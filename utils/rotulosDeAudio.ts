/**
 * Rótulo de cada botão de idioma do player de vídeo (VerticalPlayer).
 *
 * POR QUE EXISTE (retorno do cliente em 27/11/2026): o player mostrava quatro
 * botões, todos "English". O Bunny Stream marca TODAS as faixas de áudio com
 * o mesmo idioma ("en") quando o arquivo enviado não diz o idioma de cada
 * uma, e o player traduzia o código do idioma faixa por faixa. Enquanto só o
 * admin enviava vídeo, isso ficava escondido: ele digitava o nome de cada
 * faixa no "Faixas de Áudio" do Gerenciar Conteúdo (`hlsAudioLabels`). O vídeo
 * enviado pelo AUTOR (frente A, item 9) não tem esses nomes.
 *
 * Já tinha acontecido: 136b916 (28/03/2026) consertou "todos os botões
 * mostram English" e 1073485, dez minutos depois, tirou o conserto ao criar o
 * editor de nomes. Por isso a regra mora aqui, com teste próprio
 * (tests/frontend/rotulosDeAudio.test.tsx).
 *
 * REGRA, por faixa, na ordem:
 *  1. o nome que o admin digitou para aquela posição, se houver;
 *  2. o idioma da faixa, se NENHUMA outra faixa tem o mesmo idioma;
 *  3. o nome que veio do vídeo, se nenhuma outra faixa tem o mesmo nome;
 *  4. a ordem combinada das faixas na plataforma: 1ª português, 2ª inglês,
 *     3ª espanhol, 4ª chinês (a mesma do "Faixas de Áudio" do admin);
 *  5. "Faixa N".
 * Dois botões nunca saem com o mesmo texto. O número de botões é o número de
 * faixas que o vídeo tem: esta função não cria nem esconde faixa.
 */

export const ROTULOS_POR_IDIOMA: Record<string, string> = {
  'pt-br': 'PT-BR', 'pt': 'PT-BR', 'en': 'English', 'es': 'Español',
  'ja': '日本語', 'zh': '中文', 'ko': '한국어',
  'fr': 'Français', 'de': 'Deutsch', 'it': 'Italiano',
};

/** Ordem combinada das faixas de áudio de um vídeo da plataforma. */
export const ORDEM_PADRAO_DAS_FAIXAS = ['pt', 'en', 'es', 'zh'];

export interface FaixaDeAudio {
  lang?: string | null;
  name?: string | null;
}

function rotuloDoIdioma(lang?: string | null): string | null {
  const codigo = (lang || '').trim().toLowerCase();
  if (!codigo) return null;
  return ROTULOS_POR_IDIOMA[codigo] ?? ROTULOS_POR_IDIOMA[codigo.split(/[-_]/)[0]] ?? null;
}

const chave = (texto: string) => texto.trim().toLowerCase();

export function rotulosDasFaixas(
  faixas: FaixaDeAudio[],
  nomesDoEpisodio: Array<string | null | undefined> | null | undefined,
  faixaN: (numero: number) => string,
): string[] {
  const total = faixas.length;
  const rotulos: Array<string | null> = new Array(total).fill(null);
  const usados = new Set<string>();
  const fixar = (i: number, texto: string) => { rotulos[i] = texto; usados.add(chave(texto)); };
  const quantos = (lista: Array<string | null>, valor: string) => lista.filter(x => x !== null && chave(x) === chave(valor)).length;

  // 1. Nome digitado pelo admin.
  for (let i = 0; i < total; i++) {
    const nome = typeof nomesDoEpisodio?.[i] === 'string' ? (nomesDoEpisodio[i] as string).trim() : '';
    if (nome && !usados.has(chave(nome))) fixar(i, nome);
  }

  // 2. Idioma da faixa, quando ele distingue a faixa das outras.
  const porIdioma = faixas.map(f => rotuloDoIdioma(f.lang));
  for (let i = 0; i < total; i++) {
    const r = porIdioma[i];
    if (rotulos[i] === null && r && quantos(porIdioma, r) === 1 && !usados.has(chave(r))) fixar(i, r);
  }

  // 3. Nome que veio do vídeo, quando ele distingue a faixa das outras.
  const nomes = faixas.map(f => (typeof f.name === 'string' && f.name.trim() ? f.name.trim() : null));
  for (let i = 0; i < total; i++) {
    const n = nomes[i];
    if (rotulos[i] === null && n && quantos(nomes, n) === 1 && !usados.has(chave(n))) fixar(i, n);
  }

  // 4. Ordem combinada; 5. "Faixa N".
  for (let i = 0; i < total; i++) {
    if (rotulos[i] !== null) continue;
    const daOrdem = ROTULOS_POR_IDIOMA[ORDEM_PADRAO_DAS_FAIXAS[i]];
    if (daOrdem && !usados.has(chave(daOrdem))) fixar(i, daOrdem);
    else fixar(i, faixaN(i + 1));
  }

  return rotulos as string[];
}
