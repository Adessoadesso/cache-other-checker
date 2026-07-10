import fs from 'node:fs';

const path = 'src/data/pages/about.json';
const page = JSON.parse(fs.readFileSync(path, 'utf8'));

const introFix = `
        .intro-text p,
        .hero-subtitle,
        .cta-section p {
            margin-left: auto;
            margin-right: auto;
            text-align: center;
            max-width: none;
        }

        .thank-you-section {
            width: 100%;
            box-sizing: border-box;
        }
`;

if (!page.css.includes('.intro-text p')) {
  page.css = page.css.trimEnd() + introFix;
  fs.writeFileSync(path, `${JSON.stringify(page, null, 2)}\n`);
  console.log('Patched about.json centered-block CSS');
} else {
  console.log('about.json already has intro-text p rules');
}
