# jacobconlanshields.com
Personal website to display arrays of talent

## Overview
This repository is a static personal website with a small amount of JavaScript for dynamic content (YouTube playlist rendering, a modal video player, and an ebook viewer). It is intended to be hosted on Cloudflare Pages, using Cloudflare Pages Functions for server-side API proxying. The site is built from plain HTML, CSS, and JavaScript—no build step required.

## Languages used
- **HTML**: Structure and content for each page of the site.
- **CSS**: Global styles, layout rules, and component styles.
- **JavaScript**: Client-side behavior (playlist fetching, modal player, ebook navigation) and serverless proxy functions.

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

### `contact/index.html`
- The contact page.
- Provides a mailto link for direct contact and a lightweight form that opens the user’s email client with a prefilled message.
- Contains inline CSS for page-specific layout and readability.
- Includes a small JavaScript snippet that builds the `mailto:` URL from form input.

### `functions/yt.js`
- Legacy Cloudflare Pages Function that proxies YouTube XML feeds.
- Retained for backward compatibility, but the podcast page now uses the YouTube Data API proxy at `/api/youtube-playlist`.

### `functions/youtube-playlist.js`
- A Cloudflare Pages Function that calls `youtube/v3/playlistItems` server-side.
- Reads `YT_API_KEY` from the Pages environment and never exposes it to the browser.
- Accepts `playlistId` (required), `pageToken` (optional), and `maxResults` (optional, clamped to 50).
- Returns YouTube API JSON directly with caching headers (`public, max-age=0, s-maxage=600`).

### `functions/api/youtube-playlist.js`
- Route alias that exposes the same handler at `/api/youtube-playlist` for browser calls.

### `pages/projects/index.html`
- The Projects landing page.
- Lists the main projects and provides navigation back to the homepage.
- Simple, static HTML with no external CSS references.

### `pages/podcast/index.html`
- The Quality Values Podcast page.
- Uses `/assets/styles.css` for layout and card styling.
- JavaScript on this page:
  - Fetches YouTube Data API playlist items through `/api/youtube-playlist`.
  - Paginates through `nextPageToken` until reaching `LIMIT_PER_PLAYLIST` (default 120).
  - Populates horizontal carousels for different playlist categories and a vertical clips column.
  - Shows inline error states if a playlist fails to load.
  - Opens a modal player with an embedded YouTube video when a card is clicked.
- Defines playlist config and per-playlist fetch limits near the top of the script.

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
This site is designed to work as a static Cloudflare Pages project. The YouTube playlist API proxy runs as Pages Functions at `/functions/youtube-playlist.js` and `/api/youtube-playlist`.

### 1) Create the Pages project
1. Push this repository to GitHub.
2. In Cloudflare Dashboard, go to **Workers & Pages → Create → Pages → Connect to Git**.
3. Select the repository and configure the build settings:
   - **Framework preset**: `None`
   - **Build command**: *leave empty*
   - **Build output directory**: `.` (the repo root)
4. Save and deploy.

### 2) Configure the required YouTube API secret
1. In Cloudflare Dashboard, open **Workers & Pages** and select your Pages project.
2. Go to **Settings → Variables and Secrets**.
3. Under **Environment Variables**, add:
   - **Variable name**: `YT_API_KEY`
   - **Value**: your YouTube Data API v3 key
4. Add it for both environments:
   - **Production**
   - **Preview**
5. Save and trigger a redeploy.

### 3) API route used by the podcast page
- The browser calls `https://<your-pages-domain>/api/youtube-playlist?playlistId=<id>&maxResults=50&pageToken=<token>`
- The Pages Function adds the key server-side and forwards to YouTube.

## Local development & testing in GitHub Codespaces
You can run the site locally inside a GitHub Codespace for quick testing.

### Option A: Static preview (fastest)
1. Open a Codespace for this repo.
2. From the terminal, run:
   ```bash
   python -m http.server 8000
   ```
3. Use the “Ports” tab to open the forwarded port in your browser.

### Option B: Pages Functions preview (includes `/api/youtube-playlist`)
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

> Note: If you use Option A (Python server), Pages Functions are not executed. Use Option B to validate API proxy behavior.
