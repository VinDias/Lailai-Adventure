/**
 * Fase 5 Bloco 3, Task 7 — CuradoriaPanel (admin, PT fixo). Regra 8 do Vin: o
 * admin vê números e descrições anonimizadas, nunca identidades; regra 1: as 4
 * ações são explícitas, "Remover" exige motivo e confirmação.
 *
 * O shape das fixtures é o de routes/adminCuradoria.js (GET /admin/curadoria),
 * NÃO o do plano: no HISTÓRICO (`?status=fechado`) o backend não calcula
 * contagem viva, descrições nem thread — `contagem` vem do `gatilho` com
 * S_grave/semConsumo/contasRecentes/ipsDistintos zerados e as listas vazias.
 * Por isso a linha de agregados vivos só existe na aba Fila (teste próprio).
 *
 * As 4 ações respondem 409 quando outro curador fecha/reivindica o caso antes
 * (fix round do backend, commit 08639a7) — e `remover`/`reclassificar`
 * reivindicam o caso ANTES de alterar a obra, devolvendo a reivindicação se a
 * alteração falhar. Para a UI isso significa: QUALQUER erro recarrega a fila.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getAdminCuradoria: vi.fn(),
    curadoriaAprovar: vi.fn(),
    curadoriaReclassificar: vi.fn(),
    curadoriaSolicitarCorrecao: vi.fn(),
    curadoriaRemover: vi.fn(),
  },
}));

import { api } from '../../services/api';
import CuradoriaPanel from '../../components/Admin/CuradoriaPanel';

const caso = (over: any = {}) => ({
  casoId: 'c1', status: 'aberto', prioridade: 'normal', abertoEm: '2026-09-04T12:00:00.000Z',
  obra: { id: 's1', title: 'Obra Fila 7', cover_image: null, content_type: 'hiqua', content_rating: 'young', tags: ['romance'], isPublished: true },
  canal: { id: 'ch1', name: 'Canal Um' }, canalId: 'ch1',
  gatilho: { tipo: 'pequena', S: 23, V: 41, limiar: 20 }, resumoMotivos: { spam_ou_enganoso: 21, outro: 2 },
  contagem: { S: 23, S_grave: 0, V: 41, limiar: 20, semConsumo: 4, contasRecentes: 3, ipsDistintos: 19 },
  descricoes: [{ motivo: 'outro', descricao: 'Parece cópia.', createdAt: '2026-09-04T11:00:00.000Z' }],
  thread: [{ autorTipo: 'editor', texto: 'Sua obra recebeu sinalizações.', refId: 's1', createdAt: '2026-09-04T12:00:00.000Z' }, { autorTipo: 'ilustrador', texto: 'Minha defesa.', refId: null, createdAt: '2026-09-04T13:00:00.000Z' }],
  avisoArtista: 'enviado', decisao: null, motivoDecisao: null, observacao: null, decididoPor: null, decisaoEm: null, sinalizacoesAbusivas: false,
  ...over,
});

// Caso FECHADO como o backend devolve no histórico: sem contagem viva, sem
// descrições e sem thread (routes/adminCuradoria.js só as monta em `!historico`).
const casoFechado = (over: any = {}) => caso({
  casoId: 'f1', status: 'fechado',
  contagem: { S: 23, S_grave: 0, V: 41, limiar: 20, semConsumo: 0, contasRecentes: 0, ipsDistintos: 0 },
  descricoes: [], thread: [],
  decisao: 'remover', motivoDecisao: 'Cópia.', decididoPor: 'admin-1', decisaoEm: '2026-09-05T10:00:00.000Z',
  ...over,
});

const erroDaApi = (mensagem: string, status?: number) => {
  const e: any = new Error(mensagem);
  if (status) e.status = status;
  return e;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAdminCuradoria).mockResolvedValue({ casos: [caso({ casoId: 'g1', prioridade: 'grave', obra: { ...caso().obra, id: 'g', title: 'Grave Primeiro 9' }, contagem: { ...caso().contagem, S_grave: 6 } }), caso()], total: 2, graves: 1 } as any);
});
afterEach(() => cleanup());

describe('CuradoriaPanel', () => {
  it('lista os casos na ordem do backend (grave primeiro), com números, motivos, descrições e thread — sem identidades', async () => {
    render(<CuradoriaPanel />);
    const titulos = await screen.findAllByRole('heading', { level: 3 });
    expect(titulos[0]).toHaveTextContent('Grave Primeiro 9');
    expect(screen.getAllByText(/GRAVE/).length).toBeGreaterThan(0);
    const card = screen.getByText('Obra Fila 7').closest('[data-testid="caso-card"]') as HTMLElement;
    expect(within(card).getByText(/23 \/ 20/)).toBeInTheDocument();       // S / limiar
    expect(within(card).getByText(/41 visualizações únicas/)).toBeInTheDocument();
    expect(within(card).getByText(/4 sem consumo/)).toBeInTheDocument();
    expect(within(card).getByText(/3 contas recentes/)).toBeInTheDocument();
    expect(within(card).getByText(/19 IPs distintos/)).toBeInTheDocument();
    expect(within(card).getByText(/Spam ou conteúdo enganoso/)).toBeInTheDocument();
    expect(within(card).getByText('Parece cópia.')).toBeInTheDocument();
    expect(within(card).getByText('Minha defesa.')).toBeInTheDocument();
    expect(within(card).getByText(/Ilustrador/)).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/@|userId/);
  });

  it('Aprovar envia {abuso} conforme a checkbox e chama onChange + refetch', async () => {
    vi.mocked(api.curadoriaAprovar).mockResolvedValue({ caso: {} } as any);
    const onChange = vi.fn();
    render(<CuradoriaPanel onChange={onChange} />);
    const card = (await screen.findByText('Obra Fila 7')).closest('[data-testid="caso-card"]') as HTMLElement;
    fireEvent.click(within(card).getByLabelText(/Sinalizações abusivas/));
    fireEvent.click(within(card).getByRole('button', { name: /^Aprovar$/ }));
    await waitFor(() => expect(api.curadoriaAprovar).toHaveBeenCalledWith('c1', { abuso: true }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(api.getAdminCuradoria).toHaveBeenCalledTimes(2);
  });

  it('Reclassificar exige escolher o rating e envia {content_rating}', async () => {
    vi.mocked(api.curadoriaReclassificar).mockResolvedValue({ caso: {} } as any);
    render(<CuradoriaPanel />);
    const card = (await screen.findByText('Obra Fila 7')).closest('[data-testid="caso-card"]') as HTMLElement;
    const btn = within(card).getByRole('button', { name: /Reclassificar/ });
    expect(btn).toBeDisabled();
    fireEvent.change(within(card).getByLabelText(/Nova classificação/), { target: { value: 'teen' } });
    fireEvent.click(btn);
    await waitFor(() => expect(api.curadoriaReclassificar).toHaveBeenCalledWith('c1', { content_rating: 'teen' }));
  });

  it('Solicitar correção abre modal com textarea (aviso de não colar sinalizações) e envia {texto}', async () => {
    vi.mocked(api.curadoriaSolicitarCorrecao).mockResolvedValue({ caso: {} } as any);
    render(<CuradoriaPanel />);
    const card = (await screen.findByText('Obra Fila 7')).closest('[data-testid="caso-card"]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Solicitar correção/ }));
    expect(screen.getByText(/não cole trechos das sinalizações/i)).toBeInTheDocument();
    const confirmar = screen.getByRole('button', { name: /Enviar pedido/ });
    expect(confirmar).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/ajuste/i), { target: { value: 'Troque a capa.' } });
    fireEvent.click(confirmar);
    await waitFor(() => expect(api.curadoriaSolicitarCorrecao).toHaveBeenCalledWith('c1', { texto: 'Troque a capa.' }));
  });

  it('Solicitar correção fica desabilitado para obra sem canal (o backend responde 400: não há artista para avisar)', async () => {
    vi.mocked(api.getAdminCuradoria).mockResolvedValue({ casos: [caso({ canal: null, canalId: null })], total: 1, graves: 0 } as any);
    render(<CuradoriaPanel />);
    const card = (await screen.findByText('Obra Fila 7')).closest('[data-testid="caso-card"]') as HTMLElement;
    expect(within(card).getByRole('button', { name: /Solicitar correção/ })).toBeDisabled();
    expect(within(card).getByRole('button', { name: /^Remover$/ })).not.toBeDisabled();
  });

  it('Remover exige motivo e confirmação, avisa que a obra não é apagada; envia {motivo}; erro da API aparece no modal', async () => {
    vi.mocked(api.curadoriaRemover).mockRejectedValueOnce(erroDaApi('Caso já fechado.'));
    render(<CuradoriaPanel />);
    const card = (await screen.findByText('Obra Fila 7')).closest('[data-testid="caso-card"]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /^Remover$/ }));
    expect(screen.getByText(/não é apagada/i)).toBeInTheDocument();
    const confirmar = screen.getByRole('button', { name: /Confirmar remoção/ });
    expect(confirmar).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Motivo/), { target: { value: 'Cópia confirmada.' } });
    fireEvent.click(confirmar);
    await waitFor(() => expect(api.curadoriaRemover).toHaveBeenCalledWith('c1', { motivo: 'Cópia confirmada.' }));
    expect(await screen.findByText('Caso já fechado.')).toBeInTheDocument();
  });

  it('aba Histórico chama getAdminCuradoria("fechado") e mostra decisão/motivo', async () => {
    render(<CuradoriaPanel />);
    await screen.findByText('Obra Fila 7');
    vi.mocked(api.getAdminCuradoria).mockResolvedValueOnce({ casos: [casoFechado()], total: 1, graves: 0 } as any);
    fireEvent.click(screen.getByRole('button', { name: /Histórico/ }));
    await waitFor(() => expect(api.getAdminCuradoria).toHaveBeenLastCalledWith('fechado'));
    expect(await screen.findByText(/Removida/)).toBeInTheDocument();
    expect(screen.getByText(/Cópia\./)).toBeInTheDocument();
  });

  it('Histórico NÃO mostra a linha de agregados vivos (o backend só a calcula na fila) nem botões de ação', async () => {
    render(<CuradoriaPanel />);
    await screen.findByText('Obra Fila 7');
    vi.mocked(api.getAdminCuradoria).mockResolvedValueOnce({ casos: [casoFechado()], total: 1, graves: 0 } as any);
    fireEvent.click(screen.getByRole('button', { name: /Histórico/ }));
    await waitFor(() => expect(api.getAdminCuradoria).toHaveBeenLastCalledWith('fechado'));
    await screen.findByText(/Removida/);
    expect(screen.queryByText(/sem consumo/)).not.toBeInTheDocument();
    expect(screen.queryByText(/IPs distintos/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Aprovar$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remover$/ })).not.toBeInTheDocument();
  });

  it('fila vazia mostra o estado vazio', async () => {
    vi.mocked(api.getAdminCuradoria).mockResolvedValue({ casos: [], total: 0, graves: 0 } as any);
    render(<CuradoriaPanel />);
    expect(await screen.findByText(/Nenhum caso aberto/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Corrida entre curadores (fix round do backend, commit 08639a7): as 4 ações
// respondem 409 quando o caso já foi fechado/reivindicado por outro curador, e
// `remover`/`reclassificar` podem ter devolvido a reivindicação depois de um
// erro na obra. A fila na tela está desatualizada nos dois casos: qualquer
// erro RECARREGA.
// ═══════════════════════════════════════════════════════════════════════════

describe('CuradoriaPanel — 409 e recarga da fila', () => {
  it('409 no Aprovar: erro no card e refetch da fila (+ badge do dashboard)', async () => {
    vi.mocked(api.curadoriaAprovar).mockRejectedValueOnce(erroDaApi('Caso já fechado.', 409));
    const onChange = vi.fn();
    render(<CuradoriaPanel onChange={onChange} />);
    const card = (await screen.findByText('Obra Fila 7')).closest('[data-testid="caso-card"]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /^Aprovar$/ }));
    await waitFor(() => expect(api.getAdminCuradoria).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Caso já fechado.')).toBeInTheDocument();
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it('409 com o modal aberto: fecha o modal (o caso não é mais acionável) e recarrega', async () => {
    vi.mocked(api.curadoriaRemover).mockRejectedValueOnce(erroDaApi('Caso já fechado.', 409));
    render(<CuradoriaPanel />);
    const card = (await screen.findByText('Obra Fila 7')).closest('[data-testid="caso-card"]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /^Remover$/ }));
    fireEvent.change(screen.getByPlaceholderText(/Motivo/), { target: { value: 'Cópia confirmada.' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar remoção/ }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Confirmar remoção/ })).not.toBeInTheDocument());
    expect(api.getAdminCuradoria).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Caso já fechado.')).toBeInTheDocument();
  });

  it('409 e o caso SAIU da fila no refetch: a mensagem sobrevive fora do card', async () => {
    vi.mocked(api.curadoriaAprovar).mockRejectedValueOnce(erroDaApi('Caso já fechado.', 409));
    vi.mocked(api.getAdminCuradoria)
      .mockResolvedValueOnce({ casos: [caso()], total: 1, graves: 0 } as any)   // load inicial
      .mockResolvedValueOnce({ casos: [], total: 0, graves: 0 } as any);        // refetch: o caso sumiu
    render(<CuradoriaPanel />);
    const card = (await screen.findByText('Obra Fila 7')).closest('[data-testid="caso-card"]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /^Aprovar$/ }));
    await waitFor(() => expect(screen.queryByText('Obra Fila 7')).not.toBeInTheDocument());
    expect(screen.getByText('Caso já fechado.')).toBeInTheDocument();
  });

  it('erro sem 409 (falha ao aplicar a decisão) também recarrega: remover/reclassificar podem ter devolvido a reivindicação', async () => {
    vi.mocked(api.curadoriaReclassificar).mockRejectedValueOnce(erroDaApi('Erro ao aplicar a decisão.', 500));
    render(<CuradoriaPanel />);
    const card = (await screen.findByText('Obra Fila 7')).closest('[data-testid="caso-card"]') as HTMLElement;
    fireEvent.change(within(card).getByLabelText(/Nova classificação/), { target: { value: 'kids' } });
    fireEvent.click(within(card).getByRole('button', { name: /Reclassificar/ }));
    await waitFor(() => expect(api.getAdminCuradoria).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Erro ao aplicar a decisão.')).toBeInTheDocument();
  });
});
