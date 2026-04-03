# Agents.MD — jacobconlanshields.com

## System Integration

This project is part of the jcs-agent-dna system. Before working
here, read the constitutional and strategic files in the submodule
(or from the repo directly if no submodule is present):

**Load order:**
1. constitutional/IDENTITY.md
2. constitutional/VOICE.md
3. strategic/SOUL.md
4. tactical/MEMORY.md
5. strategic/GOALS.md
6. strategic/AGENTS.md
7. strategic/USER.md
8. tactical/PROJECTS.md
9. tactical/CONTEXT.md
10. tactical/CANON.md

Then read this file for project-specific context.

**Repo:** github.com/JacobConlanShields/jcs-agent-dna

If the submodule is not present, add it:
```bash
git submodule add https://github.com/JacobConlanShields/jcs-agent-dna.git .jcs-agent-dna
```

---

## This Project

jacobconlanshields.com is Jake's personal portfolio site. It is
the public-facing hub for all creative work: Quality Values Podcast,
Relative Momentum, Fight & Flight Conditioning, Spincline, and
photography.

This project connects to every other project in PROJECTS.md. It is
the publishing layer for the entire system.

---

## Principles (Project-Specific)

These extend the system-wide principles in AGENTS.md and SOUL.md:

- No build step. No frameworks. No dependencies beyond what ships
  in the browser. Plain HTML, CSS, JavaScript.
- The site must be updatable by non-engineers. Simplicity is not
  optional.
- Minimal aesthetic. Dark theme. JCS Style Guide v1.4: Playfair
  Display, EB Garamond, DM Sans, DM Mono. Pink accent #FFBCD9.
- Keep the README accurate. If you change the codebase, update
  the README to match. If you change this file, keep it accurate
  too.

---

## Tech Stack

- HTML for structure
- CSS for theme and layout (single global stylesheet at
  `/assets/styles.css`)
- JavaScript for client-side interactivity (podcast playlists,
  modal video player, ebook viewer, contact form)
- Cloudflare Pages for hosting (no build step, output directory
  is repo root)
- Cloudflare Pages Functions for APIs (`/functions/`)
- Cloudflare D1 for media metadata (`db/schema.sql`)
- Cloudflare R2 for media storage (Spincline + Photography buckets)
- Cloudflare Access for admin route protection

---

## Site Map

### Public Pages
- `/` — Homepage. Landing page + primary navigation.
- `/pages/projects/` — Non-digital projects listing.
- `/pages/podcast/` — Quality Values Podcast. YouTube playlist
  feeds fetched via proxy, rendered as card rows with modal player.
- `/pages/writing/` — Links to Relative Momentum ebook and
  external platforms.
- `/pages/writing/relative-momentum/` — Ebook viewer. Two-page
  spread with keyboard/mouse navigation and lightbox.
- `/pages/digital-builds/` — Hidden but live digital portfolio.
- `/pages/spincline/` — Three API-driven media carousels.
- `/pages/photography/` — Mosaic layout with drag pinning and
  overlay viewer.
- `/pages/scroll-shock/` — Scroll physics demo.
- `/contact/` — Email contact via mailto form.

### Admin Pages (Cloudflare Access protected)
- `/admin/` — Admin hub.
- `/admin/upload/` — Media upload console (images + resumable
  multipart video).
- `/admin/hidden-pages/` — Registry of routes not in public nav.
- `/admin/photography/` — Layout editor for mosaic order.

### API Routes
See README.md for the full API reference. Key endpoints:
- `GET /api/media?collection=<collection>` — public media listing
- `GET /api/photos` — photography manifest
- `POST /api/photos/upload` — admin photo upload
- `POST /api/photos/layout` — admin layout persistence
- `/yt?url=<encoded-feed-url>` — YouTube feed proxy

---

## Environment Bindings

Required in Cloudflare Pages project settings:
- D1 binding: `DB`
- R2 bindings: `SPINCLINE_BUCKET`, `PHOTO_BUCKET`
- Secrets: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`

---

## Local Development

```bash
# Static preview (no functions)
python -m http.server 8000

# Full preview with Pages Functions + D1
wrangler pages dev .
```

No automated tests. Manual validation.

---

## Before Shipping

- Pages render with plain HTML/CSS/JS (no build artifacts)
- All navigation links work
- Podcast cards load and modal player opens
- Contact form opens mail client
- Hidden routes tracked in `/admin/hidden-pages/`
- README.md reflects current codebase
- This file reflects current codebase

---

## Episodic Memory

This section tracks project-specific learnings and decisions.
Cross-project patterns get promoted to MEMORY.md in jcs-agent-dna.

### Log

#### 2026-04-02
- Agents.MD rewritten to align with jcs-agent-dna system
- CLAUDE.md created for Claude Code integration
- Submodule integration established
