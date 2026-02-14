
import React, { useState } from 'react';
import { Episode, Comic, Lesson } from '../types';

interface AdminDashboardProps {
  onAddEpisode: (ep: Episode) => void;
  onAddComic: (comic: Comic) => void;
  onAddLesson: (lesson: Lesson) => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onAddEpisode, onAddComic, onAddLesson }) => {
  const [activeTab, setActiveTab] = useState<'hqcines' | 'hiqua' | 'academia'>('hqcines');
  
  const [epTitle, setEpTitle] = useState('');
  const [epDesc, setEpDesc] = useState('');
  const [epUrl, setEpUrl] = useState('');

  const [coTitle, setCoTitle] = useState('');
  const [coAuthor, setCoAuthor] = useState('');
  const [coPanels, setCoPanels] = useState('');

  const [leTitle, setLeTitle] = useState('');
  const [leUrl, setLeUrl] = useState('');

  const handleEpisodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddEpisode({
      id: Date.now(),
      // Fix: Added missing required channelId property
      channelId: 1,
      title: epTitle,
      description: epDesc,
      videoUrl: epUrl,
      duration: 210, // Max for HQCINE
      thumbnail: `https://picsum.photos/seed/${epTitle}/1080/1920`,
      likes: 0,
      comments: 0
    });
    setEpTitle(''); setEpDesc(''); setEpUrl('');
    alert("Vídeo publicado no HQCINE (Limite 210s)!");
  };

  const handleComicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddComic({
      id: Date.now(),
      // Fix: Added missing required channelId property
      channelId: 1,
      title: coTitle,
      author: coAuthor,
      description: 'Publicação oficial via Painel Admin.',
      thumbnail: `https://picsum.photos/seed/${coTitle}/1080/1920`,
      panels: coPanels.split(',').map(p => p.trim()),
      likes: 0,
      comments: 0
    });
    setCoTitle(''); setCoAuthor(''); setCoPanels('');
    alert("Webtoon publicada no HI-QUA!");
  };

  const handleLessonSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddLesson({
      id: Date.now(),
      // Fix: Added missing required channelId, description and likes properties
      channelId: 1,
      title: leTitle,
      description: 'Conteúdo educativo premium.',
      category: 'Masterclass Técnica',
      videoUrl: leUrl,
      duration: 300, // Max for Academia
      thumbnail: `https://picsum.photos/seed/${leTitle}/1080/1920`,
      date: 'Agora',
      likes: 0
    });
    setLeTitle(''); setLeUrl('');
    alert("Aula publicada na ACADEMIA (Limite 300s)!");
  };

  return (
    <div className="h-full w-full bg-[#0A0A0B] text-white p-8 md:p-20 overflow-y-auto animate-apple font-lailai scrollbar-custom pb-32">
      <header className="mb-12">
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-4">Painel do Proprietário</h1>
        <p className="text-zinc-500 font-medium">Controle de publicações e limites técnicos (HQCINE: 210s | Academia: 300s).</p>
      </header>

      <div className="flex gap-4 mb-12 bg-[#1C1C1E] p-1.5 rounded-2xl w-fit border border-white/5">
        {(['hqcines', 'hiqua', 'academia'] as const).map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-8 py-3 rounded-xl text-sm font-bold capitalize transition-all ${activeTab === tab ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white'}`}
          >
            {tab === 'hqcines' ? 'HQCINE' : tab === 'hiqua' ? 'HI-QUA' : 'AULAS'}
          </button>
        ))}
      </div>

      <div className="max-w-xl bg-[#1C1C1E] rounded-[2.5rem] p-10 border border-white/5 shadow-2xl">
        {activeTab === 'hqcines' && (
          <form onSubmit={handleEpisodeSubmit} className="space-y-6">
            <h2 className="text-2xl font-bold mb-4">Novo Vídeo (HQCINE)</h2>
            <AdminInput label="Título (Máx 210s)" value={epTitle} onChange={setEpTitle} placeholder="Título impactante" />
            <AdminInput label="Sinopse" value={epDesc} onChange={setEpDesc} placeholder="Descreva o vídeo..." />
            <AdminInput label="URL FullHD (30-60 FPS)" value={epUrl} onChange={setEpUrl} placeholder="https://..." />
            <button type="submit" className="w-full bg-rose-600 py-5 rounded-2xl font-black hover:bg-rose-500 transition-all">Upload HQCINE</button>
          </form>
        )}

        {activeTab === 'hiqua' && (
          <form onSubmit={handleComicSubmit} className="space-y-6">
            <h2 className="text-2xl font-bold mb-4">Nova Webtoon (HI-QUA)</h2>
            <AdminInput label="Título da Obra" value={coTitle} onChange={setCoTitle} placeholder="Ex: Cyber Sertão" />
            <AdminInput label="Nome do Autor" value={coAuthor} onChange={setCoAuthor} placeholder="Créditos" />
            <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-600 uppercase ml-2 tracking-widest">Painéis (URLs com vírgula)</label>
                <textarea 
                  value={coPanels} onChange={e => setCoPanels(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-indigo-500 transition-all text-white h-32 placeholder:text-zinc-800"
                  placeholder="https://img1.jpg, https://img2.jpg..."
                />
            </div>
            <button type="submit" className="w-full bg-indigo-600 py-5 rounded-2xl font-black hover:bg-indigo-500 transition-all">Upload HI-QUA</button>
          </form>
        )}

        {activeTab === 'academia' && (
          <form onSubmit={handleLessonSubmit} className="space-y-6">
            <h2 className="text-2xl font-bold mb-4">Nova Aula (AULAS)</h2>
            <AdminInput label="Título (Máx 300s)" value={leTitle} onChange={setLeTitle} placeholder="Assunto da aula" />
            <AdminInput label="URL FullHD (30-60 FPS)" value={leUrl} onChange={setLeUrl} placeholder="https://..." />
            <button type="submit" className="w-full bg-emerald-600 py-5 rounded-2xl font-black hover:bg-emerald-500 transition-all text-white">Upload AULAS</button>
          </form>
        )}
      </div>
    </div>
  );
};

const AdminInput: React.FC<{ label: string, value: string, onChange: (v: string) => void, placeholder: string }> = ({ label, value, onChange, placeholder }) => (
  <div className="space-y-2">
    <label className="text-[10px] font-black text-zinc-600 uppercase ml-2 tracking-widest">{label}</label>
    <input 
      type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-black/50 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-white/20 transition-all text-white placeholder:text-zinc-800"
    />
  </div>
);

export default AdminDashboard;
