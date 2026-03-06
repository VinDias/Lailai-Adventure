
import React, { useState, useEffect } from 'react';
import { User, Channel } from '../types';
import { api } from '../services/api';

interface ProfileProps {
  user: User;
  onUpdate: (updatedUser: User) => void;
  onBack: () => void;
}

const Profile: React.FC<ProfileProps> = ({ user, onUpdate, onBack }) => {
  const [loading, setLoading] = useState(false);
  const [myChannels, setMyChannels] = useState<Channel[]>([]);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: '', handle: '', description: '' });

  useEffect(() => {
    loadMyChannels();
  }, []);

  const loadMyChannels = async () => {
    try {
      const channels = await api.getMyChannels();
      setMyChannels(channels);
    } catch (e) { console.error(e); }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.createChannel({
        ...newChannel,
        avatar: `https://picsum.photos/seed/${newChannel.handle}/200`,
        banner: `https://picsum.photos/seed/${newChannel.handle}-banner/1200/400`
      });
      setShowCreateChannel(false);
      setNewChannel({ name: '', handle: '', description: '' });
      await loadMyChannels();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full bg-[#0A0A0B] text-white overflow-y-auto font-inter animate-apple pb-48 scrollbar-custom">
      <div className="max-w-xl mx-auto px-6 pt-12">
        <header className="flex justify-between items-center mb-16">
          <button onClick={onBack} className="p-3 bg-[#1C1C1E] rounded-2xl border border-white/5 text-zinc-400"><svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg></button>
          <div className="text-[10px] font-black tracking-[0.4em] text-zinc-700 uppercase">Estúdios & Conta</div>
        </header>

        <div className="flex flex-col items-center mb-16">
          <img src={user.avatar} className="w-28 h-28 rounded-[2.5rem] mb-6 border-4 border-white/5 shadow-2xl" />
          {/* Fix: Changed user.name to user.nome */}
          <h1 className="text-3xl font-black mb-1">{user.nome || 'Usuário'}</h1>
          <div className="px-4 py-1.5 rounded-full bg-white/5 text-[10px] font-black uppercase text-zinc-500 border border-white/5">Membro Premium</div>
        </div>

        <section className="mb-12">
          <div className="flex justify-between items-end mb-6">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Meus Canais (Estúdios)</h3>
            <button onClick={() => setShowCreateChannel(true)} className="text-[10px] font-black text-rose-500 uppercase">+ Criar Novo</button>
          </div>

          <div className="space-y-4">
            {myChannels.length === 0 ? (
              <div className="p-8 border-2 border-dashed border-white/5 rounded-3xl text-center">
                <p className="text-zinc-600 text-sm">Você ainda não possui estúdios para publicar.</p>
              </div>
            ) : (
              myChannels.map(ch => (
                <div key={ch.id} className="p-5 bg-[#1C1C1E] rounded-3xl border border-white/5 flex items-center gap-4">
                  <img src={ch.avatar} className="w-12 h-12 rounded-xl" />
                  <div className="flex-1">
                    <h4 className="font-bold">{ch.name}</h4>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">@{ch.handle}</p>
                  </div>
                  <div className="text-rose-500 text-xs font-black">Ativo</div>
                </div>
              ))
            )}
          </div>
        </section>

        {showCreateChannel && (
          <div className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
            <form onSubmit={handleCreateChannel} className="w-full max-w-sm bg-[#1C1C1E] p-10 rounded-[2.5rem] border border-white/5 animate-apple">
              <h2 className="text-2xl font-black mb-6">Novo Estúdio</h2>
              <div className="space-y-4 mb-8">
                <input required placeholder="Nome do Canal" value={newChannel.name} onChange={e => setNewChannel({...newChannel, name: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-4 text-white" />
                <input required placeholder="handle (ex: neotokyo)" value={newChannel.handle} onChange={e => setNewChannel({...newChannel, handle: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-4 text-white" />
                <textarea placeholder="Descrição curta" value={newChannel.description} onChange={e => setNewChannel({...newChannel, description: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-4 text-white h-24" />
              </div>
              <div className="flex gap-4">
                <button type="button" onClick={() => setShowCreateChannel(false)} className="flex-1 font-bold text-zinc-500">Cancelar</button>
                <button disabled={loading} type="submit" className="flex-1 bg-white text-black font-black py-4 rounded-2xl">{loading ? '...' : 'Criar'}</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
