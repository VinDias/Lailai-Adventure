
import React, { useState } from 'react';
import { ICONS } from '../constants';
import { User, Ad } from '../types';

interface PremiumProps {
  user: User;
  onUpgradeComplete: () => void;
  onAdPurchase: (ad: Ad) => void;
  onBack: () => void;
}

type TabType = 'user' | 'business';
type Step = 'selection' | 'form' | 'payment';

const Premium: React.FC<PremiumProps> = ({ user, onUpgradeComplete, onAdPurchase, onBack }) => {
  const [activeTab, setActiveTab] = useState<TabType>('user');
  const [step, setStep] = useState<Step>('selection');
  const [loading, setLoading] = useState(false);

  // Business Form State
  const [campaignData, setCampaignData] = useState({
    title: '',
    videoUrl: '',
    description: '',
    format: 'H.264' as 'H.264' | 'H.265',
    impressions: 1000
  });

  const CPM_RATE = 15.00; // R$ 15,00 por 1000 impressões
  const totalPrice = (campaignData.impressions / 1000) * CPM_RATE;

  const handleUserUpgrade = () => {
    setLoading(true);
    setTimeout(() => {
      onUpgradeComplete();
      setLoading(false);
    }, 1500);
  };

  const validateAndPayAd = () => {
    if (!campaignData.title || !campaignData.videoUrl) {
      alert("Preencha todos os campos obrigatórios.");
      return;
    }
    
    setLoading(true);
    setTimeout(() => {
      // Create ad object ensuring properties match the Ad interface
      const newAd: Ad = {
        id: Date.now(),
        advertiserId: user.id,
        title: campaignData.title,
        // Fix: Ensure video_url is used instead of videoUrl to match the interface
        video_url: campaignData.videoUrl,
        duration: 90,
        views: 0,
        maxViews: campaignData.impressions,
        active: true,
        format: campaignData.format,
        resolution: '1080x1920'
      };
      onAdPurchase(newAd);
      setLoading(false);
      alert(`Campanha ativada! Investimento: R$ ${totalPrice.toFixed(2)}`);
      onBack();
    }, 2000);
  };

  return (
    <div className="h-full w-full bg-[#0A0A0B] text-white overflow-y-auto font-inter animate-apple pb-48 md:pb-32">
      <div className="max-w-4xl mx-auto px-6 pt-12 md:pt-20">
        <header className="flex justify-between items-center mb-16">
          <button onClick={step !== 'selection' ? () => setStep('selection') : onBack} className="p-3 bg-[#1C1C1E] rounded-2xl border border-white/5 hover:bg-[#2C2C2E] transition-all text-zinc-400 hover:text-white">
            <svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
          <div className="text-[10px] font-black tracking-[0.3em] text-zinc-600 uppercase">Premium & Ads</div>
        </header>

        {step === 'selection' ? (
          <div className="animate-apple text-center">
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter mb-6 premium-text">Subscribers & Businesses</h1>
            <p className="text-zinc-500 text-lg md:text-xl max-w-lg mx-auto mb-12">Impulsione sua marca ou sua experiência de cinema.</p>

            <div className="flex p-1 bg-[#1C1C1E] rounded-2xl w-full max-w-sm mx-auto mb-16 border border-white/5">
              <button onClick={() => setActiveTab('user')} className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'user' ? 'bg-[#2C2C2E] text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}>Assinante</button>
              <button onClick={() => setActiveTab('business')} className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'business' ? 'bg-[#2C2C2E] text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}>Anunciante</button>
            </div>

            <div className="grid grid-cols-1 gap-8 max-w-2xl mx-auto">
              <div onClick={() => setStep('form')} className="group bg-[#1C1C1E] border border-white/5 rounded-[2.5rem] p-10 flex flex-col items-center cursor-pointer transition-all hover:bg-[#2C2C2E] hover:scale-[1.02]">
                <div className={`w-20 h-20 rounded-[1.5rem] flex items-center justify-center mb-8 ${activeTab === 'user' ? 'bg-rose-600/10 text-rose-500' : 'bg-indigo-600/10 text-indigo-500'}`}>
                   {activeTab === 'user' ? ICONS.Premium : ICONS.AI}
                </div>
                <h3 className="text-3xl font-extrabold mb-4">{activeTab === 'user' ? 'Lorflux Premium' : 'Anunciante Cinema'}</h3>
                <p className="text-zinc-500 mb-10 text-sm text-center">
                  {activeTab === 'user' 
                    ? 'Assista a 1080p nativo, 60 FPS, sem anúncios e com áudio espacial.' 
                    : 'Alcance 1.000 pessoas por apenas R$ 15,00. Vídeos de 90s em FullHD.'}
                </p>
                <div className={`w-full py-5 font-black rounded-2xl ${activeTab === 'user' ? 'bg-white text-black' : 'bg-indigo-600 text-white'}`}>
                  {activeTab === 'user' ? 'Assinar R$ 3,99/mês' : 'Contratar CPM R$ 15,00'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto animate-apple">
             <h2 className="text-3xl font-extrabold tracking-tight mb-8 text-center">
               {activeTab === 'user' ? 'Confirmação de Plano' : 'Nova Campanha'}
             </h2>
             
             {activeTab === 'user' ? (
               <div className="space-y-4">
                 <div className="p-6 bg-white/5 rounded-3xl border border-white/10 mb-6">
                    <ul className="space-y-3 text-sm text-zinc-400">
                      <li className="flex items-center gap-2 font-bold text-white"><div className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Cinema em 60 FPS nativo</li>
                      <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Zero anúncios no feed</li>
                      <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Suporte prioritário</li>
                    </ul>
                 </div>
                 <button onClick={handleUserUpgrade} className="w-full py-5 bg-white text-black rounded-2xl font-black hover:bg-zinc-200 transition-all flex items-center justify-center">
                   {loading ? <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : 'Confirmar R$ 3,99'}
                 </button>
               </div>
             ) : (
               <div className="space-y-5">
                 <div className="bg-indigo-500/10 border border-indigo-500/20 p-5 rounded-2xl mb-4">
                    <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest mb-2">Checklist Técnico</p>
                    <ul className="text-[10px] text-zinc-500 space-y-1">
                      <li>• Resolução: 1080x1920 (Vertical)</li>
                      <li>• Frame Rate: 30 a 60 FPS</li>
                      <li>• Duração Máxima: 90 Segundos</li>
                      <li>• Custo: R$ 15,00 por 1.000 views</li>
                    </ul>
                 </div>

                 <input type="text" placeholder="Título do Anúncio" value={campaignData.title} onChange={e => setCampaignData({...campaignData, title: e.target.value})} className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-4 focus:outline-none text-white placeholder:text-zinc-700" />
                 <input type="text" placeholder="URL do Vídeo MP4 (Direct Link)" value={campaignData.videoUrl} onChange={e => setCampaignData({...campaignData, videoUrl: e.target.value})} className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-4 focus:outline-none text-white placeholder:text-zinc-700" />
                 
                 <div className="flex gap-4">
                    <select value={campaignData.format} onChange={e => setCampaignData({...campaignData, format: e.target.value as any})} className="flex-1 bg-[#1C1C1E] border border-white/5 rounded-2xl px-4 py-4 text-white text-sm">
                      <option value="H.264">H.264 (Compatibilidade)</option>
                      <option value="H.265">H.265 (Qualidade)</option>
                    </select>
                    <select value={campaignData.impressions} onChange={e => setCampaignData({...campaignData, impressions: parseInt(e.target.value)})} className="flex-1 bg-[#1C1C1E] border border-white/5 rounded-2xl px-4 py-4 text-white text-sm">
                      <option value="1000">1.000 Views (R$ 15)</option>
                      <option value="5000">5.000 Views (R$ 75)</option>
                      <option value="10000">10.000 Views (R$ 150)</option>
                    </select>
                 </div>

                 <div className="p-6 bg-indigo-600/10 rounded-3xl border border-indigo-500/20 flex justify-between items-center">
                    <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Investimento</span>
                    <span className="text-2xl font-black text-indigo-400">R$ {totalPrice.toFixed(2)}</span>
                 </div>

                 <button onClick={validateAndPayAd} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-500 transition-all flex items-center justify-center">
                   {loading ? <div className="w-5 h-5 border-2 border-black/30 border-t-white rounded-full animate-spin" /> : 'Ativar Campanha'}
                 </button>
               </div>
             )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Premium;
