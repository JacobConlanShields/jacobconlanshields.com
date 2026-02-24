(function () {
  const PHYSICS = {
    time: {
      maxDtMs: 34,
    },
    inertia: {
      frictionPerSecond: 9.5,
      minVelocityPxPerSec: 8,
      maxVelocityPxPerSec: 5200,
    },
    spring: {
      stiffness: 220,
      damping: 28,
      mass: 1,
      settleDistancePx: 0.5,
      settleVelocityPxPerSec: 4,
    },
    constraints: {
      rubberBandCoefficient: 0.18,
      bounceEnergyLoss: 0.3,
      boundaryDampingWhileConstrained: 0.68,
    },
    intent: {
      minGesturePx: 10,
      axisDominanceRatio: 1.15,
    },
    paging: {
      wheelVelocityThreshold: 3.2,
    },
  };

  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const rubberBand = (offsetPx, viewportPx, coefficient = PHYSICS.constraints.rubberBandCoefficient) => {
    if (!offsetPx) return 0;
    const dimension = Math.max(1, viewportPx || 1);
    const distance = Math.abs(offsetPx);
    const result = (coefficient * distance * dimension) / (dimension + coefficient * distance);
    return Math.sign(offsetPx) * result;
  };

  const shouldCaptureHorizontal = (dx, dy, options = {}) => {
    const minGesture = options.minGesturePx ?? PHYSICS.intent.minGesturePx;
    const dominance = options.axisDominanceRatio ?? PHYSICS.intent.axisDominanceRatio;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    return absX >= minGesture && absX > absY * dominance;
  };

  const activeAnimations = new WeakMap();

  const animateScrollTo = (element, opts = {}) => {
    if (!element) return;

    const axis = opts.axis === 'y' ? 'y' : 'x';
    const getter = axis === 'x' ? 'scrollLeft' : 'scrollTop';
    const size = axis === 'x' ? element.clientWidth : element.clientHeight;
    const maxScroll = axis === 'x'
      ? Math.max(0, element.scrollWidth - element.clientWidth)
      : Math.max(0, element.scrollHeight - element.clientHeight);

    const state = {
      pos: element[getter],
      vel: clamp(opts.initialVelocity || 0, -PHYSICS.inertia.maxVelocityPxPerSec, PHYSICS.inertia.maxVelocityPxPerSec),
      target: clamp(opts.target ?? element[getter], 0, maxScroll),
      lastTs: performance.now(),
      wasOutOfBounds: false,
      id: 0,
    };

    const prior = activeAnimations.get(element);
    if (prior) cancelAnimationFrame(prior);

    if (prefersReducedMotion()) {
      element[getter] = state.target;
      return;
    }

    const tick = (ts) => {
      const dt = Math.min((ts - state.lastTs) / 1000, PHYSICS.time.maxDtMs / 1000);
      state.lastTs = ts;

      const displacement = state.target - state.pos;
      const springAccel = (PHYSICS.spring.stiffness * displacement - PHYSICS.spring.damping * state.vel) / PHYSICS.spring.mass;
      state.vel += springAccel * dt;

      const friction = Math.exp(-PHYSICS.inertia.frictionPerSecond * dt);
      state.vel *= friction;
      state.pos += state.vel * dt;

      const outOfBounds = state.pos < 0 || state.pos > maxScroll;
      if (outOfBounds) {
        const outside = state.pos < 0 ? state.pos : state.pos - maxScroll;
        const base = state.pos < 0 ? 0 : maxScroll;
        state.pos = base + rubberBand(outside, size);

        // Only flip velocity once when first hitting the boundary.
        // Subsequent constrained frames add damping without repeated sign flips,
        // which removes the fast "double-bounce" visual artifact.
        if (!state.wasOutOfBounds) {
          state.vel *= -PHYSICS.constraints.bounceEnergyLoss;
        } else {
          state.vel *= PHYSICS.constraints.boundaryDampingWhileConstrained;
        }
      }

      state.wasOutOfBounds = outOfBounds;

      const clamped = clamp(state.pos, 0, maxScroll);
      element[getter] = clamped;

      const settled = Math.abs(state.target - clamped) <= PHYSICS.spring.settleDistancePx
        && Math.abs(state.vel) <= Math.max(PHYSICS.spring.settleVelocityPxPerSec, PHYSICS.inertia.minVelocityPxPerSec);

      if (settled) {
        element[getter] = state.target;
        activeAnimations.delete(element);
        return;
      }

      state.id = requestAnimationFrame(tick);
      activeAnimations.set(element, state.id);
    };

    state.id = requestAnimationFrame(tick);
    activeAnimations.set(element, state.id);
  };

  window.SitePhysics = {
    PHYSICS,
    clamp,
    rubberBand,
    shouldCaptureHorizontal,
    prefersReducedMotion,
    animateScrollTo,
  };
})();
