const GUEST_STORAGE_KEY = 'lorflux_guest';

/**
 * Modo visitante: flag em localStorage que lembra "esse leitor escolheu
 * explorar sem conta" entre reaberturas do app (mesmo padrão de
 * utils/anonymousId.ts e components/PushPrompt.tsx — nunca lança,
 * storage indisponível degrada em silêncio).
 */
export function isGuestMode(): boolean {
  try {
    return localStorage.getItem(GUEST_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function enterGuestMode(): void {
  try {
    localStorage.setItem(GUEST_STORAGE_KEY, '1');
  } catch {
    // Storage indisponível — sem flag persistida, a sessão segue como visitante
    // só até o app fechar (sem risco: o guard do App volta pra tela de login).
  }
}

export function leaveGuestMode(): void {
  try {
    localStorage.removeItem(GUEST_STORAGE_KEY);
  } catch {
    // Storage indisponível — nada para limpar.
  }
}
