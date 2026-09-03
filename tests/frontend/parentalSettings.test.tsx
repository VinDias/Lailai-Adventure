/**
 * Testes — ParentalSettings (Fase 5 Bloco 2, Task 7): seção da Conta
 * "Classificação etária e Preferências de conteúdo" + PIN de proteção.
 * Spec: docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md
 * (rev.4, "UI do leitor (Conta)", "PIN", "Recuperação de PIN").
 *
 * Mocka services/api inteiro (mesma técnica de portalEstudio.test.tsx) —
 * sem bater rede real. Renderizado sem I18nProvider (contexto default = pt,
 * mesma convenção de portalEstudio.test.tsx/superReaderBadge.test.tsx).
 *
 * Canal do vocabulário: os 19 toggles vêm do GET /api/parental
 * (api.getParental mockado aqui) — NUNCA de um import direto de
 * utils/tagsVocabulario.json (essa é a regra pinada pela spec: chips do
 * admin/portal usam o import, toggles do leitor usam o GET). Os testes
 * abaixo pinam isso duas vezes: com um slug INVENTADO que não existe no
 * JSON real nem no i18n (só pode ter vindo do mock do GET) e com os 19
 * slugs reais digitados aqui à mão (não importados).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getParental: vi.fn(),
    updateParental: vi.fn(),
    setParentalPin: vi.fn(),
    recuperarPin: vi.fn(),
    confirmarRecuperacaoPin: vi.fn(),
  },
}));

import { api } from '../../services/api';
import ParentalSettings from '../../components/ParentalSettings';

const userLocal = { id: 'u1', email: 'a@b.com', nome: 'A', provider: 'local' };
const userGoogle = { id: 'u2', email: 'b@c.com', nome: 'B', provider: 'google' };

const REAL_19_TAGS = [
  { slug: 'romance', rotuloPt: 'Romance' },
  { slug: 'drama', rotuloPt: 'Drama' },
  { slug: 'comedia', rotuloPt: 'Comédia' },
  { slug: 'acao', rotuloPt: 'Ação' },
  { slug: 'aventura', rotuloPt: 'Aventura' },
  { slug: 'fantasia', rotuloPt: 'Fantasia' },
  { slug: 'dark-fantasy', rotuloPt: 'Dark Fantasy' },
  { slug: 'ficcao-cientifica', rotuloPt: 'Ficção Científica' },
  { slug: 'terror', rotuloPt: 'Terror' },
  { slug: 'thriller', rotuloPt: 'Thriller' },
  { slug: 'misterio', rotuloPt: 'Mistério' },
  { slug: 'crime', rotuloPt: 'Crime' },
  { slug: 'historico', rotuloPt: 'Histórico' },
  { slug: 'sobrenatural', rotuloPt: 'Sobrenatural' },
  { slug: 'super-herois', rotuloPt: 'Super-heróis' },
  { slug: 'slice-of-life', rotuloPt: 'Slice of Life' },
  { slug: 'high-school', rotuloPt: 'High School' },
  { slug: 'psicologico', rotuloPt: 'Psicológico' },
  { slug: 'lgbtqia+', rotuloPt: 'LGBTQIA+' },
];

function baseGetParental(overrides: Partial<{ classificacaoEtaria: 'kids' | 'teen' | 'young'; tagsBloqueadas: string[]; temPin: boolean; vocabulario: any[] }> = {}): {
  classificacaoEtaria: 'kids' | 'teen' | 'young';
  tagsBloqueadas: string[];
  temPin: boolean;
  vocabulario: { slug: string; rotuloPt: string }[];
} {
  return {
    classificacaoEtaria: 'young',
    tagsBloqueadas: [],
    temPin: false,
    vocabulario: REAL_19_TAGS,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

async function renderLoaded(getParentalReturn: any, user: any = userLocal) {
  vi.mocked(api.getParental).mockResolvedValue(getParentalReturn);
  render(<ParentalSettings user={user} />);
  await waitFor(() => expect(api.getParental).toHaveBeenCalled());
  await screen.findByText('Classificação etária e Preferências de conteúdo');
}

// ═══════════════════════════════════════════════════════════════════════════
// Guest / visibilidade
// ═══════════════════════════════════════════════════════════════════════════

describe('ParentalSettings — visibilidade', () => {
  it('sem usuário (guest): não renderiza nada e não bate na API', () => {
    const { container } = render(<ParentalSettings user={null} />);
    expect(container.firstChild).toBeNull();
    expect(api.getParental).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Nomenclatura exata
// ═══════════════════════════════════════════════════════════════════════════

describe('ParentalSettings — nomenclatura', () => {
  it('título da seção e das duas subseções usam as palavras EXATAS da spec; nunca "controle de classificação"', async () => {
    await renderLoaded(baseGetParental());
    expect(screen.getByText('Classificação etária e Preferências de conteúdo')).toBeInTheDocument();
    expect(screen.getByText('Classificação etária')).toBeInTheDocument();
    expect(screen.getByText('Preferências de conteúdo')).toBeInTheDocument();
    expect(screen.queryByText(/controle de classifica[cç][aã]o/i)).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Classificação etária
// ═══════════════════════════════════════════════════════════════════════════

describe('ParentalSettings — classificação etária', () => {
  it('renderiza as 3 opções Kids/Teen/Young com a opção salva marcada', async () => {
    await renderLoaded(baseGetParental({ classificacaoEtaria: 'teen' }));
    expect(screen.getByRole('radio', { name: /Kids/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Teen/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Young/ })).not.toBeChecked();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Preferências de conteúdo — toggles vindos do GET (não do import)
// ═══════════════════════════════════════════════════════════════════════════

describe('ParentalSettings — toggles (canal = GET, não import)', () => {
  it('um slug INVENTADO (fora do JSON real e do i18n) ainda renderiza, com fallback pro rotuloPt do GET — prova que a lista não é hardcoded', async () => {
    await renderLoaded(baseGetParental({ vocabulario: [{ slug: 'inventado-teste-xyz', rotuloPt: 'Inventado Teste' }] }));
    expect(screen.getByRole('switch', { name: 'Ocultar Inventado Teste' })).toBeInTheDocument();
  });

  it('os 19 slugs reais (digitados aqui, não importados) renderizam 19 toggles com o rótulo traduzido', async () => {
    await renderLoaded(baseGetParental());
    expect(screen.getAllByRole('switch')).toHaveLength(19);
    expect(screen.getByRole('switch', { name: 'Ocultar Romance' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Ocultar Dark Fantasy' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Ocultar LGBTQIA+' })).toBeInTheDocument();
  });

  it('tag já bloqueada (do GET) chega marcada; clicar desliga', async () => {
    await renderLoaded(baseGetParental({ tagsBloqueadas: ['terror'] }));
    const toggle = screen.getByRole('switch', { name: 'Ocultar Terror' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Salvar — sem PIN
// ═══════════════════════════════════════════════════════════════════════════

describe('ParentalSettings — salvar sem PIN', () => {
  it('sem temPin: PUT vai SEM a chave pin', async () => {
    vi.mocked(api.updateParental).mockResolvedValue({ classificacaoEtaria: 'young', tagsBloqueadas: ['romance'], temPin: false });
    await renderLoaded(baseGetParental({ temPin: false }));

    fireEvent.click(screen.getByRole('switch', { name: 'Ocultar Romance' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar preferências' }));

    await waitFor(() => expect(api.updateParental).toHaveBeenCalledWith({ classificacaoEtaria: 'young', tagsBloqueadas: ['romance'] }));
    const payload = vi.mocked(api.updateParental).mock.calls[0][0];
    expect(payload).not.toHaveProperty('pin');
    await screen.findByText('Preferências salvas.');
  });

  it('botão Salvar fica desabilitado sem alterações (não-dirty)', async () => {
    await renderLoaded(baseGetParental({ temPin: false }));
    expect(screen.getByRole('button', { name: 'Salvar preferências' })).toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Salvar — com PIN
// ═══════════════════════════════════════════════════════════════════════════

describe('ParentalSettings — salvar com PIN', () => {
  it('com temPin: pede o PIN antes de salvar e envia como STRING', async () => {
    vi.mocked(api.updateParental).mockResolvedValue({ classificacaoEtaria: 'kids', tagsBloqueadas: [], temPin: true });
    await renderLoaded(baseGetParental({ temPin: true, classificacaoEtaria: 'young' }));

    fireEvent.click(screen.getByRole('radio', { name: /Kids/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar preferências' }));

    const pinInput = await screen.findByTestId('pin-gate-input');
    fireEvent.change(pinInput, { target: { value: '001234' } });
    fireEvent.click(screen.getByTestId('pin-gate-confirm'));

    await waitFor(() => expect(api.updateParental).toHaveBeenCalledWith({ classificacaoEtaria: 'kids', tagsBloqueadas: [], pin: '001234' }));
    const payload = vi.mocked(api.updateParental).mock.calls[0][0];
    expect(typeof payload.pin).toBe('string');
  });

  it('401 com tentativasRestantes > 0 — mostra a contagem', async () => {
    const err: any = new Error('PIN incorreto.');
    err.status = 401;
    err.tentativasRestantes = 2;
    vi.mocked(api.updateParental).mockRejectedValueOnce(err);
    await renderLoaded(baseGetParental({ temPin: true }));

    fireEvent.click(screen.getByRole('radio', { name: /Teen/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar preferências' }));
    fireEvent.change(await screen.findByTestId('pin-gate-input'), { target: { value: '0000' } });
    fireEvent.click(screen.getByTestId('pin-gate-confirm'));

    await screen.findByText(/PIN incorreto — 2 tentativa\(s\) restante\(s\)/);
  });

  it('401 com tentativasRestantes = 0 — avisa que a PRÓXIMA tentativa bloqueia (não é o próprio bloqueio ainda)', async () => {
    const err: any = new Error('PIN incorreto.');
    err.status = 401;
    err.tentativasRestantes = 0;
    vi.mocked(api.updateParental).mockRejectedValueOnce(err);
    await renderLoaded(baseGetParental({ temPin: true }));

    fireEvent.click(screen.getByRole('radio', { name: /Teen/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar preferências' }));
    fireEvent.change(await screen.findByTestId('pin-gate-input'), { target: { value: '0000' } });
    fireEvent.click(screen.getByTestId('pin-gate-confirm'));

    await screen.findByText(/próxima tentativa errada bloqueia temporariamente/i);
  });

  it('429 (bloqueado) — mostra o tempo restante e desabilita o formulário', async () => {
    const err: any = new Error('PIN bloqueado por excesso de tentativas. Tente novamente em 15 minuto(s).');
    err.status = 429;
    vi.mocked(api.updateParental).mockRejectedValueOnce(err);
    await renderLoaded(baseGetParental({ temPin: true }));

    fireEvent.click(screen.getByRole('radio', { name: /Teen/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar preferências' }));
    fireEvent.change(await screen.findByTestId('pin-gate-input'), { target: { value: '0000' } });
    fireEvent.click(screen.getByTestId('pin-gate-confirm'));

    await screen.findByText(/15 minuto/);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar preferências' })).toBeDisabled());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PIN de proteção — aviso sem PIN
// ═══════════════════════════════════════════════════════════════════════════

describe('ParentalSettings — aviso sem PIN', () => {
  it('sem PIN: mostra aviso recomendando criar + botão Criar PIN; sem os botões de Trocar/Remover/Esqueci', async () => {
    await renderLoaded(baseGetParental({ temPin: false }));
    expect(screen.getByText(/Sem PIN, qualquer pessoa com acesso/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar PIN' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trocar PIN' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover PIN' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Esqueci meu PIN' })).not.toBeInTheDocument();
  });

  it('com PIN: some o aviso e o botão Criar; aparecem Trocar/Remover/Esqueci', async () => {
    await renderLoaded(baseGetParental({ temPin: true }));
    expect(screen.queryByText(/Sem PIN, qualquer pessoa com acesso/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Criar PIN' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trocar PIN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover PIN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Esqueci meu PIN' })).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Criar / trocar / remover PIN — payloads
// ═══════════════════════════════════════════════════════════════════════════

describe('ParentalSettings — gestão do PIN (payloads)', () => {
  it('criar PIN: body só com novoPin (sem PIN prévio)', async () => {
    vi.mocked(api.setParentalPin).mockResolvedValue({ temPin: true });
    await renderLoaded(baseGetParental({ temPin: false }));

    fireEvent.click(screen.getByRole('button', { name: 'Criar PIN' }));
    fireEvent.change(await screen.findByTestId('pin-modal-novo'), { target: { value: '1234' } });
    fireEvent.change(screen.getByTestId('pin-modal-confirm'), { target: { value: '1234' } });
    fireEvent.click(screen.getByTestId('pin-modal-submit'));

    await waitFor(() => expect(api.setParentalPin).toHaveBeenCalledWith({ novoPin: '1234' }));
  });

  it('criar PIN: PINs diferentes não chegam a chamar a API', async () => {
    await renderLoaded(baseGetParental({ temPin: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar PIN' }));
    fireEvent.change(await screen.findByTestId('pin-modal-novo'), { target: { value: '1234' } });
    fireEvent.change(screen.getByTestId('pin-modal-confirm'), { target: { value: '9999' } });
    fireEvent.click(screen.getByTestId('pin-modal-submit'));

    await screen.findByText('Os PINs digitados não coincidem.');
    expect(api.setParentalPin).not.toHaveBeenCalled();
  });

  it('trocar PIN: body com pinAtual + novoPin', async () => {
    vi.mocked(api.setParentalPin).mockResolvedValue({ temPin: true });
    await renderLoaded(baseGetParental({ temPin: true }));

    fireEvent.click(screen.getByRole('button', { name: 'Trocar PIN' }));
    fireEvent.change(await screen.findByTestId('pin-modal-atual'), { target: { value: '1111' } });
    fireEvent.change(screen.getByTestId('pin-modal-novo'), { target: { value: '2222' } });
    fireEvent.change(screen.getByTestId('pin-modal-confirm'), { target: { value: '2222' } });
    fireEvent.click(screen.getByTestId('pin-modal-submit'));

    await waitFor(() => expect(api.setParentalPin).toHaveBeenCalledWith({ pinAtual: '1111', novoPin: '2222' }));
  });

  it('remover PIN: body com pinAtual + remover:true', async () => {
    vi.mocked(api.setParentalPin).mockResolvedValue({ temPin: false });
    await renderLoaded(baseGetParental({ temPin: true }));

    fireEvent.click(screen.getByRole('button', { name: 'Remover PIN' }));
    fireEvent.change(await screen.findByTestId('pin-remove-atual'), { target: { value: '1111' } });
    fireEvent.click(screen.getByTestId('pin-remove-submit'));

    await waitFor(() => expect(api.setParentalPin).toHaveBeenCalledWith({ pinAtual: '1111', remover: true }));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Recuperação de PIN — local pede senha, social não
// ═══════════════════════════════════════════════════════════════════════════

describe('ParentalSettings — recuperação de PIN', () => {
  it('conta local: pede senha antes de enviar', async () => {
    vi.mocked(api.recuperarPin).mockResolvedValue({ message: 'Enviamos um link.' });
    await renderLoaded(baseGetParental({ temPin: true }), userLocal);

    fireEvent.click(screen.getByRole('button', { name: 'Esqueci meu PIN' }));
    expect(await screen.findByTestId('pin-recover-password')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('pin-recover-password'), { target: { value: 'minhaSenha123' } });
    fireEvent.click(screen.getByTestId('pin-recover-submit'));

    await waitFor(() => expect(api.recuperarPin).toHaveBeenCalledWith('minhaSenha123'));
    await screen.findByText(/Enviamos um link de recuperação do PIN/);
  });

  it('conta social (google): NÃO pede senha', async () => {
    vi.mocked(api.recuperarPin).mockResolvedValue({ message: 'Enviamos um link.' });
    await renderLoaded(baseGetParental({ temPin: true }), userGoogle);

    fireEvent.click(screen.getByRole('button', { name: 'Esqueci meu PIN' }));
    await waitFor(() => expect(screen.getByTestId('pin-recover-submit')).toBeInTheDocument());
    expect(screen.queryByTestId('pin-recover-password')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pin-recover-submit'));
    await waitFor(() => expect(api.recuperarPin).toHaveBeenCalledWith(undefined));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tela de confirmação (?token=) — molde do reset de senha
// ═══════════════════════════════════════════════════════════════════════════

describe('ParentalSettings — confirmação da recuperação (token)', () => {
  it('com recoveryToken: mostra a tela de confirmação e chama confirmarRecuperacaoPin ao confirmar', async () => {
    vi.mocked(api.confirmarRecuperacaoPin).mockResolvedValue({ message: 'PIN removido.' });
    vi.mocked(api.getParental).mockResolvedValue(baseGetParental({ temPin: true }));
    const onConsumed = vi.fn();

    render(<ParentalSettings user={userLocal} recoveryToken="tok-abc" onRecoveryTokenConsumed={onConsumed} />);
    await screen.findByText('Confirmar recuperação do PIN');

    fireEvent.click(screen.getByTestId('pin-recovery-confirm-submit'));

    await waitFor(() => expect(api.confirmarRecuperacaoPin).toHaveBeenCalledWith('tok-abc'));
    await screen.findByText(/PIN removido\. Defina um novo PIN/);
  });

  it('sem recoveryToken: a tela de confirmação não aparece', async () => {
    await renderLoaded(baseGetParental({ temPin: true }));
    expect(screen.queryByText('Confirmar recuperação do PIN')).not.toBeInTheDocument();
  });
});
