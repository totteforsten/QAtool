=== QAtool ===
Contributors: qatool
Tags: seo, quality assurance, elementor, breakdance, audit
Requires at least: 5.8
Tested up to: 6.6
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later

Connects a WordPress site to the QAtool scanner (Next.js / Vercel) and applies inline fixes to Elementor and Breakdance pages.

== Description ==
The plugin calls out to the companion QAtool scanner, lists findings per page, and lets administrators patch supported issues (alt text, SEO title/description) directly against the page-builder data for Elementor and Breakdance.

== Installation ==
1. Upload `qatool/` to `wp-content/plugins/` or install the zip via Plugins → Add New → Upload.
2. Activate.
3. Go to the new *QAtool* menu item, fill in the scanner endpoint and API key, and run a scan.

== Changelog ==
= 0.1.0 =
Initial release.
