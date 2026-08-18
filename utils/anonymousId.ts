export const ANON_STORAGE_KEY = 'lorflux_anonymous_id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Formata 16 bytes como UUID v4, ajustando os bits de versão e variante. */
function bytesParaUuidV4(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versão 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante 10xx
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 16 bytes aleatórios. Usa crypto.getRandomValues quando disponível (suportado desde
 * muito antes de crypto.randomUUID, cobertura praticamente universal); se nem isso
 * existir, cai para Math.random. Aqui a aleatoriedade não precisa ser criptográfica —
 * é só um identificador de visitante, não um segredo — e um id previsível é
 * infinitamente melhor do que deixar a função lançar.
 */
function gerarBytesAleatorios(): Uint8Array {
  const bytes = new Uint8Array(16);
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
      return bytes;
    }
  } catch {
    // segue para o último recurso abaixo
  }
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/**
 * Gera um UUID v4. Prioriza crypto.randomUUID — nativo e mais rápido —, mas nunca
 * depende só dele: o app roda como TWA (Trusted Web Activity), então executa dentro
 * do Chrome instalado no aparelho do usuário, e crypto.randomUUID só existe a partir
 * do Chrome 92 (2021) e exige contexto seguro. Em aparelho com Chrome desatualizado, a
 * função simplesmente não existe — daí o fallback via crypto.getRandomValues/Math.random.
 */
function gerarUuidV4(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // segue para o fallback abaixo
  }
  return bytesParaUuidV4(gerarBytesAleatorios());
}

/**
 * Identificador do visitante sem conta, usado para guardar o progresso de leitura
 * no servidor antes do cadastro.
 *
 * É um UUID sorteado, guardado no navegador — de propósito, e não uma impressão
 * digital de dispositivo: assim o usuário se livra dele limpando os dados do
 * navegador, o que mantém a coleta dentro do que a LGPD espera.
 *
 * Nunca lança: esta função roda em toda chamada de API (services/api.ts injeta o
 * cabeçalho X-Anonymous-Id em request()), então uma exceção aqui derrubaria o app
 * inteiro em modo "offline" — não só o progresso de leitura.
 */
export function getAnonymousId(): string {
  try {
    const guardado = localStorage.getItem(ANON_STORAGE_KEY);
    if (guardado && UUID_V4.test(guardado)) return guardado;

    const novo = gerarUuidV4();
    localStorage.setItem(ANON_STORAGE_KEY, novo);
    return novo;
  } catch {
    // Navegação privada com storage bloqueado: identificador só desta sessão.
    return gerarUuidV4();
  }
}
