/**
 * Teste de regressão — App.tsx: o deep link da notificação push tem de vencer
 * o `setView()` padrão do login e do boot.
 *
 * DEFEITO (em linguagem de negócio): o leitor recebe a notificação de capítulo
 * novo, toca nela, o app abre em `/?abrir=<obra>&tipo=<tipo>` — e em vez da
 * obra avisada ele cai no feed inicial (CINECOMICS, aba ANICOM). Perdia-se
 * exatamente o clique em que a notificação precisava funcionar. Acontecia por
 * dois caminhos:
 *
 *   - ENTRANDO COM LOGIN NA HORA (e4ee859): o App já havia trocado para a aba
 *     do deep link, mas quando a migração do progresso do visitante terminava,
 *     o `setView(HQCINE)` padrão do fim do handleLogin rodava por cima.
 *   - ABRINDO JÁ LOGADO (156cbc9): sob React.StrictMode (dev) o efeito de boot
 *     roda duas vezes; o 2º `bootstrapSession` resolvia depois de o deep link
 *     já ter escolhido a aba e clobrava com o mesmo `setView(HQCINE)` padrão.
 *
 * Nos dois casos a correção é a MESMA técnica: capturar de forma síncrona,
 * ANTES do await, se havia algo pendente (`tinhaDeepLinkPendente`) e pular o
 * setView padrão quando havia.
 *
 * MEDIDO EM 21/10/2026 pela triagem de regressões: a correção está no código
 * de hoje (App.tsx:198 e :208 no boot; :288 e :314 no handleLogin), mas NENHUM
 * teste da suíte exercitava o ramo do deep link — os quatro testes que montam o
 * App inteiro mockam `bootstrapSession` como null (o `if (restored)` do boot
 * nunca rodava em teste nenhum), nenhum deles renderiza sob StrictMode, e o
 * appPinRecovery.test.tsx cobre só a OUTRA cláusula do mesmo guard (o token de
 * recuperação de PIN). deepLink.test.ts testa apenas o parser puro.
 *
 * COMMITS DA CORREÇÃO: e4ee859 (handleLogin) e 156cbc9 (boot sob StrictMode).
 * A cláusula do `pinRecoveryTokenRef`, que hoje divide o mesmo guard, é
 * posterior (fix round da T7) e tem teste próprio em appPinRecovery.test.tsx.
 *
 * O QUE ESTE TESTE GARANTE: com a query real que o backend põe na notificação
 * (`?abrir=<seriesId>&tipo=vcine`, services/notificationService.js), o App
 * abre a aba do tipo pedido E a obra avisada (a ficha dela, com o episódio,
 * abre sozinha — prova que o `seriesId` do deep link chegou ao feed), e
 * CONTINUA nela depois que (a) a migração do progresso do visitante termina no
 * login e (b) o 2º bootstrap do StrictMode resolve no boot já logado. Garante
 * também o caminho comum nos dois: sem deep link, login e boot logado seguem
 * caindo na aba inicial — o guard não pode ter quebrado isso.
 *
 * O QUE ESTE TESTE NÃO GARANTE: nada do service-worker (o
 * `navigate().catch(focus)` do notificationclick, parte do mesmo e4ee859,
 * continua sem teste na suíte); nada dos tipos de services/api.ts
 * (subscribePush/unsubscribePush — só um `tsc --noEmit` pegaria, e o comando de
 * teste do projeto não roda tsc); e nada dos tipos `hiqua`/`hqcine` do deep
 * link além do que parseDeepLink já cobre em deepLink.test.ts. O caso
 * exercitado aqui é o `vcine` porque é aquele em que a aba de destino é
 * DIFERENTE da aba padrão: é nele que o clobber é visível.
 *
 * COMO O TESTE SABE QUE A CONTINUAÇÃO PÓS-AWAIT RODOU (e não está passando por
 * ter olhado cedo demais): `components/Onboarding` é mockado só para contar as
 * chamadas de `hasSeenOnboarding()` — a linha IMEDIATAMENTE seguinte ao
 * setView guardado, nos dois caminhos. Enquanto a contagem não sobe, a
 * continuação não rodou; quando sobe, o clobber (se existisse) já teria sido
 * aplicado e renderizado. Nada neste arquivo calcula a resposta: a aba vem do
 * estado real do App.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
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
    confirmarRecuperacaoPin: vi.fn(),
    // Feeds (HQCine/VFilm) + Ads, que monta dentro de todo feed de usuário free.
    getRecommendations: vi.fn(),
    getSeries: vi.fn(),
    getContinueList: vi.fn(),
    getPublicSettings: vi.fn(),
    getRandomAd: vi.fn(),
    trackAdImpression: vi.fn(),
    trackAdClick: vi.fn(),
    // Ficha da obra que o deep link abre (VFilm.handleOpenSeries e os botões
    // de dentro da ficha).
    getSeriesContent: vi.fn(),
    getSeriesById: vi.fn(),
    getChannel: vi.fn(),
    getFavorites: vi.fn(),
    getSeriesVote: vi.fn(),
    getSuperReaderMin: vi.fn(),
    getMinhaSinalizacao: vi.fn(),
  },
}));

vi.mock('../../utils/claimProgress', () => ({
  migrarProgressoDoVisitante: vi.fn(),
}));

// Mock só como MARCADOR: `hasSeenOnboarding()` é chamado na linha seguinte ao
// setView guardado (App.tsx:209 no boot, :316 no handleLogin). Contar essas
// chamadas é o que torna as asserções deterministas, em vez de depender de
// "esperar um pouco". Devolve true para a tela de onboarding ficar fora do
// caminho, como em appPinRecovery.test.tsx.
vi.mock('../../components/Onboarding', () => ({
  default: () => null,
  hasSeenOnboarding: vi.fn(() => true),
}));

import { api } from '../../services/api';
import { migrarProgressoDoVisitante } from '../../utils/claimProgress';
import { hasSeenOnboarding } from '../../components/Onboarding';
import App from '../../App';

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

// Id no formato real do Mongo, como o backend escreve no payload do push.
const ID_DA_OBRA_DO_PUSH = '68b1f0a2c9d4e51234567890';

const obraDoPush = {
  _id: ID_DA_OBRA_DO_PUSH,
  title: 'A Lenda do Vale Secreto',
  genre: 'Aventura',
  description: 'A obra avisada pela notificação.',
  cover_image: '/capa.jpg',
  content_type: 'vcine',
  isPremium: false,
};

const episodioDaObraDoPush = {
  _id: 'ep-77',
  title: 'Producao 7: o que a notificacao avisou',
  episode_number: 7,
  description: 'Episódio novo.',
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('lorflux_onboarded', '1');
  window.history.pushState({}, '', '/');

  vi.mocked(hasSeenOnboarding).mockReturnValue(true);
  vi.mocked(api.bootstrapSession).mockResolvedValue(null);
  vi.mocked(api.getMeuEstudio).mockRejectedValue(new Error('403'));
  vi.mocked(api.getSuperReaderMe).mockResolvedValue({ superReader: false, contribuicoes: [] } as any);
  vi.mocked(api.getParental).mockResolvedValue({
    classificacaoEtaria: 'young',
    tagsBloqueadas: [],
    temPin: false,
    vocabulario: [],
  } as any);
  vi.mocked(api.getPrecosPremium).mockResolvedValue({ precos: {} } as any);
  // Só a aba do deep link tem obra; a aba inicial vem vazia de propósito, para
  // "CINECOMICS" (o cabeçalho do HQCine) ser o sinal de que a aba trocou.
  vi.mocked(api.getRecommendations).mockImplementation(
    async (tipo: any) => (tipo === 'vcine' ? ([obraDoPush] as any) : ([] as any)),
  );
  vi.mocked(api.getSeries).mockResolvedValue([] as any);
  vi.mocked(api.getContinueList).mockResolvedValue([] as any);
  vi.mocked(api.getPublicSettings).mockResolvedValue({} as any);
  vi.mocked(api.getRandomAd).mockResolvedValue(null as any);
  vi.mocked(api.getSeriesContent).mockResolvedValue({
    seasons: [],
    episodes: [episodioDaObraDoPush],
  } as any);
  vi.mocked(api.getFavorites).mockResolvedValue([] as any);
  vi.mocked(api.getSeriesVote).mockResolvedValue({ myVote: null, likes: 0 } as any);
  vi.mocked(api.getSuperReaderMin).mockResolvedValue({ minCents: 500 } as any);
  vi.mocked(api.getMinhaSinalizacao).mockResolvedValue({ jaSinalizada: false } as any);
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

/** A aba está ativa? Lê a classe que o NavBtn do App.tsx aplica de verdade. */
const abaAtiva = (label: string) =>
  !!screen.getByText(label).closest('button')?.className.includes('text-rose-500');

