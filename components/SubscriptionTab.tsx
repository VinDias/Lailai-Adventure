
import React, { useState } from 'react';
import { User } from '../types';
import { api } from '../services/api';
import { getLocalizedPrice } from '../utils/localizedPrice';

const SubscriptionTab: React.FC<{ user: User, onUpgrade: () => void }> = ({ user, onUpgrade }) => {
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    try {
      const { url } = await api.createCheckoutSession();
      // Redireciona para o Stripe Checkout seguro
      window.location.href = url;
    } catch (err: any) {
      alert("Erro ao iniciar pagamento: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full bg-[#050505] overflow-y-auto flex flex-col items-center justify-center p-8 animate-apple">
       <div className="w-full max-w-sm text-center">
          <div className="w-20 h-20 bg-rose-600/10 rounded-[1.5rem] flex items-center justify-center mx-auto mb-10 text-rose-500">
             <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 15l-2 5L9 9l11 4-5 2zm0 0l4 4L9 9l3 6z"/></svg>
          </div>
          <h1 className="text-5xl font-black text-white mb-4 tracking-tighter italic">Premium</h1>
          <p className="text-zinc-500 text-lg mb-12">Cinema vertical em 60 FPS, sem anúncios e com acesso antecipado.</p>
          
          <div className="bg-[#1C1C1E] border border-white/5 rounded-[2.5rem] p-10 mb-12 text-left shadow-2xl">
             <div className="text-3xl font-black text-white mb-8">{getLocalizedPrice()} <span className="text-sm text-zinc-600 font-bold tracking-widest uppercase">/mês</span></div>
             <ul className="space-y-4 mb-10">
                <li className="flex items-center gap-3 text-sm font-bold text-zinc-400"><div className="w-2 h-2 rounded-full bg-rose-500" /> Experiência 100% livre de Ads</li>
                <li className="flex items-center gap-3 text-sm font-bold text-zinc-400"><div className="w-2 h-2 rounded-full bg-rose-500" /> Resolução 1080p nativa</li>
                <li className="flex items-center gap-3 text-sm font-bold text-zinc-400"><div className="w-2 h-2 rounded-full bg-rose-500" /> Emblema de apoiador no perfil</li>
             </ul>
             <button 
               onClick={handlePay} 
               disabled={loading} 
               className="w-full py-5 bg-white text-black font-black rounded-2xl hover:scale-[1.02] transition-all flex items-center justify-center"
             >
                {loading ? <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : 'ASSINAR COM STRIPE'}
             </button>
          </div>
          <p className="text-[10px] text-zinc-700 font-black uppercase tracking-[0.2em]">Pagamento Seguro via Stripe</p>
       </div>
    </div>
  );
};

export default SubscriptionTab;
