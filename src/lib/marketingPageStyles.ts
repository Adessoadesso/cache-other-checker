/**
 * Layout styles for migrated SP Page Builder pages (pi-section / pi-row / pi-col).
 * Scoped under `.marketing-page` — no Joomla or builder class names.
 */
export const marketingPageCss = `
.marketing-page {
  --pi-ink: var(--color-ink);
  --pi-cream: var(--color-paper);
  --pi-green: var(--color-forest-500);
  --pi-green-dark: var(--color-forest-700);
  --pi-gold: var(--color-gold-500);
  --pi-text: var(--color-ink-soft);
  --pi-muted: var(--color-forest-300);
  --pi-rule: var(--color-line);
  --pi-max: 1180px;
}

.marketing-page .pi-section {
  padding: 64px 0;
  background-size: cover;
  background-position: center;
}
.marketing-page .pi-section + .pi-section { padding-top: 0; }
.marketing-page .pi-section.pi-section--bg { background-color: var(--color-paper-dim); }
.marketing-page .pi-section.pi-section--dark { color: #f4f1ea; }
.marketing-page .pi-section.pi-section--dark h1,
.marketing-page .pi-section.pi-section--dark h2,
.marketing-page .pi-section.pi-section--dark h3 { color: #fff; }

.marketing-page .pi-container {
  max-width: var(--pi-max);
  margin-inline: auto;
  padding-inline: 20px;
}
.marketing-page .pi-row {
  display: flex;
  gap: 32px;
  align-items: flex-start;
}
.marketing-page .pi-col {
  flex: 1 1 var(--basis, 0);
  min-width: 0;
}
.marketing-page .pi-row.pi-cards { flex-wrap: wrap; }
.marketing-page .pi-row.pi-cards > * { flex: 1 1 300px; }

@media (max-width: 767px) {
  .marketing-page .pi-row { flex-direction: column; }
  .marketing-page .pi-col { flex-basis: auto; }
  .marketing-page .pi-section { padding: 44px 0; }
}

.marketing-page h1,
.marketing-page h2,
.marketing-page h3,
.marketing-page h4 {
  font-family: var(--font-display);
  color: var(--pi-ink);
  font-weight: 600;
  line-height: 1.15;
  margin: 0 0 0.5em;
}
.marketing-page h2 { font-size: clamp(1.7rem, 3vw, 2.4rem); }
.marketing-page h3 { font-size: clamp(1.35rem, 2.2vw, 1.7rem); }
.marketing-page p,
.marketing-page li {
  font-family: var(--font-body);
  color: var(--pi-text);
  font-size: 1.05rem;
  line-height: 1.7;
}
.marketing-page p { margin: 0 0 1.1em; }
.marketing-page a { color: var(--pi-green); }
.marketing-page a:hover { color: var(--pi-green-dark); }

.marketing-page img { max-width: 100%; height: auto; }
.marketing-page .pi-col img,
.marketing-page figure img { border-radius: 10px; display: block; }
.marketing-page figure { margin: 0; }
.marketing-page figcaption {
  font-family: var(--font-body);
  font-size: 0.82rem;
  color: var(--pi-muted);
  margin-top: 8px;
  text-align: center;
}

.marketing-page .pi-btn,
.marketing-page a.pi-btn {
  display: inline-block;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.95rem;
  letter-spacing: 0.02em;
  padding: 12px 26px;
  border-radius: 6px;
  background: var(--pi-green);
  color: #fff;
  text-decoration: none;
  border: 0;
  transition: background 0.2s ease;
}
.marketing-page .pi-btn:hover,
.marketing-page a.pi-btn:hover { background: var(--pi-green-dark); color: #fff; }

.marketing-page .pi-row.pi-cards { gap: 28px; }
.marketing-page .pi-card {
  background: #fff;
  border: 1px solid var(--pi-rule);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.marketing-page .pi-card img { border-radius: 0; width: 100%; object-fit: cover; }

.marketing-page .pi-hero {
  position: relative;
  width: 100vw;
  margin-left: calc(50% - 50vw);
  height: min(88vh, 820px);
  overflow: hidden;
  background: #0b0b0c;
}
.marketing-page .pi-hero__slide {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  opacity: 0;
  animation-name: pi-hero-fade;
  animation-iteration-count: infinite;
  animation-timing-function: ease-in-out;
  will-change: opacity;
}
.marketing-page .pi-hero::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.10) 45%, rgba(0,0,0,0.70) 100%);
}
@keyframes pi-hero-fade {
  0%   { opacity: 0; }
  4%   { opacity: 1; }
  25%  { opacity: 1; }
  29%  { opacity: 0; }
  100% { opacity: 0; }
}
.marketing-page .pi-hero__inner {
  position: absolute;
  inset: auto 0 0 0;
  z-index: 2;
  max-width: var(--pi-max);
  margin-inline: auto;
  padding: 0 24px 8vh;
  color: #fff;
}
.marketing-page .pi-hero__title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: clamp(2.4rem, 6vw, 4.6rem);
  line-height: 1.02;
  margin: 0 0 0.3em;
  color: #fff;
  text-shadow: 0 2px 24px rgba(0,0,0,0.55);
}
.marketing-page .pi-hero__sub {
  font-family: var(--font-body);
  font-size: clamp(1rem, 2vw, 1.35rem);
  max-width: 40ch;
  color: #f4f1ea;
  margin: 0 0 1.6em;
  text-shadow: 0 1px 12px rgba(0,0,0,0.6);
}
.marketing-page .pi-hero__cta {
  display: inline-block;
  font-family: var(--font-body);
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 14px 30px;
  border-radius: 6px;
  background: var(--pi-green);
  color: #fff;
  text-decoration: none;
}
.marketing-page .pi-hero__cta:hover { background: var(--pi-green-dark); color: #fff; }

@media (prefers-reduced-motion: reduce) {
  .marketing-page .pi-hero__slide { animation: none; }
  .marketing-page .pi-hero__slide:first-child { opacity: 1; }
}

.marketing-subnav {
  padding-block: var(--space-l) var(--space-xl);
  border-top: 1px solid var(--color-line);
  max-width: var(--pi-max);
  margin-inline: auto;
  padding-inline: 20px;
}
.marketing-subnav h2 {
  font-family: var(--font-display);
  font-size: var(--step-0);
  margin-bottom: var(--space-s);
}
.marketing-subnav ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.4rem;
}
.marketing-subnav a {
  color: var(--color-forest-700);
  font-weight: 600;
  text-decoration: none;
}
.marketing-subnav a:hover { text-decoration: underline; }

.marketing-breadcrumb {
  padding-block: var(--space-s);
  max-width: var(--pi-max);
  margin-inline: auto;
  padding-inline: 20px;
}
.marketing-breadcrumb a {
  color: var(--color-forest-700);
  font-weight: 700;
  text-decoration: none;
}
.marketing-breadcrumb a:hover { text-decoration: underline; }
`;
