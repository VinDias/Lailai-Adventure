/**
 * Frente A, item 3: o limite de painéis por episódio (184, contado depois do
 * corte) fica nas Configurações do admin, para o Vin mudar sem mexer no
 * código. O servidor lê a chave `limite_paineis_episodio`
 * (tests/backend/envioEpisodio.test.js cobre a recusa mudando com ela).
 */
import React from 'react';
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getAdminContent: vi.fn(),
    getAdminStats: vi.fn(),
    listChannels: vi.fn(),
    getAdminAprovacoes: vi.fn(),
    getAdminCuradoria: vi.fn(),
    getAdminSettings: vi.fn(),
    updateSetting: vi.fn(),
  },
}));

import { api } from '../../services/api';
import AdminDashboard from '../../components/Admin/AdminDashboard';
import { ViewMode } from '../../types';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAdminContent).mockResolvedValue({ series: [] } as any);
  vi.mocked(api.getAdminStats).mockResolvedValue({} as any);
  vi.mocked(api.listChannels).mockResolvedValue([] as any);
  vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [] } as any);
  vi.mocked(api.getAdminCuradoria).mockResolvedValue({ casos: [], total: 0, graves: 0 } as any);
  vi.mocked(api.getAdminSettings).mockResolvedValue([{ key: 'limite_paineis_episodio', value: '184' }] as any);
  vi.mocked(api.updateSetting).mockResolvedValue({} as any);
});

it('mostra o limite gravado e salva o valor novo na chave que o servidor lê', async () => {
  render(<AdminDashboard onLogout={() => {}} currentSubView={ViewMode.ADMIN_SETTINGS} setSubView={() => {}} />);
  const campo = await screen.findByLabelText(/Limite de painéis por episódio/);
  await waitFor(() => expect(campo).toHaveValue(184));

  fireEvent.change(campo, { target: { value: '200' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

  await waitFor(() => expect(api.updateSetting).toHaveBeenCalledWith('limite_paineis_episodio', '200', 'Limite de painéis por episódio'));
});
