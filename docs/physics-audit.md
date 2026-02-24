# Physics Interaction Audit Report

## Scope and method
Repo-wide search covered CSS and JS interaction code paths, including scroll behavior, snap points, transitions, keyframes, wheel/touch handlers, and scripted animations.

## Hotspots identified

1. `assets/styles.css`
   - Found `scroll-behavior: smooth` on `.row` and `.clips-rail`.
   - Why non-physical: browser smooth-scroll uses time-based easing and ignores live velocity + damping state.
   - Change: switched to `scroll-behavior: auto` so scripted spring/inertia primitives drive movement where needed.

2. `pages/podcast/index.html`
   - Found step-scroll controls using `el.scrollTo({ behavior: "smooth" })`, plus swipe threshold logic that did not use swipe velocity.
   - Why non-physical: fixed-duration easing and threshold-only swipe response produced abrupt, non-momentum navigation.
   - Change: replaced button and swipe scroll movement with shared `SitePhysics.animateScrollTo(...)`; added velocity-aware swipe impulse and shared horizontal intent detection.

3. `pages/writing/index.html`
   - Found Substack carousel controls using `scrollBy(..., behavior: "smooth")`.
   - Why non-physical: constant smooth timing regardless of distance/input intent.
   - Change: replaced with `SitePhysics.animateScrollTo(...)` and shared clamping.

4. `pages/writing/relative-momentum/index.html`
   - Found hard-coded wheel velocity threshold, fixed swipe threshold logic, and fixed timeout to clear turning state.
   - Why non-physical: disconnected thresholds and timing not aligned to shared interaction standards.
   - Change: moved wheel threshold to shared physics config; replaced swipe intent check with shared horizontal-intent utility + velocity floor; made turn reset respect reduced-motion preference.

5. `assets/scroll-shock-absorber.js` + `pages/scroll-shock/index.html`
   - Found isolated physics constants separate from the rest of site motion behavior.
   - Why non-physical (system-level): interactions used different “world constants” across features.
   - Change: hooked absorber defaults and demo tuning to shared physics baseline (`SitePhysics.PHYSICS`) while preserving absorber-specific terms.

## New standard implemented

- Added shared physics module: `assets/physics.js`
  - Canonical constants for inertia, spring-damper, constraints, intent detection, and paging thresholds.
  - Shared primitives:
    - `animateScrollTo` (rAF spring + friction + boundary handling)
    - `shouldCaptureHorizontal` (intent detection)
    - `clamp`, `rubberBand`, `prefersReducedMotion`

## Accessibility + performance checks

- Reduced motion: `animateScrollTo` short-circuits to direct position updates when `prefers-reduced-motion` is enabled.
- Relative Momentum page now removes turn animation behavior in reduced-motion mode.
- No heavy dependencies added; all changes use native APIs + small utility module.

## Follow-up recommendations

- Extend `SitePhysics.animateScrollTo` usage to any future modal/drawer entrance motion before adding CSS easing transitions.
- If route transitions are introduced later, use the same spring constants and reduced-motion fallback.

## ScrollShockAbsorber deep re-audit (follow-up)

- Root issue observed: bottom boundary could still exhibit a secondary "double-bounce" due to near-boundary sign churn and symmetric rebound handling.
- Refactor applied:
  - Added edge hysteresis/locking (`edgeHoldPx`, `edgeReleasePx`) to stabilize boundary capture.
  - Added separate top/bottom rebound and epsilon controls so bottom edge can settle without a secondary kick.
  - Improved input-to-velocity injection with explicit clamping to avoid impulse spikes from noisy touch cadence.
- Resulting behavior target:
  - Top: subtle elastic release.
  - Bottom: quick, damped settle without glitchy second bounce.
