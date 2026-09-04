# i18n/

## Responsabilidade

Dicionários de tradução da interface do usuário (frontend). Consumidos pelo `contexts/I18nContext.tsx` via hooks `useI18n()`/`useT()`.

---

## Arquivos

### `translations.ts`
- Objeto `TRANSLATIONS` com os 4 idiomas suportados: `pt` (base/fallback), `en`, `es`, `zh`
- Chaves em dot-notation por área: `nav.*`, `auth.*`, `feed.*`, `reader.*`, `player.*`, `account.*`, `favorites.*`, `onboarding.*`, `ads.*`, `search.*`, `common.*`, `portal.*`, `parental.*`, `tags.*`
- O tipo das chaves é derivado do dicionário `pt` — adicionar uma string nova exige adicioná-la primeiro no `pt` (TypeScript acusa idiomas incompletos)
- **`parental.*` (Fase 5, Bloco 2)** — a seção "Classificação etária e Preferências de conteúdo" da Conta (`components/ParentalSettings.tsx`). Nomenclatura **EXATA** da letra do cliente: `parental.title` = `'Classificação etária e Preferências de conteúdo'` (`translations.ts:256`), `parental.ageSectionTitle` = `'Classificação etária'`, `parental.contentSectionTitle` = `'Preferências de conteúdo'`, PIN aparece como `'PIN de proteção'`. **NUNCA** "controle de classificação" nem "controle parental" em texto visível — o PDF de 31/08 proíbe explicitamente o primeiro (confunde com Kids/Teen/Young) e o segundo quebra o enquadramento anti-censura do cliente
- **`tags.<slug>` (Fase 5, Bloco 2)** — os 19 rótulos do vocabulário fechado, um por slug de `utils/tagsVocabulario.json` (`tags.romance`, `tags.dark-fantasy`, `tags.lgbtqia+`, …), nos 4 idiomas. Usados pelos toggles das Preferências de conteúdo e pelos chips do form do portal. O `ParentalSettings` tenta `tags.<slug>` primeiro e cai no `rotuloPt` que vem do `GET /api/parental` se a chave não existir. `tests/frontend/i18n.test.tsx` pina JSON ↔ dicionário (todo slug do vocabulário tem chave nos 4 idiomas) — sem esse teste, `t('tags.' + slug)` desliga a checagem de `TranslationKey` do TypeScript

- **`sinalizar.*` (Fase 5, Bloco 3 — Curadoria)** — as **18 chaves** do botão/painel "Sinalizar conteúdo" (`components/SinalizarButton.tsx`), nos 4 idiomas: PT `translations.ts:149-166`, EN `:455-472`, ES `:748-765`, ZH `:1041-1058`. Seis delas são `sinalizar.motivo.<slug>` e o sufixo é **o enum do backend** (`utils/curadoriaLimiares.js:40-47`) — o `<select>` mapeia os slugs direto para as chaves (`components/SinalizarButton.tsx:121`), então um motivo novo no vocabulário fechado exige a chave nos 4 idiomas
  - **Regra de NENHUM DÍGITO** (regra 8 do Vin: o leitor nunca vê quantas sinalizações uma obra recebeu): nenhuma string `sinalizar.*` pode conter número. Protegida por um **teste de DADOS, sem render** — varre `TRANSLATIONS[lang]` filtrando as chaves do namespace e exige zero dígito em cada idioma (`tests/frontend/sinalizarButton.test.tsx:245-251`), com um piso de quantidade de chaves para o teste não passar vazio. É o complemento do teste de render, que já cobre a tela em todos os estados do painel nos 4 idiomas (`:192-241`) — a superfície com maior chance de ganhar um dígito no futuro é o dicionário, não o componente
  - O rótulo do botão é "SINALIZAR CONTEÚDO" (`:149`), **desvio consciente da proposta comercial**, que dizia "Não conforme" — soa menos acusatório; comunicado ao Vin na entrega

### `localizeContent.ts`
- `localizeSeries(series, lang)` / `localizeEpisode(episode, lang)` — devolvem `genre`/`description` traduzidos do campo `translations` do documento (preenchido pelo backend via `services/translationService.js`), com fallback para o PT original
- Título NUNCA é traduzido (decisão do cliente)

---

## Regras

- Somente strings voltadas ao usuário final. **Admin permanece em PT.**
- Textos legais (Termos/Privacidade) permanecem em PT (segurança jurídica).
- O idioma escolhido persiste em `localStorage.lorflux_language`, compartilhado com as camadas de tradução dos painéis no `WebtoonReader`.
