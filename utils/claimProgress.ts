import { api } from '../services/api';
import { ANON_STORAGE_KEY } from './anonymousId';

/**
 * Prazo máximo que a migração pode segurar o login. O carrossel "Continuar"
 * busca a lista assim que a tela do app monta — se essa busca vencer a corrida
 * contra a migração (que no backend processa episódio por episódio), a lista
 * aparece vazia na primeira renderização. `migrarProgressoDoVisitante` é
 * chamada ANTES da troca de tela justamente para evitar essa corrida, então
 * este prazo existe para o caso oposto: numa rede lenta, não travar o login
 * esperando para sempre. Passado o prazo, o login segue em frente mesmo assim —
 * o carrossel se autocorrige na próxima busca (troca de aba, reabertura do
 * app).
 */
export const PRAZO_MIGRACAO_MS = 2000;

/**
 * Leva para a conta o que o usuário leu antes de se cadastrar.
 *
 * Chamado logo depois do login/cadastro, antes da troca para a tela do app.
 * Falha em silêncio de propósito: se a rede cair aqui, o pior que acontece é o
 * histórico anônimo continuar de lado — e o login não pode quebrar por causa
 * disso. Também nunca demora mais que PRAZO_MIGRACAO_MS, pelo mesmo motivo.
 */
export async function migrarProgressoDoVisitante(): Promise<void> {
  const anonymousId = localStorage.getItem(ANON_STORAGE_KEY);
  if (!anonymousId) return;

  const chamada = api.claimProgress(anonymousId)
    .then(() => undefined)
    .catch(() => undefined); // silencioso por decisão de projeto
  const prazo = new Promise<void>(resolve => setTimeout(resolve, PRAZO_MIGRACAO_MS));

  await Promise.race([chamada, prazo]);
}
