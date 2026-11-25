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
  it('184 passa; 185 depois do corte impede o envio; o limite é parâmetro', () => {
    const arquivos = Array.from({ length: 92 }, (_, i) => ({ nome: `Pagina ${tres(i + 1)}.jpg`, largura: 800, altura: 2560 }));
    const ok = O.organizarPasta(arquivos);
    expect(ok.totalPaineis).toBe(184);
    expect(ok.podeEnviar).toBe(true);

    const demais = O.organizarPasta([...arquivos, { nome: 'Pagina 093.jpg', largura: 800, altura: 100 }]);
    expect(demais.totalPaineis).toBe(185);
    expect(demais.podeEnviar).toBe(false);
    const p = demais.problemas.find(x => x.codigo === 'limite-paineis');
    expect(p.mensagem).toContain('185');
    expect(p.mensagem).toContain('184');

    expect(O.organizarPasta([...arquivos, { nome: 'Pagina 093.jpg', largura: 800, altura: 100 }], { limitePaineis: 200 }).podeEnviar).toBe(true);
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
