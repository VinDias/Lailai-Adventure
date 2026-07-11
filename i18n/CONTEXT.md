# i18n/

## Responsabilidade

Dicionários de tradução da interface do usuário (frontend). Consumidos pelo `contexts/I18nContext.tsx` via hooks `useI18n()`/`useT()`.

---

## Arquivos

### `translations.ts`
- Objeto `TRANSLATIONS` com os 4 idiomas suportados: `pt` (base/fallback), `en`, `es`, `zh`
- Chaves em dot-notation por área: `nav.*`, `auth.*`, `feed.*`, `reader.*`, `player.*`, `account.*`, `favorites.*`, `onboarding.*`, `ads.*`, `search.*`, `common.*`
- O tipo das chaves é derivado do dicionário `pt` — adicionar uma string nova exige adicioná-la primeiro no `pt` (TypeScript acusa idiomas incompletos)

### `localizeContent.ts`
- `localizeSeries(series, lang)` / `localizeEpisode(episode, lang)` — devolvem `genre`/`description` traduzidos do campo `translations` do documento (preenchido pelo backend via `services/translationService.js`), com fallback para o PT original
- Título NUNCA é traduzido (decisão do cliente)

---

## Regras

- Somente strings voltadas ao usuário final. **Admin permanece em PT.**
- Textos legais (Termos/Privacidade) permanecem em PT (segurança jurídica).
- O idioma escolhido persiste em `localStorage.lorflux_language`, compartilhado com as camadas de tradução dos painéis no `WebtoonReader`.
