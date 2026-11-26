/**
 * Tela de conferência do envio de pasta (Fase 7, frente A, item 2). Um
 * componente só, usado pelo Meu Estúdio e pelo Gerenciar Conteúdo (via
 * EnvioPastaEpisodio). Só mostra: o resultado vem de organizarPasta
 * (shared/organizacaoEpisodio.mjs), as mesmas regras que o servidor roda.
 *
 * Mostra quantas páginas viram quantos painéis depois do corte, o tamanho
 * contra o limite, os problemas por arquivo (os que impedem separados dos que
 * só deixam o arquivo de fora) e, por painel, os selos dos idiomas que têm
 * balão.
 */
import React from 'react';
import { useT } from '../../contexts/I18nContext';
import { formatarMB, IDIOMAS } from '../../shared/organizacaoEpisodio.mjs';

export interface ProblemaDaPasta {
  indice: number | null;
  nome: string | null;
  codigo: string;
  mensagem: string;
  impede: boolean;
  valor?: number;
  limite?: number;
}

export interface ResultadoDaPasta {
  paineis: Array<{
    ordem: number;
    numeroPagina: number;
    fatia: number;
    totalFatias: number;
    pagina: { nome: string };
    baloes: Partial<Record<'pt' | 'en' | 'es' | 'zh', unknown>>;
  }>;
  problemas: ProblemaDaPasta[];
  totalPaginas: number;
  totalPaineis: number;
  paginasCortadas: number;
  porIdioma: Record<'pt' | 'en' | 'es' | 'zh', number>;
  limitePaineis: number;
  totalBytes: number;
  limiteBytes: number;
  podeEnviar: boolean;
}

const preencher = (texto: string, valores: Record<string, string | number>) =>
  Object.entries(valores).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), texto);

/** Mensagem do problema no idioma da tela; sem tradução, a do servidor (PT). */
export function useMensagemDoProblema() {
  const t = useT();
  return (p: ProblemaDaPasta) => {
    const chave = `envio.problema.${p.codigo}` as any;
    const traduzida = t(chave);
    if (!traduzida || traduzida === chave) return p.mensagem;
    if (p.codigo === 'limite-tamanho') {
      const valor = formatarMB(p.valor ?? 0);
      const limite = formatarMB(p.limite ?? 0);
      // Arredondado, 20 MB e um byte sairia "somam 20 MB; o limite é 20 MB".
      return preencher(valor === limite ? t('envio.problema.limite-tamanho-pouco' as any) : traduzida, { valor, limite });
    }
    return preencher(traduzida, { valor: p.valor ?? '', limite: p.limite ?? '' });
  };
}

const ROTULO_IDIOMA: Record<string, string> = { pt: 'PT', en: 'EN', es: 'ES', zh: 'ZH' };

const ConferenciaEnvio: React.FC<{ resultado: ResultadoDaPasta; paineisAtuais?: number }> = ({ resultado: r, paineisAtuais = 0 }) => {
  const t = useT();
  const mensagem = useMensagemDoProblema();
  const impedem = r.problemas.filter(p => p.impede);
  const deFora = r.problemas.filter(p => !p.impede);

  const ListaDeProblemas = ({ itens, titulo, cor, testid }: { itens: ProblemaDaPasta[]; titulo: string; cor: string; testid: string }) => (
    <div data-testid={testid} className="space-y-1">
      <p className={`text-[10px] font-black uppercase tracking-widest ${cor}`}>{titulo}</p>
      <ul className="space-y-1">
        {itens.map((p, i) => (
          <li key={`${p.codigo}-${p.indice ?? 'ep'}-${i}`} data-testid="problema" data-codigo={p.codigo} className="text-xs text-zinc-300">
            {p.nome && <span className="font-mono font-bold text-[var(--text-color)]">{p.nome}: </span>}
            <span>{mensagem(p)}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="conferencia-envio">
      <div className="space-y-1 text-xs text-zinc-400">
        <p data-testid="resumo-paineis" className="font-bold text-[var(--text-color)]">
          {preencher(t('envio.resumo'), { paginas: r.totalPaginas, paineis: r.totalPaineis })}
        </p>
        {r.paginasCortadas > 0 && <p>{preencher(t('envio.cortadas'), { n: r.paginasCortadas })}</p>}
        <p>{preencher(t('envio.limitePaineis'), { limite: r.limitePaineis })}</p>
        <p data-testid="resumo-tamanho">{preencher(t('envio.tamanho'), { total: formatarMB(r.totalBytes), limite: formatarMB(r.limiteBytes) })}</p>
        <p>
          {t('envio.idiomas')}:{' '}
          {IDIOMAS.map(i => `${ROTULO_IDIOMA[i]} ${r.porIdioma[i as 'pt']}`).join(' · ')}
        </p>
        {paineisAtuais > 0 && (
          <p className="text-amber-400 font-bold">{preencher(t('envio.substituir'), { n: paineisAtuais })}</p>
        )}
      </div>

      {impedem.length > 0 && <ListaDeProblemas itens={impedem} titulo={t('envio.problemasImpedem')} cor="text-rose-500" testid="problemas-impedem" />}
      {deFora.length > 0 && <ListaDeProblemas itens={deFora} titulo={t('envio.problemasFicamDeFora')} cor="text-amber-400" testid="problemas-de-fora" />}

      {r.paineis.length > 0 && (
        <details className="bg-black/10 dark:bg-white/5 rounded-2xl p-3">
          <summary className="text-[10px] font-black uppercase tracking-widest text-zinc-500 cursor-pointer">
            {preencher(t('envio.verPaineis'), { n: r.paineis.length })}
          </summary>
          <ol className="mt-2 space-y-1 max-h-64 overflow-y-auto">
            {r.paineis.map(p => (
              <li key={p.ordem} data-testid="painel" data-ordem={p.ordem} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate text-zinc-300">
                  <span className="font-black">#{p.ordem + 1}</span> {p.pagina.nome}
                  {p.totalFatias > 1 && <span className="text-zinc-500"> ({preencher(t('envio.fatia'), { fatia: p.fatia, total: p.totalFatias })})</span>}
                </span>
                <span className="flex gap-1 shrink-0">
                  {IDIOMAS.map(i => {
                    const tem = !!p.baloes[i as 'pt'];
                    return (
                      <span
                        key={i}
                        data-testid={`selo-${i}`}
                        data-tem={tem ? 'sim' : 'nao'}
                        className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${tem ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-700'}`}
                      >
                        {ROTULO_IDIOMA[i]}
                      </span>
                    );
                  })}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
};

export default ConferenciaEnvio;
