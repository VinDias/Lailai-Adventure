# Fase 4, Bloco 1 — dívida técnica registrada

Levantada durante a execução e a revisão final do Bloco 1 (progresso de leitura e
"Continuar"). Nada aqui bloqueia o uso da funcionalidade — foram itens conscientemente
adiados, com o motivo anotado. Registrados para não se perderem.

Ordenados por impacto.

## 1. Sem fila de reenvio quando a rede falha

O spec previa uma fila no `localStorage` para reter o progresso quando a gravação falha.
Não foi implementada. Hoje, se a rede cai no momento da gravação, o trecho lido se perde:
o `catch` apenas libera o limiar para a próxima tentativa, sem persistir nada.

Mitigado em parte pelo flush quando o app vai para segundo plano, mas o buraco continua
em conexão instável.

**Onde:** `hooks/useProgress.ts`

## 2. Leitor não tem o guarda de "quase no fim" que o player tem

O `VerticalPlayer` não retoma quando o progresso passa de 95% — ninguém quer voltar nos
créditos. O `WebtoonReader` não tem o equivalente: reabrir um capítulo já concluído joga
a página direto para o rodapé.

O comportamento já existia antes, mas passou a valer para qualquer capítulo depois que a
restauração ganhou rota dedicada (antes, capítulo concluído nem aparecia na lista).

**Onde:** `components/WebtoonReader.tsx` (a checagem simétrica está em
`components/VerticalPlayer.tsx`)

## 3. Barra nos cards herda a poda do carrossel

A barra de progresso dos cards do catálogo é alimentada pela mesma lista do carrossel, que
é podada de propósito. Consequência: obra parada há mais de 90 dias, VCine fora da faixa de
10–90%, obra concluída, ou a partir da 21ª, não mostram barra — embora sejam "obra já
iniciada" no sentido do spec.

Foi decisão consciente: a alternativa seria uma requisição por card. Se incomodar, o
caminho é uma rota que devolva só `{ seriesId, percent }` de todas as obras iniciadas,
sem as regras do carrossel.

**Onde:** `components/HQCine.tsx`, `HiQua.tsx`, `VFilm.tsx`

## 4. Limiares não são reiniciados ao trocar de episódio

`ultimoGravado` e `ultimaPosicaoGravada` atravessam a troca de episódio sem zerar. A
primeira gravação do episódio novo pode ser descartada por comparação com o valor do
anterior. O tick seguinte ou o flush de saída cobrem, então o efeito é atraso, não perda.

**Onde:** `hooks/useProgress.ts`

## 5. Gravação "ao pausar" o vídeo não existe

O spec pede gravação ao pausar. O `VerticalPlayer` trata o pause apenas como estado de
interface, sem reportar progresso. Na prática o intervalo de 10 segundos cobre quase todos
os casos.

**Onde:** `components/VerticalPlayer.tsx`

## 6. O ritmo de gravação é de borda inicial, não de borda final

O spec descreve "grava 3s depois que o scroll para". A implementação grava 3s depois do
**primeiro** scroll. A diferença é sutil e o resultado prático é equivalente na maior parte
do tempo, mas não é o que está escrito.

**Onde:** `hooks/useProgress.ts`

## 7. Acessibilidade da barra nos cards

No carrossel a barra vem acompanhada do percentual em texto; nos cards ela é apenas
`aria-hidden`, sem alternativa textual — o progresso fica invisível para leitor de tela.
Além disso, o contêiner mantém a margem mesmo quando a barra não é renderizada.

**Onde:** `components/ProgressBar.tsx` e os três arquivos de aba

## 8. Restauração não filtra obra despublicada

O carrossel passou a filtrar `isPublished`, mas a rota de progresso por episódio não —
então uma obra despublicada ainda restaura se o usuário chegar nela por outro caminho.
Inofensivo enquanto as rotas de conteúdo barrarem a abertura.

**Onde:** `services/progressService.js` (`getProgressForEpisode`)

## 9. Acoplamento de ordem entre testes

`tests/frontend/components.test.tsx` usa `mockReset()` e deixa um `mockResolvedValue`
vazar entre blocos de teste. Não quebra as asserções atuais, mas torna a suíte sensível à
ordem de execução.

**Onde:** `tests/frontend/components.test.tsx`

## 10. Reivindicação de histórico anônimo sem prova de posse

`POST /api/me/progress/claim` aceita o identificador do visitante pelo corpo da requisição,
sem exigir que ele bata com o cabeçalho `X-Anonymous-Id` da mesma requisição. Quem souber
um identificador alheio pode reivindicá-lo. O identificador não trafega para terceiros, então
o risco é baixo — mas o remédio são duas linhas, e vale aplicá-lo quando o arquivo for tocado.

**Onde:** `routes/progress.js`

## 11. Sessão expirada silenciosamente joga progresso no balde anônimo

Se o token de acesso expira, `optionalAuth` degrada sem erro e a gravação passa a usar o
identificador de visitante. Como a rota responde 200, o renovador automático do cliente
(que só dispara em 401) não roda. O progresso vai para o balde errado até o próximo login,
quando a migração o recupera.

**Onde:** `middlewares/optionalAuth.js` e `services/api.ts`
