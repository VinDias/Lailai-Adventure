# Ficha Google Play Store — Lorflux

Rascunhos prontos pra colar no [Play Console](https://play.google.com/console). Sempre que o limite de caracteres for relevante, está marcado entre parênteses.

## 1. Identidade do app

| Campo | Valor |
|---|---|
| Package name (Application ID) | `com.lorflux.twa` |
| Categoria primária | **Entretenimento** |
| Categoria secundária | Quadrinhos / Livros |
| Tags sugeridas | comics, séries, animação, hqs, brasileiro, lgpd |
| Idioma padrão | Português (Brasil) |
| Idiomas adicionais | English (United States) |
| Site | `https://www.lorflux.com` |
| E-mail de contato | `privacidade@lorflux.com` |
| Política de Privacidade (URL) | `https://www.lorflux.com/privacidade` |
| Termos de Uso (URL) | `https://www.lorflux.com/termos` |

## 2. Textos da ficha

### 2.1. Título (máx. 30 chars)

`Lorflux - Cinematic Comics` *(26 chars)*

### 2.2. Descrição curta (máx. 80 chars) — pt-BR

`HQs cinematográficas que ganham vida. Histórias em vídeo, episódio a episódio.` *(78 chars)*

**Alternativas:**
- `Cinematic comics em vídeo. Mergulhe em histórias que ganham vida na tela.` *(73)*
- `Quadrinhos em movimento. Séries cinematográficas, episódio por episódio.` *(72)*

### 2.3. Descrição curta — en-US

`Cinematic comics in motion. Original stories, episode by episode.` *(64)*

### 2.4. Descrição longa (máx. 4000 chars) — pt-BR

```
Lorflux é uma plataforma de cinematic comics — quadrinhos que ganham vida em vídeo. Cada episódio é uma obra cinematográfica em si: arte, narrativa e som combinados para uma experiência diferente da leitura tradicional.

DESTAQUES
• Séries originais episódicas, com novas obras adicionadas regularmente.
• Reprodução fluida em HLS adaptativo, com áudio em múltiplos idiomas quando disponível.
• Interface minimalista pensada para o celular — uma obra de cada vez, sem distrações.
• Canais e curadoria: descubra criadores e siga os que combinam com você.
• Sistema de curtidas para apoiar suas obras favoritas.
• Modo escuro permanente, pensado para leitura/visualização noturna.

GRÁTIS E PREMIUM
A plataforma é gratuita com anúncios. Para uma experiência sem ads e acesso ao catálogo exclusivo Premium, assine direto no app via Google Play.

PRIVACIDADE E LGPD
A Lorflux foi construída com a Lei Geral de Proteção de Dados (LGPD) em mente:
• Senha armazenada apenas como hash criptográfico (bcrypt).
• Sessão em cookies httpOnly — nenhum token sensível no localStorage.
• Anúncios só carregam após seu consentimento explícito.
• Você pode exportar, corrigir ou apagar seus dados a qualquer momento na área Conta > Privacidade.
• Encarregado de Dados (DPO): privacidade@lorflux.com.

REQUISITOS
• Android 7.0 ou superior.
• Conexão à internet para reprodução (streaming HLS).
• Conta gratuita opcional para curtir, seguir canais e assinar Premium.

Aproveite o catálogo. Boas histórias.
```

*(≈ 1450 chars — bem dentro do limite)*

### 2.5. Descrição longa — en-US

```
Lorflux is a cinematic comics platform — graphic stories brought to life as motion video. Each episode is a cinematic piece on its own: artwork, narrative and sound combined for an experience that goes beyond traditional reading.

HIGHLIGHTS
• Original episodic series, with new releases added regularly.
• Smooth adaptive HLS playback, with multi-language audio when available.
• Minimalist mobile-first interface — one piece at a time, no clutter.
• Channels and curation: discover creators and follow the ones you love.
• Like system to support your favorite works.
• Permanent dark mode designed for nighttime viewing.

FREE AND PREMIUM
The platform is free with ads. For an ad-free experience and access to the exclusive Premium catalog, subscribe right in the app via Google Play.

PRIVACY
Lorflux is built with privacy regulations in mind (LGPD/Brazil):
• Passwords stored only as cryptographic hashes (bcrypt).
• Sessions in httpOnly cookies — no sensitive tokens in localStorage.
• Ads only load after your explicit consent.
• You can export, correct or delete your data anytime under Account > Privacy.
• Data Protection Officer: privacidade@lorflux.com.

REQUIREMENTS
• Android 7.0+.
• Internet connection for HLS streaming.
• Optional free account for likes, channel follows and Premium.

Enjoy the catalog. Good stories.
```

### 2.6. Novidades desta versão (máx. 500 chars) — pt-BR

```
Versão de lançamento da Lorflux. Estreia o catálogo de cinematic comics com séries originais, reprodução adaptativa, múltiplos áudios, modo Premium sem anúncios e total conformidade com a LGPD.
```

## 3. Segurança de Dados (Data Safety)

Respostas pré-preenchidas pro questionário do Play Console. Estrutura segue as categorias padrão do Google.

**Regras gerais (aplicam-se a todos os itens marcados como coletados):**
- Dados em trânsito são criptografados (HTTPS/TLS). ✅
- Usuário pode solicitar exclusão pela área "Conta > Privacidade" no app. ✅
- A coleta segue compromissos do [Play Families Policy](https://support.google.com/googleplay/android-developer/answer/9893335) — sem público infantil declarado.

### 3.1. Categorias coletadas

| Categoria | Item | Coletado? | Compartilhado com 3os? | Opcional/Obrig. | Finalidade |
|---|---|---|---|---|---|
| **Informações pessoais** | Nome | Sim | Não | Obrigatório (cadastro) | Funcionalidade do app, Gestão de conta |
| | E-mail | Sim | Não | Obrigatório (cadastro) | Funcionalidade do app, Gestão de conta, Comunicações |
| | IDs do usuário | Sim | Não | Obrigatório | Funcionalidade do app, Gestão de conta |
| **Informações financeiras** | Histórico de compras | Sim | Sim (Google Play Billing) | Obrigatório (se assinar Premium) | Funcionalidade do app |
| | Info de pagamento | **Não coletado pelo app** — Google Play Billing gerencia | — | — | — |
| **Atividade do app** | Interações no app (curtidas, follows) | Sim | Não | Obrigatório | Funcionalidade do app, Analytics |
| | Histórico de busca no app | Sim, se o usuário usar busca | Não | Opcional | Funcionalidade do app |
| **Info do app e desempenho** | Logs de crash | Sim | Sim (Sentry) | Obrigatório | Analytics, Prevenção de erros |
| | Diagnósticos | Sim | Sim (Sentry) | Obrigatório | Analytics |
| **Identificadores do dispositivo** | ID do dispositivo / IP | Sim | Não | Obrigatório | Segurança, Prevenção de fraudes |
| **Anúncios** | Atividade para anúncios | Sim, **somente após consentimento explícito** | Sim (Google AdSense) | **Opcional** | Publicidade |

### 3.2. Itens NÃO coletados

Marcar como "Não coletado":
- Localização (precisa ou aproximada)
- Fotos, vídeos ou áudio do dispositivo do usuário
- Arquivos e documentos
- Calendário, contatos, SMS, ligações
- Estado de saúde / atividade física
- Mensagens pessoais
- Microfone / câmera

### 3.3. Práticas de segurança a declarar

- ☑ Dados em trânsito são criptografados.
- ☑ Você fornece um jeito de usuários pedirem exclusão dos dados (Conta > Privacidade + e-mail do DPO).
- ☑ Você segue as práticas do Play Families Policy — *N/A pois o app não é destinado a crianças.*

## 4. Classificação de conteúdo (IARC)

O questionário muda conforme o público-alvo declarado. Para conteúdo de cinematic comics adulto/jovem-adulto, eis as respostas mais prováveis:

| Pergunta | Resposta sugerida |
|---|---|
| O app contém conteúdo violento? | Depende das obras publicadas — marcar "Violência leve" se houver luta estilizada; "Moderada" se houver sangue ou impacto realista. **Validar com Vin baseado no que vai estar no catálogo no lançamento.** |
| O app contém conteúdo sexual? | Idem — marcar conforme o catálogo real. Default: "Não". |
| Linguagem? | "Leve" se houver palavrões ocasionais; "Não" se for limpo. |
| Drogas, álcool ou tabaco? | "Não" como default; ajustar se aparecer no enredo. |
| Apostas / jogos de azar? | **Não** |
| Compras dentro do app? | **Sim** (assinatura Premium via Google Play Billing) |
| Compartilha localização do usuário? | **Não** |
| Permite interação entre usuários? | **Sim** (curtidas, follows de canais) — sem chat direto entre usuários, então classifica como "interação limitada". |
| Conteúdo gerado por usuários (UGC)? | **Sim** (canais e curadoria) — confirmar se há moderação ativa. |
| Compartilha info pessoal entre usuários? | **Não** |

Classificação final esperada: provavelmente **Livre** ou **10+/12+** dependendo do tom das obras. Será definida pelo IARC ao submeter as respostas.

## 5. Distribuição

| Campo | Valor |
|---|---|
| Preço | **Grátis** (monetização via ads + assinatura in-app) |
| Países de lançamento | Brasil (principal). Demais países LATAM e EUA podem ser adicionados depois. |
| Conta para teste interno | Adicionar o e-mail do Vin como tester antes de produção. |

## 6. Estratégia de rollout

Recomendação:

1. **Teste interno** (até 100 contas adicionadas) — subir o primeiro `.aab` aqui, validar fullscreen, login, vídeo, ads e fluxo Premium.
2. **Teste fechado** (opcional, beta com lista controlada) — pular se a confiança no app já estiver alta após teste interno.
3. **Produção** — rollout em fases (5% → 20% → 50% → 100%) nos primeiros dias, pra capturar crash logs sem afetar toda a base.

## 7. Como capturar os screenshots (1080×1920)

A Play Store exige no mínimo **2 screenshots phone**. Resolução recomendada: **1080×1920 portrait** (ou múltiplo da mesma proporção 9:16).

Recomenda-se **captura manual com Chrome DevTools** em vez de script automatizado: o app vazio (sem conteúdo curado) fica feio, e quem decide qual tela vende melhor é a curadoria.

### Passo a passo

1. Subir o site local com dados reais de demonstração:
   ```powershell
   npm run dev
   ```
2. Abrir `http://localhost:5173` no Chrome.
3. **F12** → ícone de dispositivo (Toggle Device Toolbar, `Ctrl+Shift+M`).
4. No topo, escolher **Responsive** → digitar `1080 × 1920`. Definir DPR = 1.
5. Navegar até a tela desejada com conteúdo real (séries com thumbs preenchidas, feed populado, player aberto, etc.).
6. Menu do DevTools (3 pontinhos do topo da toolbar) → **Capture screenshot** → salva PNG em 1080×1920.
7. Renomear e mover para `play-store-assets/screenshots/`.

### Telas sugeridas pra capturar

Pelo menos 3-4 das opções abaixo, escolhendo as que melhor representam:

- **Feed inicial** com pelo menos 4-5 séries com thumbs cinematográficas.
- **Player vertical** em destaque (tela cheia, controles visíveis, com título da obra).
- **Detalhe de série** mostrando descrição e lista de episódios.
- **Tela de canal/curadoria** se for um diferencial visual.
- **Tela de assinatura Premium** mostrando o paywall com benefícios.
- **Tema/identidade visual** — uma tela qualquer que dê o "look and feel".

### Boas práticas

- Status bar do navegador deve sumir (emulação Android no DevTools já faz isso).
- Evitar capturar telas com lorem ipsum / mock data óbvio.
- Se aparecer texto em inglês na UI, capturar variante em português também — Google permite screenshots por idioma.
- Verificar que nenhuma tela exibe e-mails reais de usuários ou tokens de teste.

## 8. Itens da Play Console que dependem só do Vin (informativo)

- Conta de Play Developer ativa.
- Verificação de identidade D-U-N-S (se for conta de empresa) ou doc pessoal (se for individual).
- Conta bancária pra recebimento de receita de Premium (não afeta o lançamento da versão free).
- Configuração do produto in-app `lorflux.premium.monthly` (ou nome equivalente) no Play Console — necessário para a rota `/mobile/verify-google` validar compras reais.
