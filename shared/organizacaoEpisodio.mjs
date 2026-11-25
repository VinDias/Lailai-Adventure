/**
 * Organização de um episódio de Hi-Qua a partir de uma pasta de arquivos
 * (Fase 7, frente A, item 1). Regras trazidas do DDLS Studio
 * (VinDias/ddls-studio d7edbb1: src/lib/seriesImport.js, longSeriesImport.js
 * e imageSize.js), com as mudanças combinadas na proposta de 21/11/2026.
 *
 * FONTE ÚNICA: o navegador importa este arquivo pelo Vite e o servidor pelo
 * `import()` dinâmico (services/envioEpisodioService.js). Não copie estas
 * regras para outro arquivo: tela e servidor têm de concordar sobre qual
 * balão vai em qual painel.
 *
 * Só funções puras: nada de DOM, canvas, fs ou rede. O corte da imagem em si
 * (canvas) fica no navegador; aqui está só o PLANO do corte.
 *
 * Regras:
 *  - .jpg/.jpeg = página; .png = balão; a pasta do arquivo é ignorada.
 *  - Idioma do balão pelo sufixo _PORT, _ENG, _ESP ou _ZHO antes da extensão,
 *    sem diferenciar maiúsculas (pt, en, es, zh na Lorflux).
 *  - Número da página = ÚLTIMO número do nome, depois de tirar o idioma.
 *    O Studio usa o primeiro; o último deixa
 *    "The Near Ones T1 EP4 Pagina 008" ser a página 8, e não a 1.
 *  - Um arquivo chamado Capa (ou Cover), sem número, vira a capa.
 *  - Página com mais de 1280 px de altura é cortada em fatias de até 1280 px,
 *    largura mantida, último pedaço preservado; o balão usa o mesmo mapa.
 *  - O balão tem de ter o mesmo tamanho da página (como no Studio).
 *  - O limite de painéis conta DEPOIS do corte.
 */

export const ALTURA_MAXIMA = 1280;
export const LIMITE_PAINEIS_PADRAO = 184;

/** Sufixo do nome do arquivo -> idioma da Lorflux (models/Episode.js). */
export const IDIOMA_POR_SUFIXO = { PORT: 'pt', ENG: 'en', ESP: 'es', ZHO: 'zh' };
export const IDIOMAS = ['pt', 'en', 'es', 'zh'];

/** Arquivos que o sistema operacional cria sozinho: ignorados sem aviso. */
const ARQUIVOS_DO_SISTEMA = /^(thumbs\.db|desktop\.ini|\.ds_store)$|^\._/i;

/**
 * Problemas que impedem o envio inteiro. Os outros só deixam o arquivo de
 * fora (o autor vê o aviso e confirma).
 */
export const PROBLEMAS_QUE_IMPEDEM = new Set([
  'pagina-repetida',
  'sem-paginas',
  'limite-paineis',
  'tamanho-ilegivel',
  'capa-repetida',
]);

const MENSAGENS = {
  'sem-numero': 'O nome não tem número de página.',
  'pagina-repetida': 'Há mais de uma página com este número.',
  'balao-repetido': 'Há mais de um balão neste idioma para esta página.',
  'balao-sem-pagina': 'Balão sem a página do mesmo número.',
  'balao-tamanho-diferente': 'O balão não tem o mesmo tamanho da página.',
  'balao-em-jpg': 'Balão tem de ser .png, com fundo transparente.',
  'png-sem-idioma': 'Arquivo .png sem o idioma no nome (_PORT, _ENG, _ESP ou _ZHO).',
  'tipo-invalido': 'Tipo de arquivo não aceito (use .jpg ou .jpeg para a página e .png para o balão).',
  'tamanho-ilegivel': 'Não foi possível ler o tamanho da imagem.',
  'capa-repetida': 'Há mais de um arquivo de capa.',
  'sem-paginas': 'Nenhuma página (.jpg ou .jpeg) com número no nome.',
  'limite-paineis': 'O episódio passa do limite de painéis.',
};

