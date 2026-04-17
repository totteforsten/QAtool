# QAtool

Quality-assurance audits for WordPress sites. Two pieces:

1. **Next.js app** (`app/`, `lib/`) — public scanner deployable to Vercel. Crawls a site, runs SEO + responsive-design checks, returns a JSON report.
2. **WordPress plugin** (`wordpress-plugin/qatool/`) — admin UI that calls the scanner and applies inline fixes against **Elementor** and **Breakdance** page-builder data.

## What it checks

**SEO / meta**
- `<title>` presence and length (30–65 chars)
- `<meta name="description">` presence and length (70–165 chars)
- H1 count and heading-level skips
- `<html lang>`, canonical, `robots=noindex`
- Open Graph (`og:title`, `og:description`, `og:image`), Twitter card, favicon
- Mixed content (http assets on https page)

**Accessibility (bundled with SEO)**
- Images missing / empty `alt`
- Images missing intrinsic `width`/`height`

**Responsive**
- `<meta name="viewport">` presence, `width=device-width`, user-scalable
- Inline pixel widths ≥600px (overflow risk)
- `<table>` and `<iframe>` elements without responsive wrappers

**Platform detection**
- WordPress (via `wp-content`, generator meta)
- Elementor (`data-elementor-*`, `.elementor-*`, elementor-frontend.js)
- Breakdance (`.bde-*`, breakdance-frontend)
- SEO plugin in use (Yoast / Rank Math / SEOPress / AIOSEO)

> Checks are static-HTML only; we don't launch a headless browser. That's a deliberate Vercel-serverless tradeoff. Things like real CLS, viewport overflow after layout, or dynamic JS-injected SEO are out of scope.

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

### `GET /api/scan?url=<page>`  (or `POST { url }`)
Returns `{ ok: true, report: PageReport }`. See `lib/types.ts` for the full shape.

## WordPress plugin

Zip the `wordpress-plugin/qatool/` folder and upload under *Plugins → Add New → Upload*, or symlink during development.

1. Activate, open the **QAtool** menu.
2. Set scanner endpoint + API key.
3. Click **Scan this site**.
4. Each finding with a supported `patch` gets an inline input + **Apply** button.

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

- **No database.** `/api/scan` is stateless; the plugin calls it on demand. If you want persistent scan history, wire in Vercel KV / Postgres and store reports keyed by site URL.
- **Serverless-friendly crawl.** The UI and plugin call `/api/discover` once, then `/api/scan?url=` per page in sequence. Each function invocation handles one page, well under Vercel limits.
- **No headless browser.** For real-viewport screenshots and layout-based responsive checks, run Playwright/Puppeteer in a separate worker (e.g. Browserless, a Fly machine, or a GitHub Action) and POST the results into a future `/api/reports` endpoint.

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
