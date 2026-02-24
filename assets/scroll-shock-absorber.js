class ScrollShockAbsorber {
  /**
   * Critically-damped style boundary absorber for a dedicated scroll container.
   *
   * Physics model:
   *   x' = v
   *   v' = a
   *   a = (-k_eff * x - c_eff * v) / m
   * where:
   *   k_eff = k0 + k1 * |x|   (stiffness ramps with overscroll distance)
   *   c_eff = c0 + c1 * |v|   (damping ramps with velocity)
   *
   * Jerk limiting:
   *   a is clamped so acceleration cannot change faster than J_MAX.
   */
  constructor(scrollRoot, options = {}) {
    if (!scrollRoot) throw new Error('ScrollShockAbsorber requires a scroll container element.');

    this.scrollRoot = scrollRoot;
    this.content = options.content || scrollRoot.firstElementChild;

    if (!this.content) {
      throw new Error('ScrollShockAbsorber requires an inner content element to translate.');
    }

    this.options = {
      k0: 220,
      k1: 7.5,
      c0: 34,
      c1: 0.06,
      m: 1,
      J_MAX: 12000,
      maxOverscrollPx: 84,
      reboundAmount: 0.12,
      boundaryEpsilon: 1,
      inputGain: 0.42,
      wheelVelocityGain: 8,
      touchVelocityGain: 10,
      ...options,
    };

    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.prefersReducedMotion) {
      this.options.maxOverscrollPx = Math.min(this.options.maxOverscrollPx, 28);
      this.options.reboundAmount = Math.min(this.options.reboundAmount, 0.03);
      this.options.c0 *= 1.6;
      this.options.c1 *= 1.3;
    }

    this.x = 0;
    this.v = 0;
    this.aPrev = 0;
    this.lastTs = 0;
    this.rafId = null;
    this.isInteracting = false;

    this.touchId = null;
    this.lastTouchY = 0;

    this.boundOnWheel = this.onWheel.bind(this);
    this.boundOnTouchStart = this.onTouchStart.bind(this);
    this.boundOnTouchMove = this.onTouchMove.bind(this);
    this.boundOnTouchEnd = this.onTouchEnd.bind(this);

    this.init();
  }

  init() {
    this.content.style.willChange = 'transform';

    this.scrollRoot.addEventListener('wheel', this.boundOnWheel, { passive: false });
    this.scrollRoot.addEventListener('touchstart', this.boundOnTouchStart, { passive: true });
    this.scrollRoot.addEventListener('touchmove', this.boundOnTouchMove, { passive: false });
    this.scrollRoot.addEventListener('touchend', this.boundOnTouchEnd, { passive: true });
    this.scrollRoot.addEventListener('touchcancel', this.boundOnTouchEnd, { passive: true });
  }

  destroy() {
    this.scrollRoot.removeEventListener('wheel', this.boundOnWheel);
    this.scrollRoot.removeEventListener('touchstart', this.boundOnTouchStart);
    this.scrollRoot.removeEventListener('touchmove', this.boundOnTouchMove);
    this.scrollRoot.removeEventListener('touchend', this.boundOnTouchEnd);
    this.scrollRoot.removeEventListener('touchcancel', this.boundOnTouchEnd);

    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;

    this.content.style.transform = '';
    this.content.style.willChange = '';
  }

  startLoop() {
    if (this.rafId) return;
    this.lastTs = 0;
    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
  }

  tick(ts) {
    if (!this.lastTs) this.lastTs = ts;
    const dt = Math.min(0.032, Math.max(0.001, (ts - this.lastTs) / 1000));
    this.lastTs = ts;

    const prevX = this.x;

    if (this.prefersReducedMotion && !this.isInteracting) {
      const snap = Math.min(1, dt * 14);
      this.x += (0 - this.x) * snap;
      this.v = 0;
      this.aPrev = 0;
    } else {
      const absX = Math.abs(this.x);
      const absV = Math.abs(this.v);
      const { k0, k1, c0, c1, m, J_MAX } = this.options;

      const kEff = k0 + k1 * absX;
      const cEff = c0 + c1 * absV;

      let aTarget = (-kEff * this.x - cEff * this.v) / m;
      const maxDeltaA = J_MAX * dt;
      const minA = this.aPrev - maxDeltaA;
      const maxA = this.aPrev + maxDeltaA;
      const a = Math.min(maxA, Math.max(minA, aTarget));

      this.v += a * dt;
      this.x += this.v * dt;
      this.aPrev = a;

      const maxX = this.options.maxOverscrollPx;
      if (this.x > maxX) {
        this.x = maxX;
        this.v = Math.min(0, this.v * 0.35);
      } else if (this.x < -maxX) {
        this.x = -maxX;
        this.v = Math.max(0, this.v * 0.35);
      }

      // Optional tiny rebound when crossing equilibrium.
      if (!this.isInteracting && prevX !== 0 && Math.sign(prevX) !== Math.sign(this.x)) {
        const r = this.options.reboundAmount;
        this.x *= r;
        this.v *= r;
      }
    }

    this.render();

    const settled = Math.abs(this.x) < 0.2 && Math.abs(this.v) < 1;
    if (settled && !this.isInteracting) {
      this.x = 0;
      this.v = 0;
      this.aPrev = 0;
      this.render();
      this.rafId = null;
      return;
    }

    this.rafId = requestAnimationFrame((nextTs) => this.tick(nextTs));
  }

  render() {
    this.content.style.transform = this.x === 0 ? 'translate3d(0, 0, 0)' : `translate3d(0, ${this.x.toFixed(3)}px, 0)`;
  }

  getBoundaryDirection(gestureDeltaY) {
    const { boundaryEpsilon } = this.options;
    const top = this.scrollRoot.scrollTop <= boundaryEpsilon;
    const maxScrollTop = this.scrollRoot.scrollHeight - this.scrollRoot.clientHeight;
    const bottom = this.scrollRoot.scrollTop >= maxScrollTop - boundaryEpsilon;

    if (top && gestureDeltaY > 0) return 1;
    if (bottom && gestureDeltaY < 0) return -1;
    return 0;
  }

  applyBoundaryInput(gestureDeltaY, inputVelocityGain) {
    const maxX = this.options.maxOverscrollPx;
    const compression = 1 - Math.min(0.94, Math.abs(this.x) / maxX);

    this.x += gestureDeltaY * this.options.inputGain * compression;
    this.v += gestureDeltaY * inputVelocityGain * compression;
    this.startLoop();
  }

  onWheel(event) {
    const gestureDeltaY = -event.deltaY;
    const boundaryDir = this.getBoundaryDirection(gestureDeltaY);
    const shouldCapture = boundaryDir !== 0 || Math.abs(this.x) > 0.1;

    if (!shouldCapture) return;

    event.preventDefault();
    this.isInteracting = true;
    this.applyBoundaryInput(gestureDeltaY, this.options.wheelVelocityGain);

    clearTimeout(this.wheelReleaseTimer);
    this.wheelReleaseTimer = setTimeout(() => {
      this.isInteracting = false;
      this.startLoop();
    }, 44);
  }

  onTouchStart(event) {
    if (!event.changedTouches.length) return;
    const t = event.changedTouches[0];
    this.touchId = t.identifier;
    this.lastTouchY = t.clientY;
    this.isInteracting = true;
  }

  onTouchMove(event) {
    const touch = this.findTouch(event.changedTouches, this.touchId);
    if (!touch) return;

    const gestureDeltaY = touch.clientY - this.lastTouchY;
    this.lastTouchY = touch.clientY;

    const boundaryDir = this.getBoundaryDirection(gestureDeltaY);
    const shouldCapture = boundaryDir !== 0 || Math.abs(this.x) > 0.1;

    if (!shouldCapture) return;

    event.preventDefault();
    this.applyBoundaryInput(gestureDeltaY, this.options.touchVelocityGain);
  }

  onTouchEnd(event) {
    const touch = this.findTouch(event.changedTouches, this.touchId);
    if (!touch) return;
    this.touchId = null;
    this.isInteracting = false;
    this.startLoop();
  }

  findTouch(touchList, id) {
    for (let i = 0; i < touchList.length; i += 1) {
      if (touchList[i].identifier === id) return touchList[i];
    }
    return null;
  }
}

window.ScrollShockAbsorber = ScrollShockAbsorber;
