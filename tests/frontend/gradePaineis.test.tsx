/**
 * Frente A, item 6: grade de painéis (components/EnvioEpisodio/GradePaineis.tsx),
 * o componente ÚNICO do Meu Estúdio e do Gerenciar Conteúdo.
 *
 * O QUE ESTES TESTES GARANTEM:
 * - cada ação da grade chama a rota certa com o _id do painel certo (apagar
 *   um, apagar vários num pedido só, trocar a imagem, trocar e remover o
 *   balão de um idioma) e a tela reflete o resultado no painel certo;
 * - duas trocas que terminam juntas não apagam uma o resultado da outra;
 * - erro do servidor aparece em texto e o painel fica como estava;
 * - cancelar a confirmação não chama nada;
 * - painel antigo sem _id: a grade busca os _id antes de agir;
 * - a MESMA grade abre no Meu Estúdio (botão "Editar painéis", só em capítulo
 *   que o autor pode editar) e no Gerenciar Conteúdo (com o link colado, que
 *   só o admin tem).
 *
 * O QUE NÃO GARANTEM: nada do servidor (guarda de dono, gravação atômica,
 * Bunny): isso é tests/backend/edicaoPaineis.test.js.
 */
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getPaineisEdicao: vi.fn(),
    apagarPaineisEdicao: vi.fn(),
    trocarImagemPainel: vi.fn(),
    trocarBalaoPainel: vi.fn(),
    removerBalaoPainel: vi.fn(),
    updatePanelTranslation: vi.fn(),
    // Meu Estúdio
    getMeuEstudio: vi.fn(),
    getPortalResumo: vi.fn(),
    getPortalSeries: vi.fn(),
    getPortalMensagens: vi.fn(),
    getEpisodesBySeries: vi.fn(),
    // Gerenciar Conteúdo
    getAdminContent: vi.fn(),
    listChannels: vi.fn(),
    getEpisode: vi.fn(),
    getAdminAprovacoes: vi.fn().mockResolvedValue({ itens: [], naoClassificadas: 0 }),
  },
}));

import { api } from '../../services/api';
import GradePaineis, { Painel } from '../../components/EnvioEpisodio/GradePaineis';
import PortalEstudio from '../../components/PortalEstudio';
import AdminDashboard from '../../components/Admin/AdminDashboard';
import { ViewMode } from '../../types';

const painel = (n: number, idiomas: string[] = []): Painel => ({
  _id: `id${n}`,
  image_url: `https://cdn/p${n}.jpg`,
  order: n - 1,
  translationLayers: idiomas.map(language => ({ language, imageUrl: `https://cdn/p${n}-${language}.png` })),
});
const quatro = () => [painel(1, ['pt', 'en']), painel(2, ['en']), painel(3), painel(4, ['pt', 'en', 'es', 'zh'])];

/** A grade com o estado do pai, como as duas telas a usam. */
let paineisNaTela: Painel[] = [];
const Hospedeiro: React.FC<{ inicio: Painel[]; permitirUrl?: boolean; somenteLeitura?: boolean }> = ({ inicio, permitirUrl, somenteLeitura }) => {
  const [panels, setPanels] = useState(inicio);
  paineisNaTela = panels;
  return <GradePaineis episodeId="ep1" panels={panels} onMudar={f => setPanels(prev => f(prev))} permitirUrl={permitirUrl} somenteLeitura={somenteLeitura} />;
};

