# contexts/

## Responsabilidade

React Contexts globais do frontend — configuração e estado transversal que não justificam uma lib de estado.

---

## Arquivos

### `SettingsContext.tsx`
Configurações públicas da plataforma carregadas de `GET /api/settings/public` no boot, com defaults locais.
- Tagline, CDN base, preço premium, CPM
- Frequências e tempos de anúncio (`ad_skip_seconds`, `ad_frequency_feed`, `ad_frequency_webtoon`)
- IDs do AdSense e `google_client_id` (Google Sign-In; vazio = botão oculto)
- Hook: `useSettings()`

### `I18nContext.tsx`
Idioma da interface (PT/EN/ES/ZH) + função de tradução.
- Persiste em `localStorage.lorflux_language` — a MESMA chave que o `WebtoonReader` usa para os balões dos quadrinhos (uma fonte de verdade: trocou a UI, trocou o mangá)
- Idioma inicial: localStorage → `navigator.language` → `pt`
- Hooks: `useI18n()` (lang + setLang) e `useT()` (função `t(key)`)
- Dicionários em `i18n/translations.ts`; chave ausente cai no PT

---

## Padrões

- Providers montados em `index.tsx` envolvendo o `<App />`
- Nunca guardar dados sensíveis aqui (tokens ficam em memória no `services/api.ts` + cookies httpOnly)