export function mensagemDoProblema(codigo) {
  return MENSAGENS[codigo] || codigo;
}

function nomeDoArquivo(caminho) {
  const s = String(caminho || '');
  const partes = s.split(/[\\/]/);
  return partes[partes.length - 1];
}

function semAcento(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Classifica UM arquivo pelo nome.
 * Retorna { tipo, numero, idioma, extensao, codigo? } onde tipo é
 * 'pagina' | 'balao' | 'capa' | 'ignorado' | 'problema'.
 */
export function classificarArquivo(caminho) {
  const nome = nomeDoArquivo(caminho);
  if (!nome || ARQUIVOS_DO_SISTEMA.test(nome)) return { tipo: 'ignorado', nome };

  const m = nome.match(/^(.*)\.([^.]+)$/);
  const extensao = m ? m[2].toLowerCase() : '';
  let base = (m ? m[1] : nome).trim();

  const ehPagina = extensao === 'jpg' || extensao === 'jpeg';
  const ehBalao = extensao === 'png';

  if (/^(capa|cover)$/i.test(semAcento(base)) && (ehPagina || ehBalao)) {
    return { tipo: 'capa', nome, extensao };
  }
  if (!ehPagina && !ehBalao) return { tipo: 'problema', codigo: 'tipo-invalido', nome, extensao };

  let idioma = null;
  const sufixo = base.match(/_(PORT|ENG|ESP|ZHO)\s*$/i);
  if (sufixo) {
    idioma = IDIOMA_POR_SUFIXO[sufixo[1].toUpperCase()];
    base = base.slice(0, sufixo.index);
  }

  const numeros = base.match(/\d+/g);
  const numero = numeros ? Number.parseInt(numeros[numeros.length - 1], 10) : null;

  if (ehBalao && !idioma) return { tipo: 'problema', codigo: 'png-sem-idioma', nome, extensao, numero };
  if (numero === null) return { tipo: 'problema', codigo: 'sem-numero', nome, extensao };
  // Balão salvo como .jpg perde a transparência e cobriria a página inteira.
  if (ehPagina && idioma) return { tipo: 'problema', codigo: 'balao-em-jpg', nome, extensao, numero };
  if (ehPagina) return { tipo: 'pagina', nome, extensao, numero };
  return { tipo: 'balao', nome, extensao, numero, idioma };
}

/**
 * Plano de corte vertical do Studio (createVerticalCropPlan): lista de
 * { y, altura } cobrindo [0, altura).
 */
export function planoDeCorte(altura, maximo = ALTURA_MAXIMA) {
  if (!Number.isInteger(altura) || altura <= 0) return [];
  const fatias = [];
  for (let y = 0; y < altura; y += maximo) {
    fatias.push({ y, altura: Math.min(maximo, altura - y) });
  }
  return fatias;
}

function numeroComTresDigitos(n) {
  return String(n).padStart(3, '0');
}

/**
 * Nome do arquivo no Bunny, montado pela regra (nunca pelo nome que veio do
 * navegador). Ex.: pagina-008.jpg, pagina-008-2.jpg, pagina-008-2-en.png.
 * `fatia` começa em 1; página sem corte não leva o número da fatia.
 */
export function nomeNoBunny({ numeroPagina, fatia = 1, totalFatias = 1, idioma = null, capa = false, extensao }) {
  const ext = extensao === 'jpeg' ? 'jpg' : extensao;
  if (capa) return `capa.${ext}`;
  let nome = `pagina-${numeroComTresDigitos(numeroPagina)}`;
  if (totalFatias > 1) nome += `-${fatia}`;
  if (idioma) nome += `-${idioma}`;
  return `${nome}.${ext}`;
}

/**
 * Organiza a pasta inteira.
 *
 * Entrada: lista de { nome, largura?, altura? } (nome pode trazer a pasta;
 * largura/altura são da imagem ORIGINAL, lidas pelo cabeçalho; sem elas, o
 * corte e a conferência de tamanho não são feitos e o problema
 * 'tamanho-ilegivel' aparece se `exigirTamanho`).
 *
 * Saída:
 *  - paginas: [{ numero, nome, indice, largura, altura, baloes: {pt: {nome, indice}}, fatias }]
 *    em ordem numérica, só as que entram;
 *  - paineis: a lista FINAL depois do corte, em ordem, cada um com
 *    { ordem, numeroPagina, fatia, totalFatias, y, largura, altura,
 *      pagina: {indice, nome, arquivo}, baloes: {pt: {indice, nome, arquivo}} };
 *  - capa: { indice, nome, extensao } ou null;
 *  - problemas: [{ indice, nome, codigo, mensagem, impede }] (indice = posição
 *    do arquivo na entrada; null para problema do episódio inteiro);
 *  - totalPaineis, porIdioma ({pt: n painéis com balão}), podeEnviar.
 */
export function organizarPasta(arquivos, opcoes = {}) {
  const limite = Number.isInteger(opcoes.limitePaineis) && opcoes.limitePaineis > 0
    ? opcoes.limitePaineis
    : LIMITE_PAINEIS_PADRAO;
  const exigirTamanho = opcoes.exigirTamanho !== false;
  const lista = Array.isArray(arquivos) ? arquivos : [];

  const problemas = [];
  const problema = (indice, nome, codigo) => {
    problemas.push({ indice, nome, codigo, mensagem: mensagemDoProblema(codigo), impede: PROBLEMAS_QUE_IMPEDEM.has(codigo) });
  };

  const paginas = new Map(); // numero -> pagina
  const baloesPorNumero = new Map(); // numero -> {idioma: {indice, nome}}
  const repetidas = new Set();
  let capa = null;

  lista.forEach((arquivo, indice) => {
    const c = classificarArquivo(arquivo && arquivo.nome);
    if (c.tipo === 'ignorado') return;
    if (c.tipo === 'problema') return problema(indice, c.nome, c.codigo);

    if (c.tipo === 'capa') {
      if (capa) return problema(indice, c.nome, 'capa-repetida');
      capa = { indice, nome: c.nome, extensao: c.extensao };
      return;
    }

    if (c.tipo === 'pagina') {
      if (paginas.has(c.numero)) {
        repetidas.add(c.numero);
        return problema(indice, c.nome, 'pagina-repetida');
      }
      paginas.set(c.numero, {
        numero: c.numero,
        nome: c.nome,
        indice,
        extensao: c.extensao,
        largura: arquivo.largura,
        altura: arquivo.altura,
        baloes: {},
      });
      return;
    }

    // balão
    if (!baloesPorNumero.has(c.numero)) baloesPorNumero.set(c.numero, {});
    const doNumero = baloesPorNumero.get(c.numero);
    if (doNumero[c.idioma]) return problema(indice, c.nome, 'balao-repetido');
    doNumero[c.idioma] = { indice, nome: c.nome, largura: arquivo.largura, altura: arquivo.altura };
  });

  // Página repetida: a primeira também fica marcada, para o autor ver as duas.
  for (const numero of repetidas) {
    const p = paginas.get(numero);
    problema(p.indice, p.nome, 'pagina-repetida');
  }

  for (const [numero, baloes] of baloesPorNumero) {
    const pagina = paginas.get(numero);
    for (const idioma of IDIOMAS) {
      const b = baloes[idioma];
      if (!b) continue;
      if (!pagina) { problema(b.indice, b.nome, 'balao-sem-pagina'); continue; }
      const temTamanho = Number.isInteger(b.largura) && Number.isInteger(pagina.largura);
      if (temTamanho && (b.largura !== pagina.largura || b.altura !== pagina.altura)) {
        problema(b.indice, b.nome, 'balao-tamanho-diferente');
        continue;
      }
      if (!temTamanho && exigirTamanho) {
        if (!Number.isInteger(b.largura)) problema(b.indice, b.nome, 'tamanho-ilegivel');
        continue;
      }
      pagina.baloes[idioma] = { indice: b.indice, nome: b.nome };
    }
  }

  const ordenadas = [...paginas.values()].sort((a, b) => a.numero - b.numero);
  const paineis = [];
  const porIdioma = { pt: 0, en: 0, es: 0, zh: 0 };

  for (const p of ordenadas) {
    const temTamanho = Number.isInteger(p.largura) && Number.isInteger(p.altura) && p.largura > 0 && p.altura > 0;
    if (!temTamanho && exigirTamanho) problema(p.indice, p.nome, 'tamanho-ilegivel');
    p.fatias = temTamanho ? planoDeCorte(p.altura) : [{ y: 0, altura: null }];
    const total = p.fatias.length;
    p.fatias.forEach((f, i) => {
      const fatia = i + 1;
      const baloes = {};
      for (const idioma of IDIOMAS) {
        const b = p.baloes[idioma];
        if (!b) continue;
        baloes[idioma] = {
          indice: b.indice,
          nome: b.nome,
          arquivo: nomeNoBunny({ numeroPagina: p.numero, fatia, totalFatias: total, idioma, extensao: 'png' }),
        };
      }
      paineis.push({
        ordem: paineis.length,
        numeroPagina: p.numero,
        fatia,
        totalFatias: total,
        y: f.y,
        largura: temTamanho ? p.largura : null,
        altura: f.altura,
        pagina: {
          indice: p.indice,
          nome: p.nome,
          arquivo: nomeNoBunny({ numeroPagina: p.numero, fatia, totalFatias: total, extensao: 'jpg' }),
        },
        baloes,
      });
    });
    for (const idioma of IDIOMAS) if (p.baloes[idioma]) porIdioma[idioma] += total;
  }

  if (ordenadas.length === 0) problema(null, null, 'sem-paginas');
  if (paineis.length > limite) {
    problemas.push({
      indice: null,
      nome: null,
      codigo: 'limite-paineis',
      mensagem: `O episódio fica com ${paineis.length} painéis depois do corte; o limite é ${limite}.`,
      impede: true,
    });
  }

  return {
    paginas: ordenadas,
    paineis,
    capa: capa ? { ...capa, arquivo: nomeNoBunny({ capa: true, extensao: capa.extensao }) } : null,
    problemas,
    totalPaginas: ordenadas.length,
    totalPaineis: paineis.length,
    paginasCortadas: ordenadas.filter(p => p.fatias.length > 1).length,
    porIdioma,
    limitePaineis: limite,
    podeEnviar: !problemas.some(p => p.impede),
  };
}

// ── Tipo e tamanho pelo cabeçalho (porte de ddls-studio/src/lib/imageSize.js) ──

const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

/** 'jpeg' | 'png' | 'webp' | null, pelos primeiros bytes (não pela extensão). */
export function tipoPeloConteudo(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}

/**
 * { largura, altura } lidos do cabeçalho do JPEG ou do PNG, sem decodificar.
 * null quando o formato não é um desses ou o cabeçalho está quebrado.
 */
export function tamanhoPeloCabecalho(bytes) {
  const tipo = tipoPeloConteudo(bytes);
  const b = bytes;
  if (tipo === 'png') {
    if (b.length < 24) return null;
    const largura = be32(b, 16);
    const altura = be32(b, 20);
    return largura > 0 && altura > 0 ? { largura, altura } : null;
  }
  if (tipo === 'jpeg') {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marcador = b[i + 1];
      if (marcador === 0xff) { i++; continue; }
      if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) { i += 2; continue; }
      if (marcador === 0xda) return null;
      const tam = (b[i + 2] << 8) | b[i + 3];
      if (tam < 2) return null;
      const ehSOF = marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc;
      if (ehSOF) {
        const altura = (b[i + 5] << 8) | b[i + 6];
        const largura = (b[i + 7] << 8) | b[i + 8];
        return largura > 0 && altura > 0 ? { largura, altura } : null;
      }
      i += 2 + tam;
    }
  }
  return null;
}
