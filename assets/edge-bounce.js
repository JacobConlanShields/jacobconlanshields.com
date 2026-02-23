(() => {
  const root = document.querySelector('main') || document.body;
  if (!root) return;

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

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  const getScrollTop = () => window.scrollY || document.documentElement.scrollTop || 0;
  const getMaxTop = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const atTop = () => getScrollTop() <= 0;
  const atBottom = () => getScrollTop() >= (getMaxTop() - 1);

  const setShift = (px) => {
    state.shift = Math.round(px * 100) / 100;
    root.style.setProperty('--edge-shift-y', `${state.shift}px`);
  };

  const release = () => {
    if (!state.shift) return;
    const speed = Math.abs(state.velocity);
    const duration = clamp(170 + (speed * 30), 170, 320);
    root.style.setProperty('--edge-rebound-ms', `${Math.round(duration)}ms`);
    root.classList.add('edge-bounce-animating');
    setShift(0);

    window.setTimeout(() => {
      root.classList.remove('edge-bounce-animating');
    }, duration + 30);
  };

  root.classList.add('edge-bounce-enabled');

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
    const totalX = touch.clientX - state.startX;

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

    const pullingDownAtTop = atTop() && totalY > 0;
    const pullingUpAtBottom = atBottom() && totalY < 0;

    if (!pullingDownAtTop && !pullingUpAtBottom) {
      if (state.shift) release();
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

    setShift(nextShift);
    event.preventDefault();
  }, { passive: false });

  const touchEnd = () => {
    if (!state.activeTouch) return;
    state.activeTouch = false;
    state.axisLocked = null;
    if (state.shift) release();
  };

  window.addEventListener('touchend', touchEnd, { passive: true });
  window.addEventListener('touchcancel', touchEnd, { passive: true });

  window.addEventListener('wheel', (event) => {
    if (event.deltaMode !== 0) return;

    const pullingDownAtTop = atTop() && event.deltaY < 0;
    const pullingUpAtBottom = atBottom() && event.deltaY > 0;

    if (!pullingDownAtTop && !pullingUpAtBottom) {
      if (state.shift) release();
      return;
    }

    const direction = pullingDownAtTop ? 1 : -1;
    const resistance = 0.28;
    const maxShift = 32;
    const nextShift = clamp(state.shift + (direction * Math.abs(event.deltaY) * resistance), -maxShift, maxShift);

    state.velocity = event.deltaY * 0.12;
    root.classList.remove('edge-bounce-animating');
    setShift(nextShift);

    window.clearTimeout(state.wheelReleaseTimer);
    state.wheelReleaseTimer = window.setTimeout(release, 90);
  }, { passive: true });
})();
