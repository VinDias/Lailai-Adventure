/**
 * Leitor de quadrinhos em tela cheia no celular (retorno do cliente em
 * 27/11/2026, print-1: "esconder a hora e a duração da bateria no momento da
 * leitura"). hooks/useTelaCheiaNaLeitura.ts, usado pelo WebtoonReader.
 *
 * O QUE ESTE ARQUIVO GARANTE (jsdom, com a Fullscreen API falsa)
 * - em aparelho de toque, abrir o leitor pede tela cheia para a PÁGINA
 *   (documentElement), não para o leitor: a rolagem do leitor não muda;
 * - no computador (ponteiro fino) e onde a API não existe, nada é pedido;
 * - na prévia do moderador, no anúncio e no convite de conteúdo pago, nada é
 *   pedido; depois do anúncio, é;
 * - pedido recusado pelo navegador (sem toque recente): o primeiro toque na
 *   área de leitura pede de novo; toque em botão não pede;
 * - fechar o leitor sai da tela cheia, e só se foi o leitor que entrou;
 * - o "voltar" do Android (que só tira da tela cheia) fecha o leitor de uma
 *   vez; saída da tela cheia por troca de app NÃO fecha o leitor;
 * - a rolagem continua gravando o progresso e escondendo o cabeçalho.
 *
 * O QUE SÓ SE CONFERE NO APARELHO: se a hora e a bateria somem de fato na TWA
 * instalada, o aviso de tela cheia do Chrome, e o gesto de voltar.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Webtoon, User } from '../../types';

vi.mock('../../config/api', () => ({ default: 'http://localhost:3000' }));
vi.mock('../../components/AdComponent', () => ({
  default: ({ onFinish }: { onFinish: () => void }) => (
    <div data-testid="ad-component"><button onClick={onFinish}>Fechar Anúncio</button></div>
  ),
}));
vi.mock('../../services/api', () => ({
  api: {
    getEpisode: vi.fn(),
    getMyVote: vi.fn().mockResolvedValue(null),
    vote: vi.fn(), removeVote: vi.fn(),
    getContinueList: vi.fn().mockResolvedValue([]),
    getProgressForEpisode: vi.fn().mockResolvedValue(null),
    saveProgress: vi.fn().mockResolvedValue({}),
  },
}));

import { api } from '../../services/api';
import WebtoonReader from '../../components/WebtoonReader';

const webtoon: Webtoon = { id: 'ep-1', episodeId: 'ep-1', seriesId: 's-1', titulo: 'American Soul', categoria: '', descricao: '', numeroPaineis: 2, isPremium: false, thumbnailUrl: '', criadoEm: '' } as Webtoon;
const assinante = { id: 'u1', email: 'u@lorflux.test', nome: 'U', role: 'user', isPremium: true, avatar: '', provider: 'local', criadoEm: '', followingChannelIds: [] } as unknown as User;
const gratuito = { ...assinante, isPremium: false } as User;
const episodio = () => ({ _id: 'ep-1', panels: [
  { _id: 'p1', image_url: 'https://cdn.example.com/p1.jpg', order: 0, translationLayers: [] },
  { _id: 'p2', image_url: 'https://cdn.example.com/p2.jpg', order: 1, translationLayers: [] },
] });

// ─── Fullscreen API falsa ────────────────────────────────────────────────────
let elementoEmTelaCheia: Element | null;
let pedir: ReturnType<typeof vi.fn>;
let sair: ReturnType<typeof vi.fn>;
let aceitar: boolean;
let toque: boolean;
let visibilidade: 'visible' | 'hidden';
const raiz = document.documentElement as any;

function instalarApi() {
  pedir = vi.fn(function (this: Element) {
    if (!aceitar) return Promise.reject(new TypeError('Permissions check failed'));
    elementoEmTelaCheia = this;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  sair = vi.fn(() => {
    elementoEmTelaCheia = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  raiz.requestFullscreen = pedir;
  (document as any).exitFullscreen = sair;
}
/** O que o Android faz no "voltar": tira da tela cheia sem falar com a página. */
function sistemaTiraDaTelaCheia() {
  act(() => {
    elementoEmTelaCheia = null;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
}
const assentar = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  elementoEmTelaCheia = null;
  aceitar = true;
  toque = true;
  visibilidade = 'visible';
  instalarApi();
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => elementoEmTelaCheia });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilidade });
  (window as any).matchMedia = vi.fn((q: string) => ({ matches: q.includes('pointer: coarse') ? toque : false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  vi.mocked(api.getEpisode).mockReset().mockResolvedValue(episodio() as any);
  vi.mocked(api.getProgressForEpisode).mockReset().mockResolvedValue(null);
  vi.mocked(api.saveProgress).mockReset().mockResolvedValue({} as any);
});
afterEach(() => {
  delete raiz.requestFullscreen;
  delete (document as any).exitFullscreen;
  delete (document as any).fullscreenElement;
  delete (document as any).visibilityState;
  delete (window as any).matchMedia;
});

async function abrirLeitor(props: Partial<React.ComponentProps<typeof WebtoonReader>> = {}) {
  const onClose = vi.fn();
  const r = render(<WebtoonReader webtoon={webtoon} user={assinante} onClose={onClose} {...props} />);
  await waitFor(() => expect(screen.getAllByTestId('painel-leitor')).toHaveLength(2));
  await assentar();
  return { onClose, ...r };
}

describe('leitor de quadrinhos em tela cheia no celular', () => {
  it('abrir o leitor pede tela cheia para a página inteira, uma vez, escondendo a barra de navegação', async () => {
    await abrirLeitor();
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(pedir.mock.instances[0]).toBe(document.documentElement);
    expect(pedir).toHaveBeenCalledWith({ navigationUI: 'hide' });
    expect(document.fullscreenElement).toBe(document.documentElement);
  });

  it('no computador (ponteiro fino) nada é pedido', async () => {
    toque = false;
    await abrirLeitor();
    expect(pedir).not.toHaveBeenCalled();
  });

  it('navegador sem a Fullscreen API para páginas (iPhone): o leitor abre normalmente', async () => {
    delete raiz.requestFullscreen;
    await abrirLeitor();
    expect(screen.getAllByTestId('painel-leitor')).toHaveLength(2);
  });

  it('prévia do moderador (Fila de Aprovação) não entra em tela cheia', async () => {
    await abrirLeitor({ previa: { carregar: async () => episodio() }, user: null });
    expect(pedir).not.toHaveBeenCalled();
  });

  it('leitor gratuito: no anúncio não pede; fechado o anúncio, pede', async () => {
    const onClose = vi.fn();
    render(<WebtoonReader webtoon={webtoon} user={gratuito} onClose={onClose} />);
    expect(await screen.findByTestId('ad-component')).toBeInTheDocument();
    await assentar();
    expect(pedir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Fechar Anúncio'));
    await waitFor(() => expect(screen.getAllByTestId('painel-leitor')).toHaveLength(2));
    await assentar();
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('convite de conteúdo pago (403) não entra em tela cheia', async () => {
    vi.mocked(api.getEpisode).mockRejectedValue(Object.assign(new Error('Conteúdo exclusivo'), { status: 403, code: 'assinatura_necessaria', obra: { title: 'American Soul' } }));
    render(<WebtoonReader webtoon={webtoon} user={assinante} onClose={vi.fn()} />);
    await waitFor(() => expect(api.getEpisode).toHaveBeenCalled());
    await assentar();
    // O pedido da abertura (antes de o servidor responder) é desfeito.
    expect(document.fullscreenElement).toBeNull();
  });

  it('pedido recusado ao abrir (sem toque recente): o primeiro toque na leitura pede de novo; toque em botão não pede', async () => {
    aceitar = false;
    await abrirLeitor();
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(document.fullscreenElement).toBeNull();

    aceitar = true;
    // Botão de idioma, de voltar, de curtir: não é hora de pedir tela cheia.
    fireEvent.click(screen.getAllByRole('button')[0]);
    await assentar();
    expect(pedir).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByTestId('painel-leitor')[0]);
    await assentar();
    expect(pedir).toHaveBeenCalledTimes(2);
    expect(document.fullscreenElement).toBe(document.documentElement);

    // Já em tela cheia: outros toques não pedem de novo.
    fireEvent.click(screen.getAllByTestId('painel-leitor')[1]);
    await assentar();
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it('fechar o leitor sai da tela cheia', async () => {
    const { unmount } = await abrirLeitor();
    expect(document.fullscreenElement).toBe(document.documentElement);
    unmount();
    expect(sair).toHaveBeenCalledTimes(1);
    expect(document.fullscreenElement).toBeNull();
  });

  it('se a tela cheia não foi do leitor (já estava, ou o pedido foi recusado), fechar o leitor não mexe nela', async () => {
    aceitar = false;
    const { unmount } = await abrirLeitor();
    unmount();
    expect(sair).not.toHaveBeenCalled();
  });

  it('botão voltar do Android (tira da tela cheia sem avisar a página): o leitor fecha de uma vez e não volta a pedir tela cheia', async () => {
    const { onClose } = await abrirLeitor();
    expect(onClose).not.toHaveBeenCalled();
    sistemaTiraDaTelaCheia();
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByTestId('painel-leitor')[0]);
    await assentar();
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('saída da tela cheia por troca de app (página oculta, ou recém-voltada) NÃO fecha o leitor; o próximo toque volta à tela cheia', async () => {
    const { onClose } = await abrirLeitor();
    visibilidade = 'hidden';
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    sistemaTiraDaTelaCheia();
    expect(onClose).not.toHaveBeenCalled();

    visibilidade = 'visible';
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    fireEvent.click(screen.getAllByTestId('painel-leitor')[0]);
    await assentar();
    expect(pedir).toHaveBeenCalledTimes(2);
    expect(document.fullscreenElement).toBe(document.documentElement);

    // O navegador só avisa da saída depois que a página volta: também não fecha.
    sistemaTiraDaTelaCheia();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a rolagem do leitor continua igual em tela cheia: grava o progresso e esconde o cabeçalho', async () => {
    const { container } = await abrirLeitor();
    await waitFor(() => expect(api.getProgressForEpisode).toHaveBeenCalled());
    await assentar();
    const leitor = container.querySelector('.overflow-y-auto') as HTMLElement;
    expect(leitor).toBeTruthy();
    Object.defineProperty(leitor, 'scrollHeight', { configurable: true, value: 4000 });
    Object.defineProperty(leitor, 'clientHeight', { configurable: true, value: 800 });
    leitor.scrollTop = 1600;
    fireEvent.scroll(leitor);
    expect(container.querySelector('header')!.className).toContain('-translate-y-full');
    // O leitor continua sendo quem rola: a tela cheia é da página, não dele.
    expect(document.fullscreenElement).not.toBe(leitor);
  });
});
