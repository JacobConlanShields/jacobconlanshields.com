/**
 * ScrollShockAbsorber
 *
 * Dedicated boundary overscroll absorber for a scroll container.
 * Native scrolling remains untouched in-range; at top/bottom boundaries,
 * impulses are converted into a damped spring response on content translateY.
 *
 * Physics model:
 *   x' = v
 *   v' = a
 *   a  = (-k*x - c*v) / m
 *
 * Where:
 * - k is adaptive stiffness (firms up with larger excursion)
 * - c is near-critically damped using damping ratio + velocity term
 * - jerk limiting smooths acceleration changes frame-to-frame
 */
const shared = window.SitePhysics?.PHYSICS || null;

class ScrollShockAbsorber {
  constructor(scrollRoot, options = {}) {
    if (!scrollRoot) throw new Error('ScrollShockAbsorber requires a scrollRoot element.');

    this.scrollRoot = scrollRoot;
    this.content = options.content || scrollRoot.firstElementChild;
    if (!this.content) {
      throw new Error('ScrollShockAbsorber requires a content element (first child by default).');
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const springBase = Math.max(120, shared?.spring?.stiffness || 220);

    const defaults = {
      mass: shared?.spring?.mass || 1,
      stiffness: Math.round(springBase * 0.78),
      stiffnessByDisplacement: 1.9,
      dampingRatio: 0.96,
      dampingByVelocity: 0.018,
      jerkLimit: 3200,
      maxOverscrollPx: 66,
      inputGain: 0.34,
      inputVelocityGain: 30,
      responseCurve: 0.015,
      settleThresholdX: 0.2,
      settleThresholdV: 3,
      boundaryEpsilonTop: 1,
      boundaryEpsilonBottom: 3,
      edgeLockThresholdPx: 0.5,
    };

    // Legacy compatibility (older tuning object keys).
    const legacy = {
      mass: Number.isFinite(options.m) ? options.m : undefined,
      stiffness: Number.isFinite(options.k0) ? options.k0 : undefined,
      stiffnessByDisplacement: Number.isFinite(options.k1) ? options.k1 : undefined,
      dampingByVelocity: Number.isFinite(options.c1) ? options.c1 : undefined,
      jerkLimit: Number.isFinite(options.J_MAX) ? options.J_MAX : undefined,
    };

    this.options = { ...defaults, ...legacy, ...options };

    // If legacy c0 was supplied, derive damping ratio from critical damping at base stiffness.
    if (Number.isFinite(options.c0)) {
      const critical = 2 * Math.sqrt(this.options.stiffness * this.options.mass);
      this.options.dampingRatio = this.clamp(options.c0 / critical, 0.6, 1.35);
    }

    if (reduceMotion) {
      this.options.maxOverscrollPx = Math.min(this.options.maxOverscrollPx, 16);
      this.options.dampingRatio = Math.max(this.options.dampingRatio, 1.12);
      this.options.inputGain *= 0.85;
    }

    this.state = {
      x: 0,
      v: 0,
      aPrev: 0,
      edgeSign: 0,
      inputActive: false,
      lastInputTs: 0,
    };

    this.touchState = { active: false, lastY: 0 };
    this.rafId = null;
    this.lastFrameTs = 0;

    this.onWheel = this.onWheel.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    this.tick = this.tick.bind(this);
  }

  init() {
    this.scrollRoot.addEventListener('wheel', this.onWheel, { passive: false });
    this.scrollRoot.addEventListener('touchstart', this.onTouchStart, { passive: true });
    this.scrollRoot.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.scrollRoot.addEventListener('touchend', this.onTouchEnd, { passive: true });
    this.scrollRoot.addEventListener('touchcancel', this.onTouchEnd, { passive: true });
  }

  destroy() {
    this.scrollRoot.removeEventListener('wheel', this.onWheel);
    this.scrollRoot.removeEventListener('touchstart', this.onTouchStart);
    this.scrollRoot.removeEventListener('touchmove', this.onTouchMove);
    this.scrollRoot.removeEventListener('touchend', this.onTouchEnd);
    this.scrollRoot.removeEventListener('touchcancel', this.onTouchEnd);

    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.applyTransform(0);
  }

  onWheel(e) {
    if (!this.tryAbsorbInput(e.deltaY)) return;
    e.preventDefault();
  }

  onTouchStart(e) {
    if (!e.touches[0]) return;
    this.touchState.active = true;
    this.touchState.lastY = e.touches[0].clientY;
  }

  onTouchMove(e) {
    if (!this.touchState.active || !e.touches[0]) return;
    const y = e.touches[0].clientY;
    const dy = y - this.touchState.lastY;
    this.touchState.lastY = y;

    // Finger down should move content down => negative synthetic scroll delta.
    const syntheticDeltaY = -dy;
    if (!this.tryAbsorbInput(syntheticDeltaY)) return;
    e.preventDefault();
  }

  onTouchEnd() {
    this.touchState.active = false;
  }

  tryAbsorbInput(deltaY) {
    const edgeSign = this.getBoundarySignForDelta(deltaY);
    if (!edgeSign) return false;

    const o = this.options;
    const s = this.state;
    const absDelta = Math.abs(deltaY);

    const normalized = absDelta / (1 + absDelta * o.responseCurve);
    const excursionRatio = Math.min(1, Math.abs(s.x) / Math.max(1, o.maxOverscrollPx));
    const attenuation = 1 - (excursionRatio * 0.55);
    const absorbed = normalized * o.inputGain * attenuation;

    s.edgeSign = edgeSign;
    s.x = this.clamp(s.x + (edgeSign * absorbed), -o.maxOverscrollPx, o.maxOverscrollPx);
    s.v += edgeSign * absorbed * o.inputVelocityGain;
    s.inputActive = true;
    s.lastInputTs = performance.now();

    this.applyTransform(s.x);
    this.ensureAnimating();
    return true;
  }

  getBoundarySignForDelta(deltaY) {
    const { boundaryEpsilonTop, boundaryEpsilonBottom, edgeLockThresholdPx } = this.options;
    const maxTop = this.scrollRoot.scrollHeight - this.scrollRoot.clientHeight;
    if (maxTop <= 0) return 0;

    // While still displaced, keep edge lock so we don't ping-pong boundaries.
    if (Math.abs(this.state.x) > edgeLockThresholdPx && this.state.edgeSign) {
      if (this.state.edgeSign > 0 && deltaY < 0) return 1;
      if (this.state.edgeSign < 0 && deltaY > 0) return -1;
      return 0;
    }

    const atTop = this.scrollRoot.scrollTop <= boundaryEpsilonTop;
    const atBottom = this.scrollRoot.scrollTop >= (maxTop - boundaryEpsilonBottom);

    if (atTop && deltaY < 0) return 1;
    if (atBottom && deltaY > 0) return -1;
    return 0;
  }

  ensureAnimating() {
    if (this.rafId) return;
    this.lastFrameTs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  tick(ts) {
    const maxDtS = (shared?.time?.maxDtMs || 34) / 1000;
    const dt = Math.min((ts - this.lastFrameTs) / 1000, maxDtS);
    this.lastFrameTs = ts;

    const s = this.state;
    const o = this.options;

    if (s.inputActive && ts - s.lastInputTs > 70) {
      s.inputActive = false;
    }

    const k = o.stiffness + (o.stiffnessByDisplacement * Math.abs(s.x));
    const criticalDamping = 2 * Math.sqrt(k * o.mass);
    const c = (criticalDamping * o.dampingRatio) + (o.dampingByVelocity * Math.abs(s.v));
    const rawA = (-k * s.x - c * s.v) / o.mass;

    const maxDeltaA = o.jerkLimit * dt;
    const a = this.clamp(rawA, s.aPrev - maxDeltaA, s.aPrev + maxDeltaA);
    s.aPrev = a;

    // Semi-implicit Euler keeps this stable under stiff damping.
    s.v += a * dt;
    s.x += s.v * dt;
    s.x = this.clamp(s.x, -o.maxOverscrollPx, o.maxOverscrollPx);

    this.applyTransform(s.x);

    const settled = !s.inputActive
      && Math.abs(s.x) < o.settleThresholdX
      && Math.abs(s.v) < o.settleThresholdV;

    if (settled) {
      s.x = 0;
      s.v = 0;
      s.aPrev = 0;
      s.edgeSign = 0;
      this.applyTransform(0);
      this.rafId = null;
      return;
    }

    this.rafId = requestAnimationFrame(this.tick);
  }

  applyTransform(x) {
    this.content.style.transform = `translateY(${x.toFixed(3)}px)`;
  }

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
}

window.ScrollShockAbsorber = ScrollShockAbsorber;
