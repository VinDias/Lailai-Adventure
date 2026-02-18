
import React from 'react';
import { User } from '../types';

const UserTab: React.FC<{ user: User | null, onLogout: () => void }> = ({ user, onLogout }) => {
  if (!user) return null;

  return (
    <div className="h-full w-full bg-[#050505] overflow-y-auto p-8 pt-20 animate-apple">
      <div className="max-w-2xl mx-auto">
        <header className="flex flex-col items-center mb-16">
          <div className="w-32 h-32 rounded-[3rem] bg-gradient-to-br from-zinc-800 to-zinc-950 p-1 mb-8 shadow-2xl">
             <img src={user.avatar || `https://picsum.photos/seed/${user.email}/200`} className="w-full h-full object-cover rounded-[2.8rem]" />
          </div>
          {/* Fix: Changed user.name to user.nome */}
          <h1 className="text-4xl font-black text-white mb-2 tracking-tighter">{user.nome}</h1>
          <p className="text-zinc-600 font-bold uppercase text-[10px] tracking-widest mb-4">{user.email}</p>
          <div className={`px-5 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest ${user.isPremium ? 'border-amber-500/30 text-amber-500 bg-amber-500/5' : 'border-white/10 text-zinc-500'}`}>
            {user.isPremium ? 'Assinante Premium' : 'Membro Free'}
          </div>
        </header>

        <section className="space-y-4 mb-16">
          <h3 className="text-xs font-black text-zinc-700 uppercase tracking-widest mb-6">Minha Conta</h3>
          <ProfileLink label="Dados de Cobrança" />
          <ProfileLink label="Histórico de Visualização" />
          <ProfileLink label="Minha Lista" />
          <ProfileLink label="Segurança da Conta" />
        </section>

        <button onClick={onLogout} className="w-full py-5 bg-rose-600/10 text-rose-500 font-black rounded-2xl border border-rose-500/20 hover:bg-rose-600/20 transition-all">ENCERRAR SESSÃO</button>
      </div>
    </div>
  );
};

const ProfileLink: React.FC<{ label: string }> = ({ label }) => (
  <div className="w-full p-6 bg-white/5 border border-white/5 rounded-3xl flex justify-between items-center cursor-pointer hover:bg-white/10 transition-all">
    <span className="font-bold text-white/80">{label}</span>
    <svg className="w-5 h-5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M9 5l7 7-7 7"/></svg>
  </div>
);

export default UserTab;
