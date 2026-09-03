import React, { useEffect, useState } from 'react';
import { Palette, ChevronRight } from 'lucide-react';
import { api } from '../services/api';
import { useT } from '../contexts/I18nContext';

interface CanalResumo {
  channelId: string;
  name: string;
  avatar: string | null;
  obras: number;
  pendentes: number;
  mensagensNaoLidas: number;
}

interface MeuEstudioCardProps {
  onOpen: () => void;
}

/**
 * Cartão "Meu Estúdio" na aba Conta (Fase 5 Bloco 1, Task 9). Consulta
 * `GET /portal/meu-estudio` ao montar — o componente só existe dentro da
 * Conta (ViewMode.PROFILE em App.tsx), que só é alcançável depois do login,
 * então não há prop de usuário aqui (mesmo padrão de SuperReaderBadge).
 *
 * Dois desfechos:
 * - 200 (usuário é dono de ≥1 canal ativo) → renderiza o cartão, com badges
 *   de pendências de aprovação e mensagens não lidas somadas entre os
 *   canais do usuário (quando > 0).
 * - Qualquer falha (403 "não é dono", rede, sessão expirada) → não
 *   renderiza NADA. 403 é o caso normal para a maioria dos leitores (não
 *   são ilustradores) — tratar qualquer erro como "não mostrar" evita
 *   distinguir 403 de outras falhas por texto de mensagem, que não é um
 *   contrato estável.
 */
const MeuEstudioCard: React.FC<MeuEstudioCardProps> = ({ onOpen }) => {
  const t = useT();
  const [canais, setCanais] = useState<CanalResumo[] | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let cancelado = false;
    api.getMeuEstudio()
      .then(resposta => { if (!cancelado) setCanais(resposta.canais); })
      .catch(() => { if (!cancelado) setFalhou(true); });
    return () => { cancelado = true; };
  }, []);

  if (falhou || canais === null) return null;

  const totalPendentes = canais.reduce((sum, c) => sum + c.pendentes, 0);
  const totalNaoLidas = canais.reduce((sum, c) => sum + c.mensagensNaoLidas, 0);

  return (
    <button
      onClick={onOpen}
      data-testid="meu-estudio-card"
      className="w-full py-5 px-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all text-left flex items-center gap-4"
    >
      <div className="w-11 h-11 rounded-2xl bg-rose-600/15 border border-rose-500/30 flex items-center justify-center text-rose-500 shrink-0">
        <Palette size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[var(--text-color)] font-black">{t('portal.cardTitle')}</p>
        <p className="text-zinc-500 text-xs font-bold truncate">{t('portal.cardSubtitle')}</p>
        {(totalPendentes > 0 || totalNaoLidas > 0) && (
          <div className="flex gap-3 mt-2 flex-wrap">
            {totalPendentes > 0 && (
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                {totalPendentes} {t('portal.pendingLabel')}
              </span>
            )}
            {totalNaoLidas > 0 && (
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-500">
                {totalNaoLidas} {t('portal.unreadLabel')}
              </span>
            )}
          </div>
        )}
      </div>
      <ChevronRight size={18} className="text-zinc-600 shrink-0" />
    </button>
  );
};

export default MeuEstudioCard;
