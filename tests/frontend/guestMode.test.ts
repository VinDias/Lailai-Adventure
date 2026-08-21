/**
 * Testes — utils/guestMode.ts (modo visitante, Fase "acesso sem conta").
 * Mesmo padrão de robustez das outras flags em localStorage do projeto
 * (utils/anonymousId.ts, components/PushPrompt.tsx): nunca lança, mesmo com
 * storage indisponível.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isGuestMode, enterGuestMode, leaveGuestMode } from '../../utils/guestMode';

beforeEach(() => {
  localStorage.clear();
});

describe('guestMode', () => {
  it('isGuestMode() começa false', () => {
    expect(isGuestMode()).toBe(false);
  });

  it('enterGuestMode() grava a flag e isGuestMode() passa a true', () => {
    enterGuestMode();
    expect(isGuestMode()).toBe(true);
    expect(localStorage.getItem('lorflux_guest')).toBe('1');
  });

  it('leaveGuestMode() limpa a flag e isGuestMode() volta a false', () => {
    enterGuestMode();
    leaveGuestMode();
    expect(isGuestMode()).toBe(false);
    expect(localStorage.getItem('lorflux_guest')).toBeNull();
  });

  it('leaveGuestMode() sem flag prévia não lança', () => {
    expect(() => leaveGuestMode()).not.toThrow();
    expect(isGuestMode()).toBe(false);
  });

  describe('localStorage indisponível', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('isGuestMode() com getItem lançando: não lança e devolve false', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage indisponível');
      });
      expect(() => isGuestMode()).not.toThrow();
      expect(isGuestMode()).toBe(false);
    });

    it('enterGuestMode() com setItem lançando: não lança', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('storage indisponível');
      });
      expect(() => enterGuestMode()).not.toThrow();
    });

    it('leaveGuestMode() com removeItem lançando: não lança', () => {
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('storage indisponível');
      });
      expect(() => leaveGuestMode()).not.toThrow();
    });
  });
});
