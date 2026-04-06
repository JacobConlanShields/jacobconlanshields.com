# Agents.MD — jacobconlanshields.com
## Project-Specific Agent Context

This file extends the jcs-agent-dna system for this specific project.
Read the constitutional and strategic files from the submodule first,
then read this file for project-specific context.

**Repo:** github.com/JacobConlanShields/jcs-agent-dna

Load order is defined in CLAUDE.md. If submodule is missing:
```bash
git submodule add https://github.com/JacobConlanShields/jcs-agent-dna.git .jcs-agent-dna
git submodule update --init --recursive
```

---

## What This Project Is

jacobconlanshields.com is the public-facing hub for all creative
work: Quality Values Podcast, Relative Momentum, Fight & Flight
Conditioning, Spincline, and photography. It is the publishing
layer for the entire system — every other project eventually
surfaces here.

**Goal alignment:** Artistic freedom through demonstrated quality.
The site earns the benefit of the doubt through the work it shows,
not through marketing.

**Connection to other projects:** Every active project in
PROJECTS.md connects here. New content from podcast episodes,
training card business output, photography, and writing all
eventually route through this site.

---

## Decision Authority (Project-Specific)

Follow BOUNDARIES.md from the jcs-agent-dna system for all
decision tiers. Project-specific applications:

**Tier 1 (agent decides freely):**
- CSS adjustments, copy edits, formatting changes
- Bug fixes that don't change public-facing behavior
- Admin-only page changes
- Dependency updates with no breaking changes

**Tier 2 (agent decides, flags Jake, reversible unless noted):**
- New pages or sections (reversible — can be hidden or removed)
- Changes to navigation structure (flag before shipping)
- API endpoint additions (flag, document in README)
- New R2 bucket prefixes or D1 schema changes (flag — harder to undo)

**Tier 3 (Jake decides before anything ships):**
- Removing existing public pages
- Changes to the homepage or primary navigation
- Any change affecting how the site presents Jake publicly
- Introducing new external dependencies or services
- Changes to Cloudflare Access configuration

**Irreversibility test:** If a change would be difficult to explain
or walk back publicly, treat it as Tier 3 regardless of scope.

---

## Principles (Project-Specific)

These extend system-wide principles in AGENTS.md and SOUL.md:

- No build step. No frameworks. No dependencies beyond what ships
  in the browser. Plain HTML, CSS, JavaScript.
- The site must be updatable by non-engineers. Simplicity is not
  optional. Every addition that increases complexity must clear a
  high bar.
- Minimal aesthetic. Dark theme. JCS Style Guide v1.4.
- Every new page gets added to `/admin/hidden-pages/` until Jake
  explicitly promotes it to public navigation.
- Keep README.md current after any codebase change. Keep this
  file current after any architectural change.

---

## Tech Stack

- **HTML** — structure and content
- **CSS** — global stylesheet at `/assets/styles.css`
- **JavaScript** — client-side interactivity
- **Cloudflare Pages** — hosting (no build step, root is output)
- **Cloudflare Pages Functions** — APIs at `/functions/`
- **Cloudflare D1** — media metadata (`db/schema.sql`)
- **Cloudflare R2** — media storage (Spincline + Photography)
- **Cloudflare Access** — admin route protection (Google login)

---

## Site Map

### Public Pages
- `/` — Homepage. Landing page + primary navigation.
- `/pages/projects/` — Non-digital projects listing.
- `/pages/podcast/` — Quality Values Podcast. YouTube playlist
  feeds via proxy, rendered as card rows with modal player.
- `/pages/writing/` — Links to Relative Momentum and platforms.
- `/pages/writing/relative-momentum/` — Ebook viewer. Two-page
  spread with keyboard/mouse navigation and lightbox.
- `/pages/digital-builds/` — Hidden but live digital portfolio.
- `/pages/spincline/` — Three API-driven media carousels.
- `/pages/photography/` — Mosaic layout with drag pinning and
  overlay viewer.
- `/pages/scroll-shock/` — Scroll physics demo.
- `/pages/system/` — Agent constitution browser. Manifesto +
  GitHub-style file browser for jcs-agent-dna. [IN PROGRESS]
- `/contact/` — Email contact via mailto form.

### Admin Pages (Cloudflare Access protected)
- `/admin/` — Admin hub.
- `/admin/upload/` — Media upload console.
- `/admin/hidden-pages/` — Registry of unlisted routes.
- `/admin/photography/` — Mosaic layout editor.

### API Routes
See README.md for full API reference.

---

## Environment Bindings

Required in Cloudflare Pages project settings:
- D1 binding: `DB`
- R2 bindings: `SPINCLINE_BUCKET`, `PHOTO_BUCKET`
- Secrets: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`

---

## Active Work

### /pages/system/ — Agent Constitution Browser
**Status:** Prompt written, not yet built.
**What it is:** A page that displays the jcs-agent-dna file system
as a readable, browsable experience. Top section: full manifesto
essay. Bottom section: GitHub-style file browser that fetches
live file content from raw.githubusercontent.com on load.
**Design:** JCS Style Guide v1.4. Pink accent on active states.
DM Mono for file names. No frameworks.
**Decision:** jcs-agent-dna repo must be public before this page
goes live. File content fetched from GitHub raw URLs — always
shows current version without manual sync.
**Next action:** Make jcs-agent-dna repo public, then run the
Claude Code prompt to build the page.

### Photo Mosaic Feature
**Status:** Active development.
**What it is:** MaxRects BSSF bin-packing, drag-and-drop with
three-state machine, lightbox, admin layout editor.
**Current state:** Core functionality exists. Ongoing refinement.

---

## Episodic Memory

Project-specific learnings and decisions. Cross-project patterns
get promoted to MEMORY.md in jcs-agent-dna.

### 2026-04-04
- Agents.MD rewritten with full project scope, decision authority
  tiers, active work tracking, and alignment to updated
  jcs-agent-dna constitutional structure.
- CLAUDE.md updated with correct load order including
  BOUNDARIES.md and EPISTEMOLOGY.md.
- /pages/system/ added to site map as in-progress.
- jcs-agent-dna repo identified as needing to be made public
  before /pages/system/ can go live.

### 2026-04-02
- Agents.MD initially rewritten to align with jcs-agent-dna system.
- CLAUDE.md created for Claude Code integration.
- Submodule integration established.

---

## Before Shipping Any Change

- Pages render with plain HTML/CSS/JS (no build artifacts)
- All navigation links work
- New routes added to `/admin/hidden-pages/` if not in public nav
- README.md reflects current codebase
- This file reflects current architectural state
- Tier 2+ decisions flagged to Jake before shipping
