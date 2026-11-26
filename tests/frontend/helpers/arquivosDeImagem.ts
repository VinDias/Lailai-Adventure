/**
 * Arquivos de imagem falsos para os testes do envio de pasta: só o cabeçalho
 * é de verdade (é o que o navegador lê para largura x altura), o resto é
 * enchimento até o tamanho pedido. jsdom não decodifica imagem nem tem
 * canvas; o corte real é testado no Chromium (item 5).
 */
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];

export function cabecalhoPng(largura: number, altura: number): number[] {
  return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(largura), ...be32(altura), 8, 6, 0, 0, 0, 0, 0, 0, 0];
}

/** JPEG com um bloco APP1 de `exif` bytes antes do SOF (EXIF grande). */
export function cabecalhoJpeg(largura: number, altura: number, exif = 0): number[] {
  const app1: number[] = [];
  let resta = exif;
  while (resta > 0) {
    const n = Math.min(resta, 65000);
    app1.push(0xff, 0xe1, ...be16(n + 2), ...new Array(n).fill(0));
    resta -= n;
  }
  return [0xff, 0xd8, ...app1, 0xff, 0xc0, 0, 17, 8, ...be16(altura), ...be16(largura), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
}

/** File com o cabeçalho certo e `tamanho` bytes; `caminho` vira webkitRelativePath. */
export function arquivoDeImagem(caminho: string, largura: number, altura: number, tamanho = 2000, exif = 0): File {
  const nome = caminho.split('/').pop() as string;
  const png = /\.png$/i.test(nome);
  const cab = png ? cabecalhoPng(largura, altura) : cabecalhoJpeg(largura, altura, exif);
  const bytes = new Uint8Array(Math.max(tamanho, cab.length));
  bytes.set(cab);
  const f = new File([bytes], nome, { type: png ? 'image/png' : 'image/jpeg' });
  if (caminho.includes('/')) Object.defineProperty(f, 'webkitRelativePath', { value: caminho });
  return f;
}

export function arquivoQualquer(nome: string, tamanho = 100): File {
  return new File([new Uint8Array(tamanho)], nome);
}
