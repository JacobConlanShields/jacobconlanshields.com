# jacobconlanshields.com
Personal website to display arrays of talent

## Overview
This repository is a static personal website with a small amount of JavaScript for dynamic content (YouTube feed parsing, a modal video player, an ebook viewer, and an interactive YouTube flowchart wireframe tool). It is intended to be hosted on Cloudflare Pages, optionally using Cloudflare Pages Functions for the YouTube feed proxy. The site is built from plain HTML, CSS, and JavaScript—no build step required.

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
- Lists the main projects and provides navigation back to the homepage.
- Simple, static HTML with no external CSS references.


### `pages/projects/video-flowchart/index.html`
- An interactive wireframe tool for mapping YouTube playlist videos onto a whiteboard.
- Supports loading playlist videos into a draggable video bank.
- Allows dragging video nodes onto a dotted board, adding text-box nodes, and drawing arrow links between nodes in connect mode.
- Styled to visually echo the provided flowchart reference (rounded green actions, purple decision-like node styling, dotted canvas feel).

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
