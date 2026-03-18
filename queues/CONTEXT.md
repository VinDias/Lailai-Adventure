# queues/

## Responsabilidade

Configuração das filas de processamento assíncrono usando **BullMQ** com **Redis** como broker. Permite executar tarefas pesadas (como transcodificação de vídeo) em background sem bloquear as requisições HTTP.

---

## Arquivos

### `videoQueue.js`
Define a fila `videoQueue` para processamento de vídeos.
- Conecta ao Redis via `REDIS_URL` do `.env`
- Configura estratégia de retry com **backoff exponencial**: 3 tentativas antes de mover o job para a fila de falhas
- Exporta a instância da fila para ser usada tanto para enfileirar jobs (nas rotas) quanto para processar (nos workers)

---

## Fluxo

```
Upload de vídeo (via AdminDashboard)
    → Job adicionado à videoQueue
    → Worker (workers/videoWorker.js) pega o job
    → transcodeService.js executa a transcodificação
    → Resultado salvo no MongoDB (Episode.transcodingStatus)
```

## Observações

- Redis deve estar rodando e acessível via `REDIS_URL` para o sistema de filas funcionar
- Em caso de falha, o BullMQ faz retry automático com backoff exponencial (evita sobrecarga do servidor)
- Jobs falhos após 3 tentativas ficam na fila `failed` do BullMQ para análise manual
