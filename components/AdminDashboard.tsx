
import React, { useState, useEffect } from 'react';
import { Series, Episode, Ad } from '../types';
import { api } from '../services/api';
import API_URL from '../config/api';

const AdminDashboard: React.FC = () => {
  const [series, setSeries] = useState<Series[]>([]);
  const [activeTab, setActiveTab] = useState<'series' | 'video' | 'webtoon'>('series');
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  
  const [seriesForm, setSeriesForm] = useState({ 
    title: '', 
    description: '', 
    genre: 'Ação',
    isPremium: false,
    thumbnailUrl: '' 
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setThumbnailPreview(URL.createObjectURL(file));
    }
  };

  const uploadThumbnail = async (type: 'video' | 'webtoon'): Promise<string> => {
    if (!selectedFile) throw new Error("Thumbnail obrigatória.");
    
    const formData = new FormData();
    formData.append('thumbnail', selectedFile);

    const endpoint = type === 'video' 
      ? '/admin/upload-video-thumbnail' 
      : '/admin/upload-webtoon-thumbnail';

    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      body: formData,
      // Authorization é injetado via credentials ou header se necessário
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Erro no upload.");
    return data.url;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Upload Thumbnail Primeiro
      const type = activeTab === 'series' ? 'video' : 'webtoon';
      const uploadedUrl = await uploadThumbnail(type);
      
      // 2. Criar Objeto de Conteúdo
      // Aqui integraria com as rotas de criação reais
      alert("Conteúdo criado com sucesso com Thumbnail: " + uploadedUrl);
      
      // Reset
      setSelectedFile(null);
      setThumbnailPreview(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full bg-[#0A0A0B] text-white p-10 overflow-y-auto pb-40">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-black mb-12 tracking-tighter premium-text uppercase">Loreflux Creator Studio</h1>
        
        <div className="flex gap-4 mb-12 overflow-x-auto pb-2">
          {['series', 'video', 'webtoon'].map((t: any) => (
            <button 
              key={t} 
              onClick={() => { setActiveTab(t); setThumbnailPreview(null); setSelectedFile(null); }} 
              className={`px-8 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all ${activeTab === t ? 'bg-white text-black scale-105 shadow-xl' : 'bg-white/5 text-zinc-500 hover:bg-white/10'}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="max-w-xl bg-[#1C1C1E] p-10 rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden">
          <form onSubmit={handleSubmit} className="space-y-6 animate-apple">
            <input required placeholder="Título" className="w-full bg-black/50 border border-white/10 p-5 rounded-2xl focus:border-rose-500 outline-none" value={seriesForm.title} onChange={e => setSeriesForm({...seriesForm, title: e.target.value})} />
            
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest ml-1">
                Upload Thumbnail ({activeTab === 'webtoon' ? '160x151' : '1080x1920'})
              </label>
              <div className="relative group cursor-pointer h-40 border-2 border-dashed border-white/10 rounded-3xl flex items-center justify-center overflow-hidden hover:border-rose-500/50 transition-all">
                {thumbnailPreview ? (
                  <img src={thumbnailPreview} className="w-full h-full object-contain" />
                ) : (
                  <span className="text-zinc-600 text-xs font-bold">Clique para selecionar imagem</span>
                )}
                <input 
                  type="file" 
                  onChange={handleFileChange} 
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                  accept="image/*"
                  required
                />
              </div>
            </div>

            <textarea placeholder="Descrição" className="w-full bg-black/50 border border-white/10 p-5 rounded-2xl h-32 focus:border-rose-500 outline-none" value={seriesForm.description} onChange={e => setSeriesForm({...seriesForm, description: e.target.value})} />

            <div className="flex items-center gap-3 p-5 bg-black/30 rounded-2xl border border-white/5">
              <input type="checkbox" id="premium" className="w-5 h-5 accent-amber-500" checked={seriesForm.isPremium} onChange={e => setSeriesForm({...seriesForm, isPremium: e.target.checked})} />
              <label htmlFor="premium" className="text-sm font-bold text-zinc-400">Conteúdo Exclusivo Premium</label>
            </div>

            <button disabled={loading} className="w-full py-6 bg-white text-black font-black rounded-3xl hover:bg-zinc-200 transition-all flex items-center justify-center tracking-widest text-sm">
              {loading ? <div className="w-6 h-6 border-4 border-black/30 border-t-black rounded-full animate-spin" /> : 'PUBLICAR CONTEÚDO'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
