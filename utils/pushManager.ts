/**
 * Push neste aparelho (registro/cancelamento/status). O app roda como TWA —
 * Chrome instalado no aparelho do usuário, versões variadas — então, como em
 * utils/anonymousId.ts (lição do Bloco 1: crypto.randomUUID quebrou em TWA
 * antigo), NENHUMA função aqui pode lançar: cada uma checa a existência de
 * cada API do navegador antes de usá-la e resolve false/null em qualquer
 * falha, só logando um aviso. Uma falha de push nunca pode derrubar o app.
 */
import { api } from '../services/api';

export type PushStatus = { thisDevice: boolean; anyDevice: boolean };

function suporteServiceWorker(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

function suportePushManager(): boolean {
  return typeof window !== 'undefined' && 'PushManager' in window;
}

function suporteNotification(): boolean {
  return typeof window !== 'undefined' ? 'Notification' in window : typeof Notification !== 'undefined';
}

/** As três APIs precisam existir — checadas uma a uma, nunca um atalho combinado. */
function isSupported(): boolean {
  try {
    return suporteServiceWorker() && suportePushManager() && suporteNotification();
  } catch {
    return false;
  }
}

function getPermission(): NotificationPermission | 'unsupported' {
  try {
    if (!suporteNotification()) return 'unsupported';
    return Notification.permission;
  } catch {
    return 'unsupported';
  }
}

/**
 * Converte a chave pública VAPID (base64url, como o servidor manda) para o
 * Uint8Array que `PushManager.subscribe({ applicationServerKey })` exige.
 * Implementação clássica (MDN/web-push): reaplica o padding '=' que a
 * variante url-safe do base64 costuma vir sem.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Assina o push neste aparelho: pede permissão se ainda não foi perguntado,
 * busca a chave pública do servidor, assina via PushManager e registra a
 * subscription na API. Qualquer etapa que falhar resolve false (loga, não lança).
 */
async function subscribeThisDevice(): Promise<boolean> {
  try {
    if (!isSupported()) return false;

    if (Notification.permission === 'default') {
      const resultado = await Notification.requestPermission();
      if (resultado !== 'granted') return false;
    } else if (Notification.permission !== 'granted') {
      // Já negado anteriormente — não insiste (o navegador nem reabriria o prompt).
      return false;
    }

    const { publicKey } = await api.getPushPublicKey();
    if (!publicKey) return false;

    const registration = await navigator.serviceWorker.ready;
    // Cast por incompatibilidade de tipos DOM/TS (Uint8Array<ArrayBufferLike> vs.
    // BufferSource) — comum nesta combinação de versões; o valor em si está correto.
    const applicationServerKey = urlBase64ToUint8Array(publicKey) as BufferSource;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    await api.subscribePush(subscription.toJSON() as any);
    return true;
  } catch (err) {
    console.warn('[Lorflux] pushManager.subscribeThisDevice falhou:', err);
    return false;
  }
}

/**
 * Cancela o push neste aparelho: cancela local (browser) e remove no servidor.
 * As duas chamadas são independentes de propósito — se uma falhar, ainda
 * tenta a outra (best-effort) e loga, para nunca deixar um lado silenciosamente
 * inconsistente com o outro.
 */
async function unsubscribeThisDevice(): Promise<boolean> {
  try {
    if (!isSupported()) return false;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return false;

    const endpoint = subscription.endpoint;
    let canceladoLocal = false;
    let removidoNoServidor = false;

    try {
      canceladoLocal = await subscription.unsubscribe();
    } catch (err) {
      console.warn('[Lorflux] pushManager.unsubscribeThisDevice: falha ao cancelar localmente:', err);
    }

    try {
      await api.unsubscribePush(endpoint);
      removidoNoServidor = true;
    } catch (err) {
      console.warn('[Lorflux] pushManager.unsubscribeThisDevice: falha ao remover no servidor:', err);
    }

    return canceladoLocal || removidoNoServidor;
  } catch (err) {
    console.warn('[Lorflux] pushManager.unsubscribeThisDevice falhou:', err);
    return false;
  }
}

/**
 * Status do push: se este aparelho está inscrito e se o usuário tem alguma
 * inscrição (em qualquer aparelho). Usado pelo toggle da Conta. Sem
 * subscription local, ainda consulta a API (endpoint vazio) — o servidor
 * responde `anyDevice` independente disso.
 */
async function getStatus(): Promise<PushStatus | null> {
  try {
    if (!isSupported()) return null;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    const endpoint = subscription?.endpoint ?? '';

    return await api.getPushStatus(endpoint);
  } catch (err) {
    console.warn('[Lorflux] pushManager.getStatus falhou:', err);
    return null;
  }
}

export const pushManager = {
  isSupported,
  getPermission,
  subscribeThisDevice,
  unsubscribeThisDevice,
  getStatus,
};
