import React, { useState, useEffect, useCallback } from 'react';
import { Coins, ShieldCheck, Download, AlertTriangle, Lock, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';

/**
 * Fase 3 — Painel de Royalties (admin, sempre em PT).
 * Pool híbrido: o sistema sugere (impressões×CPM + assinantes×valor), o admin
 * confirma o valor final e fecha o mês. Eventos flagged já vêm excluídos do
 * relatório pelo backend.
 */

const currentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

const RoyaltiesPanel: React.FC = () => {
  const [period, setPeriod] = useState(currentPeriod());
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [poolFinal, setPoolFinal] = useState('');
  const [closing, setClosing] = useState(false);
  const [msg, setMsg] = useState('');
  const [integrity, setIntegrity] = useState<{ ok: boolean; checked: number; brokenAt?: number } | null>(null);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);
  const [periods, setPeriods] = useState<any[]>([]);

  const loadReport = useCallback(async (p: string) => {
    setLoading(true);
    setMsg('');
    setIntegrity(null);
    try {
      const data = await api.getRoyaltyReport(p);
      setReport(data);
      setPoolFinal(data.closedPeriod ? String(data.closedPeriod.poolFinal) : data.poolSuggested.toFixed(2));
    } catch {
      setReport(null);
      setMsg('Erro ao carregar o relatório.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReport(period); }, [period, loadReport]);
  useEffect(() => { api.getRoyaltyPeriods().then(setPeriods).catch(() => {}); }, [report?.closedPeriod]);

  const handleClose = async () => {
    const pool = parseFloat(poolFinal.replace(',', '.'));
    if (!Number.isFinite(pool) || pool < 0) { setMsg('Informe um valor de pool válido.'); return; }
    if (!confirm(`Fechar o período ${period} com pool de ${brl(pool)}? Essa ação não pode ser desfeita.`)) return;
    setClosing(true);
    setMsg('');
    try {
      await api.closeRoyaltyPeriod(period, pool);
      setMsg('Período fechado com sucesso!');
      await loadReport(period);
    } catch (e: any) {
      setMsg(e?.message || 'Erro ao fechar o período.');
    } finally {
      setClosing(false);
    }
  };

  const handleIntegrity = async () => {
    setCheckingIntegrity(true);
    try {
      setIntegrity(await api.verifyRoyaltyIntegrity());
    } catch {
      setMsg('Erro ao verificar integridade.');
    } finally {
      setCheckingIntegrity(false);
    }
  };

  const isClosed = Boolean(report?.closedPeriod);

  return (
    <div className="max-w-5xl animate-apple">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
        <h2 className="text-4xl font-black tracking-tighter flex items-center gap-3"><Coins size={32} className="text-amber-500" /> Royalties</h2>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={period}
            onChange={e => e.target.value && setPeriod(e.target.value)}
            className="bg-black/5 dark:bg-white/5 border border-[var(--border-color)] rounded-2xl px-4 py-3 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500 transition-colors"
          />
          <button
            onClick={() => api.downloadRoyaltyCsv(period).catch(() => setMsg('Erro ao exportar CSV.'))}
            className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-[var(--border-color)] rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            <Download size={15} /> CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /></div>
      ) : !report ? (
        <p className="text-zinc-500 text-sm font-bold">{msg || 'Sem dados.'}</p>
      ) : (
        <>
          {/* Pool do mês (regra híbrida) */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl p-6">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Pool sugerido</p>
              <p className="text-2xl font-black text-amber-500">{brl(report.poolSuggested)}</p>
              <p className="text-[10px] text-zinc-600 font-bold mt-1">impressões ÷ 1000 × CPM + assinantes × valor</p>
            </div>
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl p-6">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Impressões válidas</p>
              <p className="text-2xl font-black">{report.adImpressions}</p>
              <p className="text-[10px] text-zinc-600 font-bold mt-1">CPM: {brl(report.cpm)}</p>
            </div>
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl p-6">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Premium ativos</p>
              <p className="text-2xl font-black">{report.premiumUsers}</p>
              <p className="text-[10px] text-zinc-600 font-bold mt-1">{brl(report.perSub)} por assinante</p>
            </div>
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl p-6">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Pontos válidos</p>
              <p className="text-2xl font-black">{report.totalPoints}</p>
              <p className="text-[10px] text-zinc-600 font-bold mt-1">views + leituras pós anti-fraude</p>
            </div>
          </div>

          {/* Fechamento */}
          <div className={`rounded-3xl border p-6 mb-8 ${isClosed ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-[var(--card-bg)] border-[var(--border-color)]'}`}>
            {isClosed ? (
              <div className="flex items-center gap-3">
                <Lock size={18} className="text-emerald-400" />
                <p className="text-sm font-bold">
                  Período <span className="font-black">{period}</span> fechado com pool de{' '}
                  <span className="font-black text-emerald-400">{brl(report.closedPeriod.poolFinal)}</span>
                  {' '}(sugerido: {brl(report.closedPeriod.poolSuggested)})
                </p>
              </div>
            ) : (
              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Pool final (R$) — você confirma o valor</label>
                  <input
                    type="text"
                    value={poolFinal}
                    onChange={e => setPoolFinal(e.target.value)}
                    className="bg-black/5 dark:bg-white/5 border border-[var(--border-color)] rounded-2xl px-4 py-3 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500 transition-colors w-40"
                  />
                </div>
                <button
                  onClick={handleClose}
                  disabled={closing || report.totalPoints === 0}
                  className="flex items-center gap-2 px-6 py-3 bg-rose-600 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-rose-500 transition-all disabled:opacity-50"
                >
                  {closing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Lock size={15} />}
                  Fechar período
                </button>
                {report.totalPoints === 0 && <p className="text-[10px] text-zinc-600 font-bold pb-3">Sem consumo válido no período.</p>}
              </div>
            )}
            {msg && <p className={`text-sm font-bold mt-3 ${msg.includes('rro') ? 'text-rose-500' : 'text-emerald-400'}`}>{msg}</p>}
          </div>

          {/* Tabela por canal */}
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-color)] text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                  <th className="text-left px-6 py-4">Canal / Ilustrador</th>
                  <th className="text-right px-6 py-4">Pontos</th>
                  <th className="text-right px-6 py-4">Share</th>
                  <th className="text-right px-6 py-4">Valor</th>
                </tr>
              </thead>
              <tbody>
                {report.channels.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-zinc-600 font-bold text-xs uppercase tracking-widest">Nenhum consumo válido no período</td></tr>
                )}
                {report.channels.map((c: any) => {
                  const pool = isClosed ? report.closedPeriod.poolFinal : parseFloat(poolFinal.replace(',', '.')) || report.poolSuggested;
                  return (
                    <tr key={c.channelId || 'none'} className="border-b border-[var(--border-color)] last:border-0">
                      <td className="px-6 py-4 font-bold">
                        <div className="flex items-center gap-2">
                          {c.channelName}
                          {c.anomaly && (
                            <span title="Razão pontos/consumidores anômala — revisar manualmente">
                              <AlertTriangle size={14} className="text-amber-500" />
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-600 font-bold mt-0.5">
                          {c.series.slice(0, 3).map((s: any) => `${s.title} (${s.points})`).join(' · ')}
                          {c.series.length > 3 ? ` · +${c.series.length - 3}` : ''}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-right font-black">{c.points}</td>
                      <td className="px-6 py-4 text-right font-black">{(c.share * 100).toFixed(1)}%</td>
                      <td className="px-6 py-4 text-right font-black text-amber-500">{brl(c.share * pool)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Integridade + histórico */}
          <div className="flex items-start gap-6 flex-wrap">
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl p-6 flex-1 min-w-[280px]">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">Auditoria do log imutável</p>
              <button
                onClick={handleIntegrity}
                disabled={checkingIntegrity}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-[var(--border-color)] rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-50"
              >
                {checkingIntegrity ? <div className="w-3.5 h-3.5 border-2 border-zinc-500/30 border-t-zinc-400 rounded-full animate-spin" /> : <ShieldCheck size={14} />}
                Verificar cadeia de hash
              </button>
              {integrity && (
                integrity.ok ? (
                  <p className="text-emerald-400 text-xs font-bold mt-3 flex items-center gap-2"><CheckCircle2 size={14} /> Cadeia íntegra — {integrity.checked} eventos verificados</p>
                ) : (
                  <p className="text-rose-500 text-xs font-bold mt-3 flex items-center gap-2"><AlertTriangle size={14} /> ADULTERAÇÃO DETECTADA no evento #{integrity.brokenAt} (após {integrity.checked} válidos)</p>
                )
              )}
            </div>

            {periods.length > 0 && (
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl p-6 flex-1 min-w-[280px]">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">Períodos fechados</p>
                <div className="space-y-2">
                  {periods.slice(0, 6).map(p => (
                    <button key={p.period} onClick={() => setPeriod(p.period)} className="w-full flex items-center justify-between text-sm font-bold px-3 py-2 rounded-xl hover:bg-white/5 transition-all">
                      <span>{p.period}</span>
                      <span className="text-amber-500 font-black">{brl(p.poolFinal)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default RoyaltiesPanel;
