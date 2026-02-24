/**
 * ScrollShockAbsorber
 *
 * Adds a controlled, critically-damped-ish overscroll response to a dedicated
 * scroll container. Native momentum scrolling is left untouched except when the
 * user tries to push past the top/bottom boundary.
 *
 * Physics model:
 *   x' = v
 *   v' = a
 *   a  = (-k*x - c*v) / m
 *
 * With non-linear terms:
 *   k_eff = k0 + k1*|x|
 *   c_eff = c0 + c1*|v|
 *
 * Jerk limiting clamps the change in acceleration per second:
 *   a <- clamp(a_raw, a_prev - J_MAX*dt, a_prev + J_MAX*dt)
 */
class ScrollShockAbsorber {
  constructor(scrollRoot, options = {}) {
    if (!scrollRoot) throw new Error('ScrollShockAbsorber requires a scrollRoot element.');

    this.scrollRoot = scrollRoot;
    this.content = options.content || scrollRoot.firstElementChild;
    if (!this.content) {
      throw new Error('ScrollShockAbsorber requires a content element (first child by default).');
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const defaults = {
      // Base spring/damper terms. Increase k for firmer stop; increase c for less rebound.
      k0: 180,
      k1: 14,
      c0: 34,
      c1: 0.06,
      m: 1,
      J_MAX: 3600,
      maxOverscrollPx: 72,
      reboundAmount: 0.05,
      boundaryEpsilon: 1,
      inputGain: 0.38,
      settleThresholdX: 0.2,
      settleThresholdV: 3,
      releaseDelayMs: 70
    };

    this.options = { ...defaults, ...options };

    // Reduced motion: smaller visual travel and heavier damping.
    if (reduceMotion) {
      this.options.maxOverscrollPx = Math.min(this.options.maxOverscrollPx, 20);
      this.options.reboundAmount = 0;
      this.options.c0 *= 1.35;
      this.options.J_MAX *= 0.65;
    }

    this.state = {
      x: 0,
      v: 0,
      aPrev: 0,
      inputActive: false,
      lastInputTs: 0,
      reboundInjected: false
    };

    this.touchState = {
      active: false,
      lastY: 0
    };

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

    // Finger down means content should move down (negative scroll delta).
    const syntheticDeltaY = -dy;
    if (!this.tryAbsorbInput(syntheticDeltaY)) return;
    e.preventDefault();
  }

  onTouchEnd() {
    this.touchState.active = false;
  }

  tryAbsorbInput(deltaY) {
    const boundarySign = this.getBoundarySignForDelta(deltaY);
    if (!boundarySign) return false;

    const absDelta = Math.abs(deltaY);
    const { x, v } = this.state;
    const { inputGain, maxOverscrollPx } = this.options;

    // Stronger damping at high incoming velocity and larger displacement.
    const adaptiveResistance = 1 + 0.028 * Math.abs(v) + 0.02 * Math.abs(x) + 0.0016 * absDelta * absDelta;
    const absorbed = (absDelta * inputGain) / adaptiveResistance;

    const signedImpulse = boundarySign * absorbed;
    this.state.x = this.clamp(this.state.x + signedImpulse, -maxOverscrollPx, maxOverscrollPx);
    this.state.v += signedImpulse * 34;

    this.state.inputActive = true;
    this.state.lastInputTs = performance.now();
    this.state.reboundInjected = false;
    this.applyTransform(this.state.x);
    this.ensureAnimating();
    return true;
  }

  getBoundarySignForDelta(deltaY) {
    const { boundaryEpsilon } = this.options;
    const atTop = this.scrollRoot.scrollTop <= boundaryEpsilon;
    const maxTop = this.scrollRoot.scrollHeight - this.scrollRoot.clientHeight;
    const atBottom = this.scrollRoot.scrollTop >= (maxTop - boundaryEpsilon);

    if (atTop && deltaY < 0) return 1;   // pull down from top
    if (atBottom && deltaY > 0) return -1; // push up from bottom
    return 0;
  }

  ensureAnimating() {
    if (this.rafId) return;
    this.lastFrameTs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  tick(ts) {
    const dt = Math.min((ts - this.lastFrameTs) / 1000, 0.032);
    this.lastFrameTs = ts;

    const s = this.state;
    const o = this.options;

    if (s.inputActive && ts - s.lastInputTs > o.releaseDelayMs) {
      s.inputActive = false;
      if (!s.reboundInjected && o.reboundAmount > 0) {
        s.v += -Math.sign(s.x || 1) * o.reboundAmount * 140;
        s.reboundInjected = true;
      }
    }

    const kEff = o.k0 + o.k1 * Math.abs(s.x);
    const cEff = o.c0 + o.c1 * Math.abs(s.v);
    const rawA = (-kEff * s.x - cEff * s.v) / o.m;

    const maxDeltaA = o.J_MAX * dt;
    const limitedA = this.clamp(rawA, s.aPrev - maxDeltaA, s.aPrev + maxDeltaA);
    s.aPrev = limitedA;

    s.v += limitedA * dt;
    s.x += s.v * dt;
    s.x = this.clamp(s.x, -o.maxOverscrollPx, o.maxOverscrollPx);

    this.applyTransform(s.x);

    const settled = Math.abs(s.x) < o.settleThresholdX && Math.abs(s.v) < o.settleThresholdV && !s.inputActive;
    if (settled) {
      s.x = 0;
      s.v = 0;
      s.aPrev = 0;
      this.applyTransform(0);
      this.rafId = null;
      return;
    }

    this.rafId = requestAnimationFrame(this.tick);
  }

  applyTransform(x) {
    // Transform only: no read-after-write layout work in the animation loop.
    this.content.style.transform = `translateY(${x.toFixed(3)}px)`;
  }

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
}

window.ScrollShockAbsorber = ScrollShockAbsorber;
