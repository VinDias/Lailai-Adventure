/**
 * Fase 5 Bloco 3, Task 6 — SinalizarButton (modal de detalhe dos 3 feeds).
 * Mesma técnica de tests/frontend/superReaderButton.test.tsx (mock de
 * services/api). Regra 8: nenhuma contagem aparece em lugar nenhum.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: { getMinhaSinalizacao: vi.fn(), sinalizarSerie: vi.fn() },
}));

import { api } from '../../services/api';
import SinalizarButton from '../../components/SinalizarButton';
import { I18nProvider } from '../../contexts/I18nContext';
import { TRANSLATIONS, LANG_OPTIONS } from '../../i18n/translations';

const user: any = { id: 'u1', email: 'a@a.com', nome: 'Ana', isPremium: false, role: 'user', provider: 'local', criadoEm: '', followingChannelIds: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getMinhaSinalizacao).mockResolvedValue({ jaSinalizada: false, motivo: null });
});
afterEach(() => cleanup());

describe('SinalizarButton', () => {
  it('guest: botão desabilitado e nenhuma consulta à API', () => {
    render(<SinalizarButton user={null} seriesId="s1" />);
    expect(screen.getByRole('button', { name: /SINALIZAR CONTEÚDO/ })).toBeDisabled();
    expect(api.getMinhaSinalizacao).not.toHaveBeenCalled();
  });

  it('logado: consulta o próprio estado ao montar; 404/erro = sem estado (botão habilitado, sem alerta)', async () => {
    vi.mocked(api.getMinhaSinalizacao).mockRejectedValue(Object.assign(new Error('Série não encontrada.'), { status: 404 }));
    render(<SinalizarButton user={user} seriesId="s1" />);
    await waitFor(() => expect(api.getMinhaSinalizacao).toHaveBeenCalledWith('s1'));
    expect(screen.getByRole('button', { name: /SINALIZAR CONTEÚDO/ })).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('já sinalizada: botão em estado "SINALIZADA", desabilitado, sem número algum', async () => {
    vi.mocked(api.getMinhaSinalizacao).mockResolvedValue({ jaSinalizada: true, motivo: 'spam_ou_enganoso' });
    render(<SinalizarButton user={user} seriesId="s1" />);
    const btn = await screen.findByRole('button', { name: /SINALIZADA/ });
    expect(btn).toBeDisabled();
    expect(document.body.textContent).not.toMatch(/\d/);
  });

  it('abre o painel com os 6 motivos, texto de anonimato, e "outro" exige descrição antes de enviar', async () => {
    render(<SinalizarButton user={user} seriesId="s1" />);
    fireEvent.click(await screen.findByRole('button', { name: /SINALIZAR CONTEÚDO/ }));
    expect(screen.getByText(/anônima para o autor/)).toBeInTheDocument();
    const select = screen.getByLabelText(/Motivo/) as HTMLSelectElement;
    expect(Array.from(select.options).map(o => o.value)).toEqual(['conteudo_inadequado_faixa', 'discurso_de_odio', 'spam_ou_enganoso', 'direitos_autorais', 'conteudo_proibido', 'outro']);
    expect(Array.from(select.options).map(o => o.textContent)).not.toContain('Violência excessiva');

    fireEvent.change(select, { target: { value: 'outro' } });
    fireEvent.click(screen.getByRole('button', { name: 'ENVIAR' }));
    expect(api.sinalizarSerie).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/Descreva/);
  });

  it('envia {motivo, descricao} e passa ao estado SINALIZADA com agradecimento (sem contagem)', async () => {
    vi.mocked(api.sinalizarSerie).mockResolvedValue({ jaSinalizada: false });
    render(<SinalizarButton user={user} seriesId="s1" />);
    fireEvent.click(await screen.findByRole('button', { name: /SINALIZAR CONTEÚDO/ }));
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'direitos_autorais' } });
    fireEvent.change(screen.getByPlaceholderText(/Descreva/), { target: { value: 'Arte copiada.' } });
    fireEvent.click(screen.getByRole('button', { name: 'ENVIAR' }));
    await waitFor(() => expect(api.sinalizarSerie).toHaveBeenCalledWith('s1', { motivo: 'direitos_autorais', descricao: 'Arte copiada.' }));
    expect(await screen.findByRole('button', { name: /SINALIZADA/ })).toBeDisabled();
    expect(screen.getByText(/Sinalização enviada/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d/);
  });

  it('erro code propria_obra mostra a mensagem própria; erro genérico mostra o fallback', async () => {
    vi.mocked(api.sinalizarSerie).mockRejectedValueOnce(Object.assign(new Error('Você não pode sinalizar a própria obra.'), { status: 400, code: 'propria_obra' }));
    render(<SinalizarButton user={user} seriesId="s1" />);
    fireEvent.click(await screen.findByRole('button', { name: /SINALIZAR CONTEÚDO/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ENVIAR' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/própria obra/);

    vi.mocked(api.sinalizarSerie).mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(screen.getByRole('button', { name: 'ENVIAR' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível enviar/);
  });

  it('duplo clique não envia duas vezes', async () => {
    let resolver: (v: any) => void = () => {};
    vi.mocked(api.sinalizarSerie).mockImplementation(() => new Promise(r => { resolver = r; }));
    render(<SinalizarButton user={user} seriesId="s1" />);
    fireEvent.click(await screen.findByRole('button', { name: /SINALIZAR CONTEÚDO/ }));
    const enviar = screen.getByRole('button', { name: 'ENVIAR' });
    fireEvent.click(enviar); fireEvent.click(enviar);
    expect(api.sinalizarSerie).toHaveBeenCalledTimes(1);
    resolver({ jaSinalizada: false });
  });

  // Fix round, item 5 (a11y): o envio troca ENVIAR por nada e desabilita o
  // botão principal — sem alvo estável o foco cai no <body> e o sucesso não
  // é anunciado.
  it('sucesso: agradecimento com role="status" e foco devolvido ao container (não ao body)', async () => {
    vi.mocked(api.sinalizarSerie).mockResolvedValue({ jaSinalizada: false });
    render(<SinalizarButton user={user} seriesId="s1" />);
    fireEvent.click(await screen.findByRole('button', { name: /SINALIZAR CONTEÚDO/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ENVIAR' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/Sinalização enviada/);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('sinalizar-button')));
    expect(document.activeElement).not.toBe(document.body);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fix round, item 2: o componente NÃO desmonta ao trocar de obra (modal da
// obra A → canal → CanalPublico empilhado → outra obra: só a prop `seriesId`
// muda). Sem reset o estado da obra A contaminava a obra B.
// ═══════════════════════════════════════════════════════════════════════════

describe('SinalizarButton — estado é POR OBRA quando só o seriesId muda', () => {
  it('obra A já sinalizada: a obra B NÃO herda "SINALIZADA" nem enquanto a consulta dela está em voo', async () => {
    let resolverB: (v: any) => void = () => {};
    vi.mocked(api.getMinhaSinalizacao)
      .mockResolvedValueOnce({ jaSinalizada: true, motivo: 'spam_ou_enganoso' })
      .mockImplementationOnce(() => new Promise<any>(r => { resolverB = r; }));
    const { rerender } = render(<SinalizarButton user={user} seriesId="sA" />);
    expect(await screen.findByRole('button', { name: /SINALIZADA/ })).toBeDisabled();

    rerender(<SinalizarButton user={user} seriesId="sB" />);
    // Sem esperar a resposta da obra B: o botão JÁ não pode dizer
    // "SINALIZADA" — é esse intervalo que mostrava o estado da obra errada.
    expect(api.getMinhaSinalizacao).toHaveBeenLastCalledWith('sB');
    expect(screen.getByRole('button', { name: /SINALIZAR CONTEÚDO/ })).toBeEnabled();

    resolverB({ jaSinalizada: false, motivo: null });
    await waitFor(() => expect(screen.getByRole('button', { name: /SINALIZAR CONTEÚDO/ })).toBeEnabled());
  });

  it('consulta da obra B falhando (404) também não deixa o "SINALIZADA" da obra A na tela', async () => {
    vi.mocked(api.getMinhaSinalizacao)
      .mockResolvedValueOnce({ jaSinalizada: true, motivo: 'outro' })
      .mockRejectedValueOnce(Object.assign(new Error('Série não encontrada.'), { status: 404 }));
    const { rerender } = render(<SinalizarButton user={user} seriesId="sA" />);
    await screen.findByRole('button', { name: /SINALIZADA/ });

    rerender(<SinalizarButton user={user} seriesId="sB" />);
    await waitFor(() => expect(api.getMinhaSinalizacao).toHaveBeenLastCalledWith('sB'));
    expect(screen.getByRole('button', { name: /SINALIZAR CONTEÚDO/ })).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('o agradecimento da obra A não aparece na obra B', async () => {
    vi.mocked(api.sinalizarSerie).mockResolvedValue({ jaSinalizada: false });
    const { rerender } = render(<SinalizarButton user={user} seriesId="sA" />);
    fireEvent.click(await screen.findByRole('button', { name: /SINALIZAR CONTEÚDO/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ENVIAR' }));
    expect(await screen.findByText(/Sinalização enviada/)).toBeInTheDocument();

    rerender(<SinalizarButton user={user} seriesId="sB" />);
    expect(screen.queryByText(/Sinalização enviada/)).not.toBeInTheDocument();
  });

  it('a descrição digitada sobre a obra A NÃO viaja no payload da obra B', async () => {
    vi.mocked(api.sinalizarSerie).mockResolvedValue({ jaSinalizada: false });
    const { rerender } = render(<SinalizarButton user={user} seriesId="sA" />);
    fireEvent.click(await screen.findByRole('button', { name: /SINALIZAR CONTEÚDO/ }));
    fireEvent.change(screen.getByPlaceholderText(/Descreva/), { target: { value: 'Isto é sobre a obra A.' } });
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'direitos_autorais' } });

    rerender(<SinalizarButton user={user} seriesId="sB" />);
    // O painel fecha junto com o reset; ao reabrir, tudo volta ao default.
    fireEvent.click(screen.getByRole('button', { name: /SINALIZAR CONTEÚDO/ }));
    expect((screen.getByPlaceholderText(/Descreva/) as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText(/Motivo/) as HTMLSelectElement).value).toBe('conteudo_inadequado_faixa');

    fireEvent.click(screen.getByRole('button', { name: 'ENVIAR' }));
    await waitFor(() => expect(api.sinalizarSerie).toHaveBeenCalledWith('sB', { motivo: 'conteudo_inadequado_faixa' }));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fix round, item 3: a asserção da regra 8 ("nenhuma contagem em lugar
// nenhum") existia só com o painel FECHADO — uma mutação que pusesse um
// contador "0/500" no textarea passava com a suíte inteira verde. Aqui ela
// roda com o painel ABERTO, cobrindo os 6 rótulos, os 3 ramos de erro e o
// sucesso, nos 4 idiomas.
// ═══════════════════════════════════════════════════════════════════════════

describe('SinalizarButton — regra 8 com o painel ABERTO, nos 4 idiomas', () => {
  const botoesDo = (container: HTMLElement) => Array.from(container.querySelectorAll('button'));

  it.each(LANG_OPTIONS.map(o => o.code))('idioma %s: nenhum dígito na tela em nenhum estado do painel', async (lang) => {
    localStorage.setItem('lorflux_language', lang);
    vi.mocked(api.sinalizarSerie)
      .mockRejectedValueOnce(Object.assign(new Error('x'), { status: 400, code: 'propria_obra' }))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ jaSinalizada: false });

    render(
      <I18nProvider>
        <SinalizarButton user={user} seriesId="s1" />
      </I18nProvider>
    );
    const container = await screen.findByTestId('sinalizar-button');
    fireEvent.click(botoesDo(container)[0]);

    // Painel aberto: título, explicação, rótulo do motivo, os 6 motivos,
    // CANCELAR e ENVIAR — tudo no idioma do provider.
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.options).toHaveLength(6);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.placeholder).not.toMatch(/\d/);
    expect(document.body.textContent).not.toMatch(/\d/);

    // Ramo 1 — "outro" sem descrição (validação local).
    fireEvent.change(select, { target: { value: 'outro' } });
    fireEvent.click(botoesDo(container)[2]);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d/);

    // Ramo 2 — 400 propria_obra. Ramo 3 — erro genérico.
    fireEvent.change(textarea, { target: { value: 'texto' } });
    fireEvent.click(botoesDo(container)[2]);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(document.body.textContent).not.toMatch(/\d/);

    fireEvent.click(botoesDo(container)[2]);
    await waitFor(() => expect(api.sinalizarSerie).toHaveBeenCalledTimes(2));
    expect(document.body.textContent).not.toMatch(/\d/);

    // Sucesso — agradecimento + botão em "SINALIZADA".
    fireEvent.click(botoesDo(container)[2]);
    await screen.findByRole('status');
    expect(document.body.textContent).not.toMatch(/\d/);

    localStorage.removeItem('lorflux_language');
  });
});

// A superfície com maior chance de ganhar um dígito no futuro é o dicionário:
// teste de DADOS, sem render.
describe('i18n — nenhuma chave sinalizar.* pode conter dígito (regra 8)', () => {
  it.each(LANG_OPTIONS.map(o => o.code))('%s', (lang) => {
    const entradas = Object.entries(TRANSLATIONS[lang]).filter(([k]) => k.startsWith('sinalizar.'));
    expect(entradas.length).toBeGreaterThan(10);
    expect(entradas.filter(([, v]) => /\d/.test(v))).toEqual([]);
  });
});
