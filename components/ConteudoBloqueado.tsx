import React from 'react';
import { Lock, UserPlus, Sparkles, X } from 'lucide-react';
import { useT } from '../contexts/I18nContext';
import ImageWithFallback from './ImageWithFallback';

/**
 * Tela de bloqueio de conteúdo (Fase 6, T2). O servidor passou a recusar
 * conteúdo pago com 403 e um código (utils/autorizacaoConteudo.js); sem esta
 * tela, o leitor e o player caíam no estado vazio ("nenhum painel") e o
 * usuário não entendia o que aconteceu nem o que fazer.
 *
 * Os dois motivos são comerciais, não erros: quem não tem conta é convidado a
 * criar; quem tem conta sem assinatura é convidado a assinar. A capa e o
 * título vêm do próprio 403 — é o que faz a oferta ter cara de oferta.
 */
export type MotivoBloqueio = 'login_necessario' | 'assinatura_necessaria';

interface Props {
  motivo: MotivoBloqueio;
  obra?: { title?: string; cover_image?: string } | null;
  onCriarConta: () => void;
  onAssinar: () => void;
  onClose: () => void;
}

const ConteudoBloqueado: React.FC<Props> = ({ motivo, obra, onCriarConta, onAssinar, onClose }) => {
  const t = useT();
  const precisaDeConta = motivo === 'login_necessario';

  return (
    <div className="fixed inset-0 z-[4000] bg-[var(--bg-color)] flex flex-col items-center justify-center p-8 text-center animate-apple">
      <button
        onClick={onClose}
        aria-label={t('common.close')}
        className="absolute top-6 right-6 p-2 text-zinc-500 hover:text-[var(--text-color)] transition-colors"
        style={{ top: 'max(env(safe-area-inset-top, 0px), 24px)' }}
      >
        <X size={22} />
      </button>

      {obra?.cover_image && (
        <div className="w-40 aspect-[9/16] bg-black rounded-3xl overflow-hidden mb-8 shadow-2xl">
          <ImageWithFallback src={obra.cover_image} className="w-full h-full object-cover opacity-80" alt={obra?.title || ''} />
        </div>
      )}

      <div className="w-14 h-14 rounded-2xl bg-rose-600/10 border border-rose-500/20 flex items-center justify-center mb-5">
        <Lock size={22} className="text-rose-500" />
      </div>

      {obra?.title && (
        <h2 className="text-2xl font-black tracking-tighter text-[var(--text-color)] mb-2">{obra.title}</h2>
      )}
      <p className="text-sm text-zinc-500 font-bold max-w-sm mb-8">
        {precisaDeConta ? t('bloqueio.semConta') : t('bloqueio.semAssinatura')}
      </p>

      <button
        onClick={precisaDeConta ? onCriarConta : onAssinar}
        className="flex items-center justify-center gap-3 w-full max-w-xs py-4 bg-rose-600 text-white font-black rounded-2xl hover:bg-rose-500 transition-all"
      >
        {precisaDeConta ? <UserPlus size={18} /> : <Sparkles size={18} />}
        {precisaDeConta ? t('bloqueio.criarConta') : t('bloqueio.assinar')}
      </button>

      <button onClick={onClose} className="mt-4 text-xs font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors">
        {t('bloqueio.voltar')}
      </button>
    </div>
  );
};

export default ConteudoBloqueado;
