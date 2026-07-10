/**
 * Convert SP Page Builder markup into clean semantic HTML (pi-section / pi-row / pi-col).
 * Port of src/lib/stripSppb.ts for Node migration scripts.
 */
import { parse } from 'node-html-parser';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const KEEP_ATTRS = new Set([
  'href', 'src', 'srcset', 'sizes', 'alt', 'title', 'target', 'rel', 'width', 'height',
  'colspan', 'rowspan', 'type', 'value', 'name', 'placeholder', 'datetime', 'loading',
  'decoding', 'role', 'aria-label', 'aria-hidden', 'aria-labelledby',
]);
const DROP_STYLE_PROPS = /^(visibility|opacity|animation|animation-[a-z]+|transition|transition-[a-z]+|transform|-webkit-transform|-webkit-animation)$/i;
const NODE_TEXT = 3;
const NODE_EL = 1;

function renderHero(h) {
  const secs = h.slideSeconds ?? 6;
  const total = secs * h.images.length;
  const slides = h.images
    .map(
      (src, i) =>
        `<div class="pi-hero__slide" style="background-image:url(${src});animation-duration:${total}s;animation-delay:${i * secs}s"></div>`,
    )
    .join('');
  return `<div class="pi-hero">${slides}<div class="pi-hero__inner"><h1 class="pi-hero__title">${h.title}</h1><p class="pi-hero__sub">${h.sub}</p><a class="pi-hero__cta" href="${h.ctaHref}">${h.ctaText}</a></div></div>`;
}

function collect(css, re, into) {
  for (const m of css.matchAll(re)) {
    into[m[1]] = (into[m[1]] || '') + ';' + m[2];
  }
}

