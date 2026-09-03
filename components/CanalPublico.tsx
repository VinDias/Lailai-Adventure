import React, { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import { api } from '../services/api';
import { User } from '../types';
import { useT } from '../contexts/I18nContext';
import ImageWithFallback from './ImageWithFallback';

interface CanalInfo {
  _id: string;
  name: string;
  description?: string | null;
  avatar?: string | null;
  banner?: string | null;
  followersCount: number;
  isFollowing: boolean;
}

interface CanalPublicoProps {
  channelId: string;
  user: User | null;
  onClose: () => void;
  onOpenSeries: (seriesId: string, contentType?: string) => void;
}

/**
 * Página pública do canal (Fase 5 Bloco 1, Task 10) — alcançada pelo clique
 * no nome do canal no modal de detalhe da obra nos 3 feeds (HQCine/VFilm/
 * HiQua registram a camada de voltar e controlam a visibilidade; este
 * componente é "burro" quanto a isso, igual PortalEstudio/MyFavorites não
 * gerenciam sua própria entrada de histórico).
 *
 * `GET /channels/:id` (shape pinado da spec: followersCount + isFollowing,
 * SEM `followers[]`) não devolve as obras do canal — não existe rota nova
 * para isso (fora do escopo autorizado desta task); as obras publicadas são
 * obtidas reusando `GET /content/series` (já usado pelos 3 feeds) e
 * filtradas aqui pelo `channelId`.
 *
 * Seguir/Seguindo: atualização otimista com rollback em erro. Visitante
 * (user null): botão desabilitado, sem prompt — mesmo padrão do favoritar
 * nos 3 feeds (components/HQCine.tsx `toggleFavorite`/`disabled={... || !user}`).
 */
const CanalPublico: React.FC<CanalPublicoProps> = ({ channelId, user, onClose, onOpenSeries }) => {
  const t = useT();
  const [canal, setCanal] = useState<CanalInfo | null>(null);
  const [obras, setObras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [falhou, setFalhou] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setFalhou(false);
    Promise.all([
      api.getChannel(channelId),
      api.getSeries().catch(() => []),
    ])
      .then(([c, todasSeries]) => {
        if (cancelado) return;
        setCanal(c as unknown as CanalInfo);
        setObras((todasSeries || []).filter((s: any) => String(s.channelId) === String(channelId)));
      })
      .catch(() => {
        if (!cancelado) setFalhou(true);
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => { cancelado = true; };
  }, [channelId]);

  const toggleFollow = async () => {
    if (!canal || !user || followBusy) return;
    setFollowBusy(true);
    const wasFollowing = canal.isFollowing;
    const prevCount = canal.followersCount;
    setCanal({ ...canal, isFollowing: !wasFollowing, followersCount: prevCount + (wasFollowing ? -1 : 1) });
    try {
      const res = wasFollowing ? await api.unfollowChannel(channelId) : await api.followChannel(channelId);
      setCanal(c => (c ? { ...c, followersCount: res.followers } : c));
    } catch {
      setCanal(c => (c ? { ...c, isFollowing: wasFollowing, followersCount: prevCount } : c));
    } finally {
      setFollowBusy(false);
    }
  };

  const handleOpenObra = (s: any) => {
    onClose();
    onOpenSeries(String(s._id), s.content_type);
  };

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-3xl z-[1600] animate-apple p-8 overflow-y-auto" data-testid="canal-publico">
      <button onClick={onClose} aria-label={t('common.back')} className="absolute top-8 right-8 text-white/40 hover:text-white transition-all">
        <X size={32} />
      </button>

      {loading ? (
        <div className="h-full flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
        </div>
      ) : falhou || !canal ? (
        <div className="max-w-2xl mx-auto pt-32 text-center">
          <p className="text-zinc-500 font-bold">{t('channel.notFound')}</p>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto pt-20">
          {canal.banner && (
            <div className="w-full h-40 rounded-3xl overflow-hidden mb-[-3rem] relative">
              <ImageWithFallback src={canal.banner} className="w-full h-full object-cover opacity-60" alt="" />
            </div>
          )}

          <div className="flex flex-col md:flex-row items-center md:items-end gap-6 mb-8">
            <div className="w-28 h-28 rounded-[2rem] overflow-hidden border-4 border-black shadow-2xl bg-zinc-800 shrink-0">
              <ImageWithFallback src={canal.avatar ?? undefined} className="w-full h-full object-cover" alt={canal.name} />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-4xl font-black text-white tracking-tighter mb-1">{canal.name}</h2>
              <p className="text-zinc-500 text-xs font-black uppercase tracking-widest">
                {canal.followersCount} {t('channel.followers')}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleFollow}
              disabled={!user || followBusy}
              data-testid="canal-follow-button"
              className={`px-10 py-4 font-black rounded-2xl transition-all disabled:opacity-50 flex items-center gap-3 ${canal.isFollowing ? 'bg-emerald-500 text-black hover:bg-emerald-400' : 'bg-rose-600 text-white hover:bg-rose-500'}`}
            >
              {canal.isFollowing && <Check size={18} strokeWidth={3} />}
              {canal.isFollowing ? t('channel.following') : t('channel.follow')}
            </button>
          </div>

          {canal.description && (
            <p className="text-zinc-400 text-base leading-relaxed mb-12 max-w-2xl">{canal.description}</p>
          )}

          <h3 className="text-xl font-black text-white mb-6">{t('channel.works')}</h3>
          {obras.length === 0 ? (
            <p className="text-zinc-600 font-bold uppercase tracking-widest text-xs">{t('channel.empty')}</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {obras.map(s => (
                <div key={s._id} onClick={() => handleOpenObra(s)} className="group cursor-pointer">
                  <div className="aspect-[9/16] rounded-[2.5rem] overflow-hidden relative ring-1 ring-white/5 transition-all group-hover:scale-[1.02] shadow-2xl">
                    <ImageWithFallback src={s.cover_image} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={s.title} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                    <div className="absolute bottom-6 left-6 right-6">
                      <h3 className="text-lg font-black text-white leading-tight drop-shadow-lg">{s.title}</h3>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CanalPublico;
