/**
 * Teste de regressão — App.tsx: a tela de agradecimento do Super Reader só
 * pode aparecer para quem TEM conta.
 *
 * O defeito, em linguagem de negócio: depois do modo visitante (acesso sem
 * conta) existir, qualquer pessoa podia digitar `?superreader=success` no
 * endereço do site e ganhar o cartão "obrigado por apoiar os autores" sem
 * nunca ter pago nem ter conta — o cartão é a confirmação visual de uma
 * contribuição, e aparecia para visitante com a URL forjada. Corrigido em
 * 7966698 ("fix(visitante): agradecimento do super reader so com conta"),
 * que acrescentou o gate `user &&` na linha de render do cartão.
 *
 * Medido em 21/10/2026 pela triagem de regressões: com o `user &&` removido
 * (volta ao estado anterior ao 7966698), os 11 testes que tocavam o assunto
 * passaram todos. Ninguém combinava as duas condições necessárias — bootar o
 * App de verdade com `?superreader=success` na URL E ficar sem conta. O
 * tests/frontend/superReaderReturn.test.ts cobre só o parser puro da query, e
 * superReaderBadge/superReaderButton montam componentes isolados, longe do
 * App. Este arquivo é o primeiro que boota o App nessa combinação.
 *
 * O QUE ESTE TESTE GARANTE
 * - Visitante (modo sem conta, `bootstrapSession` sem sessão) que chega em
 *   `/?superreader=success` entra no catálogo e NÃO vê o cartão.
 * - Que a ausência do cartão não é um falso verde: o segundo caso entra na
 *   conta no MESMO mount, sem recarregar a URL, e aí o cartão aparece — logo,
 *   o estado interno estava ligado durante a visita e o que escondia o cartão
 *   era mesmo o gate de conta. Isso também impede "consertar" o teste
 *   apagando o cartão de vez.
 * - Que o caminho real (Stripe devolve para o site com a sessão restaurada)
 *   continua mostrando o cartão.
 *
 * O QUE ELE NÃO GARANTE
 * - Não diz nada sobre o cartão corresponder a uma contribuição real: o gate
 *   é de conta, não de pagamento; quem tem conta e forja a URL ainda vê o
 *   cartão (decisão do 7966698, achado cosmético). A verdade sobre a
 *   contribuição é do backend (tests/backend/superReader.test.js).
 * - Não cobre o bundle já construído em dist/ (código compilado é outra
 *   cópia) nem o visual/z-index do cartão.
 * - Não cobre `?superreader=cancelled`, que nunca mostra cartão nenhum
 *   (parser coberto em tests/frontend/superReaderReturn.test.ts).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    setStatusCallback: vi.fn(),
    setAuthExpiredCallback: vi.fn(),
    bootstrapSession: vi.fn(),
    login: vi.fn(),
    setToken: vi.fn(),
    setRefreshToken: vi.fn(),
    logout: vi.fn(),
    getMeuEstudio: vi.fn(),
    getSuperReaderMe: vi.fn(),
    getParental: vi.fn(),
    getPrecosPremium: vi.fn(),
    getRecommendations: vi.fn(),
    getSeries: vi.fn(),
    getContinueList: vi.fn(),
    getPublicSettings: vi.fn(),
    getRandomAd: vi.fn(),
    trackAdImpression: vi.fn(),
    trackAdClick: vi.fn(),
  },
}));

vi.mock('../../utils/claimProgress', () => ({
  migrarProgressoDoVisitante: vi.fn(),
}));

import { api } from '../../services/api';
import { migrarProgressoDoVisitante } from '../../utils/claimProgress';
// Modo visitante de verdade (utils/guestMode.ts, não mockado): é a flag que
// faz o boot do App pular a tela de login e cair no catálogo SEM usuário —
// exatamente o estado em que o defeito aparecia.
import { enterGuestMode } from '../../utils/guestMode';
import App from '../../App';

const CARTAO = 'superreader-thanks'; // data-testid de components/SuperReaderThanks.tsx

const fakeUser = {
  id: 'u1',
  email: 'leitor@lorflux.com',
  nome: 'Leitor Teste',
  avatar: '',
  isPremium: false,
  role: 'user',
  provider: 'local',
  criadoEm: '2026-01-01T00:00:00.000Z',
  followingChannelIds: [],
  accessToken: 'acc-token',
  refreshToken: 'ref-token',
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // Onboarding fora do caminho: ele cobre a tela inteira e não é o assunto.
  localStorage.setItem('lorflux_onboarded', '1');
  // Idioma fixo: os rótulos procurados abaixo são os do dicionário pt.
  Object.defineProperty(window.navigator, 'language', { value: 'pt-BR', configurable: true });
  // A URL de retorno do checkout do Super Reader (success_url de
  // services/superReaderService.js), a mesma nos três casos.
  window.history.pushState({}, '', '/?superreader=success');

  vi.mocked(api.bootstrapSession).mockResolvedValue(null);
  vi.mocked(api.login).mockResolvedValue(fakeUser as any);
  vi.mocked(migrarProgressoDoVisitante).mockResolvedValue(undefined);
  vi.mocked(api.getMeuEstudio).mockRejectedValue(new Error('403'));
  vi.mocked(api.getSuperReaderMe).mockResolvedValue({ superReader: false, contribuicoes: [] } as any);
  vi.mocked(api.getParental).mockResolvedValue({
    classificacaoEtaria: 'young',
    tagsBloqueadas: [],
    temPin: false,
    vocabulario: [],
  } as any);
  vi.mocked(api.getPrecosPremium).mockResolvedValue({ precos: {} } as any);
  vi.mocked(api.getRecommendations).mockResolvedValue([]);
  vi.mocked(api.getSeries).mockResolvedValue([]);
  vi.mocked(api.getContinueList).mockResolvedValue([]);
  vi.mocked(api.getPublicSettings).mockResolvedValue({} as any);
  vi.mocked(api.getRandomAd).mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

/**
 * Abre o app como visitante (sem conta) já com a URL de sucesso do checkout e
 * espera o catálogo. Devolve quando o app passou do splash de boot — ou seja,
 * quando a árvore que contém a linha do cartão já está montada; sem isso, uma
 * afirmação de ausência passaria de graça, só porque nada foi renderizado.
 */
