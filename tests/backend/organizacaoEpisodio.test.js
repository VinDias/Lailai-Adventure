/**
 * Frente A, item 1: regras do Studio trazidas para a Lorflux
 * (shared/organizacaoEpisodio.mjs). Critério de aceite da proposta de
 * 21/11/2026: "Os seus EP4 e EP5 refeitos como pasta ficam com cada balão no
 * painel do número dele (EP4: 4, 5, 7, 8, 9, 11, 13, 16, 17 e 19). Uma página
 * de 800 x 3.000 px vira 3 painéis, com os balões alinhados."
 *
 * A estrutura do EP4 e do EP5 é a dos .ddls que o Vin mandou em 21/11
 * (docs/ddls/terceira-opcao-2026-11-21.md): 24 páginas 800x1280, balão nos
 * quatro idiomas só nas páginas abaixo. Os nomes seguem a pasta do print de
 * 21/11 ("Pagina 001", "Pagina 001_ENG").
 */
const sharp = require('sharp');

let O;
beforeAll(async () => {
  O = await import('../../shared/organizacaoEpisodio.mjs');
});

const SUFIXOS = ['PORT', 'ENG', 'ESP', 'ZHO'];
const tres = (n) => String(n).padStart(3, '0');

function pastaDoEpisodio({ paginas, comBalao, pasta, largura = 800, altura = 1280, prefixo = 'Pagina ' }) {
  const arquivos = [];
  for (let n = 1; n <= paginas; n++) {
    arquivos.push({ nome: `${pasta}/${prefixo}${tres(n)}.jpeg`, largura, altura });
    if (comBalao.includes(n)) {
      for (const s of SUFIXOS) arquivos.push({ nome: `${pasta}/${prefixo}${tres(n)}_${s}.png`, largura, altura });
    }
  }
  // O Windows não entrega na ordem do nome; o resultado não pode depender dela.
  return arquivos.reverse();
}

const EP4_COM_BALAO = [4, 5, 7, 8, 9, 11, 13, 16, 17, 19];
const EP5_COM_BALAO = [5, 6, 7, 10, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22];

function paineisComBalao(resultado, idioma) {
  return resultado.paineis.filter(p => p.baloes[idioma]).map(p => p.numeroPagina);
}

