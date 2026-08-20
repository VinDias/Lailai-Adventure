// Estratégia anti-stale:
//  - Navegações (index.html): network-first — o aparelho nunca fica preso num
//    build velho (bug clássico do SW antigo cache-first, que já prendeu
//    testadores em versões antigas do app).
//  - /assets/ do Vite: cache-first (nomes com hash são imutáveis).
//  - Demais GETs same-origin: network com fallback ao cache (suporte offline).
// Bump em VERSION invalida todos os caches antigos no activate.
const VERSION = "v3";
const RUNTIME_CACHE = `lorflux-${VERSION}`;
// Cada deploy do Vite gera hashes novos em /assets/; sem poda, os bundles de
// builds antigos acumulariam no storage do aparelho a cada release.
const MAX_ASSET_ENTRIES = 40;

function pruneAssets(cache) {
  return cache.keys().then(keys => {
    const assets = keys.filter(k => new URL(k.url).pathname.startsWith("/assets/"));
    if (assets.length <= MAX_ASSET_ENTRIES) return;
    // cache.keys() preserva a ordem de inserção: remove os mais antigos.
    return Promise.all(
      assets.slice(0, assets.length - MAX_ASSET_ENTRIES).map(k => cache.delete(k))
    );
  });
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n !== RUNTIME_CACHE).map(n => caches.delete(n))
      ))
      // Assume o controle das abas abertas já nesta ativação — sem isso o SW
      // novo só passa a valer no próximo load completo do app.
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Cross-origin (CDN de mídia, fontes, AdSense): deixa o navegador decidir.
  if (url.origin !== self.location.origin) return;

  // Nunca cachear API, rotas de autenticação, admin, stripe ou mídia local
  if (
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/auth") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/stripe") ||
    url.pathname.startsWith("/uploads")
  ) {
    return;
  }

  // Navegações: network-first, cache como fallback offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(resp => {
          // Não cachear respostas redirecionadas: o Chrome rejeita servir uma
          // response com redirect a partir do SW para uma navegação.
          if (resp.ok && !resp.redirected) {
            const copy = resp.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(request, copy));
          }
          return resp;
        })
        .catch(() =>
          caches.match(request).then(r => r || caches.match("/"))
        )
    );
    return;
  }

  // Assets hasheados do Vite: imutáveis, cache-first
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(cached =>
        cached || fetch(request).then(resp => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(RUNTIME_CACHE).then(c =>
              c.put(request, copy).then(() => pruneAssets(c))
            );
          }
          return resp;
        })
      )
    );
    return;
  }

  // Demais GETs same-origin (manifest, ícones): rede com fallback ao cache
  event.respondWith(
    fetch(request)
      .then(resp => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(request, copy));
        }
        return resp;
      })
      .catch(() => caches.match(request))
  );
});

// ─── Fase 4 Bloco 2: push (notificação de capítulo novo) ───────────────────
// Payload enviado pelo servidor (services/notificationService.js), sempre
// JSON: { title, body, url, tag }. Sem body no evento (algumas plataformas
// mandam push "silencioso") não há o que mostrar — ignora.
self.addEventListener("push", event => {
  if (!event.data) return;
  let dados;
  try {
    dados = event.data.json();
  } catch {
    // Payload que não é JSON válido: nada a mostrar, mas não derruba o SW.
    return;
  }
  event.waitUntil(
    self.registration.showNotification(dados.title || "Lorflux", {
      body: dados.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: dados.tag || undefined,
      data: { url: dados.url || "/" },
    })
  );
});

// Clique na notificação: foca uma aba já aberta do app (navegando para o
// destino) ou, sem aba aberta nem suporte a navigate(), abre uma nova janela.
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ("focus" in c) {
          // Nem todo client suporta navigate() (ex.: navegadores antigos do TWA) —
          // sem ele, focar a aba deixaria o usuário na URL errada.
          if ("navigate" in c) {
            // navigate() pode rejeitar (ex.: aba fechou entre matchAll() e aqui) —
            // sem o catch, isso vira unhandled rejection solto no console do SW.
            return c.navigate(url).then(() => c.focus()).catch(() => c.focus());
          }
          return clients.openWindow(url);
        }
      }
      return clients.openWindow(url);
    })
  );
});
