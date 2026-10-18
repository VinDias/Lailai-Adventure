# Regressões

Bug corrigido que volta é o problema que mais se repete. Esta tabela diz, para
cada conserto, qual teste impede a volta dele.

Suíte inteira do projeto: `npm run test:all` (frontend com jsdom + backend com
mongodb-memory-server). Sai diferente de 0 se algo falhar.

Procedimento: skill `/regressao`. Em resumo, conserto só termina com um teste
que falha sem a correção, e a prova de que ele falha é feita numa **cópia** do
projeto no scratchpad com o bug reintroduzido, nunca com `git stash`,
`git checkout` ou `git reset` (este clone tem arquivos de trabalho que só
existem aqui).

| Commit | Data | Bug | Teste que protege | Status |
|---|---|---|---|---|
| `9471736` | 13/10/2026 | O botão "ASSINAR PREMIUM" da aba Conta mostrava `R$ 3,99`, valor fixo de `utils/localizedPrice.ts`, enquanto o preço real não chegava, e ficava nele de vez se `GET /api/payment/precos` falhasse. O Stripe cobrava `R$ 4,90`: a tela anunciava menos do que seria cobrado | `tests/frontend/appPrecoAssinarBotao.test.tsx` | coberto-novo |

## Notas

**`9471736` foi a segunda vez.** O `517bb54` (24/09/2026, "preço real no
botão") é que introduziu o `precoPremium ?? getLocalizedPrice()` e, no mesmo
commit, acrescentou a três testes de tela o falso
`getPrecosPremium -> { precos: {} }` — exatamente o caso em que o valor de
reserva aparece. Nenhum teste olhava o texto do botão, então a suíte ficou
verde exercitando o caminho do defeito. É por isso que o teste novo cobre os
DOIS lados: sem preço do servidor o botão não mostra valor nenhum, e com preço
do servidor mostra o valor recebido. Só a primeira metade permitiria "passar"
apagando o preço para sempre.

**Duas cópias do mesmo defeito seguem no repositório, desligadas.**
`components/SubscriptionTab.tsx:33` exibe o valor fixo de
`utils/localizedPrice.ts` e `components/Premium.tsx:103,124` exibe
`premium_price_display`, campo digitado no painel do admin que nada mantém
igual ao Stripe. Hoje nenhuma tela importa esses dois componentes, então eles
não mentem para ninguém e não dá para testá-los rodando. A trava é estática, no
mesmo arquivo de teste: se alguém voltar a importar um deles, o teste quebra
dizendo para trocar a fonte do preço antes. O campo "Preço Premium (exibição)"
do painel do admin é, pelo mesmo motivo, inerte: quem o preenche pensa que
mudou o preço e não mudou nada. Remover os dois componentes e o campo está
pendente de decisão do Fellipe (é UI que o cliente vê).

## O que ainda não foi levantado

Esta tabela começou em 18/10/2026 e cobre **só** o conserto acima. O passivo
dos consertos anteriores (`git log --grep='^fix'` tem vários, das Fases 2 a 6)
não foi inventariado. Para pagar esse passivo, modo 2 da skill `/regressao`:
reintroduzir cada bug numa cópia e ver se algum teste existente pega, antes de
escrever teste novo.
