export const ANON_STORAGE_KEY = 'lorflux_anonymous_id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Identificador do visitante sem conta, usado para guardar o progresso de leitura
 * no servidor antes do cadastro.
 *
 * É um UUID sorteado, guardado no navegador — de propósito, e não uma impressão
 * digital de dispositivo: assim o usuário se livra dele limpando os dados do
 * navegador, o que mantém a coleta dentro do que a LGPD espera.
 */
export function getAnonymousId(): string {
  try {
    const guardado = localStorage.getItem(ANON_STORAGE_KEY);
    if (guardado && UUID_V4.test(guardado)) return guardado;

    const novo = crypto.randomUUID();
    localStorage.setItem(ANON_STORAGE_KEY, novo);
    return novo;
  } catch {
    // Navegação privada com storage bloqueado: identificador só desta sessão.
    return crypto.randomUUID();
  }
}
