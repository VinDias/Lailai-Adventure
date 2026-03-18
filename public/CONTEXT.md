# public/

## Responsabilidade

Assets estáticos servidos diretamente pelo servidor sem processamento. Contém os recursos necessários para o funcionamento do PWA (Progressive Web App).

---

## Estrutura

```
public/
├── icons/
│   ├── icon-192.png          # Ícone padrão PWA (192x192)
│   ├── icon-512.png          # Ícone PWA em alta resolução (512x512)
│   └── icon-maskable-512.png # Ícone adaptativo para Android (com área segura)
└── service-worker.js         # Service Worker do PWA
```

---

## Arquivos

### `icons/`
Ícones do app para instalação como PWA em dispositivos móveis e desktop.
- `icon-192.png` — usado em notificações e na tela inicial em resoluções menores
- `icon-512.png` — usado em splash screens e na tela inicial em alta resolução
- `icon-maskable-512.png` — ícone no formato maskable para Android, permite que o SO aplique formas personalizadas (círculo, squircle, etc.)
- Todos com branding real da Lorflux

### `service-worker.js`
Service Worker que habilita as funcionalidades de PWA:
- **Cache de assets** para funcionamento offline
- **Estratégia de cache** para recursos da aplicação
- **Push notifications** (suporte para notificações no dispositivo)
- Registrado automaticamente pelo `src/index.tsx` ao carregar a aplicação

---

## Observações

- O `manifest.json` na raiz do projeto referencia os ícones desta pasta e define as configurações de instalação do PWA (nome, cores, orientação)
- Em produção, o Express serve os arquivos desta pasta como estáticos
- O Vite copia automaticamente o conteúdo de `public/` para o diretório de build
