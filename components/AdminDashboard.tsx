
import React, { useState, useEffect } from 'react';
import { Episode, Comic, Lesson, Channel } from '../types';
import { api } from '../services/api';

interface AdminDashboardProps {
  onAddEpisode: (ep: Episode) => Promise<void>;
  onAddComic: (comic: Comic) => Promise<void>;
  onAddLesson: (lesson: Lesson) => Promise<void>;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onAddEpisode, onAddComic, onAddLesson }) => {
  const [myChannels, setMyChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [epTitle, setEpTitle] = useState('');
  const [epDesc, setEpDesc] = useState('');
  const [epUrl, setEpUrl] = useState('');
  const [epDuration, setEpDuration] = useState('210');

  useEffect(() => {
    api.getMyChannels().then(chs => {
      setMyChannels(chs);
      if (chs.length > 0) setSelectedChannelId(chs[0].id.toString());
    });
  }, []);

  const handleEpisodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChannelId) return alert("Crie um canal no seu perfil primeiro!");
    
    setIsSubmitting(true);
    setError(null);
    try {
      await onAddEpisode({
        id: Date.now(),
        channelId: parseInt(selectedChannelId),
        title: epTitle,
        description: epDesc,
        videoUrl: epUrl,
        duration: parseInt(epDuration),
        thumbnail: `https://picsum.photos/seed/${epTitle}/1080/1920`,
        likes: 0,
        comments: 0
      });
      setEpTitle(''); setEpDesc(''); setEpUrl('');
      alert("Vídeo publicado com sucesso!");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full w-full bg-[#0A0A0B] text-white p-8 md:p-20 overflow-y-auto animate-apple font-lailai pb-32">
      <header className="mb-12">
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-4">Lailai Studio</h1>
        <p className="text-zinc-500 font-medium">Publique em seus estúdios autorizados.</p>
      </header>

      {myChannels.length === 0 ? (
        <div className="max-w-xl p-10 bg-rose-500/10 border border-rose-500/20 rounded-[2.5rem] text-center">
          <p className="text-rose-500 font-bold mb-4">Nenhum canal detectado.</p>
          <p className="text-zinc-500 text-sm mb-6">Para publicar conteúdo, você precisa primeiro criar um canal no seu Perfil.</p>
        </div>
      ) : (
        <div className="max-w-xl bg-[#1C1C1E] rounded-[2.5rem] p-10 border border-white/5 relative overflow-hidden">
          <form onSubmit={handleEpisodeSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-2">Publicar em:</label>
              <select 
                value={selectedChannelId} 
                onChange={e => setSelectedChannelId(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none"
              >
                {myChannels.map(ch => <option key={ch.id} value={ch.id}>{ch.name} (@{ch.handle})</option>)}
              </select>
            </div>
            
            <AdminInput label="Título do Vídeo" value={epTitle} onChange={setEpTitle} placeholder="Título impactante" />
            <AdminInput label="Duração (segundos)" value={epDuration} onChange={setEpDuration} placeholder="Máx 210" type="number" />
            <AdminInput label="Sinopse" value={epDesc} onChange={setEpDesc} placeholder="Descreva o conteúdo" />
            <AdminInput label="URL FullHD" value={epUrl} onChange={setEpUrl} placeholder="Link do MP4" />
            
            <button type="submit" disabled={isSubmitting} className="w-full bg-white text-black py-5 rounded-2xl font-black hover:bg-zinc-200 transition-all disabled:opacity-50">
              {isSubmitting ? 'Processando...' : 'Publicar Agora'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

const AdminInput: React.FC<{ label: string, value: string, onChange: (v: string) => void, placeholder: string, type?: string }> = ({ label, value, onChange, placeholder, type = "text" }) => (
  <div className="space-y-2">
    <label className="text-[10px] font-black text-zinc-600 uppercase ml-2 tracking-widest">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-black/50 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-zinc-800 focus:outline-none" />
  </div>
);

export default AdminDashboard;
