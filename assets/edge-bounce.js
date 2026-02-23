(() => {
  const root =
    document.querySelector('[data-edge-bounce-root]') ||
    document.querySelector('main') ||
    document.body;

  if (!root) return;

  root.classList.add('edge-bounce-target');

  const state = {
    activeTouch: false,
    startY: 0,
    startX: 0,
    lastY: 0,
    lastT: 0,
    velocity: 0,
    shift: 0,
    axisLocked: null,
    wheelReleaseTimer: null,
  };

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function getScrollTop() {
    return window.scrollY || document.documentElement.scrollTop || 0;
  }

  function isAtPageBottom() {
    const maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    return getScrollTop() >= (maxTop - 1);
  }

  function setEdgeShift(px) {
    const shift = Math.round(px * 100) / 100;
    state.shift = shift;
    root.style.setProperty('--edge-shift-y', `${shift}px`);
  }

  function releaseEdgeBounce() {
    if (!state.shift) return;

    const speed = Math.abs(state.velocity);
    const duration = clamp(170 + (speed * 30), 170, 320);
    root.style.setProperty('--edge-rebound-ms', `${Math.round(duration)}ms`);
    root.classList.add('edge-bounce-animating');
    setEdgeShift(0);

    window.setTimeout(() => {
      root.classList.remove('edge-bounce-animating');
    }, duration + 30);
  }

  window.addEventListener('touchstart', (event) => {
    if (event.touches?.length !== 1) return;
    const touch = event.touches[0];
    state.activeTouch = true;
    state.startY = touch.clientY;
    state.startX = touch.clientX;
    state.lastY = touch.clientY;
    state.lastT = performance.now();
    state.velocity = 0;
    state.axisLocked = null;
  }, { passive: true });

  window.addEventListener('touchmove', (event) => {
    if (!state.activeTouch || event.touches?.length !== 1) return;
    const touch = event.touches[0];
    const now = performance.now();

    const totalY = touch.clientY - state.startY;
    const totalX = touch.clientX - (state.startX || touch.clientX);

    if (!state.axisLocked) {
      const dx = Math.abs(totalX);
      const dy = Math.abs(totalY);
      if (dy > 10 || dx > 10) {
        state.axisLocked = dy >= dx ? 'y' : 'x';
      }
    }

    const deltaY = touch.clientY - state.lastY;
    const dt = Math.max(16, now - state.lastT);
    state.velocity = (deltaY / dt) * 16;
    state.lastY = touch.clientY;
    state.lastT = now;

    if (state.axisLocked === 'x') return;

    const atTop = getScrollTop() <= 0;
    const atBottom = isAtPageBottom();
    const pullingDownAtTop = atTop && totalY > 0;
    const pullingUpAtBottom = atBottom && totalY < 0;

    if (!pullingDownAtTop && !pullingUpAtBottom) {
      if (state.shift) releaseEdgeBounce();
      return;
    }

    const direction = pullingDownAtTop ? 1 : -1;
    const pullDistance = Math.abs(totalY);
    const damping = 1 / (1 + (pullDistance / 180));
    const maxShift = 44;
    const nextShift = clamp(direction * pullDistance * 0.4 * damping, -maxShift, maxShift);

    if (Math.abs(nextShift) > Math.abs(state.shift)) {
      root.classList.remove('edge-bounce-animating');
    }

    setEdgeShift(nextShift);
    event.preventDefault();
  }, { passive: false });

  const endTouch = () => {
    if (!state.activeTouch) return;
    state.activeTouch = false;
    state.axisLocked = null;
    if (state.shift) releaseEdgeBounce();
  };

  window.addEventListener('touchend', endTouch, { passive: true });
  window.addEventListener('touchcancel', endTouch, { passive: true });

  window.addEventListener('wheel', (event) => {
    const atTop = getScrollTop() <= 0;
    const atBottom = isAtPageBottom();
    const pushingPastTop = atTop && event.deltaY < 0;
    const pushingPastBottom = atBottom && event.deltaY > 0;

    if (!pushingPastTop && !pushingPastBottom) {
      if (state.shift) {
        window.clearTimeout(state.wheelReleaseTimer);
        state.wheelReleaseTimer = window.setTimeout(releaseEdgeBounce, 70);
      }
      return;
    }

    const direction = pushingPastTop ? 1 : -1;
    const magnitude = Math.min(48, Math.abs(event.deltaY) * 0.16);
    const nextShift = clamp(state.shift + (direction * magnitude), -48, 48);

    root.classList.remove('edge-bounce-animating');
    state.velocity = event.deltaY * 0.05;
    setEdgeShift(nextShift);

    window.clearTimeout(state.wheelReleaseTimer);
    state.wheelReleaseTimer = window.setTimeout(releaseEdgeBounce, 90);
    event.preventDefault();
  }, { passive: false });
})();
