import React, { useState } from 'react';
import { User } from '../types';

interface ProfileProps {
  user: User;
  onUpdate: (updatedUser: User) => void;
  onBack: () => void;
}

const Profile: React.FC<ProfileProps> = ({ user, onUpdate, onBack }) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: user.name || '',
    phone: user.phone || '',
    email: user.email || '',
    currentPassword: '',
    newPassword: '',
    repeatPassword: ''
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.newPassword && formData.newPassword !== formData.repeatPassword) {
      alert("As novas senhas não coincidem.");
      return;
    }

    setLoading(true);
    
    setTimeout(() => {
      onUpdate({
        ...user,
        name: formData.name,
        phone: formData.phone,
        email: formData.email
      });
      setLoading(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }, 1200);
  };

  return (
    <div className="h-full w-full bg-[#0A0A0B] text-white overflow-y-auto font-lailai animate-apple pb-48 md:pb-32 scrollbar-custom">
      <div className="max-w-xl mx-auto px-6 pt-12 md:pt-20">
        
        <header className="flex justify-between items-center mb-16">
          <button 
            onClick={onBack}
            className="p-3 bg-[#1C1C1E] rounded-2xl border border-white/5 hover:bg-[#2C2C2E] transition-all text-zinc-400 hover:text-white active:scale-90"
          >
            <svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
          <div className="text-[10px] font-black tracking-[0.4em] text-zinc-700 uppercase">Segurança & Conta</div>
        </header>

        <div className="flex flex-col items-center mb-16">
          <div className="relative group">
            <div className="w-28 h-28 rounded-[2.5rem] overflow-hidden mb-6 border-4 border-white/5 shadow-2xl transition-transform group-hover:scale-105">
              <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-rose-600 rounded-2xl flex items-center justify-center border-4 border-[#0A0A0B] text-white shadow-lg cursor-pointer hover:bg-rose-500 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" strokeWidth={2}/><path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth={2}/></svg>
            </div>
          </div>
          <h1 className="text-3xl font-black tracking-tighter mb-1">{formData.name || 'Usuário LaiLai'}</h1>
          <div className="px-4 py-1.5 rounded-full bg-white/5 text-[10px] font-black uppercase tracking-widest text-zinc-500 border border-white/5">
            {user.isPremium ? '💎 Premium Member' : 'Membro Regular'}
          </div>
        </div>

        {success && (
          <div className="mb-8 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3 animate-apple">
            <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-black">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M5 13l4 4L19 7" strokeWidth={3}/></svg>
            </div>
            <p className="text-sm font-bold text-emerald-500">Configurações atualizadas com sucesso!</p>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-12">
          <section className="space-y-5">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600 ml-1">Dados Pessoais</h3>
            <div className="grid grid-cols-1 gap-5">
              <InputGroup label="Nome de Exibição" value={formData.name} onChange={v => setFormData({...formData, name: v})} placeholder="Seu nome" />
              <InputGroup label="Contato Telefônico" value={formData.phone} onChange={v => setFormData({...formData, phone: v})} placeholder="(00) 00000-0000" type="tel" />
              <InputGroup label="E-mail de Acesso" value={formData.email} onChange={v => setFormData({...formData, email: v})} placeholder="seu@email.com" type="email" />
            </div>
          </section>

          <section className="space-y-5">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600 ml-1">Autenticação</h3>
            <div className="grid grid-cols-1 gap-5">
              <InputGroup label="Senha Atual" value={formData.currentPassword} onChange={v => setFormData({...formData, currentPassword: v})} placeholder="••••••••" type="password" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <InputGroup label="Nova Senha" value={formData.newPassword} onChange={v => setFormData({...formData, newPassword: v})} placeholder="Mín. 8 caracteres" type="password" />
                <InputGroup label="Repetir Nova Senha" value={formData.repeatPassword} onChange={v => setFormData({...formData, repeatPassword: v})} placeholder="Confirme" type="password" />
              </div>
            </div>
          </section>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black font-black py-5 rounded-[1.8rem] mt-12 transition-all hover:bg-zinc-200 shadow-2xl shadow-white/5 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : (
              'Salvar Preferências'
            )}
          </button>
        </form>
      </div>

      <style>{`
        .scrollbar-custom::-webkit-scrollbar {
          width: 6px;
          display: block;
        }
        .scrollbar-custom::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 10px;
        }
        .scrollbar-custom::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .scrollbar-custom::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }
      `}</style>
    </div>
  );
};

const InputGroup: React.FC<{ label: string, value: string, onChange: (v: string) => void, placeholder: string, type?: string }> = ({ label, value, onChange, placeholder, type = "text" }) => (
  <div className="space-y-1.5 group">
    <label className="text-[9px] font-black text-zinc-700 uppercase ml-3 tracking-widest group-focus-within:text-white transition-colors">{label}</label>
    <input 
      type={type} 
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-4.5 focus:outline-none focus:border-zinc-700 transition-all text-white placeholder:text-zinc-700"
      placeholder={placeholder}
    />
  </div>
);

export default Profile;