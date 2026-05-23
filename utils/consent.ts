/**
 * Gestão de consentimento de cookies (LGPD).
 *
 * O script do Google AdSense (que grava cookies de rastreio/publicidade) NÃO é
 * mais carregado estaticamente no index.html. Ele só é injetado após o usuário
 * consentir explicitamente. Antes do consentimento, apenas anúncios próprios
 * (first-party, sem cookies de terceiros) podem ser exibidos.
 */

export type ConsentStatus = 'accepted' | 'rejected';

const CONSENT_KEY = 'lorflux_cookie_consent';
export const CONSENT_EVENT = 'lorflux-consent-change';
const ADSENSE_DEFAULT_CLIENT = 'ca-pub-5972610130504852';

interface ConsentRecord {
  status: ConsentStatus;
  date: string;
  version: number;
}

const POLICY_VERSION = 1;

export function getConsent(): ConsentStatus | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed: ConsentRecord = JSON.parse(raw);
    if (parsed.version !== POLICY_VERSION) return null; // re-consentir se a política mudou
    return parsed.status;
  } catch {
    return null;
  }
}

export function setConsent(status: ConsentStatus) {
  const record: ConsentRecord = { status, date: new Date().toISOString(), version: POLICY_VERSION };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  } catch { /* storage indisponível */ }

  if (status === 'accepted') loadAdSense();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: status }));
  }
}

export function hasAdConsent(): boolean {
  return getConsent() === 'accepted';
}

let adSenseLoaded = false;

/** Injeta o script do AdSense uma única vez, apenas com consentimento. */
export function loadAdSense(clientId: string = ADSENSE_DEFAULT_CLIENT) {
  if (adSenseLoaded || typeof document === 'undefined') return;
  if (!hasAdConsent()) return;
  if (document.querySelector('script[data-adsense="1"]')) { adSenseLoaded = true; return; }

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
  s.crossOrigin = 'anonymous';
  s.setAttribute('data-adsense', '1');
  document.head.appendChild(s);
  adSenseLoaded = true;
}

/** Carrega o AdSense automaticamente no boot se já houver consentimento. */
export function initConsent() {
  if (hasAdConsent()) loadAdSense();
}
