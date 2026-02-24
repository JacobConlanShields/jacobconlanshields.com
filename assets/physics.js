(function initSitePhysics(global) {
  const CONFIG = Object.freeze({
    units: Object.freeze({
      distance: 'px',
      time: 's'
    }),
    maxVelocity: 3600,
    frictionPerSecond: 0.86,
    stopVelocity: 8,
    spring: Object.freeze({
      stiffness: 320,
      damping: 36,
      mass: 1,
      settleDistance: 0.35
    }),
    boundary: Object.freeze({
      rubberBand: 0.16,
      bounceDamping: 0.32
    }),
    swipe: Object.freeze({
      axisLockRatio: 1.2,
      minDistance: 28,
      velocityWindowMs: 140
    })
  });

  const prefersReducedMotion = () =>
    global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const applyRubberBand = (value, min, max, coefficient = CONFIG.boundary.rubberBand) => {
    if (value < min) return min + (value - min) * coefficient;
    if (value > max) return max + (value - max) * coefficient;
    return value;
  };

  function createScrollSpringController(element, options = {}) {
    let axis = options.axis || 'x';
    let rafId = 0;
    let velocity = 0;
    let target = axis === 'x' ? element.scrollLeft : element.scrollTop;
    let prevTime = performance.now();

    function getBounds() {
      if (axis === 'x') {
        return { min: 0, max: Math.max(0, element.scrollWidth - element.clientWidth) };
      }
      return { min: 0, max: Math.max(0, element.scrollHeight - element.clientHeight) };
    }

    function readPosition() {
      return axis === 'x' ? element.scrollLeft : element.scrollTop;
    }

    function writePosition(next) {
      if (axis === 'x') {
        element.scrollLeft = next;
      } else {
        element.scrollTop = next;
      }
    }

    function step(now) {
      const dt = Math.min((now - prevTime) / 1000, 0.032);
      prevTime = now;
      const reduced = prefersReducedMotion();
      const position = readPosition();
      const bounds = getBounds();
      target = clamp(target, bounds.min - 120, bounds.max + 120);

      if (reduced) {
        const snapped = clamp(target, bounds.min, bounds.max);
        writePosition(snapped);
        velocity = 0;
        rafId = 0;
        return;
      }

      const displacement = target - position;
      const springForce = CONFIG.spring.stiffness * displacement;
      const dampingForce = -CONFIG.spring.damping * velocity;
      const accel = (springForce + dampingForce) / CONFIG.spring.mass;

      velocity = clamp(velocity + accel * dt, -CONFIG.maxVelocity, CONFIG.maxVelocity);
      velocity *= Math.pow(CONFIG.frictionPerSecond, dt);

      let nextPosition = position + velocity * dt;
      const constrained = applyRubberBand(nextPosition, bounds.min, bounds.max);

      if (constrained !== nextPosition) {
        nextPosition = constrained;
        velocity *= CONFIG.boundary.bounceDamping;
      }

      writePosition(nextPosition);

      const settled = Math.abs(displacement) < CONFIG.spring.settleDistance && Math.abs(velocity) < CONFIG.stopVelocity;
      if (settled) {
        writePosition(clamp(target, bounds.min, bounds.max));
        velocity = 0;
        rafId = 0;
        return;
      }
      rafId = requestAnimationFrame(step);
    }

    function ensureTicking() {
      if (rafId) return;
      prevTime = performance.now();
      rafId = requestAnimationFrame(step);
    }

    function nudge(distancePx, impulse = 0) {
      target += distancePx;
      velocity += impulse;
      ensureTicking();
    }

    function fling(initialVelocity) {
      velocity += clamp(initialVelocity, -CONFIG.maxVelocity, CONFIG.maxVelocity);
      target += velocity * 0.18;
      ensureTicking();
    }

    function setAxis(nextAxis) {
      axis = nextAxis;
      target = readPosition();
    }

    function snapToNearest(stepSize) {
      if (!stepSize) return;
      const current = readPosition();
      const nearest = Math.round(current / stepSize) * stepSize;
      target = nearest;
      ensureTicking();
    }

    return { nudge, fling, setAxis, snapToNearest };
  }

  function createSwipeIntentTracker() {
    let state = null;

    return {
      start(point) {
        state = {
          x: point.x,
          y: point.y,
          time: performance.now()
        };
      },
      end(point) {
        if (!state) return { capture: false, axis: 'x', distance: 0, velocity: 0 };
        const dtMs = Math.max(16, performance.now() - state.time);
        const dx = point.x - state.x;
        const dy = point.y - state.y;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        const horizontal = absX > CONFIG.swipe.minDistance && absX > absY * CONFIG.swipe.axisLockRatio;
        const axis = horizontal ? 'x' : 'y';
        const distance = horizontal ? dx : dy;
        const velocity = (distance / dtMs) * 1000;
        state = null;
        return {
          capture: horizontal,
          axis,
          distance,
          velocity
        };
      },
      reset() {
        state = null;
      }
    };
  }

  global.SitePhysics = {
    CONFIG,
    clamp,
    prefersReducedMotion,
    applyRubberBand,
    createScrollSpringController,
    createSwipeIntentTracker
  };
})(window);
