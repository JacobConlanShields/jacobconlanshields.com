# Physics Interaction Audit Report

## Scope and method
Repo-wide scan for motion/interaction hotspots across CSS and JS.

Commands used:
- `rg -n "scroll-snap|scroll-behavior|transition|animation|keyframes|scrollIntoView|scrollTo|requestAnimationFrame|setTimeout|pointer|touch|wheel|swiper|framer|gsap|drag|snap|smooth"`
- Targeted file inspection in `assets/styles.css`, `pages/podcast/index.html`, `pages/writing/index.html`, `pages/writing/relative-momentum/index.html`, and `assets/scroll-shock-absorber.js`.

## Findings and actions

### 1) Podcast rows and clips rail used time-based smooth scrolling
- **Files:** `pages/podcast/index.html`, `assets/styles.css`
- **Issue:** `scrollTo({ behavior: "smooth" })` and `scroll-behavior: smooth` ignored velocity and used browser-timed easing.
- **Action:** Replaced with shared spring/inertia controller (`SitePhysics.createScrollSpringController`) + swipe intent tracking + snap-to-nearest-card spring settling.

### 2) Swipe handling used one-off thresholds and simplistic snap
- **Files:** `pages/podcast/index.html`, `pages/writing/relative-momentum/index.html`
- **Issue:** Hard-coded thresholds (`45`) and direct page changes without shared intent standards.
- **Action:** Migrated to `SitePhysics.createSwipeIntentTracker()` with canonical `axisLockRatio` and `minDistance`.

### 3) Writing Substack carousel used `scrollBy(...behavior: "smooth")`
- **Files:** `pages/writing/index.html`
- **Issue:** Time-based smoothing and no physical continuity.
- **Action:** Replaced with spring controller (`nudge + snapToNearest`).

### 4) Relative Momentum page-turn transitions were easing-centric
- **Files:** `pages/writing/relative-momentum/index.html`
- **Issue:** Mixed fixed easing and timing constants, no reduced-motion fallback for page-turn animation states.
- **Action:** Standardized easing token usage, added reduced-motion animation bypass, and aligned wheel/touch navigation logic with shared physics helpers.

### 5) Scroll Shock absorber constants partially diverged from global physics constants
- **Files:** `assets/scroll-shock-absorber.js`, `pages/scroll-shock/index.html`
- **Issue:** Independent defaults risked drift from project standards.
- **Action:** Connected selected defaults to `SitePhysics.CONFIG` when available; loaded shared physics runtime in demo page.

## Standard adopted
- Shared primitives in `assets/physics.js`:
  - inertia/momentum (velocity + friction decay)
  - spring-damper settling
  - boundary constraints (clamp + rubber-band + energy loss)
  - swipe intent locking
- Canonical constants centralized in `SitePhysics.CONFIG`.
- Reduced-motion branch built into controller and page-turn behaviors.

## Remaining notes
- CSS `scroll-snap-type` is retained for layout-level landing points, but dynamic travel now comes from physics controllers.
- `setTimeout` in podcast feed fetch remains for request abort timeout (network safety), not animation.
