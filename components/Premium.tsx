
import React, { useState } from 'react';
import { ICONS } from '../constants';

interface PremiumProps {
  onUpgradeComplete: () => void;
  onBack: () => void;
}

type TabType = 'user' | 'business';
type Step = 'selection' | 'form';

const Premium: React.FC<PremiumProps> = ({ onUpgradeComplete, onBack }) => {
  const [activeTab, setActiveTab] = useState<TabType>('user');
  const [step, setStep] = useState<Step>('selection');
  const [loading, setLoading] = useState(false);

  // Dados do formulário "Sem Anúncios"
  const [userData, setUserData] = useState({
    nome: '',
    endereco: '',
    telefone: '',
    email: ''
  });

  // Dados do formulário "Campanhas"
  const [campaignData, setCampaignData] = useState({
    nome: '',
    url: '',
    descricao: '',
    publico: ''
  });

  const handlePayment = () => {
    setLoading(true);
    // Simulação de redirecionamento para o Mercado Pago
    setTimeout(() => {
      onUpgradeComplete();
      setLoading(false);
    }, 2000);
  };

  const isUserFormValid = userData.nome && userData.endereco && userData.telefone && userData.email;
  const isCampaignFormValid = campaignData.nome && campaignData.url;

  return (
    <div className="h-full w-full bg-[#0A0A0B] text-white overflow-y-auto font-lailai animate-apple pb-48 md:pb-32">
      <div className="max-w-4xl mx-auto px-6 pt-12 md:pt-20">
        
        {/* Header com botão de voltar */}
        <header className="flex justify-between items-center mb-16">
          <button 
            onClick={step === 'form' ? () => setStep('selection') : onBack}
            className="p-3 bg-[#1C1C1E] rounded-2xl border border-white/5 hover:bg-[#2C2C2E] transition-all text-zinc-400 hover:text-white"
          >
            <svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
          <div className="text-[10px] font-black tracking-[0.3em] text-zinc-600 uppercase">LaiLai Premium</div>
        </header>

        {step === 'selection' ? (
          <div className="animate-apple">
            <div className="text-center mb-12">
              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter mb-6 premium-text">Cinema Pass</h1>
              <p className="text-zinc-500 text-lg md:text-xl max-w-lg mx-auto leading-snug">Escolha sua forma de apoiar e brilhar na plataforma.</p>
            </div>

            {/* Segmented Control (Abas) */}
            <div className="flex p-1 bg-[#1C1C1E] rounded-2xl w-full max-w-sm mx-auto mb-16 border border-white/5">
              <button 
                onClick={() => setActiveTab('user')}
                className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'user' ? 'bg-[#2C2C2E] text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Para Você
              </button>
              <button 
                onClick={() => setActiveTab('business')}
                className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'business' ? 'bg-[#2C2C2E] text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Para Empresas
              </button>
            </div>

            <div className="grid grid-cols-1 gap-8 max-w-2xl mx-auto">
              {activeTab === 'user' ? (
                <div 
                  onClick={() => setStep('form')}
                  className="group bg-[#1C1C1E] border border-white/5 rounded-[2.5rem] p-10 flex flex-col items-center text-center cursor-pointer transition-all hover:bg-[#2C2C2E] hover:scale-[1.02] active:scale-[0.98]"
                >
                  <div className="w-20 h-20 bg-rose-600/10 rounded-[1.5rem] flex items-center justify-center mb-8 text-rose-500 group-hover:rotate-12 transition-transform">
                    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <h3 className="text-3xl font-extrabold mb-4">Zero Anúncios</h3>
                  <p className="text-zinc-500 mb-10 text-sm leading-relaxed">Assista sem interrupções e desbloqueie a Biblioteca da Academia.</p>
                  <div className="w-full py-5 bg-white text-black font-black rounded-2xl flex items-center justify-center gap-3">
                    Assinar R$ 9,90/mês
                  </div>
                </div>
              ) : (
                <div 
                  onClick={() => setStep('form')}
                  className="group bg-[#1C1C1E] border border-white/5 rounded-[2.5rem] p-10 flex flex-col items-center text-center cursor-pointer transition-all hover:bg-[#2C2C2E] hover:scale-[1.02] active:scale-[0.98]"
                >
                  <div className="w-20 h-20 bg-indigo-600/10 rounded-[1.5rem] flex items-center justify-center mb-8 text-indigo-500 group-hover:-rotate-12 transition-transform">
                    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </div>
                  <h3 className="text-3xl font-extrabold mb-4">Promover Arte</h3>
                  <p className="text-zinc-500 mb-10 text-sm leading-relaxed">Sua campanha vertical exibida para toda a comunidade brasileira.</p>
                  <div className="w-full py-5 border border-white/10 font-black rounded-2xl flex items-center justify-center gap-3 hover:bg-white/5 transition-all">
                    Criar Campanha
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Passo de Formulário e Pagamento */
          <div className="max-w-md mx-auto animate-apple">
            <div className="mb-12">
              <span className="text-[10px] font-black tracking-[0.2em] text-zinc-500 uppercase block mb-2">
                {activeTab === 'user' ? 'Cadastro de Assinante' : 'Gerenciador de Campanhas'}
              </span>
              <h2 className="text-3xl font-extrabold tracking-tight">
                {activeTab === 'user' ? 'Dados para Pagamento' : 'Configurar Anúncio'}
              </h2>
            </div>

            <div className="space-y-6">
              {activeTab === 'user' ? (
                <div className="space-y-4">
                  <input 
                    type="text" 
                    placeholder="Nome Completo" 
                    value={userData.nome}
                    onChange={(e) => setUserData({...userData, nome: e.target.value})}
                    className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-rose-500/50 transition-all text-white placeholder:text-zinc-600"
                  />
                  <input 
                    type="text" 
                    placeholder="Endereço" 
                    value={userData.endereco}
                    onChange={(e) => setUserData({...userData, endereco: e.target.value})}
                    className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-rose-500/50 transition-all text-white placeholder:text-zinc-600"
                  />
                  <input 
                    type="tel" 
                    placeholder="Telefone com DDD" 
                    value={userData.telefone}
                    onChange={(e) => setUserData({...userData, telefone: e.target.value})}
                    className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-rose-500/50 transition-all text-white placeholder:text-zinc-600"
                  />
                  <input 
                    type="email" 
                    placeholder="E-mail" 
                    value={userData.email}
                    onChange={(e) => setUserData({...userData, email: e.target.value})}
                    className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-rose-500/50 transition-all text-white placeholder:text-zinc-600"
                  />
                </div>
              ) : (
                <div className="space-y-8 pb-10">
                  {/* Seção de Texto para Leitura Melhor no Smartphone */}
                  <div className="p-6 bg-[#1C1C1E] rounded-3xl border border-white/5 space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-indigo-400">Diretrizes da Campanha</h4>
                    <div className="max-h-40 overflow-y-auto pr-2 space-y-3 scrollbar-custom text-zinc-400 text-[13px] leading-relaxed">
                      <p>• O vídeo deve estar no formato vertical (9:16).</p>
                      <p>• A duração máxima permitida é de 90 segundos para manter o engajamento.</p>
                      <p>• Não permitimos conteúdo ofensivo ou que viole as leis brasileiras.</p>
                      <p>• Após o pagamento, nossa equipe revisará sua peça em até 24 horas.</p>
                      <p>• Você receberá relatórios de impressões semanalmente via e-mail.</p>
                      <p>• Certifique-se de que o link do vídeo seja acessível publicamente (ex: Google Drive ou S3).</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-600 uppercase ml-2 tracking-widest">Título da Campanha</label>
                      <input 
                        type="text" 
                        placeholder="Ex: Lançamento Coleção Outono" 
                        value={campaignData.nome}
                        onChange={(e) => setCampaignData({...campaignData, nome: e.target.value})}
                        className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-indigo-500/50 transition-all text-white placeholder:text-zinc-600"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-600 uppercase ml-2 tracking-widest">URL do Vídeo (MP4)</label>
                      <input 
                        type="text" 
                        placeholder="https://seu-link-publico.mp4" 
                        value={campaignData.url}
                        onChange={(e) => setCampaignData({...campaignData, url: e.target.value})}
                        className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-indigo-500/50 transition-all text-white placeholder:text-zinc-600"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-600 uppercase ml-2 tracking-widest">Descrição (Opcional)</label>
                      <textarea 
                        placeholder="Conte um pouco sobre sua marca..." 
                        rows={3}
                        value={campaignData.descricao}
                        onChange={(e) => setCampaignData({...campaignData, descricao: e.target.value})}
                        className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-indigo-500/50 transition-all text-white placeholder:text-zinc-600 resize-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {((activeTab === 'user' && isUserFormValid) || (activeTab === 'business' && isCampaignFormValid)) && (
                <button 
                  onClick={handlePayment}
                  disabled={loading}
                  className={`w-full py-5 rounded-2xl font-black flex items-center justify-center gap-3 transition-all mt-8 shadow-2xl ${activeTab === 'user' ? 'bg-white text-black hover:bg-zinc-200' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  ) : (
                    <>
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2-2-2-2zM20 14H4v-6h16v6zm0-10H4V6h16v6z" /></svg>
                      Ir para Mercado Pago
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-20 text-center opacity-30">
          <p className="text-[10px] font-bold tracking-widest uppercase">Garantia de Qualidade LaiLai Labs</p>
        </div>
      </div>
      
      <style>{`
        .scrollbar-custom::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-custom::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 10px;
        }
        .scrollbar-custom::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .scrollbar-custom::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
};

export default Premium;
