/**
 * Teste de regressão — App.tsx: o botão "ASSINAR PREMIUM" da aba Conta só
 * pode mostrar um valor que veio do servidor (Stripe) ou da Play.
 *
 * Existe por um defeito medido em 13/10/2026: o botão caía no valor fixo de
 * `utils/localizedPrice.ts` (R$ 3,99) enquanto o preço real não chegava, e
 * ficava nele de vez se `GET /api/payment/precos` falhasse. O Stripe cobrava
 * R$ 4,90, então a tela anunciava um preço menor do que o que seria cobrado.
 * Corrigido em 9471736.
 *
 * É a SEGUNDA vez: 517bb54 (24/09/2026, "preço real no botão") introduziu o
 * `precoPremium ?? getLocalizedPrice()` e, no mesmo commit, acrescentou aos
 * testes de tela o falso `getPrecosPremium -> { precos: {} }`, que é
 * justamente o caso em que o valor de reserva aparece. Nenhum teste olhava o
 * texto do botão, então a suíte ficou verde exercitando o caminho do defeito.
 * Por isso aqui tem os DOIS lados: sem preço do servidor o botão não mostra
 * valor nenhum, e com preço do servidor ele mostra o valor recebido. Só o
 * primeiro permitiria "consertar" apagando o preço para sempre.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import fs from 'node:fs';
import path from 'node:path';

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

// `getLocalizedCurrency()` e `formatarPreco()` leem navigator.language. Fixar
// pt-BR deixa a moeda esperada (brl) e o formato ("R$ 4,90") determinados,
// em vez de depender do idioma do ambiente que roda a suíte.
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('lorflux_onboarded', '1');
  window.history.pushState({}, '', '/');
  Object.defineProperty(window.navigator, 'language', { value: 'pt-BR', configurable: true });

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

/** Entra com a conta de teste e abre a aba Conta. */
async function abrirConta() {
  render(<App />);
  fireEvent.change(await screen.findByPlaceholderText('E-mail'), { target: { value: 'leitor@lorflux.com' } });
  fireEvent.change(screen.getByPlaceholderText(/Senha \(mín/), { target: { value: 'senha1234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await waitFor(() => expect(migrarProgressoDoVisitante).toHaveBeenCalled());
  fireEvent.click(await screen.findByRole('button', { name: /Conta/ }));
  return screen.findByRole('button', { name: /ASSINAR PREMIUM/ });
}

describe('App — o botão de assinar nunca anuncia preço que o servidor não deu', () => {
  it('servidor sem preço para a moeda: botão fica só com o rótulo, sem valor nenhum', async () => {
    vi.mocked(api.getPrecosPremium).mockResolvedValue({ precos: {} } as any);

    const botao = await abrirConta();
    await waitFor(() => expect(api.getPrecosPremium).toHaveBeenCalled());

    expect(botao).toHaveTextContent(/^ASSINAR PREMIUM$/);
    expect(botao.textContent).not.toMatch(/3,99/);
    expect(botao.textContent).not.toMatch(/R\$/);
  });

  it('consulta de preço falhou: botão fica só com o rótulo, sem valor nenhum', async () => {
    vi.mocked(api.getPrecosPremium).mockRejectedValue(new Error('500'));

    const botao = await abrirConta();
    await waitFor(() => expect(api.getPrecosPremium).toHaveBeenCalled());

    expect(botao).toHaveTextContent(/^ASSINAR PREMIUM$/);
    expect(botao.textContent).not.toMatch(/3,99/);
  });

  it('servidor respondeu R$ 4,90: é esse o valor que o botão mostra', async () => {
    vi.mocked(api.getPrecosPremium).mockResolvedValue({
      precos: { brl: { centavos: 490, moeda: 'brl' } },
    } as any);

    const botao = await abrirConta();

    await waitFor(() => expect(botao.textContent).toMatch(/R\$\s?4,90/));
    expect(botao.textContent).not.toMatch(/3,99/);
  });
});

/**
 * As outras duas CÓPIAS do mesmo defeito, que não dá para testar rodando
 * porque hoje nenhuma tela as renderiza:
 *
 *   - `components/SubscriptionTab.tsx:33` mostra `getLocalizedPrice()`, o
 *     valor FIXO de utils/localizedPrice.ts (R$ 3,99).
 *   - `components/Premium.tsx:103,124` mostra `premium_price_display`, um
 *     campo DIGITADO no painel do admin que nada mantém igual ao Stripe.
 *
 * Enquanto ninguém as importa, elas não mentem para ninguém. No dia em que
 * alguém religar uma delas, o defeito de 13/10/2026 volta pela porta de trás.
 * Este teste é a trava: ele quebra no religamento e manda trocar a fonte do
 * preço por `GET /api/payment/precos` antes.
 */
describe('Telas antigas de assinatura seguem desligadas (cópias com preço que pode mentir)', () => {
  const COPIAS_COM_PRECO_FIXO = ['SubscriptionTab', 'Premium'];
  const IGNORAR = new Set(['node_modules', 'dist', 'frontend-dist', 'coverage', 'tests', '.git', 'uploads']);

  function fontes(dir: string, achados: string[] = []): string[] {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.name.startsWith('.') || IGNORAR.has(item.name)) continue;
      const caminho = path.join(dir, item.name);
      if (item.isDirectory()) fontes(caminho, achados);
      else if (/\.tsx?$/.test(item.name)) achados.push(caminho);
    }
    return achados;
  }

  it('nenhum arquivo de produção importa SubscriptionTab nem Premium', () => {
    const raiz = process.cwd();
    // Se a varredura rodar da pasta errada ela encontraria zero arquivos e
    // passaria sem olhar nada: ancora na existência do App.
    expect(fs.existsSync(path.join(raiz, 'App.tsx'))).toBe(true);

    const arquivos = fontes(raiz);
    expect(arquivos.length).toBeGreaterThan(20);

    const religados: string[] = [];
    for (const arquivo of arquivos) {
      const conteudo = fs.readFileSync(arquivo, 'utf-8');
      for (const m of conteudo.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)) {
        const nome = path.basename(m[1]).replace(/\.(tsx?|jsx?)$/, '');
        if (COPIAS_COM_PRECO_FIXO.includes(nome) && path.basename(arquivo).replace(/\.tsx?$/, '') !== nome) {
          religados.push(`${path.relative(raiz, arquivo)} importa ${nome}`);
        }
      }
    }

    expect(
      religados,
      'Uma tela com preço fixo/digitado voltou a ser usada. Antes de religar, troque a fonte do preço por GET /api/payment/precos (ver 9471736 e o cabeçalho deste arquivo).'
    ).toEqual([]);
  });
});
