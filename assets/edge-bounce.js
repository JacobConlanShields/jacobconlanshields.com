(() => {
  const root = document.querySelector('main');
  if (!root) return;

  const state = {
    shift: 0,
    velocity: 0,
    animating: false,
    touchStartX: 0,
    touchStartY: 0,
    touchLockedAxis: null,
  };

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const getTop = () => window.pageYOffset || window.scrollY || document.documentElement.scrollTop || 0;
  const getMaxTop = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const isAtTop = () => getTop() <= 0;
  const isAtBottom = () => getTop() >= (getMaxTop() - 1);

  const applyShift = (nextShift) => {
    state.shift = clamp(nextShift, -44, 44);
    root.style.setProperty('--edge-shift-y', `${state.shift.toFixed(2)}px`);

    if (Math.abs(state.shift) > 0.01) {
      root.classList.add('edge-bounce-active');
    } else {
      root.classList.remove('edge-bounce-active');
      root.style.setProperty('--edge-shift-y', '0px');
    }
  };

  const startRelease = () => {
    if (state.animating) return;
    state.animating = true;
    root.classList.add('edge-bounce-animating');

    const tick = () => {
      state.velocity *= 0.82;
      const next = state.shift + state.velocity;

      if (Math.abs(next) < 0.35 && Math.abs(state.velocity) < 0.2) {
        applyShift(0);
        state.velocity = 0;
        state.animating = false;
        root.classList.remove('edge-bounce-animating');
        return;
      }

      applyShift(next);
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  };

  const nudge = (delta) => {
    root.classList.remove('edge-bounce-animating');
    state.animating = false;
    state.velocity = delta;
    applyShift(state.shift + delta);
    startRelease();
  };

  window.addEventListener('wheel', (event) => {
    if (event.ctrlKey) return;

    const maxTop = getMaxTop();
    if (maxTop <= 0) return;

    if (isAtTop() && event.deltaY < 0) {
      nudge(Math.max(-6, event.deltaY * 0.03));
      return;
    }

    if (isAtBottom() && event.deltaY > 0) {
      nudge(Math.min(6, event.deltaY * 0.03));
    }
  }, { passive: true });

  window.addEventListener('touchstart', (event) => {
    if (event.touches?.length !== 1) return;
    const touch = event.touches[0];
    state.touchStartX = touch.clientX;
    state.touchStartY = touch.clientY;
    state.touchLockedAxis = null;
  }, { passive: true });

  window.addEventListener('touchmove', (event) => {
    if (event.touches?.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - state.touchStartX;
    const dy = touch.clientY - state.touchStartY;

    if (!state.touchLockedAxis) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        state.touchLockedAxis = Math.abs(dy) >= Math.abs(dx) ? 'y' : 'x';
      }
    }

    if (state.touchLockedAxis !== 'y') return;

    const pullingDownAtTop = isAtTop() && dy > 0;
    const pullingUpAtBottom = isAtBottom() && dy < 0;

    if (!pullingDownAtTop && !pullingUpAtBottom) return;

    const direction = pullingDownAtTop ? 1 : -1;
    const distance = Math.abs(dy);
    const damped = direction * distance * (1 / (1 + distance / 180)) * 0.35;
    applyShift(damped);
    state.velocity = damped * 0.16;
  }, { passive: true });

  const onTouchEnd = () => {
    if (Math.abs(state.shift) > 0.01) {
      startRelease();
    }
    state.touchLockedAxis = null;
  };

  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
})();
