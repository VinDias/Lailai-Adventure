import { Lang } from './translations';

/**
 * Devolve genre/description da série no idioma pedido, com fallback PT.
 * O campo `translations` é preenchido pelo backend (services/translationService)
 * no save. Título NUNCA é traduzido (decisão do cliente).
 */
export function localizeSeries<T extends { genre?: string; description?: string; translations?: any }>(
  series: T,
  lang: Lang
): T {
  if (lang === 'pt' || !series?.translations) return series;
  const t = series.translations[lang];
  if (!t) return series;
  return {
    ...series,
    genre: t.genre || series.genre,
    description: t.description || series.description,
  };
}

/** Idem para episódios (apenas description; título do episódio fica intacto). */
export function localizeEpisode<T extends { description?: string; translations?: any }>(
  episode: T,
  lang: Lang
): T {
  if (lang === 'pt' || !episode?.translations) return episode;
  const t = episode.translations[lang];
  if (!t) return episode;
  return { ...episode, description: t.description || episode.description };
}
