# QAtool

Quality-assurance audits for WordPress sites. Two pieces:

1. **Next.js app** (`app/`, `lib/`) — public scanner deployable to Vercel. Crawls a site, runs SEO + responsive-design checks, returns a JSON report.
2. **WordPress plugin** (`wordpress-plugin/qatool/`) — admin UI that calls the scanner and applies inline fixes against **Elementor** and **Breakdance** page-builder data.

## Two scan modes

**Fast scan (default)** — cheerio, no browser, ~1–3 s per page. SEO / static responsive / WordPress detection.

**Deep scan (`?deep=1`)** — launches Chromium via `puppeteer-core` + `@sparticuz/chromium`, audits every viewport, crawls every link. ~10–30 s per page. Requires Vercel Pro (Hobby's 10 s cap is too tight).

## What it checks

**SEO / meta (both modes)**
- `<title>` presence and length (30–65 chars)
- `<meta name="description">` presence and length (70–165 chars)
- H1 count and heading-level skips
- `<html lang>`, canonical, `robots=noindex`
- Open Graph (`og:title`, `og:description`, `og:image`), Twitter card, favicon
- Mixed content (http assets on https page)

**Accessibility (bundled with SEO)**
- Images missing / empty `alt`
- Images missing intrinsic `width`/`height`

**Responsive (fast mode — heuristic)**
- `<meta name="viewport">` presence, `width=device-width`, user-scalable
- Inline pixel widths ≥600px (overflow risk)
- `<table>` and `<iframe>` elements without responsive wrappers

**Responsive (deep mode — real browser, at mobile 375 + desktop 1280)**
- Horizontal overflow detection: `scrollWidth > clientWidth`, with the exact offending elements (selector + width)
- Elements physically wider than the viewport
- Text rendering below 12 px on mobile
- Touch targets smaller than 44×44 CSS px
- Fixed/sticky elements occupying >30 % of mobile viewport height

**UX / accessibility (deep mode)**
- WCAG AA contrast ratio for every visible text node, using computed colors + inherited background
- Buttons/links without accessible names (no text, no `aria-label`, no `<img alt>`)
- Form inputs missing a `<label>`, `aria-label`, or `aria-labelledby`
- Ambiguous or generic link text ("click here", "read more") + multiple links sharing the same text but pointing to different URLs
- Dead anchors (`href="#"`, `javascript:void(0)`, empty)
- Very long line lengths (>110 chars/line)
- Oversized images (natural >2× rendered) and below-the-fold images without `loading="lazy"`

**Links (deep mode)**
- Extracts every `<a href>` from the rendered DOM
- Concurrent HEAD (falling back to GET) of up to 80 links per page
- Returns status codes, redirect targets, and timeout errors
- Surfaces broken links as a single critical/warning finding plus a full list in the UI

**Visual regression (deep mode / plugin)**
- `/api/snapshot?url=&viewport=mobile|tablet|desktop` returns a PNG
- `/api/compare` takes `{ url, beforePng }`, re-captures, returns pixel-match diff with `beforePng / afterPng / diffPng` + `diffPercent`
- Used by the plugin's "visual-verify each patch" toggle

**Platform detection**
- WordPress (via `wp-content`, generator meta)
- Elementor (`data-elementor-*`, `.elementor-*`, elementor-frontend.js)
- Breakdance (`.bde-*`, breakdance-frontend)
- SEO plugin in use (Yoast / Rank Math / SEOPress / AIOSEO)

> Fast-mode checks are static-HTML only. Deep mode uses Chromium to do everything the static pass can't: layout-based responsive analysis, contrast measurement, link crawling, and visual regression.

## Running locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, enter a URL, pick page count, and scan.

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it into Vercel — default Next.js preset works, no custom build command needed.
3. (Recommended) set `QATOOL_API_KEY` in Project → Settings → Environment Variables. When unset, the API is open.

The scanner APIs (`/api/scan`, `/api/discover`) have `maxDuration: 30` in `vercel.json`. On the Hobby plan the cap is 10s — scan one URL at a time (the UI already does this).

## API

Both routes accept an optional `x-qatool-key` header (required if `QATOOL_API_KEY` is set).

### `GET /api/discover?url=<site>&max=50`
Returns `{ ok: true, urls: string[], source: string }`. Tries `/sitemap.xml`, `/sitemap_index.xml`, `/wp-sitemap.xml`, then falls back to homepage-link crawling.

### `GET /api/scan?url=<page>&deep=1&viewports=mobile,desktop&checkLinks=0`  (or `POST { url, deep, viewports, checkLinks }`)
Returns `{ ok: true, report: PageReport }`. When `deep=1` the report also contains `viewports[]` and `links[]`. See `lib/types.ts`.

### `GET /api/snapshot?url=<page>&viewport=desktop|tablet|mobile&fullPage=0`
Returns a PNG (or JSON with a base64 `png` if `Accept: application/json`).

### `POST /api/compare` with `{ url, beforePng, viewport?, fullPage? }`
Re-captures the URL, diffs against the provided before-PNG, returns `{ diffPercent, beforePng, afterPng, diffPng }` (all base64).

## WordPress plugin

Zip the `wordpress-plugin/qatool/` folder and upload under *Plugins → Add New → Upload*, or symlink during development.

1. Activate, open the **QAtool** menu.
2. Set scanner endpoint + API key.
3. Click **Scan this site**. Toggle **Deep scan** for Puppeteer-powered audits, **Visual-verify each patch** for before/after diffs, and **Auto-revert if diff > 5%** to undo breaking patches automatically.
4. Each finding with a supported `patch` gets an inline input + **Apply** button.
5. A **Revert history** panel lists every patch applied to a page; the **Revert** button restores the original value (from the stored `before_value`).

### Visual-verify flow

When the toggle is on, Apply does the following:
1. Browser calls `/api/snapshot?url=` against the live page to capture a *before* PNG.
2. Browser sends the patch to WordPress, which saves the original value in the page's `_qatool_history` meta.
3. Browser posts `{ url, beforePng }` to `/api/compare`; Puppeteer re-captures and returns a diff.
4. A modal shows `Before / After / Diff` side-by-side with Keep / Revert buttons.
5. If auto-revert is on and `diffPercent > 5`, revert fires automatically.

### Reverting

Every successful patch records a reversible entry in `_qatool_history` post meta:
- `patch_type`, `target`, `before_value`, `after_value`, `applied_at`, `applied_by`, `builder`, `meta_key`, optional `visual` `{ diff_percent, viewport }`.
- Entries are capped at 50 per post.
- `QATool_Revert::revert($post_id, $entry_id)` replays the inverse — writing the old SEO meta value back, or walking the builder tree again with the previous alt text.
- The AJAX endpoint `qatool_revert` calls this and is triggered from both the inline Revert button and the auto-revert path.

### Patch types implemented

| Patch | Elementor | Breakdance | Classic / Gutenberg |
|---|---|---|---|
| `alt-text` | ✅ Walks `_elementor_data`, updates `settings.image.alt` (widgets + gallery/carousel + background) + attachment `_wp_attachment_image_alt` | ✅ Walks `breakdance_data` (new `tree_json_string` or legacy `tree`), updates `properties.content.image.alt` | ✅ Updates attachment alt if URL → attachment can be resolved |
| `meta-title` | via SEO plugin (Yoast / Rank Math / AIOSEO) | same | same |
| `meta-description` | via SEO plugin | same | same |
| `canonical` | via SEO plugin | same | same |
| `add-viewport` | ❌ must be added in the theme header | same | same |
| `image-dimensions` | Reports attachment intrinsic size; actual output is theme-level | same | same |

All patches resolve a post ID with `url_to_postid()` + slug fallback, then route by detected builder.

## Architecture notes

- **No database.** `/api/scan` is stateless; the plugin calls it on demand. Revert history lives in WordPress post meta, not on the scanner. If you want persistent scan history, wire in Vercel KV or Postgres and store reports keyed by site URL.
- **Serverless-friendly crawl.** The UI and plugin call `/api/discover` once, then `/api/scan?url=` per page in sequence. Each function invocation handles one page, well under Vercel limits.
- **Chromium on Vercel.** `puppeteer-core` and `@sparticuz/chromium` are listed as `serverExternalPackages` in `next.config.mjs`; Vercel bundles the Chromium binary into the deployed function. The Hobby plan's 10 s function limit is too tight for deep scans — use **Pro** (60 s, configurable to 300 s) if you want deep mode.
- **Local dev.** In non-Lambda environments the browser helper tries, in order: (1) `QATOOL_BROWSER_WS` (remote headless service), (2) `QATOOL_CHROME_EXECUTABLE` → a local Chrome binary, (3) a dynamically-imported `puppeteer` devDependency, (4) `@sparticuz/chromium` as a last resort. Set `QATOOL_BROWSER_MODE` to `lambda` / `local-chrome` / `local-puppeteer` / `remote` to force one.

## Troubleshooting deep scan

**`libnss3.so: cannot open shared object file`** (or similar `libatk`, `libcups`, `libgbm`, `libasound`)
Your host is missing system libraries Chromium depends on. This almost always happens when the Lambda-packaged binary from `@sparticuz/chromium` runs on a non-Lambda Linux host (including `vercel dev` on some distros). Fixes, in order of preference:

1. **Install the libs** (Debian/Ubuntu):
   ```bash
   sudo apt-get update && sudo apt-get install -y \
     libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 \
     libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
     libcairo2 libasound2
   ```
2. **Point to an existing Chrome**:
   ```bash
   export QATOOL_CHROME_EXECUTABLE=$(which google-chrome || which chromium)
   ```
3. **Install full Puppeteer for dev**: `npm i -D puppeteer` — this downloads a self-contained Chromium.
4. **Use a hosted browser** (browserless, etc.) by setting `QATOOL_BROWSER_WS=wss://...`.

**Still fails on Vercel?** Bump the function memory to ≥1024 MB in `vercel.json` and confirm `maxDuration: 60` (already set for `/api/scan`, `/api/snapshot`, `/api/compare`). The Hobby plan's 10 s cap is too tight for Puppeteer — use Pro.

## Directory layout

```
app/
  api/discover/route.ts     # sitemap / link discovery
  api/scan/route.ts         # per-URL audit
  components/ScanRunner.tsx # client UI that loops through URLs
  components/ReportCard.tsx # per-page collapsible report
  page.tsx, layout.tsx, globals.css
lib/
  fetch-page.ts     # timed fetch w/ UA
  wp-detect.ts      # WordPress / Elementor / Breakdance detection
  seo-checks.ts     # title, desc, OG, images, headings, mixed content
  responsive-checks.ts # viewport, fixed widths, table/iframe wrapping
  sitemap.ts        # /sitemap.xml, /wp-sitemap.xml, homepage fallback
  scan.ts           # orchestrator
  types.ts, auth.ts
wordpress-plugin/qatool/
  qatool.php
  includes/
    class-admin.php
    class-api-client.php
    class-patcher.php
    class-elementor-patcher.php
    class-breakdance-patcher.php
  assets/admin.css, assets/admin.js
vercel.json, next.config.mjs, tsconfig.json, package.json
```

## License

GPL-2.0-or-later for the WordPress plugin (required). The Next.js app is MIT.
