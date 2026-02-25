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
This repo includes a D1 + R2 media platform for `/spincline`, `/photography`, and `/admin/upload`.

### Source of truth
`media_items` in D1 is the source of truth for:
- title + description
- visibility (`is_public`)
- manual ordering (`sort_index DESC`, then `created_at DESC`)
- dimensions/aspect ratio metadata

### D1 schema + migration
- Canonical schema file: `db/schema.sql`
- Migration snapshot: `db/migrations/0001_media_platform.sql`

Apply locally:
```bash
wrangler d1 execute <DB_NAME> --file=db/schema.sql
```

### Collection mapping
- `spincline_design_build` → `SPINCLINE` bucket + `design-and-build/`
- `spincline_finished_products` → `SPINCLINE` bucket + `finished-products/`
- `spincline_in_action` → `SPINCLINE` bucket + `in-action/`
- `photography` → `PHOTO` bucket + root prefix (`""`)

`previous-versions/` is intentionally not exposed through any public collection.

### Bucket names + public media bases
- `SPINCLINE_BUCKET_NAME=spincline`
- `PHOTO_BUCKET_NAME=jcs-photography`
- `SPINCLINE_MEDIA_BASE=https://pub-a0784713bd834a079424dc14cf218eea.r2.dev`
- `PHOTO_MEDIA_BASE=https://pub-980fbe5c774b4339805365b9656ec9fe.r2.dev`

Uploads use the S3-compatible endpoint (`https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com/<bucket>/<key>`); reads use the public `r2.dev` bases above.

### API routes (Pages Functions)
Public:
- `GET /api/media?collection=<collection>` → returns `{ items: [...] }`

Admin (expected to be protected by Cloudflare Access):
- `POST /api/admin/image/init`
- `POST /api/admin/image/complete`
- `POST /api/admin/multipart/init`
- `POST /api/admin/multipart/sign-part`
- `GET /api/admin/multipart/status?key=<key>&uploadId=<uploadId>&r2Base=<r2Base>`
- `POST /api/admin/multipart/complete`
- `POST /api/admin/multipart/abort`
- `PATCH /api/admin/item`
- `DELETE /api/admin/item?id=<id>`
- `POST /api/admin/import` (optional backfill/import helper)

### Admin auth model
- Required: Cloudflare Access policy on `/admin/*` and `/api/admin/*`
- Optional defense-in-depth: if `ADMIN_TOKEN` is set, the API also validates `X-Admin-Token`
- If `ADMIN_TOKEN` is not set, API requests are allowed (Access remains primary protection)

### Required environment variables / bindings
- D1 binding: `DB`
- R2/S3 auth secrets:
  - `R2_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
- Optional defense-in-depth secret:
  - `ADMIN_TOKEN`
- Optional bucket-name overrides (defaults already in code):
  - `SPINCLINE_BUCKET_NAME` (default `spincline`)
  - `PHOTO_BUCKET_NAME` (default `jcs-photography`)

### Direct upload behavior
- Images: browser requests presigned `PUT` from `/api/admin/image/init`, uploads directly to R2, then writes D1 metadata via `/api/admin/image/complete`.
- Videos: browser uses multipart upload (`init` → `sign-part` → `complete`) with localStorage resume state and uploaded-part reconciliation from `/api/admin/multipart/status`.
- Poster images for videos are uploaded directly to R2 under a `posters/` sub-prefix in the same collection prefix.

### Required R2 CORS (both buckets)
```json
[
  {
    "AllowedOrigins": ["https://jacobconlanshields.com"],
    "AllowedMethods": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

Without `ExposeHeaders: ["ETag"]`, multipart uploads cannot read part ETags in the browser and finalization will fail.

### Local dev steps
- Static only:
  ```bash
  python -m http.server 8000
  ```
- Cloudflare Pages Functions + D1:
  ```bash
  wrangler pages dev .
  ```

### Manual integration checklist
1. Upload image in `/admin/upload`, verify direct PUT succeeds and appears on `/spincline` or `/photography`.
2. Upload large video in `/admin/upload`, refresh mid-upload, resume, and complete.
3. Verify `/api/media` ordering follows `sort_index DESC`, then `created_at DESC`.
4. Confirm hidden items (`is_public=0`) disappear from public pages.

