import React, { useState } from 'react';
import { api } from '../services/api';

interface PrivacyCenterProps {
  user: any;
  onOpenPolicy: (tab?: 'privacy' | 'terms') => void;
  onDeleted: () => void;
}

/**
 * LGPD — Centro de Privacidade do titular.
 * Permite exportar dados, gerenciar consentimento de marketing e excluir a conta.
 */
const PrivacyCenter: React.FC<PrivacyCenterProps> = ({ user, onOpenPolicy, onDeleted }) => {
  const [marketing, setMarketing] = useState<boolean>(!!user?.consent?.marketing);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const handleExport = async () => {
    setMsg('');
    try {
      await api.exportMyData();
      setMsg('Download iniciado.');
    } catch {
      setMsg('Erro ao exportar dados.');
    }
  };

  const toggleMarketing = async () => {
    const next = !marketing;
    setMarketing(next);
    try {
      await api.updateMarketingConsent(next);
    } catch {
      setMarketing(!next); // reverte em caso de erro
    }
  };

  const handleDelete = async () => {
    setDeleteError('');
    setBusy(true);
    try {
      await api.deleteMyAccount(user?.provider === 'local' || !user?.provider ? password : undefined);
      onDeleted();
    } catch (err: any) {
      setDeleteError(err.message || 'Erro ao excluir conta.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-10 text-left">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-4">Privacidade & Dados (LGPD)</h3>

      <div className="space-y-3">
        <button onClick={handleExport}
          className="w-full py-4 bg-white/5 text-zinc-200 font-bold rounded-2xl border border-white/10 hover:bg-white/10 transition-all text-sm">
          Baixar meus dados (JSON)
        </button>

        <div className="w-full py-4 px-5 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-between">
          <span className="text-sm text-zinc-300">Receber novidades por e-mail</span>
          <button onClick={toggleMarketing} aria-label="Alternar consentimento de marketing"
            className={`relative w-12 h-7 rounded-full transition-colors ${marketing ? 'bg-rose-600' : 'bg-zinc-700'}`}>
            <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${marketing ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        <button onClick={() => onOpenPolicy('privacy')}
          className="w-full py-4 bg-white/5 text-zinc-200 font-bold rounded-2xl border border-white/10 hover:bg-white/10 transition-all text-sm">
          Política de Privacidade e Termos
        </button>

        <button onClick={() => setShowDelete(true)}
          className="w-full py-4 bg-rose-600/10 text-rose-500 font-bold rounded-2xl border border-rose-500/20 hover:bg-rose-600/20 transition-all text-sm">
          Excluir minha conta permanentemente
        </button>

        {msg && <p className="text-xs text-zinc-400 text-center">{msg}</p>}
      </div>

      {showDelete && (
        <div className="fixed inset-0 z-[6500] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-[#1C1C1E] p-8 rounded-[2rem] border border-white/10 animate-apple">
            <h2 className="text-xl font-black text-white mb-2">Excluir conta</h2>
            <p className="text-sm text-zinc-400 mb-6">
              Esta ação é <strong className="text-rose-400">permanente</strong>. Seus dados pessoais,
              avaliações e canais serão eliminados conforme a LGPD.
            </p>
            {(user?.provider === 'local' || !user?.provider) && (
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Confirme sua senha"
                className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-4 text-white mb-4" />
            )}
            {deleteError && <p className="text-rose-500 text-xs font-bold mb-4">{deleteError}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setShowDelete(false); setPassword(''); setDeleteError(''); }}
                className="flex-1 py-3 font-bold text-zinc-400">Cancelar</button>
              <button onClick={handleDelete} disabled={busy}
                className="flex-1 py-3 bg-rose-600 text-white font-black rounded-2xl disabled:opacity-50">
                {busy ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrivacyCenter;