const arquivo = (nome: string, tipo = 'image/png') => new File(['x'], nome, { type: tipo });
const imagens = () => screen.getAllByTestId('grade-painel').map(c => within(c).getByRole('img').getAttribute('src'));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('GradePaineis — apagar', () => {
  it('apagar UM painel: pede a confirmação, manda o _id dele e ele some da tela', async () => {
    vi.mocked(api.apagarPaineisEdicao).mockResolvedValue({ removidos: ['id2'], totalPaineis: 3, apagadosDoBunny: 2, naoApagados: [] });
    render(<Hospedeiro inicio={quatro()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apagar painel #2' }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.apagarPaineisEdicao).toHaveBeenCalledWith('ep1', ['id2']));
    await waitFor(() => expect(imagens()).toEqual(['https://cdn/p1.jpg', 'https://cdn/p3.jpg', 'https://cdn/p4.jpg']));
  });

  it('apagar VÁRIOS: um pedido só, com os _id dos marcados', async () => {
    vi.mocked(api.apagarPaineisEdicao).mockResolvedValue({ removidos: ['id1', 'id3', 'id4'], totalPaineis: 1, apagadosDoBunny: 9, naoApagados: [] });
    render(<Hospedeiro inicio={quatro()} />);
    for (const n of [1, 3, 4]) fireEvent.click(screen.getByRole('button', { name: `Selecionar painel #${n}` }));
    expect(screen.getByText('3 selecionado(s)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Excluir 3/ }));
    await waitFor(() => expect(api.apagarPaineisEdicao).toHaveBeenCalledTimes(1));
    expect(api.apagarPaineisEdicao).toHaveBeenCalledWith('ep1', ['id1', 'id3', 'id4']);
    await waitFor(() => expect(imagens()).toEqual(['https://cdn/p2.jpg']));
    expect(screen.queryByText(/selecionado/)).not.toBeInTheDocument();
  });

  it('"Selecionar todos" marca todos e vira "Desselecionar todos"', () => {
    render(<Hospedeiro inicio={quatro()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar todos' }));
    expect(screen.getByText('4 selecionado(s)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desselecionar todos' }));
    expect(screen.queryByText(/selecionado/)).not.toBeInTheDocument();
  });

  it('cancelar a confirmação não chama o servidor', () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<Hospedeiro inicio={quatro()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apagar painel #1' }));
    expect(api.apagarPaineisEdicao).not.toHaveBeenCalled();
    expect(imagens()).toHaveLength(4);
  });

  it('o servidor recusa: o motivo aparece em texto e nenhum painel some', async () => {
    vi.mocked(api.apagarPaineisEdicao).mockRejectedValue(new Error('Episódio em análise não pode receber painéis. Aguarde a aprovação ou a devolução.'));
    render(<Hospedeiro inicio={quatro()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apagar painel #1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Episódio em análise');
    expect(imagens()).toHaveLength(4);
  });
});

describe('GradePaineis — trocar a imagem de um painel', () => {
  it('manda o arquivo para o _id do painel e a imagem nova aparece NO LUGAR, com os balões', async () => {
    vi.mocked(api.trocarImagemPainel).mockImplementation(async (_ep: string, id: string) => ({ panel: { ...painel(2, ['en']), _id: id, image_url: 'https://cdn/nova.jpg' } }));
    render(<Hospedeiro inicio={quatro()} />);
    const f = arquivo('pagina nova.jpg', 'image/jpeg');
    fireEvent.change(screen.getByLabelText('Trocar imagem do painel #2'), { target: { files: [f] } });
    await waitFor(() => expect(api.trocarImagemPainel).toHaveBeenCalledWith('ep1', 'id2', f));
    await waitFor(() => expect(imagens()).toEqual(['https://cdn/p1.jpg', 'https://cdn/nova.jpg', 'https://cdn/p3.jpg', 'https://cdn/p4.jpg']));
    expect(paineisNaTela[1].translationLayers).toEqual([{ language: 'en', imageUrl: 'https://cdn/p2-en.png' }]);
  });

  it('duas trocas que terminam juntas: as duas ficam na tela', async () => {
    const soltar: Array<() => void> = [];
    vi.mocked(api.trocarImagemPainel).mockImplementation((_ep: string, id: string) => new Promise(resolve => {
      soltar.push(() => resolve({ panel: { _id: id, image_url: `https://cdn/nova-${id}.jpg`, translationLayers: [] } }));
    }));
    render(<Hospedeiro inicio={quatro()} />);
    fireEvent.change(screen.getByLabelText('Trocar imagem do painel #1'), { target: { files: [arquivo('a.jpg', 'image/jpeg')] } });
    fireEvent.change(screen.getByLabelText('Trocar imagem do painel #3'), { target: { files: [arquivo('c.jpg', 'image/jpeg')] } });
    await waitFor(() => expect(soltar).toHaveLength(2));
    soltar.forEach(s => s());
    await waitFor(() => expect(imagens()).toEqual(['https://cdn/nova-id1.jpg', 'https://cdn/p2.jpg', 'https://cdn/nova-id3.jpg', 'https://cdn/p4.jpg']));
  });

  it('imagem recusada (tamanho diferente do balão): aviso em texto e o painel fica', async () => {
    vi.mocked(api.trocarImagemPainel).mockRejectedValue(new Error('Este painel tem balões de 800x1280; a imagem nova tem 800x900.'));
    render(<Hospedeiro inicio={quatro()} />);
    fireEvent.change(screen.getByLabelText('Trocar imagem do painel #1'), { target: { files: [arquivo('a.jpg', 'image/jpeg')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('balões de 800x1280');
    expect(imagens()[0]).toBe('https://cdn/p1.jpg');
  });
});

describe('GradePaineis — balão de um idioma', () => {
  it('os selos mostram quais idiomas cada painel tem', () => {
    render(<Hospedeiro inicio={quatro()} />);
    const tem = (lang: string, n: number) => screen.getByRole('button', { name: `Balão ${lang} #${n}` }).getAttribute('aria-pressed');
    expect([tem('PT', 1), tem('EN', 1), tem('ES', 1), tem('ZH', 1)]).toEqual(['true', 'true', 'false', 'false']);
    expect([tem('PT', 3), tem('EN', 3), tem('ES', 3), tem('ZH', 3)]).toEqual(['false', 'false', 'false', 'false']);
    expect([tem('PT', 4), tem('EN', 4), tem('ES', 4), tem('ZH', 4)]).toEqual(['true', 'true', 'true', 'true']);
  });

  it('TROCAR o balão EN do painel 2: vai para o _id e o idioma certos, e o balão novo aparece', async () => {
    vi.mocked(api.trocarBalaoPainel).mockResolvedValue({ panel: { ...painel(2), translationLayers: [{ language: 'en', imageUrl: 'https://cdn/novo-en.png' }] } });
    render(<Hospedeiro inicio={quatro()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Balão EN #2' }));
    const dialogo = screen.getByRole('dialog', { name: 'Balão EN #2' });
    expect(within(dialogo).getByTestId('grade-balao-atual')).toHaveAttribute('src', 'https://cdn/p2-en.png');
    const f = arquivo('balao.png');
    fireEvent.change(within(dialogo).getByLabelText('Trocar balão (PNG)'), { target: { files: [f] } });
    await waitFor(() => expect(api.trocarBalaoPainel).toHaveBeenCalledWith('ep1', 'id2', 'en', f));
    await waitFor(() => expect(within(dialogo).getByTestId('grade-balao-atual')).toHaveAttribute('src', 'https://cdn/novo-en.png'));
    expect(paineisNaTela[0]).toEqual(quatro()[0]); // os outros painéis não mudam
  });

  it('painel SEM balão no idioma: avisa, oferece "Enviar balão" e não tem "Remover"', async () => {
    vi.mocked(api.trocarBalaoPainel).mockResolvedValue({ panel: { ...painel(3), translationLayers: [{ language: 'es', imageUrl: 'https://cdn/p3-es.png' }] } });
    render(<Hospedeiro inicio={quatro()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Balão ES #3' }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText('Este painel ainda não tem balão neste idioma.')).toBeInTheDocument();
    expect(within(dialogo).queryByRole('button', { name: /Remover balão/ })).not.toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText('Enviar balão (PNG)'), { target: { files: [arquivo('es.png')] } });
    await waitFor(() => expect(api.trocarBalaoPainel).toHaveBeenCalledWith('ep1', 'id3', 'es', expect.any(File)));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Balão ES #3' })).toHaveAttribute('aria-pressed', 'true'));
  });

  it('REMOVER o balão ZH do painel 4: confirma, manda _id e idioma, e o selo apaga', async () => {
    vi.mocked(api.removerBalaoPainel).mockResolvedValue({ panel: painel(4, ['pt', 'en', 'es']), removido: true });
    render(<Hospedeiro inicio={quatro()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Balão ZH #4' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Remover balão/ }));
    expect(window.confirm).toHaveBeenCalledWith('Remover o balão ZH do painel #4?');
    await waitFor(() => expect(api.removerBalaoPainel).toHaveBeenCalledWith('ep1', 'id4', 'zh'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Balão ZH #4' })).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.getByRole('button', { name: 'Balão ES #4' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('balão recusado (não é PNG do tamanho do painel): o motivo aparece dentro da janela', async () => {
    vi.mocked(api.trocarBalaoPainel).mockRejectedValue(new Error('O balão tem 800x900; o painel tem 800x1280. O balão tem de ter o tamanho do painel.'));
    render(<Hospedeiro inicio={quatro()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Balão EN #1' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.change(within(dialogo).getByLabelText('Trocar balão (PNG)'), { target: { files: [arquivo('x.png')] } });
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('tamanho do painel');
    expect(within(dialogo).getByTestId('grade-balao-atual')).toHaveAttribute('src', 'https://cdn/p1-en.png');
  });

  it('link colado só existe para o admin (permitirUrl) e grava pelo índice do painel', async () => {
    const { unmount } = render(<Hospedeiro inicio={quatro()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Balão ES #3' }));
    expect(screen.queryByLabelText('ou cole uma URL')).not.toBeInTheDocument();
    unmount();

    vi.mocked(api.updatePanelTranslation).mockResolvedValue({ success: true, panel: { ...painel(3), translationLayers: [{ language: 'es', imageUrl: 'https://outro/es.png' }] } });
    render(<Hospedeiro inicio={quatro()} permitirUrl />);
    fireEvent.click(screen.getByRole('button', { name: 'Balão ES #3' }));
    fireEvent.change(screen.getByLabelText('ou cole uma URL'), { target: { value: ' https://outro/es.png ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.updatePanelTranslation).toHaveBeenCalledWith('ep1', 2, 'es', 'https://outro/es.png'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Balão ES #3' })).toHaveAttribute('aria-pressed', 'true'));
  });
});

describe('GradePaineis — casos de borda', () => {
  it('painel antigo SEM _id: busca os _id no servidor antes de apagar, e apaga o da posição clicada', async () => {
    const semId = quatro().map(({ _id, ...resto }) => resto);
    vi.mocked(api.getPaineisEdicao).mockResolvedValue({ panels: quatro() } as any);
    vi.mocked(api.apagarPaineisEdicao).mockResolvedValue({ removidos: ['id3'], totalPaineis: 3, apagadosDoBunny: 1, naoApagados: [] });
    render(<Hospedeiro inicio={semId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apagar painel #3' }));
    await waitFor(() => expect(api.getPaineisEdicao).toHaveBeenCalledWith('ep1'));
    await waitFor(() => expect(api.apagarPaineisEdicao).toHaveBeenCalledWith('ep1', ['id3']));
    await waitFor(() => expect(imagens()).toEqual(['https://cdn/p1.jpg', 'https://cdn/p2.jpg', 'https://cdn/p4.jpg']));
  });

  it('somente leitura (capítulo em análise): mostra os painéis e os selos, sem nenhum botão de mudar', () => {
    render(<Hospedeiro inicio={quatro()} somenteLeitura />);
    expect(imagens()).toHaveLength(4);
    expect(screen.queryByRole('button', { name: /Apagar painel/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Selecionar/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Trocar imagem/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Balão EN #1' }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByTestId('grade-balao-atual')).toBeInTheDocument();
    expect(within(dialogo).queryByLabelText(/balão \(PNG\)/)).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole('button', { name: /Remover balão/ })).not.toBeInTheDocument();
  });

  // 27/11/2026, E2E em emulação de Pixel 7 (tests/e2e/roteiroFrenteA.cjs): o
  // selo de idioma tinha 18 px de altura e os botões 24 a 25 px, abaixo ou no
  // limite do alvo de toque. jsdom não mede tela: este pino confere as classes
  // que dão o tamanho no celular (sem prefixo `sm:`); a medida de verdade é do
  // roteiro E2E.
  it('no celular os botões da grade têm alvo de toque maior que no desktop', () => {
    render(<Hospedeiro inicio={quatro()} />);
    const classes = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/);
    const selo = classes(screen.getByRole('button', { name: 'Balão PT #1' }));
    expect(selo).toContain('py-2');
    expect(selo).toContain('sm:py-0.5');
    const apagar = classes(screen.getByRole('button', { name: 'Apagar painel #1' }));
    expect(apagar).toContain('p-2');
    expect(apagar).toContain('sm:p-1.5');
    const trocar = classes(screen.getByLabelText('Trocar imagem do painel #1').closest('label'));
    expect(trocar).toContain('p-2');
    const marcar = classes(screen.getByRole('button', { name: 'Selecionar painel #1' }));
    expect(marcar).toContain('w-7');
    expect(marcar).toContain('h-7');
  });

  it('sem painéis: diz que não há nenhum', () => {
    render(<Hospedeiro inicio={[]} />);
    expect(screen.getByText('Nenhum painel')).toBeInTheDocument();
  });
});

describe('a mesma grade nas duas telas', () => {
  const episodio = (extra: Record<string, any> = {}) => ({ _id: 'ep1', title: 'Cap 1', episode_number: 1, status: 'draft', submittedAt: null, panels: quatro(), ...extra });

  async function abrirObraNoMeuEstudio(eps: any[]) {
    vi.mocked(api.getMeuEstudio).mockResolvedValue({ canais: [{ channelId: 'c1', name: 'Canal Um', avatar: null, obras: 1, pendentes: 0, mensagensNaoLidas: 0 }] } as any);
    vi.mocked(api.getPortalResumo).mockResolvedValue({ period: '2026-11', status: 'aberto', canais: [], superReader: { porCanal: [] }, periodosFechadosDisponiveis: [] } as any);
    vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [{ _id: 's1', title: 'Obra Rascunho', description: '', cover_image: '', isPublished: false, submittedAt: null, content_rating_sugerida: null, channelId: 'c1' }] } as any);
    vi.mocked(api.getPortalMensagens).mockResolvedValue({ canalId: 'c1', mensagens: [] } as any);
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue(eps as any);
    render(<PortalEstudio onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('Obras'));
    fireEvent.click(await screen.findByText('Obra Rascunho'));
    await waitFor(() => expect(api.getEpisodesBySeries).toHaveBeenCalledWith('s1'));
  }

  it('Meu Estúdio: "Editar painéis" abre a grade do capítulo em rascunho e apagar reflete na tela', async () => {
    vi.mocked(api.apagarPaineisEdicao).mockResolvedValue({ removidos: ['id1'], totalPaineis: 3, apagadosDoBunny: 3, naoApagados: [] });
    await abrirObraNoMeuEstudio([episodio()]);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar painéis' }));
    expect(screen.getByTestId('grade-paineis')).toBeInTheDocument();
    expect(imagens()).toHaveLength(4);
    // O autor não tem o link colado.
    fireEvent.click(screen.getByRole('button', { name: 'Apagar painel #1' }));
    await waitFor(() => expect(api.apagarPaineisEdicao).toHaveBeenCalledWith('ep1', ['id1']));
    await waitFor(() => expect(imagens()).toEqual(['https://cdn/p2.jpg', 'https://cdn/p3.jpg', 'https://cdn/p4.jpg']));
  });

  it('Meu Estúdio: capítulo em análise e capítulo sem painel não têm "Editar painéis"', async () => {
    await abrirObraNoMeuEstudio([
      episodio({ _id: 'ep-analise', title: 'Em analise', submittedAt: '2026-11-20T10:00:00.000Z' }),
      episodio({ _id: 'ep-vazio', title: 'Vazio', panels: [] }),
    ]);
    await screen.findByText('Em analise');
    expect(screen.queryByRole('button', { name: 'Editar painéis' })).not.toBeInTheDocument();
  });

  it('Gerenciar Conteúdo: a tela de painéis do episódio usa a mesma grade, com o link colado', async () => {
    vi.mocked(api.getAdminContent).mockResolvedValue({ series: [{ _id: 's1', title: 'The Ha-Qa Stones', content_type: 'hiqua', isPublished: true, genre: 'Aventura', content_rating: 'teen', tags: [], episodes: [] }] } as any);
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue([{ _id: 'ep1', title: 'T1 EP2', episode_number: 2, status: 'published' }] as any);
    vi.mocked(api.listChannels).mockResolvedValue([] as any);
    vi.mocked(api.getEpisode).mockResolvedValue({ _id: 'ep1', panels: quatro() } as any);
    vi.mocked(api.trocarImagemPainel).mockResolvedValue({ panel: { ...painel(1, ['pt', 'en']), image_url: 'https://cdn/nova.jpg' } });

    render(<AdminDashboard onLogout={() => {}} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={() => {}} />);
    await screen.findByText('The Ha-Qa Stones');
    fireEvent.click(screen.getByTitle('Gerenciar episódios'));
    fireEvent.click(await screen.findByTitle('Gerenciar painéis'));
    await waitFor(() => expect(api.getEpisode).toHaveBeenCalledWith('ep1'));

    expect(await screen.findByTestId('grade-paineis')).toBeInTheDocument();
    // Trocar a imagem de um painel: o admin não tinha isso antes do item 6.
    fireEvent.change(screen.getByLabelText('Trocar imagem do painel #1'), { target: { files: [arquivo('a.jpg', 'image/jpeg')] } });
    await waitFor(() => expect(api.trocarImagemPainel).toHaveBeenCalledWith('ep1', 'id1', expect.any(File)));
    await waitFor(() => expect(imagens()[0]).toBe('https://cdn/nova.jpg'));
    fireEvent.click(screen.getByRole('button', { name: 'Balão ES #3' }));
    expect(screen.getByLabelText('ou cole uma URL')).toBeInTheDocument();
  });
});
