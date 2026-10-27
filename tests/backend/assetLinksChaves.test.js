/**
 * Regressão: public/.well-known/assetlinks.json tem de declarar a chave de
 * assinatura do app E a chave de upload em vigor, e não pode declarar chave
 * revogada.
 *
 * O CASO REAL (27/10/2026): a chave de upload original ficou no computador que
 * foi formatado. Em 22/10 foi pedida a redefinição ao Google, que liberou a
 * chave nova para 24/10 às 23:33. O arquivo nunca foi atualizado: continuava
 * com a chave de assinatura do app (certo) e com a chave de upload PERDIDA
 * (errado), e sem a chave de upload nova. As duas consequências são
 * silenciosas e apontam para o lado errado:
 *
 * - o `bubblewrap build --apk` que serve de teste em aparelho é assinado com a
 *   chave de upload NOVA, que não estava declarada. O app abre com a barra de
 *   endereço do Chrome em cima, sintoma clássico de assetlinks errado, e quem
 *   não souber do histórico vai procurar o defeito no build ou no manifest;
 * - a chave perdida continuava podendo abrir as URLs de lorflux.com, que é
 *   justamente o que a redefinição existe para encerrar.
 *
 * POR QUE NENHUM TESTE PEGOU: não havia teste nenhum sobre esse arquivo. A
 * única conferência era `$ExpectedFingerprint` em scripts/build-twa.ps1, que
 * roda só na máquina Windows do Fellipe, só na hora do build, e que estava
 * com a chave perdida escrita dentro.
 *
 * A metade que roda offline é esta. A conferência do que o site serve de
 * verdade, e do que o Google tem em cache, é `node scripts/verificarAssetLinks.js`.
 */
const fs = require('fs');
const {
  ARQUIVO,
  PACOTE,
  CHAVE_DE_ASSINATURA_DO_APP,
  CHAVE_DE_UPLOAD_ATUAL,
  CHAVES_REVOGADAS,
  impressoesDoArquivo,
  conferir,
} = require('../../scripts/verificarAssetLinks');

describe('assetlinks.json — chaves declaradas', () => {
  it('é JSON válido e declara a relação de handle_all_urls para com.lorflux.twa', () => {
    const conteudo = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    expect(Array.isArray(conteudo)).toBe(true);
    const nosso = conteudo.filter(st => st.target && st.target.package_name === PACOTE);
    expect(nosso.length).toBeGreaterThan(0);
    for (const st of nosso) {
      expect(st.relation).toContain('delegate_permission/common.handle_all_urls');
      expect(st.target.namespace).toBe('android_app');
    }
  });

  it('declara a chave de ASSINATURA DO APP, que é a do app publicado em qualquer faixa', () => {
    const { faltando } = conferir(impressoesDoArquivo());
    expect(
      faltando.includes(CHAVE_DE_ASSINATURA_DO_APP),
      'tirar a chave de assinatura do app quebra o App Link de todo mundo que já instalou'
    ).toBe(false);
  });

  it('declara a chave de UPLOAD em vigor, sem a qual o APK de teste abre com a barra do Chrome', () => {
    const { faltando } = conferir(impressoesDoArquivo());
    expect(
      faltando.includes(CHAVE_DE_UPLOAD_ATUAL),
      'o bubblewrap build --apk assina com a chave de upload; sem ela declarada o teste em aparelho parece build quebrado'
    ).toBe(false);
  });

  it('não declara nenhuma chave revogada', () => {
    const { revogadas } = conferir(impressoesDoArquivo());
    expect(
      revogadas,
      'chave revogada declarada continua podendo abrir as URLs de lorflux.com'
    ).toEqual([]);
  });

  it('não sobrou impressão desconhecida no arquivo', () => {
    const conhecidas = [CHAVE_DE_ASSINATURA_DO_APP, CHAVE_DE_UPLOAD_ATUAL, ...CHAVES_REVOGADAS]
      .map(f => f.toUpperCase().replace(/[^0-9A-F]/g, ''));
    const desconhecidas = impressoesDoArquivo()
      .filter(f => !conhecidas.includes(f.toUpperCase().replace(/[^0-9A-F]/g, '')));
    expect(
      desconhecidas,
      'impressão que não é a de assinatura, nem a de upload atual, nem uma revogada conhecida: documente em scripts/verificarAssetLinks.js antes de deixar passar'
    ).toEqual([]);
  });
});