describe('EP4 e EP5 refeitos como pasta', () => {
  it.each([
    ['EP4', EP4_COM_BALAO],
    ['EP5', EP5_COM_BALAO],
  ])('%s: cada balão no painel do número dele, nos quatro idiomas', (ep, comBalao) => {
    const r = O.organizarPasta(pastaDoEpisodio({ paginas: 24, comBalao, pasta: `The Near Ones T1 ${ep}` }));

    expect(r.problemas).toEqual([]);
    expect(r.podeEnviar).toBe(true);
    expect(r.totalPaineis).toBe(24);
    expect(r.paineis.map(p => p.numeroPagina)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    for (const idioma of ['pt', 'en', 'es', 'zh']) {
      expect(paineisComBalao(r, idioma)).toEqual(comBalao);
      expect(r.porIdioma[idioma]).toBe(comBalao.length);
    }
    // Hoje (envio em sequência) os balões do EP4 cairiam nos painéis 1 a 10.
    expect(paineisComBalao(r, 'en')).not.toEqual(Array.from({ length: comBalao.length }, (_, i) => i + 1));
  });

  it('EP4: o balão do painel 8 é o arquivo da página 8 e vai para o nome certo no Bunny', () => {
    const r = O.organizarPasta(pastaDoEpisodio({ paginas: 24, comBalao: EP4_COM_BALAO, pasta: 'EP4' }));
    const p8 = r.paineis.find(p => p.numeroPagina === 8);
    expect(p8.pagina.nome).toBe('Pagina 008.jpeg');
    expect(p8.pagina.arquivo).toBe('pagina-008.jpg');
    expect(p8.baloes.en.nome).toBe('Pagina 008_ENG.png');
    expect(p8.baloes.en.arquivo).toBe('pagina-008-en.png');
    expect(r.paineis.find(p => p.numeroPagina === 6).baloes).toEqual({});
  });

  it('nome longo do jeito do Vin: o número é o último antes do idioma', () => {
    const r = O.organizarPasta(pastaDoEpisodio({
      paginas: 24, comBalao: EP4_COM_BALAO, pasta: 'x', prefixo: 'The Near Ones T1 EP4 Pagina ',
    }));
    expect(r.problemas).toEqual([]);
    expect(paineisComBalao(r, 'zh')).toEqual(EP4_COM_BALAO);
  });
});

describe('página alta', () => {
  it('800 x 3000 vira 3 painéis (1280, 1280, 440) com os balões nas mesmas fatias', () => {
    const r = O.organizarPasta([
      { nome: 'Pagina 001.jpeg', largura: 800, altura: 1280 },
      { nome: 'Pagina 002.jpeg', largura: 800, altura: 3000 },
      { nome: 'Pagina 002_ENG.png', largura: 800, altura: 3000 },
      { nome: 'Pagina 002_PORT.png', largura: 800, altura: 3000 },
      { nome: 'Pagina 003.jpg', largura: 800, altura: 900 },
    ]);
    expect(r.problemas).toEqual([]);
    expect(r.totalPaginas).toBe(3);
    expect(r.totalPaineis).toBe(5);
    expect(r.paginasCortadas).toBe(1);

    const da2 = r.paineis.filter(p => p.numeroPagina === 2);
    expect(da2.map(p => [p.y, p.altura, p.largura])).toEqual([[0, 1280, 800], [1280, 1280, 800], [2560, 440, 800]]);
    expect(da2.map(p => p.ordem)).toEqual([1, 2, 3]);
    expect(da2.map(p => p.pagina.arquivo)).toEqual(['pagina-002-1.jpg', 'pagina-002-2.jpg', 'pagina-002-3.jpg']);
    expect(da2.map(p => p.baloes.en.arquivo)).toEqual(['pagina-002-1-en.png', 'pagina-002-2-en.png', 'pagina-002-3-en.png']);
    expect(da2.every(p => p.baloes.pt && !p.baloes.es)).toBe(true);
    expect(r.porIdioma).toEqual({ pt: 3, en: 3, es: 0, zh: 0 });
    expect(r.paineis[4].numeroPagina).toBe(3);
  });

  it('plano de corte do Studio: até 1280 é uma fatia; 2560 são duas; último pedaço preservado', () => {
    expect(O.planoDeCorte(1280)).toEqual([{ y: 0, altura: 1280 }]);
    expect(O.planoDeCorte(2560)).toEqual([{ y: 0, altura: 1280 }, { y: 1280, altura: 1280 }]);
    expect(O.planoDeCorte(1281)).toEqual([{ y: 0, altura: 1280 }, { y: 1280, altura: 1 }]);
    expect(O.planoDeCorte(0)).toEqual([]);
  });
});

describe('limite de painéis, contado depois do corte', () => {
  // Vin, 25/11/2026: "até 100 imagens (o que dá uma altura máxima teórica de
  // 800x128.000 px)". 100 x 1280 = 128.000: são painéis DEPOIS do corte.
  it('100 passa; 101 depois do corte impede o envio; o limite é parâmetro', () => {
    const arquivos = Array.from({ length: 50 }, (_, i) => ({ nome: `Pagina ${tres(i + 1)}.jpg`, largura: 800, altura: 2560 }));
    const ok = O.organizarPasta(arquivos);
    expect(O.LIMITE_PAINEIS_PADRAO).toBe(100);
    expect(ok.totalPaineis).toBe(100);
    expect(ok.podeEnviar).toBe(true);

    const demais = O.organizarPasta([...arquivos, { nome: 'Pagina 051.jpg', largura: 800, altura: 100 }]);
    expect(demais.totalPaineis).toBe(101);
    expect(demais.podeEnviar).toBe(false);
    const p = demais.problemas.find(x => x.codigo === 'limite-paineis');
    expect(p.mensagem).toBe('O episódio fica com 101 painéis depois do corte; o limite é 100.');
    expect([p.valor, p.limite]).toEqual([101, 100]);

    expect(O.organizarPasta([...arquivos, { nome: 'Pagina 051.jpg', largura: 800, altura: 100 }], { limitePaineis: 200 }).podeEnviar).toBe(true);
  });

  it('a altura teórica do Vin: uma página de 800 x 128.000 dá exatamente 100 painéis; 128.001 passa do limite', () => {
    expect(O.organizarPasta([{ nome: 'Pagina 001.jpg', largura: 800, altura: 128000 }]).totalPaineis).toBe(100);
    const r = O.organizarPasta([{ nome: 'Pagina 001.jpg', largura: 800, altura: 128001 }]);
    expect(r.totalPaineis).toBe(101);
    expect(r.podeEnviar).toBe(false);
  });

  it('página de 800 x 28.160 (a maior que o Vin diz ser comum) vira 22 painéis, balão nas mesmas fatias', () => {
    const r = O.organizarPasta([
      { nome: 'Pagina 001.jpg', largura: 800, altura: 28160 },
      { nome: 'Pagina 001_ENG.png', largura: 800, altura: 28160 },
    ]);
    expect(r.totalPaineis).toBe(22);
    expect(r.paineis.every(p => p.altura === 1280 && p.baloes.en)).toBe(true);
    expect(r.paineis[21].pagina.arquivo).toBe('pagina-001-22.jpg');
    expect(r.paineis[21].baloes.en.arquivo).toBe('pagina-001-22-en.png');
  });
});

// Regressão (26/11/2026, pedido do Vin): "mantenha a liberação para não barrar
// o autor pela quantidade de megabytes". O padrão é SEM limite de MB.
describe('sem limite de MB por episódio no padrão (o autor não é barrado pelo peso)', () => {
  const MB = 1024 * 1024;
  it('pasta de 25 MB e de 300 MB passam sem opção nenhuma; o limite de 100 painéis continua valendo', () => {
    expect(O.LIMITE_MB_EPISODIO_PADRAO).toBe(0);
    const r = O.organizarPasta([{ nome: 'Pagina 001.jpg', largura: 800, altura: 25600, tamanho: 25 * MB }]);
    expect(r.podeEnviar).toBe(true);
    expect(r.limiteBytes).toBe(0);
    expect(r.totalBytes).toBe(25 * MB);
    expect(r.problemas.find(p => p.codigo === 'limite-tamanho')).toBeUndefined();
    expect(O.organizarPasta([{ nome: 'Pagina 001.jpg', largura: 800, altura: 25600, tamanho: 300 * MB }]).podeEnviar).toBe(true);

    // 101 painéis depois do corte continuam impedindo, com qualquer peso.
    const muitos = O.organizarPasta([
      { nome: 'Pagina 001.jpg', largura: 800, altura: 64000, tamanho: 30 * MB },
      { nome: 'Pagina 002.jpg', largura: 800, altura: 64001, tamanho: 30 * MB },
    ]);
    expect(muitos.problemas.map(p => p.codigo)).toEqual(['limite-paineis']);
    expect(muitos.podeEnviar).toBe(false);
  });
});

describe('limite de MB por episódio LIGADO (opção do admin; aqui 20 MB), sobre os arquivos originais', () => {
  const MB = 1024 * 1024;
  const LIGADO = { limiteBytes: 20 * MB };
  it('soma páginas, balões usados e capa; 20 MB exatos passam, um byte a mais impede', () => {
    const pasta = [
      { nome: 'Capa.jpg', largura: 600, altura: 900, tamanho: 2 * MB },
      { nome: 'Pagina 001.jpg', largura: 800, altura: 12500, tamanho: 10 * MB },
      { nome: 'Pagina 001_ENG.png', largura: 800, altura: 12500, tamanho: 8 * MB },
    ];
    const ok = O.organizarPasta(pasta, LIGADO);
    expect(ok.totalBytes).toBe(20 * MB);
    expect(ok.limiteBytes).toBe(20 * MB);
    expect(ok.podeEnviar).toBe(true);

    const demais = O.organizarPasta([...pasta.slice(0, 2), { ...pasta[2], tamanho: 8 * MB + 1 }], LIGADO);
    expect(demais.podeEnviar).toBe(false);
    const p = demais.problemas.find(x => x.codigo === 'limite-tamanho');
    expect(p.mensagem).toBe('Os arquivos do episódio somam um pouco mais de 20 MB, que é o limite.');
    expect(p.valor).toBe(20 * MB + 1);
  });

  it('o que fica de fora (balão sem página, arquivo de outro tipo) não conta no tamanho', () => {
    const r = O.organizarPasta([
      { nome: 'Pagina 001.jpg', largura: 800, altura: 1280, tamanho: 1 * MB },
      { nome: 'Pagina 009_ENG.png', largura: 800, altura: 1280, tamanho: 30 * MB },
      { nome: 'roteiro.psd', tamanho: 300 * MB },
    ], LIGADO);
    expect(r.totalBytes).toBe(1 * MB);
    expect(r.podeEnviar).toBe(true);
  });

  it('o limite é parâmetro (Setting do admin); 0 desliga', () => {
    const pasta = [{ nome: 'Pagina 001.jpg', largura: 800, altura: 25600, tamanho: 25 * MB }];
    expect(O.organizarPasta(pasta, LIGADO).podeEnviar).toBe(false);
    expect(O.organizarPasta(pasta, { limiteBytes: 30 * MB }).podeEnviar).toBe(true);
    expect(O.organizarPasta(pasta, { limiteBytes: 0 }).podeEnviar).toBe(true);
  });

  it('arquivo que sobe inteiro (até 1280 px, ou capa) maior que a parte do envio impede; página que vai em fatias, não', () => {
    const r = O.organizarPasta([
      { nome: 'Capa.png', largura: 3000, altura: 4000, tamanho: 9 * MB },
      { nome: 'Pagina 001.jpg', largura: 800, altura: 1280, tamanho: 9 * MB },
      { nome: 'Pagina 002.jpg', largura: 800, altura: 12500, tamanho: 9 * MB },
    ], { tamanhoMaximoArquivo: 8 * MB, limiteBytes: 100 * MB });
    expect(r.problemas.filter(p => p.codigo === 'arquivo-grande').map(p => p.nome)).toEqual(['Capa.png', 'Pagina 001.jpg']);
    expect(r.podeEnviar).toBe(false);
  });

  it('formatarMB: uma casa abaixo de 10 MB, vírgula decimal', () => {
    expect(O.formatarMB(4910292)).toBe('4,7 MB');
    expect(O.formatarMB(21 * MB)).toBe('21 MB');
  });
});

describe('as duas pastas reais que o Vin mandou em 25/11/2026', () => {
  // Só nome, tamanho e dimensões (tests/fixtures); as imagens ficam fora do git.
  const pastas = require('../fixtures/pastasVin-2026-11-25.json');

  it('HáQa Stone EP3 (páginas de 800 x 12.500 com balão do mesmo tamanho): 31 painéis, balão nas 30 fatias, 4 idiomas', () => {
    const r = O.organizarPasta(pastas.haqaStoneEp3);
    expect(r.problemas).toEqual([]);
    expect(r.podeEnviar).toBe(true);
    expect(r.totalPaginas).toBe(4); // 000 a 003
    expect(r.paginasCortadas).toBe(3);
    expect(r.totalPaineis).toBe(1 + 3 * 10); // 12.500 = 9 x 1280 + 980
    expect(r.paineis.filter(p => p.numeroPagina === 1).map(p => p.altura)).toEqual([...Array(9).fill(1280), 980]);
    for (const idioma of ['pt', 'en', 'es', 'zh']) {
      expect(r.porIdioma[idioma]).toBe(30);
      expect(r.paineis[0].baloes[idioma]).toBeUndefined(); // a página 000 não tem balão
    }
    expect(r.paineis[10].baloes.zh.nome).toBe('Pagina 001_ZHO.png');
    expect(r.paineis[10].baloes.zh.arquivo).toBe('pagina-001-10-zh.png');
    expect(O.formatarMB(r.totalBytes)).toBe('4,7 MB');
  });

  it('The Near Ones EP6 (subpastas art/ e dialog_xx/, 800 x 1280): 23 painéis, balão só nos números dele', () => {
    const r = O.organizarPasta(pastas.nearOnesEp6);
    expect(r.problemas).toEqual([]);
    expect(r.totalPaineis).toBe(23); // panel 000 a 022
    expect(r.paginasCortadas).toBe(0);
    const comBalao = [8, 9, 10, 11, 13, 15, 16, 17];
    for (const idioma of ['pt', 'en', 'es', 'zh']) {
      expect(r.paineis.filter(p => p.baloes[idioma]).map(p => p.numeroPagina)).toEqual(comBalao);
    }
    expect(r.paineis[8].baloes.es.nome).toBe('panel 008_ESP.png');
    expect(r.totalBytes).toBe(pastas.nearOnesEp6.reduce((s, a) => s + a.tamanho, 0));
  });
});

describe('o que está fora do padrão (cada aviso no arquivo certo)', () => {
  const base = [
    { nome: 'Pagina 001.jpeg', largura: 800, altura: 1280 },
    { nome: 'Pagina 002.jpeg', largura: 800, altura: 1280 },
  ];
  function codigosPorArquivo(r) {
    return Object.fromEntries(r.problemas.map(p => [p.nome, p.codigo]));
  }

  it('cada erro da proposta aparece no arquivo dele, e só os graves impedem', () => {
    const r = O.organizarPasta([
      ...base,
      { nome: 'Pagina sem numero.jpeg', largura: 800, altura: 1280 },
      { nome: 'Pagina 009_ENG.png', largura: 800, altura: 1280 },
      { nome: 'Pagina 001_ESP.png', largura: 800, altura: 1000 },
      { nome: 'Pagina 002.png', largura: 800, altura: 1280 },
      { nome: 'roteiro.docx' },
      { nome: 'Pagina 002_PORT.jpg', largura: 800, altura: 1280 },
      { nome: 'Pagina 001_ENG.png', largura: 800, altura: 1280 },
      { nome: 'Pagina 1_ENG.png', largura: 800, altura: 1280 },
    ]);
    expect(codigosPorArquivo(r)).toEqual({
      'Pagina sem numero.jpeg': 'sem-numero',
      'Pagina 009_ENG.png': 'balao-sem-pagina',
      'Pagina 001_ESP.png': 'balao-tamanho-diferente',
      'Pagina 002.png': 'png-sem-idioma',
      'roteiro.docx': 'tipo-invalido',
      'Pagina 002_PORT.jpg': 'balao-em-jpg',
      'Pagina 1_ENG.png': 'balao-repetido',
    });
    // Nenhum desses impede: os arquivos ficam de fora e o resto sobe.
    expect(r.problemas.every(p => !p.impede)).toBe(true);
    expect(r.podeEnviar).toBe(true);
    expect(r.paineis[0].baloes).toEqual({ en: expect.objectContaining({ nome: 'Pagina 001_ENG.png' }) });
    // Mensagem legível para a tela.
    expect(r.problemas.find(p => p.codigo === 'balao-sem-pagina').mensagem).toMatch(/sem a página/);
  });

  it('número repetido de página impede e marca os dois arquivos', () => {
    const r = O.organizarPasta([...base, { nome: 'Pagina 2.jpg', largura: 800, altura: 1280 }]);
    expect(r.podeEnviar).toBe(false);
    expect(r.problemas.filter(p => p.codigo === 'pagina-repetida').map(p => p.nome).sort()).toEqual(['Pagina 002.jpeg', 'Pagina 2.jpg']);
  });

  it('pasta sem página impede', () => {
    const r = O.organizarPasta([{ nome: 'Pagina 001_ENG.png', largura: 1, altura: 1 }]);
    expect(r.podeEnviar).toBe(false);
    expect(r.problemas.map(p => p.codigo)).toContain('sem-paginas');
  });

  it('tamanho ilegível da página impede (não dá para cortar nem conferir o balão)', () => {
    const r = O.organizarPasta([{ nome: 'Pagina 001.jpg' }]);
    expect(r.podeEnviar).toBe(false);
    expect(r.problemas[0]).toMatchObject({ codigo: 'tamanho-ilegivel', impede: true });
  });

  it('Thumbs.db, desktop.ini e ._ do Mac são ignorados sem aviso', () => {
    const r = O.organizarPasta([...base, { nome: 'Thumbs.db' }, { nome: 'desktop.ini' }, { nome: '._Pagina 001.jpeg' }, { nome: '.DS_Store' }]);
    expect(r.problemas).toEqual([]);
  });
});

describe('nomes e capa', () => {
  it.each([
    ['Pagina 008_ENG.png', { tipo: 'balao', numero: 8, idioma: 'en' }],
    ['Página 008_eng.PNG', { tipo: 'balao', numero: 8, idioma: 'en' }],
    ['Pagina 000.jpeg', { tipo: 'pagina', numero: 0 }],
    ['Pagina 184_ZHO.png', { tipo: 'balao', numero: 184, idioma: 'zh' }],
    ['Pagina 010_PORT.png', { tipo: 'balao', numero: 10, idioma: 'pt' }],
    ['Pagina 010_ESP .png', { tipo: 'balao', numero: 10, idioma: 'es' }],
    ['The Near Ones T1 EP4 Pagina 008.JPG', { tipo: 'pagina', numero: 8 }],
    ['C:\\Users\\vin\\EP4\\Pagina 003.jpg', { tipo: 'pagina', numero: 3 }],
    ['Capa.jpeg', { tipo: 'capa' }],
    ['cover.png', { tipo: 'capa' }],
    ['Pagina 008_FRA.png', { tipo: 'problema', codigo: 'png-sem-idioma' }],
  ])('%s', (nome, esperado) => {
    expect(O.classificarArquivo(nome)).toMatchObject(esperado);
  });

  it('arquivo Capa vira a capa do episódio e não conta como painel', () => {
    const r = O.organizarPasta([{ nome: 'EP4/Capa.jpeg', largura: 600, altura: 900 }, { nome: 'Pagina 001.jpg', largura: 800, altura: 1280 }]);
    expect(r.capa).toMatchObject({ indice: 0, nome: 'Capa.jpeg', arquivo: 'capa.jpg' });
    expect(r.totalPaineis).toBe(1);
    expect(r.problemas).toEqual([]);
  });

  it('duas capas impedem', () => {
    const r = O.organizarPasta([{ nome: 'Capa.jpeg' }, { nome: 'capa.png' }, { nome: 'Pagina 001.jpg', largura: 8, altura: 8 }]);
    expect(r.problemas.map(p => p.codigo)).toEqual(['capa-repetida']);
    expect(r.podeEnviar).toBe(false);
  });
});

describe('tipo e tamanho pelo cabeçalho do arquivo (imagens reais)', () => {
  it('JPEG e PNG gerados com sharp: tipo pelo conteúdo e tamanho certo', async () => {
    const jpg = await sharp({ create: { width: 800, height: 3000, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    const png = await sharp({ create: { width: 800, height: 1280, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const progressivo = await sharp({ create: { width: 321, height: 123, channels: 3, background: '#000' } }).jpeg({ progressive: true }).withMetadata().toBuffer();

    expect(O.tipoPeloConteudo(jpg)).toBe('jpeg');
    expect(O.tipoPeloConteudo(png)).toBe('png');
    expect(O.tamanhoPeloCabecalho(jpg)).toEqual({ largura: 800, altura: 3000 });
    expect(O.tamanhoPeloCabecalho(png)).toEqual({ largura: 800, altura: 1280 });
    expect(O.tamanhoPeloCabecalho(progressivo)).toEqual({ largura: 321, altura: 123 });
  });

  it('PNG renomeado para .jpg é reconhecido como PNG; texto não é imagem', async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 4, background: '#000' } }).png().toBuffer();
    expect(O.tipoPeloConteudo(png)).toBe('png');
    expect(O.tipoPeloConteudo(Buffer.from('<html>não é imagem</html>'))).toBeNull();
    expect(O.tamanhoPeloCabecalho(Buffer.from('<html>não é imagem</html>'))).toBeNull();
    expect(O.tamanhoPeloCabecalho(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });
});
