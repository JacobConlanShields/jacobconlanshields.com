# jacobconlanshields.com
Personal website to display arrays of talent

## Overview
This repository is a static personal website with a small amount of JavaScript for dynamic content (YouTube feed parsing, a modal video player, an ebook viewer, and a scroll-boundary physics demo). It is intended to be hosted on Cloudflare Pages, optionally using Cloudflare Pages Functions for the YouTube feed proxy. The site is built from plain HTML, CSS, and JavaScript—no build step required.

## Languages used
- **HTML**: Structure and content for each page of the site.
- **CSS**: Global styles, layout rules, and component styles.
- **JavaScript**: Client-side behavior (playlist fetching, modal player, ebook navigation) and an optional serverless proxy function.

## File-by-file reference (every tracked file)
Below is a detailed description of every tracked file in the repository, as an example for future documentation.

### `README.md`
- This document. It explains the project, lists the languages used, details every file, and provides hosting and local development instructions.

### `index.html`
- The homepage for the site.
- Renders the top-level navigation buttons to Projects, Writing, Podcast, and Contact.
- Uses the global stylesheet at `/assets/styles.css`.
- Provides a brief introduction about the site being intentionally simple.

### `assets/styles.css`
- The global stylesheet for the website.
- Defines the dark theme, typography defaults, spacing variables, and shared UI components such as buttons, cards, and navigation.
- Includes layout rules for:
  - The podcast page (horizontal carousels + vertical clips column).
  - The contact form styles.
  - The modal video player.
  - The Relative Momentum ebook viewer (two-page spread + lightbox).
- Includes responsive behavior for screens below 900px, switching the clips column to a horizontal row and stacking layouts.

### `assets/scroll-shock-absorber.js`
- Reusable `ScrollShockAbsorber` module for a dedicated scroll container.
- Preserves native momentum scrolling until boundaries are reached, then applies a jerk-limited spring-damper overscroll response via `transform: translateY(...)`.
- Exposes tunable physics options (`k0`, `k1`, `c0`, `c1`, `m`, `J_MAX`, `maxOverscrollPx`, `reboundAmount`) and `init()` / `destroy()` lifecycle methods.

### `pages/scroll-shock/index.html`
- Minimal demo page with long content to exercise top and bottom boundaries.
- Demonstrates integration on a dedicated `#scrollRoot` container with `overflow:auto` and `-webkit-overflow-scrolling: touch`.
- Documents tuning guidance for “soft stop” versus “slight rebound” feel.

### `contact/index.html`
- The contact page.
- Provides a mailto link for direct contact and a lightweight form that opens the user’s email client with a prefilled message.
- Contains inline CSS for page-specific layout and readability.
- Includes a small JavaScript snippet that builds the `mailto:` URL from form input.

### `functions/yt.js`
- A Cloudflare Pages Function (or Worker-style handler) that proxies YouTube playlist feeds.
- Accepts a `?url=` query string, validates that it is a YouTube feed URL, fetches the XML, and returns it with cache headers.
- Used to avoid CORS issues when the client-side podcast page fetches YouTube playlist feeds.

### `pages/projects/index.html`
- The Projects landing page.
- Lists the main non-digital projects and provides navigation back to the homepage.
- Uses the global stylesheet and shared navigation pattern.

### `pages/digital-builds/index.html`
- A live "hidden" portfolio page for digital work that is not linked from global navigation yet.
- Collects digital projects currently in the repo: Scroll Shock Absorber Demo, Podcast Fetch System, and the Relative Momentum Ebook Reader.
- Uses the global stylesheet and shared navigation pattern.

### `pages/podcast/index.html`
- The Quality Values Podcast page.
- Uses `/assets/styles.css` for layout and card styling.
- JavaScript on this page:
  - Fetches YouTube playlist feeds through the proxy.
  - Populates horizontal carousels for different playlist categories.
  - Populates a vertical clips column.
  - Opens a modal player with an embedded YouTube video when a card is clicked.
- Defines all playlist IDs, fetch limits, and the proxy URL near the top of the script.

### `pages/writing/index.html`
- The Writing landing page.
- Links to the Relative Momentum ebook viewer and external reading platforms (Amazon and Substack).
- Uses the global stylesheet for navigation and layout.

### `pages/writing/relative-momentum/index.html`
- The Relative Momentum ebook viewer.
- Implements a two-page spread with keyboard, click, and scroll navigation.
- Uses the global stylesheet for layout and the lightbox.
- JavaScript responsibilities:
  - Tracks the current page spread.
  - Preloads adjacent pages for smoother transitions.
  - Opens a lightbox with a high-quality image when a page is clicked.

## Hosting on Cloudflare (Cloudflare Pages + Functions)
This site is designed to work as a static Cloudflare Pages project. The optional YouTube feed proxy can run as a Pages Function at `/functions/yt.js`.

### 1) Create the Pages project
1. Push this repository to GitHub.
2. In Cloudflare Dashboard, go to **Workers & Pages → Create → Pages → Connect to Git**.
3. Select the repository and configure the build settings:
   - **Framework preset**: `None`
   - **Build command**: *leave empty*
   - **Build output directory**: `.` (the repo root)
4. Save and deploy.

