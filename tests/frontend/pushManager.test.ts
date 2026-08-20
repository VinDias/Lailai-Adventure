/**
 * Testes unitários — utils/pushManager: registro/cancelamento de push neste
 * aparelho. Ponto crítico (lição do Bloco 1 com crypto.randomUUID quebrando o
 * TWA antigo): nenhuma função aqui pode lançar, mesmo sem suporte do navegador.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/api', () => ({
  api: {
    getPushPublicKey: vi.fn(),
    subscribePush: vi.fn(),
    unsubscribePush: vi.fn(),
    getPushStatus: vi.fn(),
  },
}));

import { api } from '../../services/api';
import { pushManager, urlBase64ToUint8Array } from '../../utils/pushManager';

const PUBLIC_KEY_B64URL = 'BEl62iUYgUivxIkv69yViEuiBIa40HI0DLLuxazjekWKgpV8DTflK8UkFTsr7Y5nT2SW-YwOu-oGb7O_JnbTLo0';

function stubNotification(permission: NotificationPermission, requestResult?: NotificationPermission) {
  const requestPermission = vi.fn().mockResolvedValue(requestResult ?? permission);
  vi.stubGlobal('Notification', { permission, requestPermission });
  return requestPermission;
}

function stubServiceWorker(subscribeImpl?: any, getSubscriptionImpl?: any) {
  const pushManagerMock = {
    subscribe: subscribeImpl ?? vi.fn(),
    getSubscription: getSubscriptionImpl ?? vi.fn().mockResolvedValue(null),
  };
  const registration = { pushManager: pushManagerMock };
  vi.stubGlobal('navigator', {
    ...globalThis.navigator,
    serviceWorker: { ready: Promise.resolve(registration) },
  });
  vi.stubGlobal('PushManager', function () {});
  return { pushManagerMock, registration };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('urlBase64ToUint8Array', () => {
  it('converte uma chave VAPID pública base64url válida sem lançar', () => {
    const bytes = urlBase64ToUint8Array(PUBLIC_KEY_B64URL);
    expect(bytes).toBeInstanceOf(Uint8Array);
    // Chave pública EC P-256 não comprimida: 0x04 + 64 bytes = 65 bytes.
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4);
  });

  it('lida com strings que exigem padding (tamanho não múltiplo de 4)', () => {
    // 'YQ' -> decodifica para 'a' (1 byte); exercita o padding de base64url.
    const bytes = urlBase64ToUint8Array('YQ');
    expect(Array.from(bytes)).toEqual([97]);
  });
});

describe('pushManager.isSupported', () => {
  it('false quando serviceWorker não existe em navigator', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('PushManager', function () {});
    vi.stubGlobal('Notification', function () {});
    expect(pushManager.isSupported()).toBe(false);
  });

  it('false quando PushManager não existe em window', () => {
    vi.stubGlobal('navigator', { serviceWorker: {} });
    vi.stubGlobal('Notification', function () {});
    expect(pushManager.isSupported()).toBe(false);
  });

  it('false quando Notification não existe', () => {
    vi.stubGlobal('navigator', { serviceWorker: {} });
    vi.stubGlobal('PushManager', function () {});
    expect(pushManager.isSupported()).toBe(false);
  });

  it('true quando as três APIs existem', () => {
    vi.stubGlobal('navigator', { serviceWorker: {} });
    vi.stubGlobal('PushManager', function () {});
    vi.stubGlobal('Notification', function () {});
    expect(pushManager.isSupported()).toBe(true);
  });
});

describe('pushManager.getPermission', () => {
  it('retorna "unsupported" sem a API Notification', () => {
    vi.stubGlobal('navigator', {});
    expect(pushManager.getPermission()).toBe('unsupported');
  });

  it('retorna Notification.permission quando suportado', () => {
    stubNotification('granted');
    expect(pushManager.getPermission()).toBe('granted');
  });
});

describe('pushManager.subscribeThisDevice', () => {
  it('sem suporte no navegador: resolve false sem lançar e sem chamar a API', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('PushManager', undefined);
    vi.stubGlobal('Notification', undefined);

    await expect(pushManager.subscribeThisDevice()).resolves.toBe(false);
    expect(api.subscribePush).not.toHaveBeenCalled();
  });

  it('permissão negada (já negada antes): resolve false sem pedir permissão de novo', async () => {
    stubServiceWorker();
    const requestPermission = stubNotification('denied');

    await expect(pushManager.subscribeThisDevice()).resolves.toBe(false);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(api.subscribePush).not.toHaveBeenCalled();
  });

  it('permissão default: pede a permissão antes de assinar; se o usuário negar, resolve false', async () => {
    stubServiceWorker();
    const requestPermission = stubNotification('default', 'denied');

    await expect(pushManager.subscribeThisDevice()).resolves.toBe(false);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(api.subscribePush).not.toHaveBeenCalled();
  });

  it('sem chave pública no servidor: resolve false sem chamar subscribe', async () => {
    const { pushManagerMock } = stubServiceWorker();
    stubNotification('granted');
    (api.getPushPublicKey as any).mockResolvedValue({ publicKey: null });

    await expect(pushManager.subscribeThisDevice()).resolves.toBe(false);
    expect(pushManagerMock.subscribe).not.toHaveBeenCalled();
  });

  it('fluxo feliz: assina o push e envia a subscription serializada para a API', async () => {
    const subscriptionJson = {
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    };
    const subscribe = vi.fn().mockResolvedValue({ toJSON: () => subscriptionJson });
    const { pushManagerMock } = stubServiceWorker(subscribe);
    stubNotification('granted');
    (api.getPushPublicKey as any).mockResolvedValue({ publicKey: PUBLIC_KEY_B64URL });
    (api.subscribePush as any).mockResolvedValue({ subscribed: true });

    await expect(pushManager.subscribeThisDevice()).resolves.toBe(true);

    expect(pushManagerMock.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) })
    );
    expect(api.subscribePush).toHaveBeenCalledWith(subscriptionJson);
  });

  it('nunca lança mesmo se a API rejeitar (ex.: rede fora do ar)', async () => {
    const subscriptionJson = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
    const subscribe = vi.fn().mockResolvedValue({ toJSON: () => subscriptionJson });
    stubServiceWorker(subscribe);
    stubNotification('granted');
    (api.getPushPublicKey as any).mockResolvedValue({ publicKey: PUBLIC_KEY_B64URL });
    (api.subscribePush as any).mockRejectedValue(new Error('rede fora do ar'));

    await expect(pushManager.subscribeThisDevice()).resolves.toBe(false);
  });

  it('nunca lança se pushManager.subscribe do navegador rejeitar', async () => {
    const subscribe = vi.fn().mockRejectedValue(new Error('AbortError'));
    stubServiceWorker(subscribe);
    stubNotification('granted');
    (api.getPushPublicKey as any).mockResolvedValue({ publicKey: PUBLIC_KEY_B64URL });

    await expect(pushManager.subscribeThisDevice()).resolves.toBe(false);
    expect(api.subscribePush).not.toHaveBeenCalled();
  });
});

describe('pushManager.unsubscribeThisDevice', () => {
  it('sem suporte: resolve false sem lançar', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('PushManager', undefined);
    vi.stubGlobal('Notification', undefined);
    await expect(pushManager.unsubscribeThisDevice()).resolves.toBe(false);
  });

  it('sem subscription ativa neste aparelho: resolve false sem chamar a API', async () => {
    stubServiceWorker(undefined, vi.fn().mockResolvedValue(null));
    stubNotification('granted');
    await expect(pushManager.unsubscribeThisDevice()).resolves.toBe(false);
    expect(api.unsubscribePush).not.toHaveBeenCalled();
  });

  it('fluxo feliz: chama sub.unsubscribe() E api.unsubscribePush(endpoint)', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const subscription = { endpoint: 'https://push.example/abc', unsubscribe };
    stubServiceWorker(undefined, vi.fn().mockResolvedValue(subscription));
    stubNotification('granted');
    (api.unsubscribePush as any).mockResolvedValue({ removed: 1 });

    await expect(pushManager.unsubscribeThisDevice()).resolves.toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(api.unsubscribePush).toHaveBeenCalledWith('https://push.example/abc');
  });

  it('se sub.unsubscribe() falhar, ainda tenta remover no servidor (sem lançar)', async () => {
    const unsubscribe = vi.fn().mockRejectedValue(new Error('falhou local'));
    const subscription = { endpoint: 'https://push.example/abc', unsubscribe };
    stubServiceWorker(undefined, vi.fn().mockResolvedValue(subscription));
    stubNotification('granted');
    (api.unsubscribePush as any).mockResolvedValue({ removed: 1 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(pushManager.unsubscribeThisDevice()).resolves.toBe(true);
    expect(api.unsubscribePush).toHaveBeenCalledWith('https://push.example/abc');
    expect(warn).toHaveBeenCalled();
  });

  it('se api.unsubscribePush falhar, ainda tenta cancelar localmente (sem lançar)', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const subscription = { endpoint: 'https://push.example/abc', unsubscribe };
    stubServiceWorker(undefined, vi.fn().mockResolvedValue(subscription));
    stubNotification('granted');
    (api.unsubscribePush as any).mockRejectedValue(new Error('rede fora do ar'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(pushManager.unsubscribeThisDevice()).resolves.toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });

  it('se ambos falharem, resolve false sem lançar e loga', async () => {
    const unsubscribe = vi.fn().mockRejectedValue(new Error('falhou local'));
    const subscription = { endpoint: 'https://push.example/abc', unsubscribe };
    stubServiceWorker(undefined, vi.fn().mockResolvedValue(subscription));
    stubNotification('granted');
    (api.unsubscribePush as any).mockRejectedValue(new Error('rede fora do ar'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(pushManager.unsubscribeThisDevice()).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe('pushManager.getStatus', () => {
  it('sem suporte: resolve null sem lançar', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('PushManager', undefined);
    vi.stubGlobal('Notification', undefined);
    await expect(pushManager.getStatus()).resolves.toBeNull();
  });

  it('sem subscription neste aparelho: consulta a API com endpoint vazio', async () => {
    stubServiceWorker(undefined, vi.fn().mockResolvedValue(null));
    stubNotification('granted');
    (api.getPushStatus as any).mockResolvedValue({ thisDevice: false, anyDevice: true });

    const status = await pushManager.getStatus();
    expect(status).toEqual({ thisDevice: false, anyDevice: true });
    expect(api.getPushStatus).toHaveBeenCalledWith('');
  });

  it('com subscription: consulta a API pelo endpoint deste aparelho', async () => {
    const subscription = { endpoint: 'https://push.example/abc' };
    stubServiceWorker(undefined, vi.fn().mockResolvedValue(subscription));
    stubNotification('granted');
    (api.getPushStatus as any).mockResolvedValue({ thisDevice: true, anyDevice: true });

    const status = await pushManager.getStatus();
    expect(status).toEqual({ thisDevice: true, anyDevice: true });
    expect(api.getPushStatus).toHaveBeenCalledWith('https://push.example/abc');
  });

  it('nunca lança se a API falhar', async () => {
    stubServiceWorker(undefined, vi.fn().mockResolvedValue(null));
    stubNotification('granted');
    (api.getPushStatus as any).mockRejectedValue(new Error('rede fora do ar'));

    await expect(pushManager.getStatus()).resolves.toBeNull();
  });
});
