import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useT } from '../contexts/I18nContext';
import type { TFunction } from '../contexts/I18nContext';
import { useCamadaVoltar } from '../utils/pilhaVoltar';

/**
 * Fase 5, Bloco 2 (Task 7) — "Classificação etária e Preferências de
 * conteúdo" + PIN de proteção. Seção da Conta, molde components/PrivacyCenter.tsx
 * (estado local + chamadas api + confirmação por senha). Spec:
 * docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md
 * (rev.4, "UI do leitor (Conta)", "PIN", "Recuperação de PIN").
 *
 * Nomenclatura EXATA da spec — NUNCA "controle de classificação"/"controle
 * parental" em texto visível.
 *
 * Canal do vocabulário (pinado pela spec): os 19 toggles usam a lista vinda
 * do GET /api/parental (`vocabulario`) — nunca um import direto de
 * utils/tagsVocabulario.json (esse import é o canal dos CHIPS do
 * admin/portal, um componente diferente). O rótulo de cada tag tenta
 * `tags.<slug>` no i18n primeiro; se a chave não existir (vocabulário novo
 * no servidor antes do i18n acompanhar), cai pro `rotuloPt` que o próprio
 * GET devolve — o `t()` deste app devolve a CHAVE crua quando não encontra
 * tradução (contexts/I18nContext.tsx), o que serve de sinal de "não achei".
 *
 * Salvar por LOTE (decisão): etária + toggles vivem num rascunho local
 * (`draft*`) só sincronizado ao servidor no clique de "Salvar preferências"
 * — não a cada toggle. Com PIN definido, o PIN é pedido UMA vez por lote
 * (modal `showPinGate`), não uma vez por campo alterado.
 */

interface ParentalSettingsProps {
  user: any;
  // Fluxo de recuperação de PIN (link por e-mail, ?token= no padrão do
  // reset de senha — ver Auth.tsx). App.tsx detecta a URL /recuperar-pin e
  // repassa o token aqui só quando já existe usuário logado (a rota de
  // confirmação exige sessão — nunca pública como a de senha).
  recoveryToken?: string | null;
  onRecoveryTokenConsumed?: () => void;
}

type Classificacao = 'kids' | 'teen' | 'young';

function mesmoConjunto(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}

/**
 * Compõe a mensagem de erro de uma tentativa de PIN (401 com
 * `tentativasRestantes`, ou fallback pra mensagem do servidor). Reusada
 * pelos 3 pontos que pedem PIN (salvar em lote, trocar, remover) — mesma
 * regra em todos: `tentativasRestantes: 0` NÃO é o bloqueio em si (essa
 * resposta ainda é 401) — é aviso de que a PRÓXIMA errada bloqueia (ledger
 * da T3, achado #6).
 */
function formatarErroPin(err: any, t: TFunction): string {
  if (err?.status === 401 && typeof err.tentativasRestantes === 'number') {
    if (err.tentativasRestantes > 0) {
      return `${t('parental.pinIncorrectPrefix')} ${err.tentativasRestantes} ${t('parental.pinAttemptsRemainingSuffix')}`;
    }
    return t('parental.pinNextAttemptBlocks');
  }
  return err?.message || t('parental.saveGenericError');
}

/**
 * Fix round (MÉDIA 2): `err.sessaoRenovada` vem de services/api.ts quando
 * um 401 nas rotas sem retry era SESSÃO expirada (accessToken vencido com
 * o formulário aberto), não PIN/senha errados — já renovado a essa altura.
 * NUNCA deve virar "PIN incorreto" (formatarErroPin acima trataria como
 * tal, já que o corpo pode nem ter `tentativasRestantes`). Checar isso
 * PRIMEIRO, antes de qualquer outra interpretação do erro, é o que evita a
 * mensagem enganosa.
 */
function éSessaoRenovada(err: any): boolean {
  return !!err?.sessaoRenovada;
}

