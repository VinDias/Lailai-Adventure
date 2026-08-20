import React, { useEffect, useState } from 'react';
import { Crown } from 'lucide-react';
import { api } from '../services/api';
import { useT, useI18n } from '../contexts/I18nContext';
import { formatarValorMonetario } from '../utils/currency';
import { Lang } from '../i18n/translations';

interface Contribuicao {
  seriesTitle: string | null;
  amountCents: number;
  currency: string;
  createdAt: string;
}

interface SuperReaderMeResponse {
  superReader: boolean;
  contribuicoes: Contribuicao[];
}

// Locale usado para formatar a data das contribuições (Intl.DateTimeFormat),
// derivado do idioma da interface — mesmo padrão de components/AgendaView.tsx,
// não do navegador.
const DATE_LOCALES: Record<Lang, string> = {
  pt: 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
  zh: 'zh-CN',
};

function formatarData(iso: string, lang: Lang): string {
  const locale = DATE_LOCALES[lang] || 'pt-BR';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Selo Super Reader na aba Conta (Fase 4 Bloco 3, Task 6). Consulta
 * `GET /superreader/me` ao montar — o componente só existe dentro da Conta
 * (ViewMode.PROFILE em App.tsx), que só é alcançável depois do login
 * (`if (view === ViewMode.AUTH) return (...)` antes de qualquer outra view);
 * visitante nunca monta este componente, então não há prop de usuário aqui.
 *
 * Três desfechos, nenhum quebra a Conta:
 * - `superReader: true` → selo + lista das contribuições (título da obra,
 *   valor formatado, data curta); obra removida (`seriesTitle: null`) cai no
 *   texto de fallback i18n.
 * - `superReader: false` → convite discreto para apoiar (escolha desta task,
 *   registrada no ledger — a alternativa era não renderizar nada).
 * - Falha da API (rede, 401 expirado etc.) → não renderiza nada.
 */
const SuperReaderBadge: React.FC = () => {
  const t = useT();
  const { lang } = useI18n();
  const [dados, setDados] = useState<SuperReaderMeResponse | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let cancelado = false;
    api.getSuperReaderMe()
      .then(resposta => { if (!cancelado) setDados(resposta); })
      .catch(() => { if (!cancelado) setFalhou(true); });
    return () => { cancelado = true; };
  }, []);

  if (falhou || dados === null) return null;

  if (!dados.superReader) {
    return (
      <p className="text-xs text-zinc-500 px-2 text-center">
        {t('superReader.inviteText')}
      </p>
    );
  }

  return (
    <div data-testid="superreader-badge" className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6 text-left">
      <div className="flex items-center gap-3 mb-1">
        <div className="p-2 rounded-full bg-amber-500 text-black shrink-0">
          <Crown size={16} />
        </div>
        <span className="font-black text-amber-400 uppercase tracking-widest text-xs">
          {t('superReader.badgeTitle')}
        </span>
      </div>

      {dados.contribuicoes.length > 0 && (
        <>
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mt-4 mb-2">
            {t('superReader.contributionsHeading')}
          </p>
          <ul className="space-y-2">
            {dados.contribuicoes.map((c, i) => (
              <li key={`${c.createdAt}-${i}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-[var(--text-color)] font-bold truncate">
                  {c.seriesTitle ?? t('superReader.removedSeries')}
                </span>
                <span className="text-zinc-400 text-xs whitespace-nowrap shrink-0">
                  {formatarValorMonetario(c.amountCents, c.currency)} · {formatarData(c.createdAt, lang)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

export default SuperReaderBadge;
