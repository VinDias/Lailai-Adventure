
import React, { useState, useEffect } from 'react';
import { Series, Episode, Ad } from '../types';
import { api } from '../services/api';

const AdminDashboard: React.FC = () => {
  const [series, setSeries] = useState<Series[]>([]);
  const [activeTab, setActiveTab] = useState<'series' | 'chapter' | 'video' | 'ad'>('series');
  const [selectedSeriesId, setSelectedSeriesId] = useState('');
  
  // Forms
  const [seriesForm, setSeriesForm] = useState({ title: '', description: '', cover_image: '', genre: 'Suspense' });
  const [chapterForm, setChapterForm] = useState({ chapter_number: 1, title: '', panels: [] as string[] });
  const [videoForm, setVideoForm] = useState({ title: '', video_url: '', duration: 60 });

  useEffect(() => {
    api.getSeries().then(setSeries);
  }, []);

  const handleCreateSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createSeries(seriesForm as any);
    alert("Série Criada!");
    api.getSeries().then(setSeries);
  };

  const handleCreateChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeriesId) return;
    const res = await fetch('http://localhost:5000/api/chapters', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('lailai_token')}`
      },
      body: JSON.stringify({ ...chapterForm, series_id: parseInt(selectedSeriesId) })
    });
    if (res.ok) alert("Capítulo Criado!");
    else alert("Erro ao criar capítulo (Máx 22 painéis)");
  };

  return (
    <div className="h-full w-full bg-[#0A0A0B] text-white p-10 overflow-y-auto pb-40">
      <h1 className="text-4xl font-black mb-12 tracking-tighter">LaiLai Creator Studio</h1>
      
      <div className="flex gap-2 mb-12 overflow-x-auto pb-4">
        {['series', 'chapter', 'video', 'ad'].map((t: any) => (
          <button key={t} onClick={() => setActiveTab(t)} className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest ${activeTab === t ? 'bg-white text-black' : 'bg-white/5'}`}>{t}</button>
        ))}
      </div>

      <div className="max-w-xl bg-white/5 p-8 rounded-[2rem] border border-white/5">
        {activeTab === 'series' && (
          <form onSubmit={handleCreateSeries} className="space-y-4">
             <input required placeholder="Título da Série" className="w-full bg-black border border-white/10 p-4 rounded-xl" value={seriesForm.title} onChange={e => setSeriesForm({...seriesForm, title: e.target.value})} />
             <textarea placeholder="Sinopse" className="w-full bg-black border border-white/10 p-4 rounded-xl h-32" value={seriesForm.description} onChange={e => setSeriesForm({...seriesForm, description: e.target.value})} />
             <input required placeholder="URL Capa Vertical" className="w-full bg-black border border-white/10 p-4 rounded-xl" value={seriesForm.cover_image} onChange={e => setSeriesForm({...seriesForm, cover_image: e.target.value})} />
             <button className="w-full py-4 bg-rose-600 font-black rounded-xl">CRIAR SÉRIE</button>
          </form>
        )}

        {activeTab === 'chapter' && (
          <form onSubmit={handleCreateChapter} className="space-y-4">
             <select className="w-full bg-black border border-white/10 p-4 rounded-xl" value={selectedSeriesId} onChange={e => setSelectedSeriesId(e.target.value)}>
                <option value="">Selecione a Série...</option>
                {series.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
             </select>
             <input type="number" placeholder="Número do Capítulo" className="w-full bg-black border border-white/10 p-4 rounded-xl" value={chapterForm.chapter_number} onChange={e => setChapterForm({...chapterForm, chapter_number: parseInt(e.target.value)})} />
             <input placeholder="Título do Capítulo" className="w-full bg-black border border-white/10 p-4 rounded-xl" value={chapterForm.title} onChange={e => setChapterForm({...chapterForm, title: e.target.value})} />
             <textarea placeholder="URLs dos Painéis (Um por linha - Máx 22)" className="w-full bg-black border border-white/10 p-4 rounded-xl h-48" onChange={e => setChapterForm({...chapterForm, panels: e.target.value.split('\n').filter(l => l.trim())})} />
             <button className="w-full py-4 bg-emerald-600 font-black rounded-xl">PUBLICAR CAPÍTULO</button>
          </form>
        )}

        {activeTab === 'video' && (
          <form onSubmit={async (e) => {
            e.preventDefault();
            await api.saveEpisode({...videoForm, seriesId: parseInt(selectedSeriesId)} as any);
            alert("Vídeo HI-QUA Publicado!");
          }} className="space-y-4">
             <select className="w-full bg-black border border-white/10 p-4 rounded-xl" value={selectedSeriesId} onChange={e => setSelectedSeriesId(e.target.value)}>
                <option value="">Selecione a Série...</option>
                {series.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
             </select>
             <input required placeholder="Título do Vídeo" className="w-full bg-black border border-white/10 p-4 rounded-xl" value={videoForm.title} onChange={e => setVideoForm({...videoForm, title: e.target.value})} />
             <input required placeholder="URL MP4" className="w-full bg-black border border-white/10 p-4 rounded-xl" value={videoForm.video_url} onChange={e => setVideoForm({...videoForm, video_url: e.target.value})} />
             <input type="number" placeholder="Duração (Segundos - Máx 210)" className="w-full bg-black border border-white/10 p-4 rounded-xl" value={videoForm.duration} onChange={e => setVideoForm({...videoForm, duration: parseInt(e.target.value)})} />
             <button className="w-full py-4 bg-blue-600 font-black rounded-xl">PUBLICAR VÍDEO</button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
