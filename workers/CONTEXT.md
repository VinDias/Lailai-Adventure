# workers/

## Responsabilidade

Processadores de jobs em background. Consomem as filas do BullMQ e executam tarefas assíncronas sem impactar a performance das requisições HTTP.

---

## Arquivos

### `videoWorker.js`
Worker de transcodificação de vídeo.
- Consome jobs da fila `videoQueue` (definida em `queues/videoQueue.js`)
- Para cada job, chama o `transcodeService.js` para converter o vídeo para formato HLS
- Após transcodificação bem-sucedida, **remove o arquivo de entrada** do disco (limpeza automática)
- Concorrência configurável via variável de ambiente `WORKER_CONCURRENCY` (padrão: 2 workers simultâneos)
- Registra erros e sucessos via `utils/logger.js`

---

## Execução

O worker é um **processo separado** do servidor Express:

```bash
npm run worker  # desenvolvimento
```

Em produção, o PM2 (`ecosystem.config.js`) gerencia o worker como um segundo processo independente do app principal.

---

## Observações

- O worker deve ter acesso ao mesmo Redis que o servidor Express para consumir os jobs corretamente
- Aumentar `WORKER_CONCURRENCY` exige mais CPU/memória do servidor — ajuste conforme a capacidade de hardware
- O PM2 reinicia o worker automaticamente em caso de crash