async function abrirComoVisitante() {
  enterGuestMode();
  render(<App />);
  // O botão de busca só existe na tela principal (fora do splash e fora da
  // tela de login), na MESMA árvore em que o cartão é renderizado.
  await screen.findByRole('button', { name: 'Buscar' });
}

describe('App — agradecimento do Super Reader só com conta (7966698)', () => {
  it('visitante com ?superreader=success: entra no catálogo sem conta e o cartão NÃO aparece', async () => {
    await abrirComoVisitante();

    // A query foi consumida e limpa pelo boot: é a prova de que o App
    // reconheceu o `superreader=success` desta URL (mesmo ramo que liga o
    // cartão) — e não de que o parâmetro passou batido.
    expect(window.location.search).toBe('');

    // Prova que não há conta nenhuma: a aba Conta mostra o convite de
    // cadastro do visitante, no lugar do perfil.
    fireEvent.click(screen.getByRole('button', { name: /Conta/ }));
    await screen.findByText('Crie sua conta para aproveitar tudo');

    expect(screen.queryByTestId(CARTAO)).not.toBeInTheDocument();
  });

  it('o mesmo visitante, depois de entrar na conta: o cartão aparece (o que o escondia era o gate de conta)', async () => {
    await abrirComoVisitante();
    expect(screen.queryByTestId(CARTAO)).not.toBeInTheDocument();

    // Sai do modo visitante pela porta do app: convite da aba Conta → tela de
    // login → entrar. Nada recarrega a página, e a URL já foi limpa no boot,
    // então o estado do agradecimento é o MESMO que estava valendo durante a
    // visita acima.
    fireEvent.click(screen.getByRole('button', { name: /Conta/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Entrar ou criar conta/ }));

    fireEvent.change(await screen.findByPlaceholderText('E-mail'), { target: { value: 'leitor@lorflux.com' } });
    fireEvent.change(screen.getByPlaceholderText(/Senha \(mín/), { target: { value: 'senha1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(migrarProgressoDoVisitante).toHaveBeenCalled());

    await waitFor(() => expect(screen.getByTestId(CARTAO)).toBeInTheDocument());
  });

  it('sessão de conta restaurada no boot com ?superreader=success: o cartão aparece (caminho real do Stripe)', async () => {
    vi.mocked(api.bootstrapSession).mockResolvedValue(fakeUser as any);

    render(<App />);

    await waitFor(() => expect(screen.getByTestId(CARTAO)).toBeInTheDocument());
  });
});
