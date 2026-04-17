/**
 * Script evaluated inside the target page. Returns an array of findings
 * describing responsive / accessibility / UX issues detectable only after
 * layout. Writing as a plain function string keeps it serializable for
 * puppeteer's `page.evaluate` — do NOT import anything here.
 */

export interface InPageFinding {
  code: string;
  severity: "critical" | "warning" | "info";
  category: "responsive" | "accessibility" | "ux" | "perf";
  message: string;
  offenders?: Array<Record<string, unknown>>;
}

export const IN_PAGE_CHECKS_SCRIPT = `
(() => {
  const findings = [];
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const isMobile = vw < 500;
  const add = (f) => findings.push(f);

  function cssPath(el) {
    if (!(el instanceof Element)) return '';
    const path = [];
    let cur = el;
    while (cur && cur.nodeType === 1) {
      let sel = cur.nodeName.toLowerCase();
      if (cur.id) { path.unshift(sel + '#' + cur.id); break; }
      let nth = 1, sib = cur;
      while ((sib = sib.previousElementSibling)) nth++;
      sel += ':nth-child(' + nth + ')';
      path.unshift(sel);
      cur = cur.parentElement;
      if (path.length > 6) break;
    }
    return path.join(' > ');
  }

  function parseColor(str) {
    if (!str) return null;
    const m = str.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p[3] == null ? 1 : p[3] };
  }
  function findBg(el) {
    let cur = el;
    while (cur && cur !== document.documentElement) {
      const c = parseColor(getComputedStyle(cur).backgroundColor);
      if (c && c.a > 0.5) return c;
      cur = cur.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  function lum({ r, g, b }) {
    const a = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }
  function contrast(c1, c2) {
    const l1 = lum(c1), l2 = lum(c2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  // 1. Horizontal overflow
  const sw = document.documentElement.scrollWidth;
  if (sw > vw + 1) {
    const off = [];
    document.querySelectorAll('body *').forEach((el) => {
      if (off.length >= 10) return;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 0 && r.height > 0) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed') return;
        off.push({ tag: el.tagName, selector: cssPath(el), right: Math.round(r.right), width: Math.round(r.width) });
      }
    });
    add({
      code: 'horizontal-overflow',
      severity: 'critical',
      category: 'responsive',
      message: 'Document scrolls horizontally by ' + (sw - vw) + 'px at ' + vw + 'px viewport.',
      offenders: off.slice(0, 5)
    });
  }

  // 2. Elements physically wider than viewport
  if (isMobile) {
    const tooWide = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > vw + 2 && r.height > 0) {
        tooWide.push({ tag: el.tagName, selector: cssPath(el), width: Math.round(r.width) });
      }
    });
    if (tooWide.length) add({
      code: 'element-wider-than-viewport',
      severity: 'warning',
      category: 'responsive',
      message: tooWide.length + ' element(s) render wider than the mobile viewport.',
      offenders: tooWide.slice(0, 5)
    });
  }

  // 3. Tiny text on mobile
  if (isMobile) {
    const small = [];
    const SEL = 'p, li, span, a, button, label, td, th, dd, dt, div';
    document.querySelectorAll(SEL).forEach((el) => {
      if (small.length >= 15) return;
      const t = (el.innerText || '').trim();
      if (!t || t.length < 2) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs && fs < 12) small.push({ selector: cssPath(el), fontSize: fs, text: t.slice(0, 40) });
    });
    if (small.length) add({
      code: 'tiny-text-mobile',
      severity: 'warning',
      category: 'responsive',
      message: small.length + ' text element(s) render below 12px on mobile.',
      offenders: small.slice(0, 5)
    });
  }

  // 4. Small touch targets on mobile
  if (isMobile) {
    const tiny = [];
    document.querySelectorAll('a, button, [role=button], input[type=button], input[type=submit], input[type=checkbox], input[type=radio]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if ((r.width < 44 || r.height < 44) && el.getClientRects().length) {
        tiny.push({ selector: cssPath(el), width: Math.round(r.width), height: Math.round(r.height) });
      }
    });
    if (tiny.length) add({
      code: 'small-touch-targets',
      severity: 'warning',
      category: 'ux',
      message: tiny.length + ' interactive element(s) are smaller than 44x44px.',
      offenders: tiny.slice(0, 5)
    });
  }

  // 5. Low contrast
  const contrastIssues = [];
  document.querySelectorAll('p, span, a, button, h1, h2, h3, h4, h5, h6, li, td, th, label, dd, dt').forEach((el) => {
    if (contrastIssues.length >= 20) return;
    const t = (el.innerText || '').trim();
    if (!t) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    const fg = parseColor(cs.color);
    const bg = findBg(el);
    if (!fg || !bg) return;
    const ratio = contrast(fg, bg);
    const fs = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight) >= 700;
    const large = fs >= 24 || (fs >= 18.66 && bold);
    const min = large ? 3 : 4.5;
    if (ratio < min) {
      contrastIssues.push({ selector: cssPath(el), ratio: Math.round(ratio * 10) / 10, required: min, text: t.slice(0, 40) });
    }
  });
  if (contrastIssues.length) add({
    code: 'low-contrast',
    severity: 'warning',
    category: 'accessibility',
    message: contrastIssues.length + ' text element(s) fail WCAG AA contrast.',
    offenders: contrastIssues.slice(0, 5)
  });

  // 6. Unnamed controls
  const unnamed = [];
  document.querySelectorAll('button, a, [role=button]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const txt = (el.innerText || '').trim();
    const label = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    const imgAlt = el.querySelector('img[alt]');
    const altText = imgAlt ? (imgAlt.getAttribute('alt') || '').trim() : '';
    if (!txt && !label.trim() && !altText) unnamed.push({ selector: cssPath(el), html: el.outerHTML.slice(0, 120) });
  });
  if (unnamed.length) add({
    code: 'unnamed-control',
    severity: 'warning',
    category: 'accessibility',
    message: unnamed.length + ' interactive element(s) without accessible name.',
    offenders: unnamed.slice(0, 5)
  });

  // 7. Form inputs without labels
  const unlabeled = [];
  document.querySelectorAll('input, select, textarea').forEach((el) => {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'image', 'reset'].includes(type)) return;
    if (!el.getClientRects().length) return;
    const id = el.id;
    const hasFor = id ? !!document.querySelector('label[for="' + CSS.escape(id) + '"]') : false;
    const inLabel = !!el.closest('label');
    const ariaL = el.getAttribute('aria-label');
    const ariaLb = el.getAttribute('aria-labelledby');
    if (!hasFor && !inLabel && !ariaL && !ariaLb) {
      unlabeled.push({ selector: cssPath(el), name: el.getAttribute('name'), placeholder: el.getAttribute('placeholder') });
    }
  });
  if (unlabeled.length) add({
    code: 'unlabeled-input',
    severity: 'warning',
    category: 'accessibility',
    message: unlabeled.length + ' form field(s) without an associated <label>.',
    offenders: unlabeled.slice(0, 5)
  });

  // 8. Ambiguous link text
  const byText = new Map();
  document.querySelectorAll('a[href]').forEach((a) => {
    const t = (a.innerText || '').trim().toLowerCase();
    if (!t || t.length < 2) return;
    const list = byText.get(t) || [];
    list.push(a.href);
    byText.set(t, list);
  });
  const dupes = [];
  for (const [text, urls] of byText) {
    const uniq = Array.from(new Set(urls));
    if (uniq.length > 1 && ['read more', 'click here', 'here', 'more', 'link'].includes(text) === false) {
      dupes.push({ text, destinations: uniq.length });
    }
  }
  if (dupes.length) add({
    code: 'ambiguous-link-text',
    severity: 'info',
    category: 'ux',
    message: dupes.length + ' link label(s) point to multiple destinations.',
    offenders: dupes.slice(0, 5)
  });

  // 9. Generic "click here" / "read more" anchors
  const generic = [];
  document.querySelectorAll('a[href]').forEach((a) => {
    const t = (a.innerText || '').trim().toLowerCase();
    if (['click here', 'read more', 'more', 'here', 'link'].includes(t)) {
      generic.push({ selector: cssPath(a), href: a.getAttribute('href') });
    }
  });
  if (generic.length) add({
    code: 'generic-link-text',
    severity: 'info',
    category: 'ux',
    message: generic.length + ' link(s) use generic text ("click here", "read more").',
    offenders: generic.slice(0, 5)
  });

  // 10. Sticky/fixed consuming viewport
  if (isMobile) {
    const sticky = [];
    document.querySelectorAll('body *').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'sticky') {
        const r = el.getBoundingClientRect();
        if (r.height > vh * 0.3) sticky.push({ selector: cssPath(el), heightPct: Math.round((r.height / vh) * 100) });
      }
    });
    if (sticky.length) add({
      code: 'fixed-consumes-viewport',
      severity: 'info',
      category: 'ux',
      message: sticky.length + ' fixed/sticky element(s) occupy >30% of viewport height on mobile.',
      offenders: sticky.slice(0, 5)
    });
  }

  // 11. Oversized images
  const wasted = [];
  document.querySelectorAll('img').forEach((img) => {
    if (!img.getClientRects().length) return;
    if (img.naturalWidth && img.width && img.naturalWidth > img.width * 2) {
      wasted.push({ selector: cssPath(img), natural: img.naturalWidth, rendered: img.width, src: img.currentSrc || img.src });
    }
  });
  if (wasted.length) add({
    code: 'oversized-image',
    severity: 'info',
    category: 'perf',
    message: wasted.length + ' image(s) loaded at more than 2x their rendered size.',
    offenders: wasted.slice(0, 5)
  });

  // 12. Below-the-fold images without lazy loading
  const notLazy = [];
  document.querySelectorAll('img').forEach((img) => {
    const r = img.getBoundingClientRect();
    if (r.top > vh && img.loading !== 'lazy' && img.getClientRects().length) {
      notLazy.push({ selector: cssPath(img), top: Math.round(r.top) });
    }
  });
  if (notLazy.length) add({
    code: 'missing-lazy-load',
    severity: 'info',
    category: 'perf',
    message: notLazy.length + ' below-the-fold image(s) without loading="lazy".',
    offenders: notLazy.slice(0, 5)
  });

  // 13. Very long line length (reading comfort)
  const longLines = [];
  document.querySelectorAll('p, li, blockquote').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
    const cpl = r.width / (fs * 0.5);
    if (cpl > 110) longLines.push({ selector: cssPath(el), charsPerLine: Math.round(cpl) });
  });
  if (longLines.length >= 3) add({
    code: 'long-line-length',
    severity: 'info',
    category: 'ux',
    message: longLines.length + ' paragraph(s) exceed ~110 characters per line; reading comfort suffers.',
    offenders: longLines.slice(0, 5)
  });

  // 14. Empty / broken-looking anchors
  const emptyHref = [];
  document.querySelectorAll('a').forEach((a) => {
    const h = (a.getAttribute('href') || '').trim();
    if (h === '' || h === '#' || /^javascript:\\s*void/i.test(h)) {
      emptyHref.push({ selector: cssPath(a), text: (a.innerText || '').slice(0, 40), href: h });
    }
  });
  if (emptyHref.length) add({
    code: 'dead-anchor',
    severity: 'info',
    category: 'ux',
    message: emptyHref.length + ' anchor(s) point to "#", empty href, or javascript:void.',
    offenders: emptyHref.slice(0, 5)
  });

  return findings;
})();
`;
