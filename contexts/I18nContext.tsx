import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { TRANSLATIONS, Lang, TranslationKey } from '../i18n/translations';

// A MESMA chave que o WebtoonReader usa para os balões dos quadrinhos:
// trocar o idioma da interface troca as camadas de tradução do leitor junto.
const STORAGE_KEY = 'lorflux_language';
const SUPPORTED: Lang[] = ['pt', 'en', 'es', 'zh'];

function detectInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved as Lang)) return saved as Lang;
  } catch { /* storage indisponível */ }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'pt').slice(0, 2).toLowerCase();
  return SUPPORTED.includes(nav as Lang) ? (nav as Lang) : 'pt';
}

export type TFunction = (key: TranslationKey) => string;

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFunction;
}

// Default funcional (pt): componentes renderizados fora do provider — como nos
// testes legados — continuam funcionando com o dicionário base.
const defaultValue: I18nValue = {
  lang: 'pt',
  setLang: () => {},
  t: (key) => TRANSLATIONS.pt[key] ?? key,
};

const I18nContext = createContext<I18nValue>(defaultValue);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage indisponível */ }
  }, []);

  const t = useCallback<TFunction>(
    (key) => TRANSLATIONS[lang][key] ?? TRANSLATIONS.pt[key] ?? key,
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const { lang, setLang } = useContext(I18nContext);
  return { lang, setLang };
};

export const useT = (): TFunction => useContext(I18nContext).t;
