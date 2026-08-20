
import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { api, AgendaItem } from '../services/api';
import ImageWithFallback from './ImageWithFallback';
import { useT, useI18n } from '../contexts/I18nContext';
import { Lang } from '../i18n/translations';

type AgendaByDay = Record<string, AgendaItem[]>;

interface AgendaViewProps {
  open: boolean;
  onClose: () => void;
  onOpenSeries: (seriesId: string, contentType?: string) => void;
}

// Locale usado para nomear os dias da semana (Intl.DateTimeFormat), derivado
// do idioma da interface do app — não do navegador.
const WEEKDAY_LOCALES: Record<Lang, string> = {
  pt: 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
  zh: 'zh-CN',
};

// 1º de janeiro de 2023 foi um domingo (new Date(2023,0,1).getDay() === 0) —
// semana-âncora fixa e conhecida, usada só para formatar os 7 nomes curtos de
// dia na mesma ordem de Date.getDay() (0=domingo..6=sábado). Não depende da
// data "hoje" real, então funciona igual em qualquer dia (e em teste, com
// "hoje" mockado).
function buildWeekdayNames(lang: Lang): string[] {
  const locale = WEEKDAY_LOCALES[lang] || 'pt-BR';
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(2023, 0, 1 + i)));
}

const AgendaView: React.FC<AgendaViewProps> = ({ open, onClose, onOpenSeries }) => {
  const t = useT();
  const { lang } = useI18n();
  const [agenda, setAgenda] = useState<AgendaByDay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Dia selecionado no seletor horizontal — default é o dia de hoje
  // (0=domingo..6=sábado, igual a Date.getDay(), igual ao backend).
  const [selectedDay, setSelectedDay] = useState<number>(() => new Date().getDay());

  // Reabrir o overlay recarrega a agenda e volta a selecionar o dia de hoje
  // (cobre o caso de o app ter ficado aberto de um dia para o outro).
  useEffect(() => {
    if (!open) return;
    setSelectedDay(new Date().getDay());
    setLoading(true);
    setError(false);
    api.getAgenda()
      .then(data => setAgenda(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open]);

  // Fecha por Escape — mesmo padrão do SearchOverlay (único listener global,
  // com cleanup, só ativo enquanto o overlay está aberto).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const weekdayNames = useMemo(() => buildWeekdayNames(lang), [lang]);

  if (!open) return null;

  const todayIndex = new Date().getDay();
  const itemsOfDay = agenda?.[String(selectedDay)] ?? [];

  const handleSelectItem = (item: AgendaItem) => {
    onOpenSeries(item._id, item.content_type);
    onClose();
  };

  return (
    // Pilha de z-index deliberada (não empatada com nenhum vizinho):
    // detalhe de série 1500 (HQCine/HiQua/VFilm) < agenda 1550 <
    // PushPrompt 1600 < leitor de webtoon 2000. Um valor próprio evita que um
    // refactor que mova onde a Agenda é montada (hoje fora do <main>, ver
    // App.tsx) faça os dois overlays de 1500 coexistirem por ordem do DOM.
    //
    // Div externa = "backdrop": clique aqui fecha, igual ao SearchOverlay.
    // Div interna para o conteúdo com stopPropagation, para o clique dentro
    // (header, seletor de dia, grade de capas) não fechar o overlay.
    <div
      data-testid="agenda-backdrop"
      className="fixed inset-0 z-[1550] bg-[var(--bg-color)] animate-apple overflow-y-auto scrollbar-hide"
      onClick={onClose}
    >
      <div className="pb-40" onClick={e => e.stopPropagation()}>
        <header className="p-8 pt-16 md:p-12 flex items-center justify-between gap-4">
          <h1 className="text-5xl font-black premium-text tracking-tighter">{t('agenda.title')}</h1>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-3 rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-[var(--text-color)] hover:bg-white/10 transition-all shrink-0"
          >
            <X size={22} />
          </button>
        </header>

        <div className="px-8 mb-8 flex gap-2 overflow-x-auto scrollbar-hide">
          {weekdayNames.map((name, idx) => (
            <button
              key={idx}
              data-testid={`agenda-day-${idx}`}
              aria-pressed={selectedDay === idx}
              onClick={() => setSelectedDay(idx)}
              className={`shrink-0 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                selectedDay === idx
                  ? 'bg-rose-600 text-white'
                  : idx === todayIndex
                  ? 'bg-white/10 text-[var(--text-color)] border border-rose-500/40'
                  : 'bg-white/5 text-zinc-400 border border-white/10 hover:text-[var(--text-color)]'
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="py-20 px-8 text-center">
            <p className="text-zinc-600 font-bold uppercase tracking-widest text-xs">{t('agenda.error')}</p>
          </div>
        )}

        {!loading && !error && itemsOfDay.length === 0 && (
          <div className="py-20 px-8 text-center">
            <p className="text-zinc-600 font-bold uppercase tracking-widest text-xs">{t('agenda.empty')}</p>
          </div>
        )}

        {!loading && !error && itemsOfDay.length > 0 && (
          <section className="px-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {itemsOfDay.map(item => (
              <div key={item._id} onClick={() => handleSelectItem(item)} className="group cursor-pointer">
                <div className="aspect-[9/16] rounded-[2.5rem] overflow-hidden relative ring-1 ring-white/5 transition-all group-hover:scale-[1.02] shadow-2xl">
                  <ImageWithFallback src={item.cover_image} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={item.title} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                  <div className="absolute bottom-6 left-6 right-6">
                    <h3 className="text-lg font-black text-white leading-tight drop-shadow-lg">{item.title}</h3>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
};

export default AgendaView;
