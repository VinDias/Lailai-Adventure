
import React, { useState, useEffect } from 'react';
import { Series, Episode, Ad } from '../types';
import { api } from '../services/api';

const AdminDashboard: React.FC = () => {
  const [series, setSeries] = useState<Series[]>([]);
  const [activeTab, setActiveTab] = useState<'series' | 'chapter' | 'video' | 'ad'>('series');
  const [selectedSeriesId, setSelectedSeriesId] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Forms
  const [seriesForm, setSeriesForm] = useState({ title: '', description: '', cover_image: '', genre: 'Suspense' });
  const [chapterForm, setChapterForm] = useState({ chapter_number: 1, title: '', panels: [] as string[] });
  const [videoForm, setVideoForm] = useState({ title: '', video_url: '', duration: 60 });

  useEffect(() => {
    api.getSeries().then(setSeries);
  }, []);

  const handleCreateSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.createSeries(seriesForm as any);
      alert("Série Criada com Sucesso!");
      const updated = await api.getSeries();
      setSeries(updated);
    } catch (err) {
      alert("Erro ao criar série.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeriesId) return;
    setLoading(true);
    try {
      await api.createChapter({ ...chapterForm, series_id: parseInt(selectedSeriesId) });
      alert("Capítulo Publicado!");
    } catch (err) {
      alert("Erro ao publicar capítulo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full bg-[#0A0A0B] text-white p-10 overflow-y-auto pb-40">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-black mb-12 tracking-tighter">LaiLai Creator Studio</h1>
        
        <div className="flex gap-2 mb-12 overflow-x-auto pb-4 scrollbar-hide">
          {['series', 'chapter', 'video', 'ad'].map((t: any) => (
            <button key={t} onClick={() => setActiveTab(t)} className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === t ? 'bg-white text-black scale-105 shadow-xl shadow-white/10' : 'bg-white/5 text-zinc-500 hover:bg-white/10'}`}>{t}</button>
          ))}
        </div>

        <div className="max-w-xl bg-[#1C1C1E] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
          {activeTab === 'series' && (
            <form onSubmit={handleCreateSeries} className="space-y-4 animate-apple">
               <input required placeholder="Título da Série" className="w-full bg-black/50 border border-white/10 p-5 rounded-2xl focus:border-rose-500 outline-none" value={seriesForm.title} onChange={e => setSeriesForm({...seriesForm, title: e.target.value})} />
               <textarea placeholder="Sinopse" className="w-full bg-black/50 border border-white/10 p-5 rounded-2xl h-32 focus:border-rose-500 outline-none" value={seriesForm.description} onChange={e => setSeriesForm({...seriesForm, description: e.target.value})} />
               <input required placeholder="URL Capa Vertical" className="w-full bg-black/50 border border-white/10 p-5 rounded-2xl focus:border-rose-500 outline-none" value={seriesForm.cover_image} onChange={e => setSeriesForm({...seriesForm, cover_image: e.target.value})} />
               <button disabled={loading} className="w-full py-5 bg-rose-600 font-black rounded-2xl hover:bg-rose-500 transition-all flex items-center justify-center">
                 {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'CRIAR SÉRIE'}
               </button>
            </form>
          )}

          {activeTab === 'chapter' && (
            <form onSubmit={handleCreateChapter} className="space-y-4 animate-apple">
               <select className="w-full bg-black/50 border border-white/10 p-5 rounded-2xl focus:border-rose-500 outline-none" value={selectedSeriesId} onChange={e => setSelectedSeriesId(e.target.value)}>
                  <option value="">Selecione a Série...</option>
                  {series.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
               </select>
               <input type="number" placeholder="Número do Capítulo" className="w-full bg-black/50 border border-white/10 p-5 rounded-2xl focus:border-rose-500 outline-none" value={chapterForm.chapter_number} onChange={e => setChapterForm({...chapterForm, chapter_number: parseInt(e.target.value)})} />
               <input placeholder="Título do Capítulo" className="w-full bg-black/50 border border-white/10 p-5 rounded-2xl focus:border-rose-500 outline-none" value={chapterForm.title} onChange={e => setChapterForm({...chapterForm, title: e.target.value})} />
               <textarea placeholder="URLs dos Painéis (Um por linha - Máx 50)" className="w-full bg-black/50 border border-white/10 p-5 rounded-2xl h-48 focus:border-rose-500 outline-none" onChange={e => setChapterForm({...chapterForm, panels: e.target.value.split('\n').filter(l => l.trim())})} />
               <button disabled={loading} className="w-full py-5 bg-emerald-600 font-black rounded-2xl hover:bg-emerald-500 transition-all flex items-center justify-center">
                 {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'PUBLICAR CAPÍTULO'}
               </button>
            </form>
          )}

          {activeTab === 'video' && (
            <form onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              try {
                await api.saveEpisode({...videoForm, series_id: parseInt(selectedSeriesId)} as any);
                alert("Vídeo HQCINE Publicado!");
              } catch (err) {
                alert("Erro ao publicar vídeo.");
              } finally {
                setLoading(false);
              }
            }} className="space-y-4 animate-apple">
               <select className="w-full bg-black/50 border border-white/10 p-5 rounded-2xl focus:border-rose-500 outline-none" value={selectedSeriesId} onChange={e => setSelectedSeriesId(e.target.value)}>
                  <option value="">Selecione a Série...</option>
                  {series.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
               </select>
               <input required placeholder="Título do Vídeo" className="w-full bg-black/50 border border-white/10 p-5 rounded-2xl focus:border-rose-500 outline-none" value={videoForm.title} onChange={e => setVideoForm({...videoForm, title: e.target.value})} />
               <input required placeholder="URL MP4 (Ou pasta m3u8)" className="w-full bg-black/50 border border-white/10 p-5 rounded-2xl focus:border-rose-500 outline-none" value={videoForm.video_url} onChange={e => setVideoForm({...videoForm, video_url: e.target.value})} />
               <input type="number" placeholder="Duração (Segundos - Máx 600)" className="w-full bg-black/50 border border-white/10 p-5 rounded-2xl focus:border-rose-500 outline-none" value={videoForm.duration} onChange={e => setVideoForm({...videoForm, duration: parseInt(e.target.value)})} />
               <button disabled={loading} className="w-full py-5 bg-blue-600 font-black rounded-2xl hover:bg-blue-500 transition-all flex items-center justify-center">
                 {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'PUBLICAR VÍDEO'}
               </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