### 2) (Optional) Enable the YouTube feed proxy on your own domain
If you want the YouTube feed proxy to run on the same domain instead of a separate Worker:
1. Ensure the `functions/yt.js` file remains in the repo. Cloudflare Pages will automatically deploy it.
2. Once deployed, the proxy will be available at:
   - `https://<your-pages-domain>/yt?url=<encoded-youtube-feed-url>`
3. Update `pages/podcast/index.html` to point `WORKER_PROXY` to your Pages domain if desired.

### 3) (Optional) Separate Cloudflare Worker alternative
If you prefer a standalone Worker (as referenced in the podcast page today):
1. Create a Worker in Cloudflare and deploy the same logic as `functions/yt.js`.
2. Set the Worker URL in `WORKER_PROXY` inside `pages/podcast/index.html`.

## Local development & testing in GitHub Codespaces
You can run the site locally inside a GitHub Codespace for quick testing.

### Option A: Static preview (fastest)
1. Open a Codespace for this repo.
2. From the terminal, run:
   ```bash
   python -m http.server 8000
   ```
3. Use the “Ports” tab to open the forwarded port in your browser.

### Option B: Pages Functions preview (includes `/functions/yt.js`)
If you want to test the Cloudflare Pages Function locally:
1. In the Codespace, install Wrangler (if not already available):
   ```bash
   npm install -g wrangler
   ```
2. Run the Pages dev server from the repo root:
   ```bash
   wrangler pages dev .
   ```
3. Open the forwarded port in the Codespace “Ports” tab.

> Note: If you use Option A (Python server), `/functions/yt.js` will not be executed. Use Option B if you want to validate the proxy behavior.
>

## Media system (Spincline + Photography)

### Admin routes (Cloudflare Access protected)
- `/admin/`: admin hub page for internal tools.
- `/admin/upload/`: media upload console for images and resumable multipart video uploads.
- `/admin/hidden-pages/`: private index of routes not linked in the public top navigation.
- These routes are intended to be protected by Cloudflare Access (Google login) in production.

This repo now includes a durable media system using Cloudflare Pages Functions + D1 + R2.

### New pages
- `/pages/spincline/`: three API-driven media carousels (Design & Build, Finished Products, In Action videos).
- `/pages/photography/`: API-driven masonry/tetris grid using CSS grid + JS row-span measurement.
- `/admin/upload/`: admin upload console for images and resumable multipart video uploads.
- `/admin/hidden-pages/`: admin index of hidden routes.

### Data model (D1)
Schema file: `db/schema.sql`.

- `media_items`: source of truth for title/description/order/aspect ratio/public visibility.
- `multipart_uploads`: tracks resumable multipart uploads (`initiated`, `completed`, `aborted`).

Apply locally with Wrangler D1 tooling (example):
```bash
wrangler d1 execute <DB_NAME> --file=db/schema.sql
```

### API routes (Pages Functions)
- Public:
  - `GET /api/media?collection=<collection>`
- Admin (requires `X-Admin-Token`):
  - `POST /api/admin/upload-image`
  - `POST /api/admin/upload-poster`
  - `POST /api/admin/multipart/init`
  - `POST /api/admin/multipart/sign-part`
  - `GET /api/admin/multipart/status?key=<key>`
  - `POST /api/admin/multipart/complete`
  - `POST /api/admin/multipart/abort`
  - `PATCH /api/admin/item`
  - `DELETE /api/admin/item?id=<id>`

### Collection to bucket/prefix mapping
- `spincline_design_build` → `SPINCLINE_BUCKET` + `design-and-build/`
- `spincline_finished_products` → `SPINCLINE_BUCKET` + `finished-products/`
- `spincline_in_action` → `SPINCLINE_BUCKET` + `in-action/`
- `photography` → `PHOTO_BUCKET` + root prefix (`""`)

Public base URLs used for playback/rendering:
- `SPINCLINE_MEDIA_BASE = https://pub-a0784713bd834a079424dc14cf218eea.r2.dev`
- `PHOTO_MEDIA_BASE = https://pub-980fbe5c774b4339805365b9656ec9fe.r2.dev`

### Required environment bindings/secrets
Configure in Cloudflare Pages project settings:
- D1 binding: `DB`
- R2 bindings:
  - `SPINCLINE_BUCKET`
  - `PHOTO_BUCKET`
- Secrets:
  - `ADMIN_TOKEN`
  - `R2_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`

### Security hardening for `/admin/*`
1. Protect `/admin/*` routes with **Cloudflare Access** policy (email/IdP allowlist).
2. Keep API-side token verification enabled (`X-Admin-Token` == `ADMIN_TOKEN`).
3. Never commit secrets into source code or client bundles.

### R2 CORS settings for direct multipart uploads
Set CORS on buckets to allow browser PUTs to presigned URLs:
- Allowed origins: your site origin(s) (prod + preview)
- Allowed methods: `PUT, GET, HEAD`
- Allowed headers: `*` (or at least `content-type`, `x-amz-*`)
- Expose headers: `ETag`
- Max age: e.g. `3600`

### Media encoding guidance
For best browser playback compatibility, encode uploaded videos as MP4 (H.264 video + AAC audio).

### Local run notes
- Static-only preview:
  ```bash
  python -m http.server 8000
  ```
- Functions + D1 preview:
  ```bash
  wrangler pages dev .
  ```
