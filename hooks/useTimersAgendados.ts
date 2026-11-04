import { useCallback, useEffect, useRef } from 'react';

/**
 * Timers com NOME, para os "mostra a mensagem e fecha o modal daqui a pouco"
 * dos painéis.
 *
 * Por que existe: um `setTimeout` solto não sabe que o modal foi fechado na
 * mão e aberto de novo. No AdminDashboard, o timer da criação anterior fechava
 * o modal novo dentro da janela de 1,5 s, e sobrevivia ao desmonte do painel
 * (na suíte, disparava depois do jsdom desmontado e derrubava a rodada). Ver
 * tests/frontend/adminDashboardTimers.test.tsx.
 *
 * - `agendar(nome, fn, ms)` cancela o timer pendente com o mesmo nome antes
 *   de agendar o novo;
 * - `cancelar(nome)` é para chamar ao ABRIR o que o timer fecharia;
 * - no desmonte, todos os pendentes são cancelados.
 */
export function useTimersAgendados() {
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const cancelar = useCallback((nome: string) => {
    const id = timers.current.get(nome);
    if (id !== undefined) {
      clearTimeout(id);
      timers.current.delete(nome);
    }
  }, []);

  const agendar = useCallback((nome: string, fn: () => void, ms: number) => {
    cancelar(nome);
    const id = setTimeout(() => {
      timers.current.delete(nome);
      fn();
    }, ms);
    timers.current.set(nome, id);
  }, [cancelar]);

  useEffect(() => {
    const mapa = timers.current;
    return () => {
      for (const id of mapa.values()) clearTimeout(id);
      mapa.clear();
    };
  }, []);

  return { agendar, cancelar };
}
