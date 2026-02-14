
import React, { useState } from 'react';
import { Episode, Comic, Lesson } from '../types';

interface AdminDashboardProps {
  onAddEpisode: (ep: Episode) => Promise<void>;
  onAddComic: (comic: Comic) => Promise<void>;
  onAddLesson: (lesson: Lesson) => Promise<void>;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onAddEpisode, onAddComic, onAddLesson }) => {
  const [activeTab, setActiveTab] = useState<'hqcines' | 'hiqua' | 'academia'>('hqcines');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [epTitle, setEpTitle] = useState('');
  const [epDesc, setEpDesc] = useState('');
  const [epUrl, setEpUrl] = useState('');
  const [epDuration, setEpDuration] = useState('210');

  const [coTitle, setCoTitle] = useState('');
  const [coAuthor, setCoAuthor] = useState('');
  const [coPanels, setCoPanels] = useState('');

  const [leTitle, setLeTitle] = useState('');
  const [leUrl, setLeUrl] = useState('');
  const [leDuration, setLeDuration] = useState('210');

  const handleEpisodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await onAddEpisode({
        id: Date.now(),
        channelId: 1,
        title: epTitle,
        description: epDesc,
        videoUrl: epUrl,
        duration: parseInt(epDuration),
        thumbnail: `https://picsum.photos/seed/${epTitle}/1080/1920`,
        likes: 0,
        comments: 0
      });
      setEpTitle(''); setEpDesc(''); setEpUrl('');
      alert("Vídeo publicado com sucesso no HQCINE!");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await onAddComic({
        id: Date.now(),
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
      alert("Webtoon publicada com sucesso no HI-QUA!");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLessonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await onAddLesson({
        id: Date.now(),
        channelId: 1,
        title: leTitle,
        description: 'Conteúdo educativo premium.',
        category: 'Masterclass Técnica',
        videoUrl: leUrl,
        duration: parseInt(leDuration),
        thumbnail: `https://picsum.photos/seed/${leTitle}/1080/1920`,
        date: 'Agora',
        likes: 0
      });
      setLeTitle(''); setLeUrl('');
      alert("Aula publicada com sucesso na ACADEMIA!");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full w-full bg-[#0A0A0B] text-white p-8 md:p-20 overflow-y-auto animate-apple font-lailai scrollbar-custom pb-32">
      <header className="mb-12">
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-4">Painel do Proprietário</h1>
        <p className="text-zinc-500 font-medium">Controle central de conteúdo. <span className="text-rose-500 font-black">Limite Global de Vídeo: 3min 30s (210s).</span></p>
      </header>

      {error && (
        <div className="max-w-xl mb-8 p-6 bg-rose-500/10 border border-rose-500/20 rounded-3xl flex items-start gap-4 animate-apple">
          <div className="w-6 h-6 bg-rose-500 rounded-full flex-shrink-0 flex items-center justify-center text-black font-black">!</div>
          <div className="flex-1">
             <h4 className="text-rose-500 font-black text-xs uppercase tracking-widest mb-1">Erro de Validação (Backend)</h4>
             <p className="text-sm text-rose-200/70">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-zinc-500 hover:text-white">&times;</button>
        </div>
      )}

      <div className="flex gap-4 mb-12 bg-[#1C1C1E] p-1.5 rounded-2xl w-fit border border-white/5">
        {(['hqcines', 'hiqua', 'academia'] as const).map(tab => (
          <button 
            key={tab}
            onClick={() => { setActiveTab(tab); setError(null); }}
            className={`px-8 py-3 rounded-xl text-sm font-bold capitalize transition-all ${activeTab === tab ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white'}`}
          >
            {tab === 'hqcines' ? 'HQCINE' : tab === 'hiqua' ? 'HI-QUA' : 'AULAS'}
          </button>
        ))}
      </div>

      <div className="max-w-xl bg-[#1C1C1E] rounded-[2.5rem] p-10 border border-white/5 shadow-2xl relative overflow-hidden">
        {isSubmitting && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
             <div className="w-10 h-10 border-4 border-white/10 border-t-white rounded-full animate-spin" />
             <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Validando Metadados no Servidor...</span>
          </div>
        )}

        {activeTab === 'hqcines' && (
          <form onSubmit={handleEpisodeSubmit} className="space-y-6">
            <h2 className="text-2xl font-bold mb-4">Novo Vídeo (HQCINE)</h2>
            <AdminInput label="Título" value={epTitle} onChange={setEpTitle} placeholder="Título impactante" />
            <AdminInput label="Duração Estimada (segundos)" value={epDuration} onChange={setEpDuration} placeholder="Ex: 210" type="number" />
            <AdminInput label="Sinopse" value={epDesc} onChange={setEpDesc} placeholder="Descreva o vídeo..." />
            <AdminInput label="URL FullHD" value={epUrl} onChange={setEpUrl} placeholder="https://..." />
            <button type="submit" disabled={isSubmitting} className="w-full bg-rose-600 py-5 rounded-2xl font-black hover:bg-rose-500 transition-all disabled:opacity-50">Upload HQCINE</button>
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
            <button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 py-5 rounded-2xl font-black hover:bg-indigo-500 transition-all disabled:opacity-50">Upload HI-QUA</button>
          </form>
        )}

        {activeTab === 'academia' && (
          <form onSubmit={handleLessonSubmit} className="space-y-6">
            <h2 className="text-2xl font-bold mb-4">Nova Aula (AULAS)</h2>
            <AdminInput label="Título" value={leTitle} onChange={setLeTitle} placeholder="Assunto da aula" />
            <AdminInput label="Duração Estimada (segundos)" value={leDuration} onChange={setLeDuration} placeholder="Ex: 210" type="number" />
            <AdminInput label="URL FullHD" value={leUrl} onChange={setLeUrl} placeholder="https://..." />
            <button type="submit" disabled={isSubmitting} className="w-full bg-emerald-600 py-5 rounded-2xl font-black hover:bg-emerald-500 transition-all text-white disabled:opacity-50">Upload AULAS</button>
          </form>
        )}
      </div>
    </div>
  );
};

const AdminInput: React.FC<{ label: string, value: string, onChange: (v: string) => void, placeholder: string, type?: string }> = ({ label, value, onChange, placeholder, type = "text" }) => (
  <div className="space-y-2">
    <label className="text-[10px] font-black text-zinc-600 uppercase ml-2 tracking-widest">{label}</label>
    <input 
      type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-black/50 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-white/20 transition-all text-white placeholder:text-zinc-800"
    />
  </div>
);

export default AdminDashboard;