async function loginNaTelaDeAuth() {
  const emailInput = await screen.findByPlaceholderText('E-mail');
  fireEvent.change(emailInput, { target: { value: 'leitor@lorflux.com' } });
  fireEvent.change(screen.getByPlaceholderText(/Senha \(mín/), { target: { value: 'senha1234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

/**
 * Espera a continuação pós-await do caminho de login/boot ter rodado: a
 * contagem de `hasSeenOnboarding()` é o marcador (linha seguinte ao setView
 * guardado). O `act` final só drena o que ficou pendente de render.
 */
async function esperarContinuacao(vezes: number) {
  await waitFor(() => expect(hasSeenOnboarding).toHaveBeenCalledTimes(vezes));
  await act(async () => { await Promise.resolve(); });
}

describe('App — deep link de push vence o setView padrão do login (e4ee859)', () => {
  it('login com deep link pendente: abre a aba V-SHOW com a obra avisada e CONTINUA nela quando a migração do progresso termina', async () => {
    window.history.pushState({}, '', `/?abrir=${ID_DA_OBRA_DO_PUSH}&tipo=vcine`);

    // Migração do progresso do visitante presa de propósito: é o await que
    // existe entre o setUser e o setView(HQCINE) padrão do handleLogin, e é
    // nessa janela que o useEffect([user]) consome o deep link.
    let resolveMigracao: () => void = () => {};
    vi.mocked(migrarProgressoDoVisitante).mockImplementation(
      () => new Promise<void>((resolve) => { resolveMigracao = resolve; }),
    );
    vi.mocked(api.login).mockResolvedValue(fakeUser as any);

    render(<App />);
    await loginNaTelaDeAuth();

    // Com a migração ainda pendurada: aba do tipo pedido (VERTICALSHOW só
    // existe no VFilm) e ficha da obra do push aberta sozinha — o episódio só
    // aparece porque o `seriesId` do deep link chegou ao feed como
    // focusSeriesId e casou com a obra do catálogo.
    await screen.findByText('VERTICALSHOW');
    await screen.findByText(episodioDaObraDoPush.title);
    expect(abaAtiva('V-SHOW')).toBe(true);
    // Marcador: a continuação do handleLogin ainda NÃO rodou.
    expect(hasSeenOnboarding).not.toHaveBeenCalled();

    // Libera a migração. Sem o guard, é aqui que o setView(HQCINE) padrão
    // rodaria por cima da aba escolhida pelo deep link.
    await act(async () => { resolveMigracao(); });
    await esperarContinuacao(1);

    expect(abaAtiva('V-SHOW')).toBe(true);
    expect(abaAtiva('ANICOM')).toBe(false);
    expect(screen.getByText('VERTICALSHOW')).toBeInTheDocument();
    expect(screen.getByText(episodioDaObraDoPush.title)).toBeInTheDocument();
    // O feed inicial nem chegou a montar (não buscou a recomendação dele).
    expect(screen.queryByText('CINECOMICS')).not.toBeInTheDocument();
    expect(api.getRecommendations).not.toHaveBeenCalledWith('hqcine');
  });

  it('login SEM deep link: continua caindo na aba inicial (o guard não quebrou o caminho comum)', async () => {
    vi.mocked(migrarProgressoDoVisitante).mockResolvedValue(undefined);
    vi.mocked(api.login).mockResolvedValue(fakeUser as any);

    render(<App />);
    await loginNaTelaDeAuth();

    await esperarContinuacao(1);

    await screen.findByText('CINECOMICS');
    expect(abaAtiva('ANICOM')).toBe(true);
    expect(abaAtiva('V-SHOW')).toBe(false);
    expect(screen.queryByText('VERTICALSHOW')).not.toBeInTheDocument();
  });
});

describe('App — deep link de push vence o 2º bootstrap do StrictMode (156cbc9)', () => {
  it('boot já logado com deep link sob StrictMode: a aba V-SHOW não volta para a inicial quando o 2º bootstrapSession resolve', async () => {
    window.history.pushState({}, '', `/?abrir=${ID_DA_OBRA_DO_PUSH}&tipo=vcine`);
    vi.mocked(migrarProgressoDoVisitante).mockResolvedValue(undefined);

    // Duas restaurações de sessão controladas: é o que o StrictMode (dev)
    // provoca de verdade ao rodar o efeito de boot duas vezes, com a 2ª
    // resolvendo depois da rede.
    let resolverPrimeiro: (v: any) => void = () => {};
    let resolverSegundo: (v: any) => void = () => {};
    vi.mocked(api.bootstrapSession)
      .mockImplementationOnce(() => new Promise((res) => { resolverPrimeiro = res; }))
      .mockImplementationOnce(() => new Promise((res) => { resolverSegundo = res; }));

    render(<React.StrictMode><App /></React.StrictMode>);
    await waitFor(() => expect(api.bootstrapSession).toHaveBeenCalledTimes(2));

    await act(async () => { resolverPrimeiro(fakeUser); });
    await esperarContinuacao(1);

    await screen.findByText('VERTICALSHOW');
    await screen.findByText(episodioDaObraDoPush.title);
    expect(abaAtiva('V-SHOW')).toBe(true);

    // A 2ª restauração resolve DEPOIS: sem o flag capturado antes do await,
    // ela clobrava a aba do deep link com o setView(HQCINE) padrão.
    await act(async () => { resolverSegundo(fakeUser); });
    await esperarContinuacao(2);

    expect(abaAtiva('V-SHOW')).toBe(true);
    expect(abaAtiva('ANICOM')).toBe(false);
    expect(screen.getByText('VERTICALSHOW')).toBeInTheDocument();
    expect(screen.getByText(episodioDaObraDoPush.title)).toBeInTheDocument();
    expect(screen.queryByText('CINECOMICS')).not.toBeInTheDocument();
    expect(api.getRecommendations).not.toHaveBeenCalledWith('hqcine');
  });

  it('boot já logado SEM deep link sob StrictMode: continua caindo na aba inicial', async () => {
    vi.mocked(migrarProgressoDoVisitante).mockResolvedValue(undefined);

    let resolverPrimeiro: (v: any) => void = () => {};
    let resolverSegundo: (v: any) => void = () => {};
    vi.mocked(api.bootstrapSession)
      .mockImplementationOnce(() => new Promise((res) => { resolverPrimeiro = res; }))
      .mockImplementationOnce(() => new Promise((res) => { resolverSegundo = res; }));

    render(<React.StrictMode><App /></React.StrictMode>);
    await waitFor(() => expect(api.bootstrapSession).toHaveBeenCalledTimes(2));

    await act(async () => { resolverPrimeiro(fakeUser); });
    await esperarContinuacao(1);
    await act(async () => { resolverSegundo(fakeUser); });
    await esperarContinuacao(2);

    await screen.findByText('CINECOMICS');
    expect(abaAtiva('ANICOM')).toBe(true);
    expect(abaAtiva('V-SHOW')).toBe(false);
    expect(screen.queryByText('VERTICALSHOW')).not.toBeInTheDocument();
  });
});
