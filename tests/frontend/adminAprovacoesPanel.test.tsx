/**
 * Testes — AprovacoesPanel (Fase 5 Bloco 1, Task 10; Fase 5 Bloco 2, Task 6):
 * Fila de Aprovação no admin (PT fixo, sem i18n). Pina o shape FLAT de GET
 * /admin/aprovacoes (routes/adminPortal.js): `tipo: 'series'|'episode'`,
 * preview por item, `naoClassificadas` ao lado de `itens`.
 * Cobre: render dos cards (preview/classificação sugerida/canal/data),
 * Aprovar bloqueado sem gênero OU sem classificação etária (série), seletor
 * de classificação pré-preenchido com a sugerida (SEM default quando null),
 * envio de genre/tags/content_rating editados, episódio com série não
 * publicada (mensagem legível do 400), Devolver (texto obrigatório) e
 * refetch da fila + badges (pendentes e não classificadas) após qualquer ação.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getAdminAprovacoes: vi.fn(),
    aprovarSerieAdmin: vi.fn(),
    aprovarEpisodioAdmin: vi.fn(),
    devolverAprovacao: vi.fn(),
  },
}));

import { api } from '../../services/api';
import AprovacoesPanel from '../../components/Admin/AprovacoesPanel';

const itemSerie = {
  tipo: 'series', id: 's1', title: 'Obra Submetida', description: 'Uma obra nova',
  cover_image: 'https://cdn/capa.jpg', content_rating_sugerida: 'teen', genre: null, tags: [],
  canal: { id: 'c1', name: 'Canal do Vin' }, submittedAt: '2026-08-20T10:00:00.000Z',
};

const itemSerieComGenero = {
  ...itemSerie, id: 's2', title: 'Obra Com Genero Existente', genre: 'Comédia', tags: ['acao', 'aventura'],
};

const itemEpisodioSeriePublicada = {
  tipo: 'episode', id: 'e1', title: 'Cap Submetido', description: 'Descricao do cap',
  thumbnail: 'https://cdn/thumb.jpg', panelCount: 3,
  serie: { id: 's3', title: 'Serie Publicada', isPublished: true },
  canal: { id: 'c1', name: 'Canal do Vin' }, submittedAt: '2026-08-21T10:00:00.000Z',
};

const itemEpisodioSerieNaoPublicada = {
  ...itemEpisodioSeriePublicada, id: 'e2', title: 'Cap Aguardando Serie',
  serie: { id: 's4', title: 'Serie Nao Publicada', isPublished: false },
};

// Task 6: obra submetida ANTES do Bloco 2 — sem content_rating_sugerida
// (autor nunca viu o campo). O seletor precisa abrir SEM default.
const itemSerieSemSugerida = {
  ...itemSerie, id: 's5', title: 'Obra Sem Sugerida', genre: 'Aventura', content_rating_sugerida: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AprovacoesPanel — render', () => {
  it('carrega a fila ao montar e chama onCountChange com o total', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemSerie, itemEpisodioSeriePublicada] } as any);
    const onCountChange = vi.fn();
    render(<AprovacoesPanel onCountChange={onCountChange} />);

    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalled());
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(2));
    expect(await screen.findByText('Obra Submetida')).toBeInTheDocument();
    expect(screen.getByText('Cap Submetido')).toBeInTheDocument();
  });

  it('fila vazia — sem erro, mostra estado vazio', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [] } as any);
    render(<AprovacoesPanel />);
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalled());
    expect(await screen.findByText(/nenhum item|nada pendente|fila vazia/i)).toBeInTheDocument();
  });

  it('mostra classificação sugerida e nome do canal do item', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemSerie] } as any);
    render(<AprovacoesPanel />);
    await screen.findByText('Obra Submetida');
    // "Teen" aparece em MAIS de um lugar desde a Task 6 (badge do topo, dica
    // "Autor sugeriu" e o próprio <option> selecionado do seletor) —
    // getAllByText em vez de getByText evita o falso "múltiplos elementos".
    expect(screen.getAllByText(/teen/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Canal do Vin')).toBeInTheDocument();
  });
});

describe('AprovacoesPanel — Aprovar série', () => {
  it('sem gênero (nem preenchido, nem editado) — botão Aprovar desabilitado', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemSerie] } as any);
    render(<AprovacoesPanel />);
    await screen.findByText('Obra Submetida');

    const botaoAprovar = screen.getAllByRole('button', { name: /aprovar/i })[0];
    expect(botaoAprovar).toBeDisabled();
  });

  it('série já com gênero preenchido — Aprovar habilitado sem precisar editar', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemSerieComGenero] } as any);
    render(<AprovacoesPanel />);
    await screen.findByText('Obra Com Genero Existente');

    const botaoAprovar = screen.getAllByRole('button', { name: /aprovar/i })[0];
    expect(botaoAprovar).not.toBeDisabled();
  });

  it('preencher o gênero habilita Aprovar e envia genre/tags/content_rating (rating vem pré-preenchido da sugerida)', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemSerie] } as any);
    vi.mocked(api.aprovarSerieAdmin).mockResolvedValue({ _id: 's1', isPublished: true } as any);
    render(<AprovacoesPanel onCountChange={vi.fn()} />);
    await screen.findByText('Obra Submetida');

    const inputGenero = screen.getByPlaceholderText(/g[eê]nero/i);
    fireEvent.change(inputGenero, { target: { value: 'Aventura' } });

    // Chip de tag (seletor fechado do vocabulário — Task 6): liga "Ação".
    fireEvent.click(screen.getByRole('button', { name: 'Ação' }));

    const botaoAprovar = screen.getAllByRole('button', { name: /aprovar/i })[0];
    expect(botaoAprovar).not.toBeDisabled();
    fireEvent.click(botaoAprovar);

    // content_rating: 'teen' vem da sugerida do item (pré-preenchida, não editada).
    await waitFor(() => expect(api.aprovarSerieAdmin).toHaveBeenCalledWith('s1', { genre: 'Aventura', tags: ['acao'], content_rating: 'teen' }));
    // Refetch da fila após a ação.
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalledTimes(2));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fase 5 Bloco 2, Task 6: classificação etária obrigatória para aprovar
// ═══════════════════════════════════════════════════════════════════════════

describe('AprovacoesPanel — classificação etária (Task 6)', () => {
  it('sugerida presente ("teen") pré-preenche o seletor e mostra a dica "Autor sugeriu: Teen"', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemSerieComGenero] } as any);
    render(<AprovacoesPanel />);
    await screen.findByText('Obra Com Genero Existente');

    const seletor = screen.getByLabelText('Classificação etária') as HTMLSelectElement;
    expect(seletor.value).toBe('teen');
    expect(screen.getByText(/Autor sugeriu:\s*Teen/i)).toBeInTheDocument();
  });

  it('sugerida NULA — seletor abre SEM default ("— escolha —") mesmo com gênero preenchido; Aprovar fica desabilitado', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemSerieSemSugerida] } as any);
    render(<AprovacoesPanel />);
    await screen.findByText('Obra Sem Sugerida');

    const seletor = screen.getByLabelText('Classificação etária') as HTMLSelectElement;
    expect(seletor.value).toBe('');
    expect(screen.queryByText(/Autor sugeriu/i)).not.toBeInTheDocument();

    const botaoAprovar = screen.getAllByRole('button', { name: /aprovar/i })[0];
    expect(botaoAprovar).toBeDisabled();
  });

  it('escolher a classificação manualmente (sugerida nula) habilita Aprovar e envia o valor escolhido', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemSerieSemSugerida] } as any);
    vi.mocked(api.aprovarSerieAdmin).mockResolvedValue({ _id: 's5', isPublished: true } as any);
    render(<AprovacoesPanel onCountChange={vi.fn()} />);
    await screen.findByText('Obra Sem Sugerida');

    const seletor = screen.getByLabelText('Classificação etária') as HTMLSelectElement;
    fireEvent.change(seletor, { target: { value: 'kids' } });

    const botaoAprovar = screen.getAllByRole('button', { name: /aprovar/i })[0];
    expect(botaoAprovar).not.toBeDisabled();
    fireEvent.click(botaoAprovar);

    await waitFor(() => expect(api.aprovarSerieAdmin).toHaveBeenCalledWith('s5', { genre: 'Aventura', tags: [], content_rating: 'kids' }));
  });

  it('sem gênero, mesmo com classificação escolhida — Aprovar continua desabilitado (os dois são obrigatórios)', async () => {
    const semGeneroComSugerida = { ...itemSerieSemSugerida, genre: null };
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [semGeneroComSugerida] } as any);
    render(<AprovacoesPanel />);
    await screen.findByText('Obra Sem Sugerida');

    fireEvent.change(screen.getByLabelText('Classificação etária'), { target: { value: 'young' } });

    const botaoAprovar = screen.getAllByRole('button', { name: /aprovar/i })[0];
    expect(botaoAprovar).toBeDisabled();
  });

  it('badge de não classificadas: onNaoClassificadasChange é chamado no load inicial e após aprovar', async () => {
    vi.mocked(api.getAdminAprovacoes)
      .mockResolvedValueOnce({ itens: [itemSerieComGenero], naoClassificadas: 3 } as any)
      .mockResolvedValueOnce({ itens: [], naoClassificadas: 4 } as any);
    vi.mocked(api.aprovarSerieAdmin).mockResolvedValue({ _id: 's2', isPublished: true } as any);
    const onNaoClassificadasChange = vi.fn();
    render(<AprovacoesPanel onNaoClassificadasChange={onNaoClassificadasChange} />);
    await screen.findByText('Obra Com Genero Existente');
    await waitFor(() => expect(onNaoClassificadasChange).toHaveBeenCalledWith(3));

    fireEvent.click(screen.getAllByRole('button', { name: /aprovar/i })[0]);
    await waitFor(() => expect(onNaoClassificadasChange).toHaveBeenLastCalledWith(4));
  });
});

describe('AprovacoesPanel — Aprovar episódio', () => {
  it('série não publicada — Aprovar desabilitado e mensagem legível visível', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemEpisodioSerieNaoPublicada] } as any);
    render(<AprovacoesPanel />);
    await screen.findByText('Cap Aguardando Serie');

    const botaoAprovar = screen.getAllByRole('button', { name: /aprovar/i })[0];
    expect(botaoAprovar).toBeDisabled();
    expect(screen.getByText(/aprove a s[eé]rie primeiro/i)).toBeInTheDocument();
  });

  it('série publicada — Aprovar habilitado e chama aprovarEpisodioAdmin', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemEpisodioSeriePublicada] } as any);
    vi.mocked(api.aprovarEpisodioAdmin).mockResolvedValue({ _id: 'e1', status: 'published' } as any);
    render(<AprovacoesPanel onCountChange={vi.fn()} />);
    await screen.findByText('Cap Submetido');

    const botaoAprovar = screen.getAllByRole('button', { name: /aprovar/i })[0];
    expect(botaoAprovar).not.toBeDisabled();
    fireEvent.click(botaoAprovar);

    await waitFor(() => expect(api.aprovarEpisodioAdmin).toHaveBeenCalledWith('e1'));
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalledTimes(2));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fase 5 Bloco 3, Task 7: obra que a curadoria tirou do ar e o artista
// reenviou. GET /admin/aprovacoes anexa `removidaPelaCuradoria` por série
// (routes/adminPortal.js:262) para o Master não aprovar às cegas.
// ═══════════════════════════════════════════════════════════════════════════

describe('AprovacoesPanel — obra removida pela curadoria (Fase 5 Bloco 3)', () => {
  it('item com removidaPelaCuradoria mostra o aviso com data e motivo; sem ele, nada', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({
      itens: [
        { ...itemSerieComGenero, id: 's-rem', title: 'Reenviada 2', removidaPelaCuradoria: { decisaoEm: '2026-09-05T10:00:00.000Z', motivo: 'Cópia de terceiro.' } },
        { ...itemSerieComGenero, id: 's-ok', title: 'Limpa 1', removidaPelaCuradoria: null },
      ],
      naoClassificadas: 0,
    } as any);
    render(<AprovacoesPanel />);
    const aviso = await screen.findByText(/Removida pela curadoria em/);
    expect(aviso).toHaveTextContent('Cópia de terceiro.');
    expect(screen.getAllByText(/Removida pela curadoria/)).toHaveLength(1);
  });

  it('removidaPelaCuradoria sem motivo (motivoDecisao null) mostra só a data, sem travessão solto', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({
      itens: [{ ...itemSerieComGenero, id: 's-rem2', title: 'Reenviada Sem Motivo', removidaPelaCuradoria: { decisaoEm: '2026-09-05T10:00:00.000Z', motivo: null } }],
      naoClassificadas: 0,
    } as any);
    render(<AprovacoesPanel />);
    const aviso = await screen.findByText(/Removida pela curadoria em/);
    expect(aviso.textContent).not.toMatch(/—\s*$/);
  });
});

describe('AprovacoesPanel — Devolver', () => {
  it('exige texto: sem digitar nada, confirmar não chama a API', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemSerie] } as any);
    render(<AprovacoesPanel />);
    await screen.findByText('Obra Submetida');

    fireEvent.click(screen.getAllByRole('button', { name: /devolver/i })[0]);
    const botaoConfirmar = screen.getByRole('button', { name: /confirmar|enviar/i });
    expect(botaoConfirmar).toBeDisabled();
    expect(api.devolverAprovacao).not.toHaveBeenCalled();
  });

  it('com texto — chama devolverAprovacao(tipo, id, texto) e refetch da fila + badge', async () => {
    vi.mocked(api.getAdminAprovacoes)
      .mockResolvedValueOnce({ itens: [itemSerie] } as any) // load inicial
      .mockResolvedValueOnce({ itens: [] } as any); // refetch pós-devolução: item saiu da fila
    vi.mocked(api.devolverAprovacao).mockResolvedValue({ success: true, mensagem: {} } as any);
    const onCountChange = vi.fn();
    render(<AprovacoesPanel onCountChange={onCountChange} />);
    await screen.findByText('Obra Submetida');

    fireEvent.click(screen.getAllByRole('button', { name: /devolver/i })[0]);
    const textarea = screen.getByPlaceholderText(/motivo|mensagem|texto/i);
    fireEvent.change(textarea, { target: { value: 'Falta caprichar na capa.' } });

    const botaoConfirmar = screen.getByRole('button', { name: /confirmar|enviar/i });
    expect(botaoConfirmar).not.toBeDisabled();
    fireEvent.click(botaoConfirmar);

    await waitFor(() => expect(api.devolverAprovacao).toHaveBeenCalledWith('series', 's1', 'Falta caprichar na capa.'));
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onCountChange).toHaveBeenLastCalledWith(0));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Frente A, item 8 — o moderador lê o episódio da fila no WebtoonReader (o
// leitor de verdade, sem mock), com os 4 idiomas. Garante: o botão existe só
// em item de episódio, o leitor abre pela rota de admin (getLeituraAprovacao,
// nunca a pública), mostra os 4 idiomas com a contagem de balões, trocar de
// idioma troca o balão do painel, e a prévia não pede anúncio, voto nem
// progresso (a api mockada só tem as 5 funções acima e a de leitura: qualquer
// outra chamada quebraria o teste). Não garante a guarda da rota (backend).
// ═══════════════════════════════════════════════════════════════════════════

describe('AprovacoesPanel — ler o episódio na fila (item 8)', () => {
  const leitura = {
    _id: 'e1', title: 'Cap Submetido', status: 'draft',
    panels: [
      { _id: 'p1', image_url: 'https://cdn/p1.jpg', order: 0, translationLayers: [
        { language: 'pt', imageUrl: 'https://cdn/p1-pt.png' },
        { language: 'en', imageUrl: 'https://cdn/p1-en.png' },
        { language: 'es', imageUrl: 'https://cdn/p1-es.png' },
        { language: 'zh', imageUrl: 'https://cdn/p1-zh.png' },
      ] },
      { _id: 'p2', image_url: 'https://cdn/p2.jpg', order: 1, translationLayers: [
        { language: 'en', imageUrl: 'https://cdn/p2-en.png' },
      ] },
    ],
  };
  const baloes = () => Array.from(document.querySelectorAll('[data-testid="painel-leitor"] img[aria-hidden="true"]'))
    .map(img => img.getAttribute('src'));

  beforeEach(() => {
    (api as any).getLeituraAprovacao = vi.fn().mockResolvedValue(leitura);
  });

  it('item de série não tem "Ler episódio"; item de episódio tem', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemSerie] } as any);
    const { unmount } = render(<AprovacoesPanel />);
    await screen.findByText('Obra Submetida');
    expect(screen.queryByRole('button', { name: /Ler episódio/ })).not.toBeInTheDocument();
    unmount();

    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemEpisodioSeriePublicada] } as any);
    render(<AprovacoesPanel />);
    expect(await screen.findByRole('button', { name: /Ler episódio/ })).toBeInTheDocument();
  });

  it('abre o leitor com os 4 idiomas e troca o balão ao trocar de idioma', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemEpisodioSeriePublicada] } as any);
    render(<AprovacoesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Ler episódio/ }));

    await waitFor(() => expect((api as any).getLeituraAprovacao).toHaveBeenCalledWith('e1'));
    // Os dois painéis, na ordem, sem anúncio na frente.
    expect(await screen.findByAltText('Página 1')).toHaveAttribute('src', 'https://cdn/p1.jpg');
    expect(screen.getByAltText('Página 2')).toHaveAttribute('src', 'https://cdn/p2.jpg');
    expect(screen.getByText(/PRÉVIA DA FILA/)).toBeInTheDocument();

    // 4 idiomas, cada um com quantos painéis têm balão.
    for (const rotulo of ['Port 1/2', 'Eng 2/2', 'Esp 1/2', 'Zhon 1/2']) {
      expect(screen.getByRole('button', { name: rotulo })).toBeInTheDocument();
    }

    // Português (idioma inicial): balão só no painel 1.
    expect(baloes()).toEqual(['https://cdn/p1-pt.png']);
    fireEvent.click(screen.getByRole('button', { name: 'Eng 2/2' }));
    expect(baloes()).toEqual(['https://cdn/p1-en.png', 'https://cdn/p2-en.png']);
    fireEvent.click(screen.getByRole('button', { name: 'Esp 1/2' }));
    expect(baloes()).toEqual(['https://cdn/p1-es.png']);
    fireEvent.click(screen.getByRole('button', { name: 'Zhon 1/2' }));
    expect(baloes()).toEqual(['https://cdn/p1-zh.png']);
    // Trocar o balão na prévia não muda o idioma guardado do aparelho.
    expect(localStorage.getItem('lorflux_language')).toBeNull();
  });

  it('fechar o leitor volta para a fila, com Aprovar e Devolver no lugar', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemEpisodioSeriePublicada] } as any);
    render(<AprovacoesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Ler episódio/ }));
    await screen.findByAltText('Página 1');
    fireEvent.click(screen.getByRole('button', { name: 'CONCLUIR' }));
    await waitFor(() => expect(screen.queryByAltText('Página 1')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Aprovar/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Devolver/ })).toBeInTheDocument();
  });
});
