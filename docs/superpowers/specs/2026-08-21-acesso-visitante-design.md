# Acesso sem conta (modo visitante)

**Pedido do cliente em 21/08/2026, dia da publicação na Play Store:** "A única
coisa que não está acontecendo é ver as obras sem conta. Não existe forma de
pular essa etapa se o leitor quiser."

## Situação

O app sempre exigiu login: `App.tsx` nasce em `ViewMode.AUTH` e só sai dali
por `handleLogin` ou sessão restaurada. O backend e os componentes JÁ tratam
visitante (Fase 4 construiu de propósito): `user: User | null` nos feeds,
player e leitor; progresso anônimo via `X-Anonymous-Id` com migração no
login (`migrarProgressoDoVisitante`); recomendações anônimas; convite de
login no `SuperReaderButton`; `PushPrompt` só com conta. Falta o portão.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Entrada | Botão secundário **"Explorar sem conta"** na tela de login (modo login) → `onGuest` | É o que o cliente pediu: poder pular |
| Persistência | Flag `lorflux_guest` em `localStorage` (helper `utils/guestMode.ts` com try/catch, padrão das outras flags) | Quem escolheu explorar não deve bater na parede de login a cada reabertura do app |
| Boot | Sem sessão restaurada E flag de visitante → `HQCINE` direto (sem flash da tela de login) | Mesma experiência de sessão restaurada |
| Login a partir do visitante | `handleLogin` já migra o progresso anônimo; passa a LIMPAR a flag | A conta substitui o modo visitante |
| Logout / exclusão de conta | Limpam a flag e voltam ao `AUTH` | Quem saiu explicitamente espera a tela de entrada (com o botão de explorar disponível) |
| Aba Conta do visitante | Componente `GuestAccountPrompt`: explica o que a conta libera (favoritos, avisos de capítulo, apoio ao autor, progresso guardado) + botão **"Entrar ou criar conta"** → `setView(AUTH)`; mantém o seletor de idioma e os links de privacidade/termos | A aba Conta é a porta natural para converter o visitante; nada do perfil real (avatar, Premium, favoritos, push) faz sentido sem conta |
| Premium / anúncios | Visitante = usuário sem Premium (anúncios ligados, selos visuais) — caminho que já existe | Nenhum paywall novo; o checkout do Premium fica atrás do login, como hoje |
| Favoritar / curtir / push / Super Reader | Comportamento atual para `user: null` (desabilitado em silêncio; SR mostra convite; push não aparece) | Fora do escopo alinhar tudo ao convite explícito — dívida cosmética já registrada no Bloco 3 |
| Deep link de push para visitante | Ignorado (o `useEffect([user])` não consome sem `user`) | Push exige conta; não há deep link legítimo para visitante |
| Onboarding | `handleGuest` mostra o onboarding se nunca visto (igual ao login) | Mesma primeira impressão |
| i18n | `auth.exploreGuest`, `guest.title`, `guest.body`, `guest.cta` nos 4 idiomas | Padrão do projeto |

## Testes

Auth: botão de visitante aparece no modo login e chama `onGuest`; não aparece
nos modos cadastro/recuperação (ou aparece — decidir e testar).
`utils/guestMode`: set/clear/read com `localStorage` indisponível não lança.
`GuestAccountPrompt`: renderiza o CTA e chama `onLogin`. Suíte frontend
inteira verde + `tsc`. Teste local no app real: explorar sem conta → feed →
abrir obra → ler/assistir → Conta mostra o convite → entrar → progresso do
visitante migrado para a conta.
