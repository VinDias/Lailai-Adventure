// Gera o feature graphic 1024x500 exigido pela Google Play Store.
// Saída: play-store-assets/feature-graphic.png
//
// Uso:
//   node scripts/generateFeatureGraphic.js

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const W = 1024;
const H = 500;

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#000000"/>
      <stop offset="100%" stop-color="#0a0a0a"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.78" cy="0.28" r="0.55">
      <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.35"/>
      <stop offset="60%" stop-color="#f43f5e" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#f43f5e" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="textShine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#d4d4d8"/>
    </linearGradient>
  </defs>

  <!-- Fundo -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- Linhas decorativas sutis -->
  <line x1="0" y1="${H - 1}" x2="${W}" y2="${H - 1}" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1"/>
  <line x1="64" y1="${H / 2}" x2="160" y2="${H / 2}" stroke="#f43f5e" stroke-opacity="0.9" stroke-width="3"/>

  <!-- Wordmark -->
  <text x="64" y="${H / 2 - 18}"
        font-family="Inter, 'Helvetica Neue', Arial, sans-serif"
        font-weight="900"
        font-size="128"
        letter-spacing="-4"
        fill="url(#textShine)">LORFLUX</text>

  <!-- Tagline -->
  <text x="64" y="${H / 2 + 50}"
        font-family="Inter, 'Helvetica Neue', Arial, sans-serif"
        font-weight="700"
        font-size="22"
        letter-spacing="6"
        text-transform="uppercase"
        fill="#a1a1aa">CINEMATIC COMICS</text>

  <text x="64" y="${H / 2 + 88}"
        font-family="Inter, 'Helvetica Neue', Arial, sans-serif"
        font-weight="400"
        font-size="18"
        fill="#71717a">Histórias em vídeo, episódio a episódio.</text>
</svg>
`;

const outDir = path.join(__dirname, '..', 'play-store-assets');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'feature-graphic.png');

sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toFile(outPath)
  .then(info => {
    console.log(`✓ Feature graphic gerado: ${outPath}`);
    console.log(`  ${info.width}x${info.height}, ${(info.size / 1024).toFixed(1)} KB`);
  })
  .catch(err => {
    console.error('✗ Erro ao gerar feature graphic:', err.message);
    process.exit(1);
  });
