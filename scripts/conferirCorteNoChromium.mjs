/**
 * Confere o corte das páginas altas NO NAVEGADOR DE VERDADE (Chromium), com o
 * mesmo código que a tela usa (utils/envioPasta.ts + shared/organizacaoEpisodio.mjs).
 * jsdom não tem canvas; este script é o pedaço do item 4/5 da frente A que os
 * testes de componente não alcançam.
 *
 * Uso:
 *   node scripts/conferirCorteNoChromium.mjs <pasta do episódio> [pasta de saída]
 *
 * Para cada recorte que o servidor pediria: corta com preparadorDoNavegador,
 * decodifica a fatia de novo e confere largura x altura; nos balões, compara o
 * canal alfa da fatia com o da página original na mesma faixa (balão
 * deslocado de 1 px já aparece). Imprime o tamanho antes e depois do corte
 * (o limite de 20 MB conta os originais; o servidor aceita até 3x de fato).
 * Com a pasta de saída, grava as fatias para olhar.
 *
 * Chromium: o do Playwright (PLAYWRIGHT_CHROMIUM=<executável> para escolher).
 * Nada sai para a rede.
 */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [pastaArg, saidaArg] = process.argv.slice(2);
if (!pastaArg) {
  console.error('Uso: node scripts/conferirCorteNoChromium.mjs <pasta do episódio> [pasta de saída]');
  process.exit(2);
}
const pasta = path.resolve(pastaArg);

function arquivosDaPasta(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...arquivosDaPasta(p));
    else out.push(p);
  }
  return out.sort();
}

function chromiumInstalado() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!fs.existsSync(cache)) return undefined;
  const dirs = fs.readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) {
    const exe = path.join(cache, d, 'chrome-linux64', 'chrome');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

const pacote = await build({
  stdin: {
    contents: `
      import * as envio from './utils/envioPasta.ts';
      import * as regras from './shared/organizacaoEpisodio.mjs';
      window.__envio = envio; window.__regras = regras;`,
    resolveDir: raiz,
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  write: false,
  logLevel: 'silent',
});

const arquivos = arquivosDaPasta(pasta);
const navegador = await chromium.launch({ executablePath: chromiumInstalado() });
const pagina = await navegador.newPage();
await pagina.setContent('<input id="f" type="file" multiple>');
await pagina.addScriptTag({ content: pacote.outputFiles[0].text });
await pagina.setInputFiles('#f', arquivos);

const relatorio = await pagina.evaluate(async () => {
  const { lerPasta, preparadorDoNavegador } = window.__envio;
  const { organizarPasta } = window.__regras;
  const files = Array.from(document.getElementById('f').files);
  const lidos = await lerPasta(files);
  const org = organizarPasta(lidos);
  const recortes = [];
  for (const p of org.paineis) {
    recortes.push({ chave: String(p.ordem), indice: p.pagina.indice, tipo: 'pagina', y: p.y, altura: p.altura, largura: p.largura });
    for (const [idioma, b] of Object.entries(p.baloes)) recortes.push({ chave: `${p.ordem}-${idioma}`, indice: b.indice, tipo: 'balao', idioma, y: p.y, altura: p.altura, largura: p.largura });
  }
  recortes.sort((a, b) => a.indice - b.indice || a.y - b.y);

  const alfa = async (fonte, y, largura, altura) => {
    const c = document.createElement('canvas');
    c.width = largura; c.height = altura;
    const ctx = c.getContext('2d');
    ctx.drawImage(fonte, 0, y, largura, altura, 0, 0, largura, altura);
    const d = ctx.getImageData(0, 0, largura, altura).data;
    const a = new Uint8Array(largura * altura);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    return a;
  };

  const prep = preparadorDoNavegador();
  const saida = [];
  let errados = 0;
  let piorDiferencaAlfa = 0;
  let bytesDepois = 0;
  const inicio = performance.now();
  let originalAberto = null;
  for (const r of recortes) {
    const blob = await prep.preparar(files[r.indice], r, lidos[r.indice]);
    bytesDepois += blob.size;
    const fatia = await createImageBitmap(blob);
    const okTamanho = fatia.width === r.largura && fatia.height === r.altura;
    if (!okTamanho) errados++;
    if (r.tipo === 'balao' && blob !== files[r.indice]) {
      if (!originalAberto || originalAberto.indice !== r.indice) {
        originalAberto?.bmp.close();
        originalAberto = { indice: r.indice, bmp: await createImageBitmap(files[r.indice]) };
      }
      const a1 = await alfa(fatia, 0, r.largura, r.altura);
      const a2 = await alfa(originalAberto.bmp, r.y, r.largura, r.altura);
      for (let i = 0; i < a1.length; i++) piorDiferencaAlfa = Math.max(piorDiferencaAlfa, Math.abs(a1[i] - a2[i]));
    }
    fatia.close();
    const b64 = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
    saida.push({ chave: r.chave, arquivo: org.paineis[Number(r.chave.split('-')[0])][r.tipo === 'balao' ? 'baloes' : 'pagina'], tipo: r.tipo, idioma: r.idioma, bytes: blob.size, inteiro: blob === files[r.indice], okTamanho, b64 });
  }
  prep.liberar();
  originalAberto?.bmp.close();
  return {
    totalPaginas: org.totalPaginas,
    totalPaineis: org.totalPaineis,
    problemas: org.problemas.map(p => `${p.nome ?? 'episódio'}: ${p.mensagem}`),
    arquivosQueSobem: recortes.length,
    bytesOriginais: org.totalBytes,
    bytesDepois,
    fatiasComTamanhoErrado: errados,
    piorDiferencaAlfaNosBaloes: piorDiferencaAlfa,
    segundos: Math.round((performance.now() - inicio) / 100) / 10,
    saida,
  };
});
await navegador.close();

if (saidaArg) {
  const dir = path.resolve(saidaArg);
  fs.mkdirSync(dir, { recursive: true });
  for (const s of relatorio.saida) {
    const nome = s.tipo === 'balao' ? s.arquivo[s.idioma].arquivo : s.arquivo.arquivo;
    fs.writeFileSync(path.join(dir, nome), Buffer.from(s.b64, 'base64'));
  }
}
const mb = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`;
const { saida, ...resumo } = relatorio;
console.log(JSON.stringify({
  ...resumo,
  bytesOriginais: mb(resumo.bytesOriginais),
  bytesDepois: mb(resumo.bytesDepois),
  razao: Math.round((resumo.bytesDepois / resumo.bytesOriginais) * 100) / 100,
  inteiros: saida.filter(s => s.inteiro).length,
}, null, 1));
process.exit(resumo.fatiasComTamanhoErrado === 0 && resumo.piorDiferencaAlfaNosBaloes <= 2 ? 0 : 1);