const ParentalSettings: React.FC<ParentalSettingsProps> = ({ user, recoveryToken, onRecoveryTokenConsumed }) => {
  const t = useT();

  // ─── Carregamento ───────────────────────────────────────────────────────
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vocabulario, setVocabulario] = useState<{ slug: string; rotuloPt: string }[]>([]);
  const [temPin, setTemPin] = useState(false);

  const [savedEtaria, setSavedEtaria] = useState<Classificacao>('young');
  const [savedTags, setSavedTags] = useState<string[]>([]);
  const [draftEtaria, setDraftEtaria] = useState<Classificacao>('young');
  const [draftTags, setDraftTags] = useState<string[]>([]);

  const dirty = draftEtaria !== savedEtaria || !mesmoConjunto(draftTags, savedTags);

  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    api
      .getParental()
      .then((r) => {
        if (cancelado) return;
        setVocabulario(r.vocabulario);
        setSavedEtaria(r.classificacaoEtaria);
        setSavedTags(r.tagsBloqueadas);
        setDraftEtaria(r.classificacaoEtaria);
        setDraftTags(r.tagsBloqueadas);
        setTemPin(r.temPin);
        setLoaded(true);
      })
      .catch((err: any) => {
        if (cancelado) return;
        setLoadError(err?.message || t('parental.loadError'));
        setLoaded(true);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ─── Salvar em lote (etária + toggles) ──────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [showPinGate, setShowPinGate] = useState(false);
  const [pinGateValue, setPinGateValue] = useState('');
  const [pinGateError, setPinGateError] = useState<string | null>(null);

  // 429 (bloqueado): mensagem global com o tempo restante — desabilita
  // Salvar e todos os botões que pedem PIN até a página ser recarregada
  // (sem contador regressivo — decisão de escopo, ver relatório da task).
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  // Fix round (MÉDIA 2): aviso neutro quando um 401 nas rotas sem retry era
  // sessão expirada (não PIN errado) e o refresh funcionou — o formulário
  // segue aberto (o pedido original nunca chegou a ser avaliado pelo
  // servidor, então não há "tentativa" a repetir), só pede pra tentar de
  // novo já com a sessão renovada. Compartilhado entre os 4 pontos que
  // pedem PIN/senha (só um fica aberto por vez, então não há colisão de
  // qual modal mostra o quê).
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  function atualizarDraftEtaria(v: Classificacao) {
    setDraftEtaria(v);
    setSaveSuccess(false);
    setSaveError(null);
  }

  function toggleTag(slug: string) {
    setDraftTags((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
    setSaveSuccess(false);
    setSaveError(null);
  }

  function handleSaveClick() {
    setSaveError(null);
    setSaveSuccess(false);
    if (temPin) {
      setPinGateValue('');
      setPinGateError(null);
      setSessionNotice(null);
      setShowPinGate(true);
    } else {
      performSave();
    }
  }

  async function performSave(pinValue?: string) {
    setSaving(true);
    setSessionNotice(null);
    try {
      const payload: { classificacaoEtaria: Classificacao; tagsBloqueadas: string[]; pin?: string } = {
        classificacaoEtaria: draftEtaria,
        tagsBloqueadas: draftTags,
      };
      if (temPin) payload.pin = pinValue;
      const r = await api.updateParental(payload);
      setSavedEtaria(r.classificacaoEtaria);
      setSavedTags(r.tagsBloqueadas);
      setTemPin(r.temPin);
      setShowPinGate(false);
      setPinGateValue('');
      setPinGateError(null);
      setSaveSuccess(true);
    } catch (err: any) {
      if (éSessaoRenovada(err)) {
        setSessionNotice(t('parental.sessionRenewedNotice'));
      } else if (err?.status === 429) {
        setBlockedMessage(err.message);
        setShowPinGate(false);
      } else if (temPin) {
        setPinGateError(formatarErroPin(err, t));
      } else {
        setSaveError(err?.message || t('parental.saveGenericError'));
      }
    } finally {
      setSaving(false);
    }
  }

  // Fix round (BAIXA 5): valida o formato LOCALMENTE antes de gastar uma
  // tentativa no servidor — mesma regra de criar/trocar (submitPinModal
  // abaixo). Sem isso, digitar 'abc' ou 3 dígitos incrementava
  // pinTentativas por um valor que o servidor já sabe de antemão que é
  // inválido (formatoPinValido em routes/parental.js — mas aquele 400 é só
  // pra POST /pin; o PUT /parental trata QUALQUER pin não-vazio como uma
  // tentativa de comparação via bcrypt).
  function handlePinGateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pinGateValue)) {
      setPinGateError(t('parental.pinFormatError'));
      return;
    }
    performSave(pinGateValue);
  }

  useCamadaVoltar(showPinGate, () => setShowPinGate(false));

  // ─── Criar / trocar PIN ─────────────────────────────────────────────────
  const [pinModal, setPinModal] = useState<'create' | 'change' | null>(null);
  const [pinModalAtual, setPinModalAtual] = useState('');
  const [pinModalNovo, setPinModalNovo] = useState('');
  const [pinModalConfirm, setPinModalConfirm] = useState('');
  const [pinModalError, setPinModalError] = useState<string | null>(null);
  const [pinModalSaving, setPinModalSaving] = useState(false);
  const [pinManageMessage, setPinManageMessage] = useState<string | null>(null);

  function abrirPinModal(modo: 'create' | 'change') {
    setPinModalAtual('');
    setPinModalNovo('');
    setPinModalConfirm('');
    setPinModalError(null);
    setPinManageMessage(null);
    setSessionNotice(null);
    setPinModal(modo);
  }

  async function submitPinModal(e: React.FormEvent) {
    e.preventDefault();
    const modo = pinModal;
    setPinModalError(null);
    setSessionNotice(null);
    if (!/^\d{4,6}$/.test(pinModalNovo)) {
      setPinModalError(t('parental.pinFormatError'));
      return;
    }
    if (pinModalNovo !== pinModalConfirm) {
      setPinModalError(t('parental.pinMismatchError'));
      return;
    }
    setPinModalSaving(true);
    try {
      const payload: { novoPin: string; pinAtual?: string } = { novoPin: pinModalNovo };
      if (modo === 'change') payload.pinAtual = pinModalAtual;
      const r = await api.setParentalPin(payload);
      setTemPin(r.temPin);
      setPinModal(null);
      setPinManageMessage(modo === 'create' ? t('parental.pinCreateSuccess') : t('parental.pinChangeSuccess'));
    } catch (err: any) {
      if (éSessaoRenovada(err)) {
        setSessionNotice(t('parental.sessionRenewedNotice'));
      } else if (err?.status === 429) {
        setBlockedMessage(err.message);
        setPinModal(null);
      } else {
        setPinModalError(formatarErroPin(err, t));
      }
    } finally {
      setPinModalSaving(false);
    }
  }

  useCamadaVoltar(pinModal !== null, () => setPinModal(null));

  // ─── Remover PIN ────────────────────────────────────────────────────────
  const [showRemovePin, setShowRemovePin] = useState(false);
  const [removePinAtual, setRemovePinAtual] = useState('');
  const [removePinError, setRemovePinError] = useState<string | null>(null);
  const [removePinSaving, setRemovePinSaving] = useState(false);

  function abrirRemoverPin() {
    setRemovePinAtual('');
    setRemovePinError(null);
    setPinManageMessage(null);
    setSessionNotice(null);
    setShowRemovePin(true);
  }

  async function submitRemovePin(e: React.FormEvent) {
    e.preventDefault();
    setRemovePinError(null);
    setSessionNotice(null);
    setRemovePinSaving(true);
    try {
      const r = await api.setParentalPin({ pinAtual: removePinAtual, remover: true });
      setTemPin(r.temPin);
      setShowRemovePin(false);
      setPinManageMessage(t('parental.pinRemoveSuccess'));
    } catch (err: any) {
      if (éSessaoRenovada(err)) {
        setSessionNotice(t('parental.sessionRenewedNotice'));
      } else if (err?.status === 429) {
        setBlockedMessage(err.message);
        setShowRemovePin(false);
      } else {
        setRemovePinError(formatarErroPin(err, t));
      }
    } finally {
      setRemovePinSaving(false);
    }
  }

  useCamadaVoltar(showRemovePin, () => setShowRemovePin(false));

  // ─── Recuperar PIN esquecido ────────────────────────────────────────────
  // Conta local exige senha (mesma prova de identidade da exclusão de
  // conta, molde PrivacyCenter); social não tem senha — a própria sessão já
  // prova quem é.
  const isLocal = user?.provider === 'local' || !user?.provider;
  const [showRecover, setShowRecover] = useState(false);
  const [recoverPassword, setRecoverPassword] = useState('');
  const [recoverError, setRecoverError] = useState<string | null>(null);
  const [recoverSaving, setRecoverSaving] = useState(false);
  const [recoverSent, setRecoverSent] = useState(false);

  function abrirRecuperar() {
    setRecoverPassword('');
    setRecoverError(null);
    setRecoverSent(false);
    setSessionNotice(null);
    setShowRecover(true);
  }

  async function submitRecover(e: React.FormEvent) {
    e.preventDefault();
    setRecoverError(null);
    setSessionNotice(null);
    setRecoverSaving(true);
    try {
      await api.recuperarPin(isLocal ? recoverPassword : undefined);
      setRecoverSent(true);
    } catch (err: any) {
      if (éSessaoRenovada(err)) {
        setSessionNotice(t('parental.sessionRenewedNotice'));
      } else {
        setRecoverError(err?.message || t('parental.saveGenericError'));
      }
    } finally {
      setRecoverSaving(false);
    }
  }

  useCamadaVoltar(showRecover, () => setShowRecover(false));

  // ─── Confirmação da recuperação (?token=) ───────────────────────────────
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmDone, setConfirmDone] = useState(false);

  async function submitConfirmRecovery() {
    if (!recoveryToken) return;
    setConfirmError(null);
    setConfirmSaving(true);
    try {
      await api.confirmarRecuperacaoPin(recoveryToken);
      setTemPin(false);
      setConfirmDone(true);
    } catch (err: any) {
      setConfirmError(err?.message || t('parental.saveGenericError'));
    } finally {
      setConfirmSaving(false);
    }
  }

  function dismissConfirmRecovery() {
    setConfirmDone(false);
    setConfirmError(null);
    onRecoveryTokenConsumed?.();
  }

  useCamadaVoltar(!!recoveryToken, dismissConfirmRecovery);

  // ─── Renderização ───────────────────────────────────────────────────────

  if (!user) return null;

  return (
    <div data-testid="parental-settings" className="mt-10 text-left">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-4">{t('parental.title')}</h3>

      {!loaded ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <p className="text-rose-500 text-sm font-bold">{loadError}</p>
      ) : (
        <>
          {/* Classificação etária */}
          <div className="mb-8">
            <h4 className="text-[var(--text-color)] font-black text-lg mb-1">{t('parental.ageSectionTitle')}</h4>
            <p className="text-xs text-zinc-500 mb-4">{t('parental.ageSectionHint')}</p>
            <div role="radiogroup" aria-label={t('parental.ageSectionTitle')} className="space-y-3">
              {(['kids', 'teen', 'young'] as const).map((op) => {
                const rotulo = op === 'kids' ? t('portal.works.ratingKids') : op === 'teen' ? t('portal.works.ratingTeen') : t('portal.works.ratingYoung');
                const hint = op === 'kids' ? t('parental.ageKidsHint') : op === 'teen' ? t('parental.ageTeenHint') : t('parental.ageYoungHint');
                return (
                  <label
                    key={op}
                    className="flex items-start gap-3 w-full py-3 px-4 bg-white/5 rounded-2xl border border-white/10 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="parental-classificacao-etaria"
                      aria-label={rotulo}
                      checked={draftEtaria === op}
                      onChange={() => atualizarDraftEtaria(op)}
                      className="mt-1 accent-rose-600 w-4 h-4 shrink-0"
                    />
                    <span>
                      <span className="block font-black text-[var(--text-color)] text-sm">{rotulo}</span>
                      <span className="block text-xs text-zinc-500">{hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Preferências de conteúdo */}
          <div className="mb-8">
            <h4 className="text-[var(--text-color)] font-black text-lg mb-1">{t('parental.contentSectionTitle')}</h4>
            <p className="text-xs text-zinc-500 mb-4">{t('parental.contentSectionHint')}</p>
            <div className="space-y-2">
              {vocabulario.map((tag) => {
                const traduzido = t(`tags.${tag.slug}` as any);
                const rotulo = traduzido === `tags.${tag.slug}` ? tag.rotuloPt : traduzido;
                const checked = draftTags.includes(tag.slug);
                return (
                  <div
                    key={tag.slug}
                    className="w-full py-3 px-4 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-between"
                  >
                    <span className="text-sm text-[var(--text-color)]">{rotulo}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={checked}
                      aria-label={`${t('parental.hideTagAria')} ${rotulo}`}
                      onClick={() => toggleTag(tag.slug)}
                      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${checked ? 'bg-rose-600' : 'bg-zinc-700'}`}
                    >
                      <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Salvar (em lote) */}
          <div className="mb-10">
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={!dirty || saving || !!blockedMessage}
              className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl hover:bg-rose-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? '...' : t('parental.saveButton')}
            </button>
            {saveSuccess && <p className="text-emerald-400 text-xs font-bold text-center mt-3">{t('parental.saveSuccess')}</p>}
            {saveError && <p className="text-rose-500 text-xs font-bold text-center mt-3">{saveError}</p>}
          </div>

          {/* PIN de proteção */}
          <div>
            <h4 className="text-[var(--text-color)] font-black text-lg mb-3">{t('parental.pinSectionTitle')}</h4>
            {blockedMessage && <p className="text-rose-500 text-xs font-bold mb-3">{blockedMessage}</p>}
            {pinManageMessage && <p className="text-emerald-400 text-xs font-bold mb-3">{pinManageMessage}</p>}

            {!temPin ? (
              <>
                <p className="text-xs text-amber-500 mb-4">{t('parental.pinNoneWarning')}</p>
                <button
                  type="button"
                  onClick={() => abrirPinModal('create')}
                  disabled={!!blockedMessage}
                  className="w-full py-4 bg-white/5 text-[var(--text-color)] font-bold rounded-2xl border border-white/10 hover:bg-white/10 transition-all text-sm disabled:opacity-40"
                >
                  {t('parental.pinCreateButton')}
                </button>
              </>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => abrirPinModal('change')}
                  disabled={!!blockedMessage}
                  className="py-3.5 bg-white/5 text-[var(--text-color)] font-bold rounded-2xl border border-white/10 hover:bg-white/10 transition-all text-sm disabled:opacity-40"
                >
                  {t('parental.pinChangeButton')}
                </button>
                <button
                  type="button"
                  onClick={abrirRemoverPin}
                  disabled={!!blockedMessage}
                  className="py-3.5 bg-rose-600/10 text-rose-500 font-bold rounded-2xl border border-rose-500/20 hover:bg-rose-600/20 transition-all text-sm disabled:opacity-40"
                >
                  {t('parental.pinRemoveButton')}
                </button>
                <button
                  type="button"
                  onClick={abrirRecuperar}
                  className="py-3.5 bg-white/5 text-[var(--text-color)] font-bold rounded-2xl border border-white/10 hover:bg-white/10 transition-all text-sm"
                >
                  {t('parental.pinForgotButton')}
                </button>
              </div>
            )}
          </div>

          {/* Modal: PIN (salvar em lote). Formulário (não div solto) pra
              Enter submeter — fix round BAIXA 5. */}
          {showPinGate && (
            <div className="fixed inset-0 z-[6500] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
              <form onSubmit={handlePinGateSubmit} className="w-full max-w-sm bg-[#1C1C1E] p-8 rounded-[2rem] border border-white/10 animate-apple">
                <h2 className="text-xl font-black text-white mb-2">{t('parental.pinEnterLabel')}</h2>
                <p className="text-sm text-zinc-400 mb-6">{t('parental.pinEnterHint')}</p>
                <input
                  data-testid="pin-gate-input"
                  type="password"
                  inputMode="numeric"
                  value={pinGateValue}
                  onChange={(e) => setPinGateValue(e.target.value)}
                  placeholder={t('parental.pinEnterLabel')}
                  className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-4 text-white mb-4"
                />
                {sessionNotice && <p className="text-amber-500 text-xs font-bold mb-4">{sessionNotice}</p>}
                {pinGateError && <p className="text-rose-500 text-xs font-bold mb-4">{pinGateError}</p>}
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowPinGate(false)} className="flex-1 py-3 font-bold text-zinc-400">
                    {t('portal.works.cancel')}
                  </button>
                  <button
                    type="submit"
                    data-testid="pin-gate-confirm"
                    disabled={saving || !!blockedMessage}
                    className="flex-1 py-3 bg-rose-600 text-white font-black rounded-2xl disabled:opacity-50"
                  >
                    {saving ? '...' : t('parental.pinConfirmButton')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Modal: criar/trocar PIN */}
          {pinModal && (
            <div className="fixed inset-0 z-[6500] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
              <form onSubmit={submitPinModal} className="w-full max-w-sm bg-[#1C1C1E] p-8 rounded-[2rem] border border-white/10 animate-apple space-y-4">
                <h2 className="text-xl font-black text-white">{pinModal === 'create' ? t('parental.pinCreateButton') : t('parental.pinChangeButton')}</h2>

                {pinModal === 'change' && (
                  <div>
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">{t('parental.pinCurrentLabel')}</label>
                    <input
                      data-testid="pin-modal-atual"
                      type="password"
                      inputMode="numeric"
                      value={pinModalAtual}
                      onChange={(e) => setPinModalAtual(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-3 text-white"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">{t('parental.pinNewLabel')}</label>
                  <input
                    data-testid="pin-modal-novo"
                    type="password"
                    inputMode="numeric"
                    value={pinModalNovo}
                    onChange={(e) => setPinModalNovo(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-3 text-white"
                  />
                  <p className="text-[10px] text-zinc-600 mt-1">{t('parental.pinNewHint')}</p>
                </div>

                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">{t('parental.pinConfirmNewLabel')}</label>
                  <input
                    data-testid="pin-modal-confirm"
                    type="password"
                    inputMode="numeric"
                    value={pinModalConfirm}
                    onChange={(e) => setPinModalConfirm(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-3 text-white"
                  />
                </div>

                {sessionNotice && <p className="text-amber-500 text-xs font-bold">{sessionNotice}</p>}
                {pinModalError && <p className="text-rose-500 text-xs font-bold">{pinModalError}</p>}

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setPinModal(null)} className="flex-1 py-3 font-bold text-zinc-400">
                    {t('portal.works.cancel')}
                  </button>
                  <button
                    type="submit"
                    data-testid="pin-modal-submit"
                    disabled={pinModalSaving || !!blockedMessage}
                    className="flex-1 py-3 bg-rose-600 text-white font-black rounded-2xl disabled:opacity-50"
                  >
                    {pinModalSaving ? '...' : t('parental.pinConfirmButton')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Modal: remover PIN */}
          {showRemovePin && (
            <div className="fixed inset-0 z-[6500] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
              <form onSubmit={submitRemovePin} className="w-full max-w-sm bg-[#1C1C1E] p-8 rounded-[2rem] border border-white/10 animate-apple space-y-4">
                <h2 className="text-xl font-black text-white">{t('parental.pinRemoveButton')}</h2>
                <p className="text-sm text-zinc-400">{t('parental.pinRemoveHint')}</p>
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">{t('parental.pinCurrentLabel')}</label>
                  <input
                    data-testid="pin-remove-atual"
                    type="password"
                    inputMode="numeric"
                    value={removePinAtual}
                    onChange={(e) => setRemovePinAtual(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-3 text-white"
                  />
                </div>
                {sessionNotice && <p className="text-amber-500 text-xs font-bold">{sessionNotice}</p>}
                {removePinError && <p className="text-rose-500 text-xs font-bold">{removePinError}</p>}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowRemovePin(false)} className="flex-1 py-3 font-bold text-zinc-400">
                    {t('portal.works.cancel')}
                  </button>
                  <button
                    type="submit"
                    data-testid="pin-remove-submit"
                    disabled={removePinSaving || !!blockedMessage}
                    className="flex-1 py-3 bg-rose-600 text-white font-black rounded-2xl disabled:opacity-50"
                  >
                    {removePinSaving ? '...' : t('parental.pinConfirmButton')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Modal: recuperar PIN esquecido */}
          {showRecover && (
            <div className="fixed inset-0 z-[6500] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
              <form onSubmit={submitRecover} className="w-full max-w-sm bg-[#1C1C1E] p-8 rounded-[2rem] border border-white/10 animate-apple space-y-4">
                <h2 className="text-xl font-black text-white">{t('parental.pinForgotButton')}</h2>
                {!recoverSent ? (
                  <>
                    <p className="text-sm text-zinc-400">{isLocal ? t('parental.recoverLocalHint') : t('parental.recoverSocialHint')}</p>
                    {isLocal && (
                      <input
                        data-testid="pin-recover-password"
                        type="password"
                        value={recoverPassword}
                        onChange={(e) => setRecoverPassword(e.target.value)}
                        placeholder={t('parental.recoverPasswordLabel')}
                        className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-3 text-white"
                      />
                    )}
                    {sessionNotice && <p className="text-amber-500 text-xs font-bold">{sessionNotice}</p>}
                    {recoverError && <p className="text-rose-500 text-xs font-bold">{recoverError}</p>}
                    <div className="flex gap-3 pt-2">
                      <button type="button" onClick={() => setShowRecover(false)} className="flex-1 py-3 font-bold text-zinc-400">
                        {t('portal.works.cancel')}
                      </button>
                      <button
                        type="submit"
                        data-testid="pin-recover-submit"
                        disabled={recoverSaving}
                        className="flex-1 py-3 bg-rose-600 text-white font-black rounded-2xl disabled:opacity-50"
                      >
                        {recoverSaving ? '...' : t('parental.recoverSendButton')}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-emerald-400">{t('parental.recoverSentMessage')}</p>
                    <button type="button" onClick={() => setShowRecover(false)} className="w-full py-3 bg-white/5 text-zinc-200 font-bold rounded-2xl border border-white/10">
                      {t('common.back')}
                    </button>
                  </>
                )}
              </form>
            </div>
          )}
        </>
      )}

      {/* Confirmação da recuperação (?token=) — independente do carregamento
          acima: quem chega aqui via link de e-mail espera resolver rápido. */}
      {recoveryToken && (
        <div className="fixed inset-0 z-[6600] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-[#1C1C1E] p-8 rounded-[2rem] border border-white/10 animate-apple">
            <h2 className="text-xl font-black text-white mb-2">{t('parental.recoveryConfirmTitle')}</h2>
            {!confirmDone ? (
              <>
                <p className="text-sm text-zinc-400 mb-6">{t('parental.recoveryConfirmHint')}</p>
                {confirmError && <p className="text-rose-500 text-xs font-bold mb-4">{confirmError}</p>}
                <div className="flex gap-3">
                  <button type="button" onClick={dismissConfirmRecovery} className="flex-1 py-3 font-bold text-zinc-400">
                    {t('portal.works.cancel')}
                  </button>
                  <button
                    type="button"
                    data-testid="pin-recovery-confirm-submit"
                    onClick={submitConfirmRecovery}
                    disabled={confirmSaving}
                    className="flex-1 py-3 bg-rose-600 text-white font-black rounded-2xl disabled:opacity-50"
                  >
                    {confirmSaving ? '...' : t('parental.recoveryConfirmButton')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-emerald-400 mb-6">{t('parental.recoveryConfirmSuccess')}</p>
                <button type="button" onClick={dismissConfirmRecovery} className="w-full py-3 bg-white/5 text-zinc-200 font-bold rounded-2xl border border-white/10">
                  {t('common.back')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentalSettings;
