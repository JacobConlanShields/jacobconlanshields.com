# agents.md

This file mirrors the operational guidance in `Agents.MD` and adds enforcement for physics-first interaction design.

## Physics-first UX rules
- Use shared primitives from `assets/physics.js` (`window.SitePhysics`) for interactive motion.
- Prefer velocity-based inertia + spring damping over fixed-duration easing.
- Snap via spring settling (`snapToNearest`) instead of abrupt jump/snaps.
- Preserve user intent: do not capture horizontal gestures unless horizontal movement dominates.
- Respect `prefers-reduced-motion` with reduced or immediate alternatives.
- Keep constants centralized in `SitePhysics.CONFIG`; avoid new motion magic numbers.
