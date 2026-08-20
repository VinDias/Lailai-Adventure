import React, { useEffect, useRef, useState } from 'react';
import { Gift } from 'lucide-react';
import { api } from '../services/api';
import { useT } from '../contexts/I18nContext';
import { formatarValorMonetario } from '../utils/currency';
import { User } from '../types';

// Super Reader é BRL apenas (ruling da revisão final, 20/08/2026): o
// relatório de repasse agrega por canal sem separar moeda — reabrir
// multimoeda é dívida registrada na spec. Ao contrário do Premium (que
// segue usando getLocalizedCurrency por navigator.language), o apoio envia
// SEMPRE 'brl'/R$, independente do idioma do dispositivo.
const SUPER_READER_CURRENCY = 'brl';

// Só usado se o fetch do mínimo falhar de verdade (rede fora do ar) — o
// componente sempre tenta buscar o valor real do backend primeiro; enquanto
// isso não chega, os valores rápidos ficam vazios (ver `valores` abaixo).
const FALLBACK_MIN_CENTS = 500;

interface SuperReaderButtonProps {
  user: User | null;
  seriesId: string;
}

/**
 * Converte o valor digitado (em unidades da moeda — reais, dólares...) para
 * centavos. Aceita vírgula OU ponto como separador decimal: o usuário BR
 * digita vírgula, mas o teclado numérico de alguns aparelhos só solta ponto.
 * Ruling P1 do bloco (ledger): valor SEMPRE em centavos na fronteira
 * frontend→backend — `Math.round` evita erro de ponto flutuante
 * (ex.: 7.50 * 100 pode virar 749.999999999999 em JS puro).
 */
function paraCentavos(valorDigitado: string): number | null {
  const normalizado = valorDigitado.trim().replace(',', '.');
  if (!normalizado) return null;
  const unidades = Number(normalizado);
  if (!Number.isFinite(unidades) || unidades <= 0) return null;
  return Math.round(unidades * 100);
}

/**
 * Botão de apoio direto ao autor (Fase 4, Bloco 3 — Super Reader). Inserido
 * no modal de detalhe de série dos 3 feeds (HQCine/VFilm/HiQua), junto do
 * favoritar. Busca o mínimo ao montar (o modal só monta este componente
 * quando uma série está selecionada, então montar == abrir); valores rápidos
 * = mínimo, 2x e 4x, mais um campo livre. Envia sempre centavos.
 * Visitante (user null): o botão aparece; ao tocar, mostra o convite de
 * login no lugar do formulário — não existe um padrão de "gate de login"
 * pronto no app (favoritar/curtir hoje só desabilitam o botão em silêncio),
 * então esta é a primeira vez que o app mostra esse convite explícito.
 */
const SuperReaderButton: React.FC<SuperReaderButtonProps> = ({ user, seriesId }) => {
  const t = useT();
  const currency = SUPER_READER_CURRENCY;

  const [aberto, setAberto] = useState(false);
  const [minCents, setMinCents] = useState<number | null>(null);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [valorLivre, setValorLivre] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Lock síncrono contra duplo clique — mesma técnica de components/PushPrompt.tsx:
  // um ref muda de valor imediatamente, sem esperar o próximo render, então
  // dois cliques no mesmo tick não escapam pela janela antes do state travar.
  const lockRef = useRef(false);

  useEffect(() => {
    let cancelado = false;
    // minCents e selecionado são setados JUNTOS no mesmo callback (React 18
    // batching): um efeito separado escutando `[minCents]` para pré-selecionar
    // deixava uma janela de render em que os botões de valor já apareciam
    // (minCents definido) mas `selecionado` ainda estava null — `podeEnviar`
    // ficava false por um instante, e um clique nessa janela (ex.: teste de
    // duplo clique, rápido o bastante) era engolido em silêncio.
    api.getSuperReaderMin()
      .then(({ minCents: valor }) => {
        if (cancelado) return;
        setMinCents(valor);
        setSelecionado(valor);
      })
      .catch(() => {
        if (cancelado) return;
        setMinCents(FALLBACK_MIN_CENTS);
        setSelecionado(FALLBACK_MIN_CENTS);
      });
    return () => { cancelado = true; };
  }, []);

  const valores = minCents !== null ? [minCents, minCents * 2, minCents * 4] : [];
  const valorEmCentavos = valorLivre.trim() !== '' ? paraCentavos(valorLivre) : selecionado;
  const podeEnviar = minCents !== null && valorEmCentavos !== null && valorEmCentavos >= minCents;

  const escolherValor = (v: number) => {
    setSelecionado(v);
    setValorLivre('');
  };

  const handleApoiar = async () => {
    if (lockRef.current || !podeEnviar || valorEmCentavos === null) return;
    lockRef.current = true;
    setEnviando(true);
    setErro(null);
    try {
      const { url } = await api.createSuperReaderSession(seriesId, valorEmCentavos, currency);
      window.location.href = url;
    } catch (e: any) {
      setErro(e?.message || t('superReader.genericError'));
    } finally {
      lockRef.current = false;
      setEnviando(false);
    }
  };

  return (
    <div data-testid="superreader-button">
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        className="px-5 py-5 rounded-2xl border border-rose-500/30 bg-rose-600/10 text-rose-400 hover:bg-rose-600/20 transition-all flex items-center gap-2 font-black text-xs uppercase tracking-widest"
      >
        <Gift size={18} />
        {t('superReader.cta')}
      </button>

      {aberto && !user && (
        <p className="mt-4 max-w-md text-sm text-zinc-400">{t('superReader.loginToSupport')}</p>
      )}

      {aberto && user && (
        <div className="mt-4 max-w-md bg-white/5 border border-white/10 rounded-3xl p-6">
          <p className="text-white font-black mb-1">{t('superReader.title')}</p>
          <p className="text-zinc-400 text-sm leading-relaxed mb-4">{t('superReader.explain')}</p>

          <div className="flex gap-2 mb-3">
            {valores.map(v => (
              <button
                key={v}
                type="button"
                onClick={() => escolherValor(v)}
                className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${selecionado === v && valorLivre.trim() === '' ? 'bg-white text-black' : 'bg-white/5 text-zinc-400 border border-white/5 hover:bg-white/10'}`}
              >
                {formatarValorMonetario(v, currency)}
              </button>
            ))}
          </div>

          <input
            type="text"
            inputMode="decimal"
            placeholder={t('superReader.customAmount')}
            value={valorLivre}
            onChange={e => setValorLivre(e.target.value)}
            className="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white text-sm mb-3 outline-none focus:border-rose-500/50"
          />

          {!podeEnviar && minCents !== null && (
            <p className="text-[11px] text-zinc-500 mb-3">
              {t('superReader.minHint')} {formatarValorMonetario(minCents, currency)}
            </p>
          )}

          {erro && <p role="alert" className="text-rose-500 text-xs mb-3">{erro}</p>}

          <button
            type="button"
            onClick={handleApoiar}
            disabled={!podeEnviar || enviando}
            className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl text-xs uppercase tracking-widest transition-all disabled:opacity-50"
          >
            {t('superReader.submit')}
          </button>
        </div>
      )}
    </div>
  );
};

export default SuperReaderButton;
