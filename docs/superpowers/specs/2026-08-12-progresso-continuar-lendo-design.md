# Bloco 1 — Progresso de leitura e "Continuar"

**Fase 4 do Lorflux · aprovado por Fellipe em 12/08/2026**

## Objetivo

Registrar automaticamente onde o usuário parou em qualquer conteúdo e trazê-lo de
volta a esse ponto — no painel do webtoon ou no segundo exato do vídeo — com
sincronização entre dispositivos pela conta.

É o primeiro dos quatro blocos da Fase 4. Entrega valor sozinho (é a função mais
pedida em app de leitura) e produz os dados de **retenção** e **afinidade** que o
algoritmo de recomendação do Bloco 4 consome. Sem este bloco, o algoritmo nasce
cego para dois dos cinco pesos confirmados pelo cliente.

## Decisões tomadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Onde aparece | Carrossel "Continuar" no topo de cada aba (HQCine, VCine, Hi-Qua) + barra de progresso nos cards do catálogo | Padrão de Webtoon e Netflix; o usuário abre o app e a primeira coisa que vê é o que deixou pela metade |
| Usuário deslogado | Progresso no aparelho, migrado para a conta ao criar conta ou entrar | Ninguém perde progresso, e vira argumento natural para criar conta — conta gera o dado de afinidade que o algoritmo precisa |
| Saída do carrossel | Ao concluir o último capítulo publicado; volta sozinha quando sai capítulo novo | Casa com a notificação do Bloco 2: o usuário recebe o aviso, abre o app e a obra já está esperando |

## Modelo de dados

Coleção nova `ReadingProgress`, **um documento por (usuário, episódio)**:

```js
{
  userId:      ObjectId,  // ref User
  seriesId:    ObjectId,  // ref Series — denormalizado para o carrossel
  episodeId:   ObjectId,  // ref Episode
  contentType: String,    // 'hqcine' | 'vcine' | 'hiqua'
  position:    Number,    // segundos de reprodução — só vídeo
  percent:     Number,    // 0..1 — a barrinha, o rótulo "62%" e a volta no webtoon
  completed:   Boolean,   // true quando percent >= 0.9
  updatedAt:   Date,
}
```

Índices:

- `{ userId: 1, episodeId: 1 }` **único** — um registro por episódio por usuário
- `{ userId: 1, updatedAt: -1 }` — monta o carrossel
- `{ userId: 1, seriesId: 1, updatedAt: -1 }` — resolve "qual episódio continuar"

**Por que por episódio e não por obra:** é o que permite saber quais capítulos já
foram lidos, detectar "terminou o último publicado" e alimentar o percentual de
leitura por capítulo. Guardar só por obra economizaria documentos, mas custaria as
três coisas.

`completed` a 90% (e não 100%) porque créditos finais e rodapés fazem quase ninguém
chegar ao fim absoluto.

## Gravação

Escrita com folga, para não sobrecarregar o Mongo quando a base crescer:

| Conteúdo | Quando grava |
|---|---|
| Vídeo | a cada 10s de reprodução, ao pausar e ao sair |
| Webtoon | 3s depois que o scroll para, e ao sair |

Descarta a escrita se a mudança for menor que 5 segundos ou 2% — evita gravar
repetidamente a mesma posição quando o usuário está parado.

## API

| Rota | Função |
|---|---|
| `PUT /api/me/progress` | Salva o progresso de um episódio |
| `GET /api/me/continue` | Devolve o carrossel, já ordenado e podado |
| `POST /api/me/progress/merge` | Funde o progresso do aparelho na conta, no login |

Todas exigem autenticação. O deslogado usa apenas `localStorage`.

**Regra da fusão:** para cada episódio presente nos dois lados, vence o registro
com maior `percent`. É mais seguro que vencer por data: se o usuário leu mais no
celular ontem e abriu o app no desktop hoje sem ler nada, o progresso maior é o que
representa a verdade.

## Interface

- `ContinueCarousel` — carrossel no topo de cada aba, com capa, nome do capítulo,
  percentual e barra
- Barra fina de progresso nos cards do catálogo, só em obra já iniciada
- Restauração automática: `VerticalPlayer` posiciona `videoRef.current.currentTime`
  com `position`; `WebtoonReader` volta por **percentual** —
  `scrollTop = scrollHeight * percent`, e não por pixels salvos

  A distinção importa: pixel de scroll depende da largura da tela. Quem lê no
  celular e continua no tablet cairia no lugar errado se guardássemos `scrollTop`
  absoluto. O percentual atravessa qualquer tamanho de tela.
- Hook `useProgress()` centraliza gravação, leitura e a fila do `localStorage`

Pontos de engate já existem no código: o player tem `videoRef`, estado `currentTime`
e listener de `timeupdate`; o leitor tem `scrollRef` e `handleScroll`.

## Regras do carrossel

1. Ordena por `updatedAt` decrescente
2. Uma linha por obra — o episódio mais recente com progresso
3. Remove a obra quando o último episódio publicado está `completed`
4. A obra volta sozinha quando um episódio novo é publicado
5. Teto de 20 obras; poda o que passou de 90 dias sem toque
6. **VCine:** mostra apenas o que está entre 10% e 90% — vídeo vertical curto é
   consumo de rolagem, e sem esse filtro o carrossel viraria lista de tudo que
   passou pela tela

## LGPD

Histórico de leitura é dado pessoal. Entra no export e na exclusão de conta que já
existem no Centro de Privacidade (`components/PrivacyCenter.tsx` e a rota
`DELETE /api/account/me`). A poda de 90 dias também limita a retenção por padrão.

## Testes (antes do código)

**Backend**

- salva progresso novo e atualiza o existente sem duplicar
- rejeita `percent` fora de 0..1 e `position` negativa
- marca `completed` a partir de 90%
- carrossel vem ordenado por atualização, uma linha por obra
- obra sai do carrossel ao concluir o último episódio publicado
- obra volta ao carrossel quando um episódio novo é publicado
- respeita o teto de 20 e a poda de 90 dias
- fusão mantém o maior `percent` de cada episódio
- progresso de um usuário nunca aparece para outro
- exclusão de conta remove o progresso

**Frontend**

- `useProgress` respeita o intervalo de gravação e o limiar de mudança
- carrossel não renderiza para quem não tem progresso
- barra aparece só em obra iniciada
- player restaura pelo segundo salvo
- leitor restaura por percentual e cai no mesmo ponto relativo em telas de
  larguras diferentes

## Fora de escopo deste bloco

Notificação de capítulo novo (Bloco 2), agenda de lançamentos (Bloco 2), Super
Reader (Bloco 3), tags e motor de score (Bloco 4). O que este bloco garante é que,
quando o Bloco 4 chegar, os dados de retenção e afinidade já existam com histórico.

## Limitação conhecida

O percentual em webtoon é medido por posição de scroll, não por painéis lidos. Em
capítulos com imagens de alturas muito diferentes o número oscila um pouco. É o
mesmo método de Webtoon e Tapas; não convém prometer precisão exata ao cliente.
