
import React, { useState } from 'react';
import { ICONS } from '../constants';

interface PremiumProps {
  onUpgradeComplete: () => void;
  onBack: () => void;
}

type TabType = 'user' | 'business';
type Step = 'selection' | 'form';

const Premium: React.FC<PremiumProps> = ({ onUpgradeComplete, onBack }) => {
  // Fix: Corrected useState syntax for TabType and added missing brackets
  const [activeTab, setActiveTab] = useState<TabType>('user');
  const [step, setStep] = useState<Step>('selection');
  const [loading, setLoading] = useState(false);

  const [userData, setUserData] = useState({ nome: '', endereco: '', telefone: '', email: '' });
  const [campaignData, setCampaignData] = useState({ nome: '', url: '', descricao: '', publico: '' });

  const handlePayment = () => {
    setLoading(true);
    setTimeout(() => {
      onUpgradeComplete();
      setLoading(false);
    }, 2000);
  };

  return (
    <div className="h-full w-full bg-[#0A0A0B] text-white overflow-y-auto font-lailai animate-apple pb-48 md:pb-32">
      <div className="max-w-4xl mx-auto px-6 pt-12 md:pt-20">
        <header className="flex justify-between items-center mb-16">
          <button onClick={step === 'form' ? () => setStep('selection') : onBack} className="p-3 bg-[#1C1C1E] rounded-2xl border border-white/5 hover:bg-[#2C2C2E] transition-all text-zinc-400 hover:text-white">
            <svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
          <div className="text-[10px] font-black tracking-[0.3em] text-zinc-600 uppercase">Assinantes</div>
        </header>

        {step === 'selection' ? (
          <div className="animate-apple text-center">
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter mb-6 premium-text">Assinantes e Anunciantes</h1>
            <p className="text-zinc-500 text-lg md:text-xl max-w-lg mx-auto mb-12">Escolha sua forma de apoiar e brilhar na plataforma.</p>

            <div className="flex p-1 bg-[#1C1C1E] rounded-2xl w-full max-w-sm mx-auto mb-16 border border-white/5">
              <button onClick={() => setActiveTab('user')} className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'user' ? 'bg-[#2C2C2E] text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}>Para Você</button>
              <button onClick={() => setActiveTab('business')} className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'business' ? 'bg-[#2C2C2E] text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}>Para Empresas</button>
            </div>

            <div className="grid grid-cols-1 gap-8 max-w-2xl mx-auto">
              <div onClick={() => setStep('form')} className="group bg-[#1C1C1E] border border-white/5 rounded-[2.5rem] p-10 flex flex-col items-center cursor-pointer transition-all hover:bg-[#2C2C2E] hover:scale-[1.02]">
                <div className={`w-20 h-20 rounded-[1.5rem] flex items-center justify-center mb-8 ${activeTab === 'user' ? 'bg-rose-600/10 text-rose-500' : 'bg-indigo-600/10 text-indigo-500'}`}>
                   {activeTab === 'user' ? <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> : <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
                </div>
                <h3 className="text-3xl font-extrabold mb-4">{activeTab === 'user' ? 'Zero Anúncios' : 'Promover Arte'}</h3>
                <p className="text-zinc-500 mb-10 text-sm">{activeTab === 'user' ? 'Assista sem interrupções e desbloqueie a Biblioteca.' : 'Sua campanha exibida para toda a comunidade.'}</p>
                <div className={`w-full py-5 font-black rounded-2xl ${activeTab === 'user' ? 'bg-white text-black' : 'border border-white/10 text-white hover:bg-white/5'}`}>
                  {activeTab === 'user' ? 'Assinar R$ 9,90/mês' : 'Criar Campanha'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto animate-apple">
             <h2 className="text-3xl font-extrabold tracking-tight mb-8">{activeTab === 'user' ? 'Dados para Pagamento' : 'Configurar Anúncio'}</h2>
             <div className="space-y-4">
               {activeTab === 'user' ? (
                 <>
                   <input type="text" placeholder="Nome Completo" value={userData.nome} onChange={(e) => setUserData({...userData, nome: e.target.value})} className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-rose-500/50 transition-all text-white placeholder:text-zinc-600" />
                   <input type="text" placeholder="Endereço" value={userData.endereco} onChange={(e) => setUserData({...userData, endereco: e.target.value})} className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-rose-500/50 transition-all text-white placeholder:text-zinc-600" />
                   <input type="tel" placeholder="Telefone" value={userData.telefone} onChange={(e) => setUserData({...userData, telefone: e.target.value})} className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-rose-500/50 transition-all text-white placeholder:text-zinc-600" />
                 </>
               ) : (
                 <>
                   <input type="text" placeholder="Título da Campanha" value={campaignData.nome} onChange={(e) => setCampaignData({...campaignData, nome: e.target.value})} className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-4 focus:outline-none text-white placeholder:text-zinc-600" />
                   <input type="text" placeholder="URL do Vídeo (MP4)" value={campaignData.url} onChange={(e) => setCampaignData({...campaignData, url: e.target.value})} className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-4 focus:outline-none text-white placeholder:text-zinc-600" />
                 </>
               )}
               <button onClick={handlePayment} className={`w-full py-5 rounded-2xl font-black mt-8 shadow-2xl transition-all ${activeTab === 'user' ? 'bg-white text-black hover:bg-zinc-200' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}>
                 {loading ? <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin mx-auto" /> : 'Ir para Mercado Pago'}
               </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Premium;
