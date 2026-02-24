# Agents.MD — jacobconlanshields.com

## Purpose of this document
This file is a short onboarding guide for coding agents (Codex, Cursor, etc.). It explains the website's goals, structure, and hosting so you can make changes safely without breaking the site. Ensure all major changes are documented corectly in the ReadMe so the ReadMe file is always accurate and reflective of the current codebase. Ensure this document is also updated with major changes to accuratly reflect the codebase. 

## Project goals (high level)
- Keep the site **simple, fast, and durable** (no build step, no heavy frameworks).
- Make the content **easy to update** by non-engineers and interns.
- Preserve a **minimal aesthetic** and clean navigation between sections.

## Tech stack (languages + runtime)
- **HTML** for page structure and content.
- **CSS** for the global theme and layout rules.
- **JavaScript** for light client-side interactivity (podcast playlists, modal video player, ebook viewer, contact form).
- **Cloudflare Pages** for hosting, with an **optional Pages Function** for the YouTube feed proxy.

## Hosting and deployment (Cloudflare Pages)
- This repo is deployed as a **static Cloudflare Pages** project.
- There is **no build step**. Cloudflare Pages should be configured with:
  - Framework preset: `None`
  - Build command: *(empty)*
  - Output directory: `.`
- Optional Pages Function:
  - `functions/yt.js` is deployed automatically by Cloudflare Pages.
  - It runs at `https://<pages-domain>/yt?url=<encoded-feed-url>`.
  - The podcast page can use this local Pages Function instead of the separate Worker if desired.

## How to test locally
Because there is no build step, local testing is simple:
- **Static preview (fastest):**
  - `python -m http.server 8000`
  - Open the forwarded port and browse the site.
- **Pages Functions preview (if you need the YouTube proxy):**
  - `npm install -g wrangler`
  - `wrangler pages dev .`

There are **no automated tests** at the moment. Manual validation is expected.

## Site map and responsibilities
### Home page
- `index.html`
- Purpose: landing page + primary navigation.

### Global styles
- `assets/styles.css`
- Purpose: theme, layout, cards, buttons, modal player, podcast layout, and ebook viewer.

### Analytics helper
- `assets/analytics.js`
- Purpose: shared GA4 event helper for custom page-view naming and declarative micro-events via `data-ga-event` attributes.

### Contact
- `contact/index.html`
- Purpose: displays email and a mailto-based form. The JavaScript builds a `mailto:` URL so no backend is required.

### Projects
- `pages/projects/index.html`
- Purpose: lists key projects with short descriptions.

### Writing
- `pages/writing/index.html`
- Purpose: links to the Relative Momentum ebook and external writing platforms.

### Relative Momentum ebook viewer
- `pages/writing/relative-momentum/index.html`
- Purpose: two-page spread with keyboard/mouse navigation and a high-resolution lightbox.

### Podcast page (key section)
- `pages/podcast/index.html`

**Important note:** the podcast page is in its **original state** and may be advanced or redesigned later. Keep this flexibility in mind when editing.

**Purpose:** showcase YouTube videos quickly for followers and provide easy access to the latest podcast content (including quick clips and highlights).

**How it works (current behavior):**
- The page lists multiple **playlist sections** (rows) and a **clips column**.
- JavaScript fetches YouTube playlist feeds (XML) for each playlist.
- Fetching goes through a **proxy** to avoid browser CORS errors:
  - Current proxy is a dedicated Cloudflare Worker URL.
  - You can optionally switch to the local Pages Function (`/yt?url=...`) if desired.
- Each playlist is rendered into **card rows** (horizontal scrolling).
- The **Clips** section is a **sticky column** on the right for quick access.
- Clicking a card opens a **modal video player** (embedded YouTube iframe).
- The sections (in order) are:
  1. Full Podcast (Latest)
  2. Highlight Episodes
  3. Movement Episodes
  4. Science & Sustainability
  5. Entrepreneurship Episodes
  6. Clips (right column)

## Editing guidelines (to avoid breaking the site)
- Keep HTML **semantic and minimal**; avoid introducing frameworks or build steps.
- When adding new pages, follow the existing structure under `/pages/...` and reuse `/assets/styles.css`.
- If you change playlist IDs or the proxy URL, verify the podcast page still loads playlists.
- Avoid removing the modal player or proxy logic without providing a replacement.
- Keep navigation links consistent so visitors can move between sections easily.

## Quick checklist before shipping changes
- Do pages still render with plain HTML/CSS/JS?
- Do all navigation links work?
- If the podcast page was touched, do video cards still load and open the modal?
- If the contact form was touched, does it still open a mail client?
