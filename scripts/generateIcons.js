// Renderiza o logo do componente BrandLogo.tsx como PNG nos tamanhos
// exigidos pelo manifest (192, 512, maskable-512).
//
// Saídas substituem os arquivos em public/icons/:
//   - icon-192.png
//   - icon-512.png
//   - icon-maskable-512.png  (com safe-zone interna de 80% pra Android maskable)
//
// Uso:
//   node scripts/generateIcons.js

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const outDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// SVG do BrandLogo (idêntico ao componente React).
// Quadrado 1024x1024 com fundo preto + L gigante em branco com marcações de régua.
const baseSvg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#000000" rx="180"/>
  <rect x="128" y="128" width="768" height="768" rx="180" fill="none" stroke="#FFFFFF" stroke-width="12"/>
  <path d="M360 300 H440 V620 H760 V700 H360 Z" fill="#FFFFFF"/>
  <g stroke="#000000" stroke-width="6" stroke-linecap="round">
    <line x1="360" y1="340" x2="400" y2="340"/>
    <line x1="360" y1="420" x2="400" y2="420"/>
    <line x1="360" y1="500" x2="400" y2="500"/>
    <line x1="360" y1="580" x2="400" y2="580"/>
    <line x1="360" y1="380" x2="385" y2="380"/>
    <line x1="360" y1="460" x2="385" y2="460"/>
    <line x1="360" y1="540" x2="385" y2="540"/>
    <line x1="420" y1="700" x2="420" y2="660"/>
    <line x1="520" y1="700" x2="520" y2="660"/>
    <line x1="620" y1="700" x2="620" y2="660"/>
    <line x1="720" y1="700" x2="720" y2="660"/>
    <line x1="470" y1="700" x2="470" y2="675"/>
    <line x1="570" y1="700" x2="570" y2="675"/>
    <line x1="670" y1="700" x2="670" y2="675"/>
  </g>
</svg>`;

// Maskable: o Android aplica uma máscara (circular, squircle, etc.) sobre o ícone,
// então o conteúdo importante precisa caber na "safe-zone" central de 80% do canvas.
// Solução: fundo preto FULL-BLEED (sem cantos arredondados, eles serão mascarados)
// + logo escalado pra ocupar só 80% do centro.
const maskableSvg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#000000"/>
  <g transform="translate(102.4, 102.4) scale(0.8)">
    <rect x="128" y="128" width="768" height="768" rx="180" fill="none" stroke="#FFFFFF" stroke-width="12"/>
    <path d="M360 300 H440 V620 H760 V700 H360 Z" fill="#FFFFFF"/>
    <g stroke="#000000" stroke-width="6" stroke-linecap="round">
      <line x1="360" y1="340" x2="400" y2="340"/>
      <line x1="360" y1="420" x2="400" y2="420"/>
      <line x1="360" y1="500" x2="400" y2="500"/>
      <line x1="360" y1="580" x2="400" y2="580"/>
      <line x1="360" y1="380" x2="385" y2="380"/>
      <line x1="360" y1="460" x2="385" y2="460"/>
      <line x1="360" y1="540" x2="385" y2="540"/>
      <line x1="420" y1="700" x2="420" y2="660"/>
      <line x1="520" y1="700" x2="520" y2="660"/>
      <line x1="620" y1="700" x2="620" y2="660"/>
      <line x1="720" y1="700" x2="720" y2="660"/>
      <line x1="470" y1="700" x2="470" y2="675"/>
      <line x1="570" y1="700" x2="570" y2="675"/>
      <line x1="670" y1="700" x2="670" y2="675"/>
    </g>
  </g>
</svg>`;

async function render(svg, size, name) {
  const out = path.join(outDir, name);
  const info = await sharp(Buffer.from(svg))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  ✓ ${name}  (${info.width}x${info.height}, ${(info.size / 1024).toFixed(1)} KB)`);
}

(async () => {
  console.log('Gerando ícones a partir do BrandLogo SVG:');
  await render(baseSvg,     192, 'icon-192.png');
  await render(baseSvg,     512, 'icon-512.png');
  await render(maskableSvg, 512, 'icon-maskable-512.png');
  console.log(`\nArquivos em: ${outDir}`);
})().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