function parseStyleIndex(pageStyles) {
  const css = (pageStyles || []).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const desktop = css.replace(/@media[^{]*\{(?:[^{}]|\{[^}]*\})*\}/g, '');
  const mobileBlock = css.match(/@media\s*\(max-width:\s*767\.98px\)\s*\{((?:[^{}]|\{[^}]*\})*)\}/);
  const mobile = mobileBlock ? mobileBlock[1] : '';

  const sections = {};
  const columnsDesktop = {};
  const columnsMobile = {};
  collect(desktop, /#section-id-([0-9a-f-]+)\s*\{([^}]*)\}/gi, sections);
  collect(desktop, /#column-wrap-id-([0-9a-f-]+)\s*\{([^}]*)\}/gi, columnsDesktop);
  collect(mobile, /#column-wrap-id-([0-9a-f-]+)\s*\{([^}]*)\}/gi, columnsMobile);
  return { sections, columnsDesktop, columnsMobile };
}

function decl(block, prop) {
  if (!block) return null;
  const m = block.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'));
  return m ? m[1].trim() : null;
}

function idSuffix(id, prefix) {
  if (!id) return null;
  return id.startsWith(prefix) ? id.slice(prefix.length) : null;
}

function sectionStyle(block) {
  if (!block) return { style: '', dark: false };
  const parts = [];
  for (const p of ['padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'min-height', 'text-align']) {
    const v = decl(block, p);
    if (v && v !== '0px') parts.push(`${p}:${v}`);
  }
  const bgColor = decl(block, 'background-color');
  const bgImage = decl(block, 'background-image');
  let dark = false;
  if (bgImage && /url\(/i.test(bgImage)) {
    parts.push(`background-image:${bgImage}`);
    const pos = decl(block, 'background-position');
    if (pos) parts.push(`background-position:${pos}`);
    dark = true;
  }
  if (bgColor && !/^(#fff|#ffffff|transparent|rgba\(0, ?0, ?0, ?0\))$/i.test(bgColor)) {
    parts.push(`background-color:${bgColor}`);
  }
  return { style: parts.join(';'), dark };
}

function colStyle(idx, wrapId) {
  if (!wrapId) return '';
  const basis = decl(idx.columnsDesktop[wrapId], 'flex-basis') || decl(idx.columnsDesktop[wrapId], 'max-width');
  return basis ? `--basis:${basis}` : '';
}

function classList(el) {
  return (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
}

function cleanClass(classes) {
  return classes
    .filter((c) => !/^(sppb[-]|wow$|animated?$|addon-root|clearfix$|sp-page-builder$|page-\d+$|builder-container$|sppb$)/.test(c))
    .join(' ');
}

function cleanStyle(style) {
  if (!style) return '';
  return style
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => {
      const prop = d.split(':')[0]?.trim() || '';
      if (DROP_STYLE_PROPS.test(prop)) return false;
      if (/^(visibility)/i.test(prop)) return false;
      return true;
    })
    .join(';');
}

function attrsString(el, extraClass = '', replaceClass) {
  const out = [];
  let cls = replaceClass ?? cleanClass(classList(el));
  if (extraClass) cls = (cls ? cls + ' ' : '') + extraClass;
  if (cls) out.push(`class="${cls}"`);
  for (const [name, value] of Object.entries(el.attributes)) {
    if (name === 'class' || name === 'style' || name === 'id') continue;
    if (name.startsWith('data-') || name.startsWith('x-')) continue;
    if (!KEEP_ATTRS.has(name)) continue;
    out.push(value === '' ? name : `${name}="${value.replace(/"/g, '&quot;')}"`);
  }
  const tag = el.rawTagName?.toLowerCase();
  if (tag === 'img') {
    if (!el.getAttribute('loading')) out.push('loading="lazy"');
    if (!el.getAttribute('decoding')) out.push('decoding="async"');
  }
  const style = cleanStyle(el.getAttribute('style'));
  if (style) out.push(`style="${style}"`);
  return out.length ? ' ' + out.join(' ') : '';
}

function childrenHtml(node, idx, opts) {
  return (node.childNodes || []).map((c) => convert(c, idx, opts)).join('');
}

function convert(node, idx, opts) {
  if (node.nodeType === NODE_TEXT) return node.rawText ?? '';
  if (node.nodeType !== NODE_EL) return '';
  const el = node;
  const tag = el.rawTagName?.toLowerCase();
  if (!tag) return childrenHtml(el, idx, opts);
  if (tag === 'style' || tag === 'script' || tag === 'link') return '';

  const classes = classList(el);
  const has = (c) => classes.includes(c);

  if (has('sppb-section')) {
    if (opts.hero && el.querySelector('.sppb-carousel-pro, [class*="carouselpro"]')) {
      return renderHero(opts.hero);
    }
    const { style, dark } = sectionStyle(idx.sections[idSuffix(el.getAttribute('id'), 'section-id-') || '']);
    const cls = 'pi-section' + (dark ? ' pi-section--dark' : '');
    return `<section class="${cls}"${style ? ` style="${style}"` : ''}>${childrenHtml(el, idx, opts)}</section>`;
  }
  if (has('sppb-row-container')) return `<div class="pi-container">${childrenHtml(el, idx, opts)}</div>`;
  if (has('sppb-row')) {
    const cards = has('sppb-addon-article-layout-editorial-row') || has('sppb-addon-articles-row');
    return `<div class="pi-row${cards ? ' pi-cards' : ''}">${childrenHtml(el, idx, opts)}</div>`;
  }
  if (has('sppb-row-column')) {
    const style = colStyle(idx, idSuffix(el.getAttribute('id'), 'column-wrap-id-'));
    return `<div class="pi-col"${style ? ` style="${style}"` : ''}>${childrenHtml(el, idx, opts)}</div>`;
  }
  if (has('sppb-addon-raw-html') || has('sppb-addon-custom') || has('sppb-addon-html')) {
    return el.innerHTML;
  }

  if (has('sppb-column') || has('sppb-column-addons') || has('sppb-addon-wrapper') || has('sppb-addon')) {
    return childrenHtml(el, idx, opts);
  }
  const id = el.getAttribute('id') || '';
  if (/^sppb-addon-[0-9a-f-]{20,}$/.test(id) && has('clearfix')) {
    return childrenHtml(el, idx, opts);
  }

  const isBtn = has('sppb-btn') || has('sppb-button');
  const extraClass = isBtn ? 'pi-btn' : '';

  if (VOID.has(tag)) return `<${tag}${attrsString(el, extraClass)}>`;
  return `<${tag}${attrsString(el, extraClass)}>${childrenHtml(el, idx, opts)}</${tag}>`;
}

/** @returns {{ html: string, hadBuilder: boolean }} */
export function stripSppb(bodyHtml, pageStyles = [], opts = {}) {
  if (!bodyHtml || !bodyHtml.includes('sppb-section')) {
    return { html: bodyHtml, hadBuilder: false };
  }
  const doc = parse(bodyHtml, { comment: false });
  const builder = doc.querySelector('#sp-page-builder');
  if (!builder) return { html: bodyHtml, hadBuilder: false };

  const idx = parseStyleIndex(pageStyles);
  const container = builder.querySelector('.builder-container') || builder;
  const sections = container.childNodes.map((c) => convert(c, idx, opts)).join('');
  return { html: sections, hadBuilder: true };
}

/** Remove embedded forms/scripts from migrated intro copy (e.g. contact page). */
export function stripEmbeddedForms(html) {
  if (!html) return '';
  const doc = parse(`<div id="wrap">${html}</div>`, { comment: false });
  const wrap = doc.querySelector('#wrap');
  wrap.querySelectorAll('form, script').forEach((el) => el.remove());
  return wrap.innerHTML;
}

/** Pull hand-authored HTML from an SP Page Builder raw-html addon. */
export function extractRawHtmlContent(fragment) {
  if (!fragment?.includes('sppb-addon-raw-html')) return null;
  const doc = parse(fragment, { comment: false });
  const addon =
    doc.querySelector('.sppb-addon-raw-html .sppb-addon-content') ??
    doc.querySelector('.sppb-addon-raw-html');
  const inner = addon?.innerHTML?.trim();
  return inner || null;
}

const THANK_YOU_SECTION_INLINE =
  '<section style="text-align: center; padding: 60px 0; margin-top: 40px; background: linear-gradient(135deg, rgba(40, 80, 60, 0.08), rgba(80, 120, 80, 0.08)); border-radius: 12px; border: 2px solid rgba(40, 80, 60, 0.15);">';

const RAW_HTML_CENTERED_BLOCK_CSS = `
        .intro-text p,
        .hero-subtitle,
        .cta-section p,
        .thank-you-section h3,
        .thank-you-section p {
            margin-left: auto !important;
            margin-right: auto !important;
            text-align: center;
        }

        .thank-you-closing {
            font-size: 1rem;
            color: #666;
            font-style: italic;
            margin: 0 auto !important;
            text-align: center;
            max-width: 42rem;
        }

        .intro-text p,
        .hero-subtitle,
        .cta-section p {
            max-width: none;
        }

        .thank-you-section {
            text-align: center;
            padding: 60px 0;
            margin-top: 40px;
            width: 100%;
            box-sizing: border-box;
            background: linear-gradient(135deg, rgba(40, 80, 60, 0.08), rgba(80, 120, 80, 0.08));
            border-radius: 12px;
            border: 2px solid rgba(40, 80, 60, 0.15);
        }

        .thank-you-section h3,
        .thank-you-section p {
            max-width: 42rem;
        }
`;

/** Split raw page HTML into body markup + global CSS; fix relative image paths. */
export function cleanRawHtmlPage(innerHtml) {
  const doc = parse(`<div id="wrap">${innerHtml}</div>`, { comment: false });
  const wrap = doc.querySelector('#wrap');
  if (!wrap) return { html: '', css: '' };

  const styles = [];
  wrap.querySelectorAll('style').forEach((el) => {
    styles.push(el.innerHTML);
    el.remove();
  });
  wrap.querySelectorAll('script, meta, title, link').forEach((el) => el.remove());

  let html = wrap.innerHTML.trim();
  let css = styles.join('\n');

  const fixPaths = (s) =>
    s
      .replace(/url\(\s*(['"])images\//gi, 'url($1/images/')
      .replace(/src=(['"])images\//gi, 'src=$1/images/')
      .replace(/href=(['"])images\//gi, 'href=$1/images/');

  if (html.includes(THANK_YOU_SECTION_INLINE)) {
    html = html.replace(THANK_YOU_SECTION_INLINE, '<section class="thank-you-section">');
  }
  html = html.replace(
    '<p style="font-size: 1rem; color: #666; font-style: italic; margin: 0;">',
    '<p class="thank-you-closing">',
  );
  if (!css.includes('.thank-you-section')) {
    css = css.trimEnd() + RAW_HTML_CENTERED_BLOCK_CSS;
  } else if (!css.includes('.intro-text p')) {
    css = css.trimEnd() + RAW_HTML_CENTERED_BLOCK_CSS;
  }

  return { html: fixPaths(html), css: fixPaths(css) };
}
