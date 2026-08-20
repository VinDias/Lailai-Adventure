import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { pushManager } from '../utils/pushManager';
import { useT } from '../contexts/I18nContext';

type Estado = 'carregando' | 'ligado' | 'desligado' | 'negado' | 'indisponivel';

/**
 * Toggle "Notificações de capítulos novos" na aba Conta (Fase 4 Bloco 2,
 * Task 8). Três estados visíveis — ligado (thisDevice ativo, clique
 * desliga), desligado (clique liga) e negado (permissão bloqueada no
 * navegador, desabilitado com dica) — mais um estado interno "indisponível"
 * quando `getStatus()` devolve null (sem suporte residual ou erro de rede):
 * nesse caso o toggle fica desabilitado com um aviso, nunca afirmando
 * "desligado" sobre um status que não foi possível confirmar. Sem suporte
 * do navegador (`isSupported() === false`), a seção inteira some.
 */
const PushAccountToggle: React.FC = () => {
  const t = useT();
  const suportado = pushManager.isSupported();
  const [estado, setEstado] = useState<Estado>('carregando');
  const [processando, setProcessando] = useState(false);
  // Lock síncrono (não é state): dois cliques no mesmo tick, antes do React
  // commitar `setProcessando(true)`, ainda leriam `travado === false` no
  // closure e disparariam subscribe/unsubscribe duas vezes. Um ref muda de
  // valor imediatamente, sem esperar o próximo render.
  const lockRef = useRef(false);

  const carregar = useCallback(async () => {
    if (!suportado) return;
    if (pushManager.getPermission() === 'denied') {
      setEstado('negado');
      return;
    }
    const status = await pushManager.getStatus();
    if (status === null) {
      setEstado('indisponivel');
      return;
    }
    setEstado(status.thisDevice ? 'ligado' : 'desligado');
  }, [suportado]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!suportado) return null;

  const travado = processando || estado === 'negado' || estado === 'indisponivel' || estado === 'carregando';

  const handleToggle = async () => {
    if (lockRef.current || travado) return;
    lockRef.current = true;
    setProcessando(true);
    try {
      if (estado === 'ligado') await pushManager.unsubscribeThisDevice();
      else await pushManager.subscribeThisDevice();
    } finally {
      lockRef.current = false;
      setProcessando(false);
      await carregar();
    }
  };

  const ligado = estado === 'ligado';

  return (
    <div className="space-y-2">
      <button
        onClick={handleToggle}
        disabled={travado}
        aria-pressed={ligado}
        className="w-full py-5 bg-white/5 text-[var(--text-color)] font-black rounded-3xl border border-white/10 hover:bg-white/10 transition-all flex items-center justify-between px-6 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/5"
      >
        <span className="flex items-center gap-3">
          <Bell size={18} /> {t('push.accountToggle')}
        </span>
        <span className={`w-11 h-6 rounded-full relative transition-colors ${ligado ? 'bg-rose-600' : 'bg-white/10'}`}>
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${ligado ? 'left-5' : 'left-0.5'}`}
          />
        </span>
      </button>
      {estado === 'negado' && <p className="text-xs text-zinc-500 px-2">{t('push.deniedHint')}</p>}
      {estado === 'indisponivel' && <p className="text-xs text-zinc-500 px-2">{t('push.unavailable')}</p>}
    </div>
  );
};

export default PushAccountToggle;
