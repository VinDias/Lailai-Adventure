import React, { useEffect, useRef, useState } from 'react';
import { Flag } from 'lucide-react';
import { api } from '../services/api';
import { useT } from '../contexts/I18nContext';
import { useCamadaVoltar } from '../utils/pilhaVoltar';
import { User } from '../types';

// Vocabulário FECHADO do backend (utils/curadoriaLimiares.js MOTIVOS) — a
// ordem é a do select. `outro` exige descrição (o backend devolve 400 sem ela;
// a UI barra antes para não gastar a chamada).
const MOTIVOS = ['conteudo_inadequado_faixa', 'discurso_de_odio', 'spam_ou_enganoso', 'direitos_autorais', 'conteudo_proibido', 'outro'] as const;
type Motivo = typeof MOTIVOS[number];
const DESCRICAO_MAX = 500;

interface SinalizarButtonProps {
  user: User | null;
  seriesId: string;
}

/**
 * "Sinalizar conteúdo" (Fase 5 Bloco 3) — ao lado do Super Reader no modal de
 * detalhe dos 3 feeds. Guest: botão desabilitado (padrão do favoritar/curtir
 * nesses modais — não o convite de login do SuperReaderButton). Regra 8 do
 * Vin: este componente NUNCA mostra quantas sinalizações a obra tem — só se
 * o próprio usuário já sinalizou. 404 ao consultar o estado (obra
 * despublicada/invisível) = sem estado, sem alerta.
 */
const SinalizarButton: React.FC<SinalizarButtonProps> = ({ user, seriesId }) => {
  const t = useT();
  const [jaSinalizada, setJaSinalizada] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<Motivo>(MOTIVOS[0]);
  const [descricao, setDescricao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviada, setEnviada] = useState(false);
  // Lock síncrono contra duplo clique — mesma técnica de SuperReaderButton.
  const lockRef = useRef(false);

  useCamadaVoltar(aberto, () => setAberto(false));

  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    api.getMinhaSinalizacao(seriesId)
      .then(r => { if (!cancelado) setJaSinalizada(!!r.jaSinalizada); })
      .catch(() => { /* 404/erro: sem estado */ });
    return () => { cancelado = true; };
  }, [user, seriesId]);

  const handleEnviar = async () => {
    if (lockRef.current) return;
    const desc = descricao.trim();
    if (motivo === 'outro' && !desc) {
      setErro(t('sinalizar.descricaoObrigatoria'));
      return;
    }
    lockRef.current = true;
    setEnviando(true);
    setErro(null);
    try {
      await api.sinalizarSerie(seriesId, desc ? { motivo, descricao: desc } : { motivo });
      setJaSinalizada(true);
      setEnviada(true);
      setAberto(false);
    } catch (e: any) {
      setErro(e?.code === 'propria_obra' ? t('sinalizar.propriaObra') : t('sinalizar.genericError'));
    } finally {
      lockRef.current = false;
      setEnviando(false);
    }
  };

  return (
    <div data-testid="sinalizar-button">
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        disabled={!user || jaSinalizada}
        className={`px-5 py-5 rounded-2xl border transition-all flex items-center gap-2 font-black text-xs uppercase tracking-widest disabled:opacity-50 ${jaSinalizada ? 'border-white/10 bg-white/5 text-zinc-400' : 'border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10'}`}
      >
        <Flag size={18} fill={jaSinalizada ? 'currentColor' : 'none'} />
        {jaSinalizada ? t('sinalizar.done') : t('sinalizar.cta')}
      </button>

      {enviada && <p className="mt-3 max-w-md text-sm text-emerald-400">{t('sinalizar.thanks')}</p>}

      {aberto && user && !jaSinalizada && (
        <div className="mt-4 max-w-md bg-white/5 border border-white/10 rounded-3xl p-6">
          <p className="text-white font-black mb-1">{t('sinalizar.title')}</p>
          <p className="text-zinc-400 text-sm leading-relaxed mb-4">{t('sinalizar.explain')}</p>

          <label htmlFor={`sinalizar-motivo-${seriesId}`} className="block text-[11px] font-black uppercase tracking-widest text-zinc-500 mb-2">{t('sinalizar.motivoLabel')}</label>
          <select
            id={`sinalizar-motivo-${seriesId}`}
            value={motivo}
            onChange={e => { setMotivo(e.target.value as Motivo); setErro(null); }}
            className="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white text-sm mb-3 outline-none focus:border-rose-500/50"
          >
            {MOTIVOS.map(m => <option key={m} value={m}>{t(`sinalizar.motivo.${m}` as any)}</option>)}
          </select>

          <textarea
            value={descricao}
            maxLength={DESCRICAO_MAX}
            onChange={e => { setDescricao(e.target.value); setErro(null); }}
            placeholder={t('sinalizar.descricaoPlaceholder')}
            rows={3}
            className="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white text-sm mb-3 outline-none focus:border-rose-500/50"
          />

          {erro && <p role="alert" className="text-rose-500 text-xs mb-3">{erro}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={() => setAberto(false)} className="flex-1 py-4 bg-white/5 text-zinc-300 font-black rounded-2xl text-xs uppercase tracking-widest">{t('sinalizar.cancel')}</button>
            <button type="button" onClick={handleEnviar} disabled={enviando} className="flex-1 py-4 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl text-xs uppercase tracking-widest disabled:opacity-50">{t('sinalizar.submit')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SinalizarButton;
