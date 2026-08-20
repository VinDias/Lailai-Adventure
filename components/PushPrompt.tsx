import React, { useEffect, useRef, useState } from 'react';
import { pushManager } from '../utils/pushManager';
import { useT } from '../contexts/I18nContext';

const ASKED_KEY = 'lorflux_push_asked';

function jaPerguntou(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) !== null;
  } catch {
    // Storage indisponível: por segurança, não insiste (evita reperguntar em loop).
    return true;
  }
}

function marcarPerguntado(): void {
  try {
    localStorage.setItem(ASKED_KEY, '1');
  } catch {
    // Storage indisponível — sem flag persistida, a próxima carga tenta de novo; sem risco.
  }
}

/**
 * Cartão contextual pós-favorito (Fase 4 Bloco 2, Task 8). Escuta o evento
 * `lorflux:favorited` (disparado por services/api.ts::addFavorite) e mostra,
 * uma única vez, um convite não-bloqueante para ativar notificações — só
 * quando a permissão do navegador ainda está em `default` e o usuário nunca
 * respondeu antes. A flag `lorflux_push_asked` nunca é limpa pelo app: uma
 * vez perguntado (Ativar ou Agora não), nunca mais.
 */
const PushPrompt: React.FC = () => {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const [ativando, setAtivando] = useState(false);
  // Lock síncrono (não é state): dois cliques em "Ativar" no mesmo tick, antes
  // do React commitar o `setAtivando(true)`, ainda leriam `ativando === false`
  // no closure e disparariam subscribeThisDevice() duas vezes. Um ref muda de
  // valor imediatamente, sem esperar o próximo render.
  const lockRef = useRef(false);

  useEffect(() => {
    const onFavorited = () => {
      // Achado de revisão: sem checar isSupported(), um navegador com
      // Notification mas sem PushManager mostraria o cartão com "Ativar"
      // silenciosamente inócuo (subscribeThisDevice resolveria false sem
      // motivo aparente para quem clicou).
      if (pushManager.isSupported() && pushManager.getPermission() === 'default' && !jaPerguntou()) {
        setVisible(true);
      }
    };
    window.addEventListener('lorflux:favorited', onFavorited);
    return () => window.removeEventListener('lorflux:favorited', onFavorited);
  }, []);

  const fechar = () => {
    marcarPerguntado();
    setVisible(false);
  };

  const handleEnable = async () => {
    if (lockRef.current) return;
    lockRef.current = true;
    setAtivando(true);
    try {
      // subscribeThisDevice nunca lança (contrato de utils/pushManager) — sucesso
      // ou falha, o resultado é o mesmo aqui: grava a flag e fecha o cartão.
      await pushManager.subscribeThisDevice();
    } finally {
      lockRef.current = false;
      setAtivando(false);
      fechar();
    }
  };

  if (!visible) return null;

  return (
    <div
      data-testid="push-prompt"
      // Achado de revisão: favoritar só acontece dentro do modal de detalhe de
      // série (z-[1500], fullscreen, nos três feeds — único ponto de entrada
      // de favoritar no app). Com z-[850] o cartão nascia atrás desse overlay
      // e só aparecia depois que o usuário já tinha fechado o modal, fora de
      // contexto. z-[1600] fica acima do modal (1500) e abaixo do leitor
      // (2000, que não é gatilho de favoritar) — aparece por cima da tela
      // onde o usuário acabou de favoritar.
      className="fixed left-0 right-0 z-[1600] p-4 animate-apple"
      style={{ bottom: 'calc(7rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="max-w-md mx-auto bg-[#141416] border border-white/10 rounded-3xl p-5 shadow-2xl">
        <p className="text-sm font-black text-white mb-1">{t('push.promptTitle')}</p>
        <p className="text-sm text-zinc-400 leading-relaxed mb-4">{t('push.promptBody')}</p>
        <div className="flex gap-3">
          <button
            onClick={handleEnable}
            disabled={ativando}
            className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl text-xs uppercase tracking-widest transition-all disabled:opacity-60"
          >
            {t('push.enable')}
          </button>
          <button
            onClick={fechar}
            disabled={ativando}
            className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-zinc-200 font-black rounded-2xl text-xs uppercase tracking-widest transition-all border border-white/10 disabled:opacity-60"
          >
            {t('push.notNow')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PushPrompt;
