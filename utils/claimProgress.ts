import { api } from '../services/api';
import { ANON_STORAGE_KEY } from './anonymousId';

/**
 * Leva para a conta o que o usuário leu antes de se cadastrar.
 *
 * Chamado logo depois do login/cadastro. Falha em silêncio de propósito: se a
 * rede cair aqui, o pior que acontece é o histórico anônimo continuar de lado —
 * e o login não pode quebrar por causa disso.
 */
export async function migrarProgressoDoVisitante(): Promise<void> {
  try {
    const anonymousId = localStorage.getItem(ANON_STORAGE_KEY);
    if (!anonymousId) return;
    await api.claimProgress(anonymousId);
  } catch { /* silencioso por decisão de projeto */ }
}
