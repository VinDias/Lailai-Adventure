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
});
