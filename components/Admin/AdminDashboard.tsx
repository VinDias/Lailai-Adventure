
import React, { useState, useEffect } from 'react';
import { ViewMode, AdminStats, User as UserType } from '../../types';
import { api } from '../../services/api';
import { Users, Video, BookOpen, CreditCard, LayoutDashboard, LogOut, Trash2, ShieldCheck, TrendingUp, Music, Layers } from 'lucide-react';
import API_URL from '../../config/api';

interface AdminProps {
  onLogout: () => void;
  currentSubView: ViewMode;
  setSubView: (v: ViewMode) => void;
}

const AdminDashboard: React.FC<AdminProps> = ({ onLogout, currentSubView, setSubView }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contentType, setContentType] = useState<'video' | 'webtoon'>('video');
  const [section, setSection] = useState<'HQCINE' | 'VCINE' | 'HIQUA'>('HQCINE');
  const [isPremium, setIsPremium] = useState(false);
  
  // Files
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [selectedAudio1, setSelectedAudio1] = useState<File | null>(null);
  const [selectedAudio2, setSelectedAudio2] = useState<File | null>(null);
  const [selectedThumbnail, setSelectedThumbnail] = useState<File | null>(null);
  const [selectedPanels, setSelectedPanels] = useState<FileList | null>(null);

  useEffect(() => {
    loadData();
  }, [currentSubView]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (currentSubView === ViewMode.ADMIN_DASHBOARD) {
        const res = await fetch(`${API_URL}/admin/dashboard`, { credentials: 'include' });
        setStats(await res.json());
      } else if (currentSubView === ViewMode.ADMIN_USERS) {
        const res = await fetch(`${API_URL}/admin/users`, { credentials: 'include' });
        setUsers(await res.json());
      }
    } catch (e) {
      console.error("Admin Load Error", e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return alert("Título é obrigatório.");

    setLoading(true);
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('type', contentType);
    formData.append('section', section);
    formData.append('isPremium', String(isPremium));

    if (contentType === 'video') {
      if (selectedVideo) formData.append('video', selectedVideo);
      if (selectedAudio1) formData.append('audioTrack1', selectedAudio1);
      if (selectedAudio2) formData.append('audioTrack2', selectedAudio2);
    } else {
      if (selectedPanels) {
        for (let i = 0; i < selectedPanels.length; i++) {
          formData.append('panels', selectedPanels[i]);
        }
      }
    }
    
    if (selectedThumbnail) formData.append('thumbnail', selectedThumbnail);

    try {
      const res = await fetch(`${API_URL}/admin/upload-content`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro no upload");
      
      alert("Sucesso: " + result.message);
      resetForm();
    } catch (err: any) {
      alert("Erro de Validação: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setSelectedVideo(null);
    setSelectedAudio1(null);
    setSelectedAudio2(null);
    setSelectedPanels(null);
  };

  return (
    <div className="flex h-screen bg-[#0F0F12] text-zinc-100 font-inter">
      <aside className="w-72 bg-[#16161A] border-r border-white/5 flex flex-col p-6">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center font-black italic">LL</div>
          <h1 className="text-lg font-black tracking-tighter">LaiLai Studio</h1>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarLink active={currentSubView === ViewMode.ADMIN_DASHBOARD} onClick={() => setSubView(ViewMode.ADMIN_DASHBOARD)} icon={<LayoutDashboard size={20}/>} label="Dashboard" />
          <SidebarLink active={currentSubView === ViewMode.ADMIN_CONTENT} onClick={() => setSubView(ViewMode.ADMIN_CONTENT)} icon={<Layers size={20}/>} label="Publicar" />
          <SidebarLink active={currentSubView === ViewMode.ADMIN_USERS} onClick={() => setSubView(ViewMode.ADMIN_USERS)} icon={<Users size={20}/>} label="Comunidade" />
        </nav>

        <button onClick={onLogout} className="mt-auto flex items-center gap-3 p-4 rounded-2xl text-zinc-500 hover:text-rose-500 font-bold text-sm transition-all">
          <LogOut size={20} /> Sair
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto p-12 scrollbar-hide">
        {currentSubView === ViewMode.ADMIN_CONTENT && (
          <div className="max-w-2xl mx-auto animate-apple pb-32">
            <h2 className="text-4xl font-black tracking-tighter mb-8">Publicar Conteúdo</h2>
            <form onSubmit={handleUpload} className="space-y-6">
               <div className="grid grid-cols-2 gap-4 bg-[#1C1C21] p-6 rounded-3xl border border-white/5">
                 <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-zinc-500">Tipo de Conteúdo</label>
                   <select value={contentType} onChange={e => setContentType(e.target.value as any)} className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-sm font-bold">
                     <option value="video">Vídeo Cinematográfico</option>
                     <option value="webtoon">Webtoon (HI-QUA)</option>
                   </select>
                 </div>
                 <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-zinc-500">Seção de Destino</label>
                   <select value={section} onChange={e => setSection(e.target.value as any)} className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-sm font-bold">
                     <option value="HQCINE">HQCINE (Séries)</option>
                     <option value="VCINE">VCINE (Experimental)</option>
                     <option value="HIQUA">HI-QUA (Exclusivo Webtoon)</option>
                   </select>
                 </div>
               </div>

               <div className="space-y-4">
                 <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da Produção" className="w-full bg-[#16161A] border border-white/5 p-5 rounded-2xl outline-none focus:border-rose-500" />
                 <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição" className="w-full bg-[#16161A] border border-white/5 p-5 rounded-2xl h-24" />
               </div>

               {contentType === 'video' ? (
                 <div className="space-y-4 animate-apple">
                   <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase text-zinc-500">Arquivo de Vídeo (MP4)</label>
                     <input type="file" accept="video/mp4" onChange={e => setSelectedVideo(e.target.files?.[0] || null)} className="w-full text-xs bg-white/5 p-4 rounded-xl" />
                   </div>
                   <div className="bg-rose-500/5 p-6 rounded-3xl border border-rose-500/10 grid grid-cols-2 gap-4">
                     <div className="col-span-2 text-[10px] font-black text-rose-500 uppercase">Trilhas de Áudio Adicionais</div>
                     <input type="file" accept="audio/*" onChange={e => setSelectedAudio1(e.target.files?.[0] || null)} className="text-[10px] bg-black/20 p-2 rounded" />
                     <input type="file" accept="audio/*" onChange={e => setSelectedAudio2(e.target.files?.[0] || null)} className="text-[10px] bg-black/20 p-2 rounded" />
                   </div>
                 </div>
               ) : (
                 <div className="space-y-4 animate-apple">
                   <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase text-zinc-500">Paineis do Webtoon (JPG/PNG)</label>
                     <input type="file" multiple accept="image/*" onChange={e => setSelectedPanels(e.target.files)} className="w-full text-xs bg-white/5 p-4 rounded-xl" />
                   </div>
                 </div>
               )}

               <div className="flex items-center gap-3 p-5 bg-[#1C1C21] rounded-2xl border border-white/5">
                 <input type="checkbox" checked={isPremium} onChange={e => setIsPremium(e.target.checked)} className="w-5 h-5 accent-rose-500" />
                 <span className="text-sm font-bold text-zinc-400">Conteúdo Premium</span>
               </div>

               <button disabled={loading} className="w-full py-6 bg-white text-black font-black rounded-3xl hover:bg-rose-100 transition-all flex items-center justify-center">
                 {loading ? <div className="w-6 h-6 border-4 border-black/30 border-t-black rounded-full animate-spin" /> : "PUBLICAR NA PLATAFORMA"}
               </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
};

const SidebarLink = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all font-bold text-sm ${active ? 'bg-rose-600 text-white' : 'text-zinc-500 hover:bg-white/5'}`}>
    {icon} {label}
  </button>
);

const StatCard = ({ label, value, icon }: any) => (
  <div className="bg-[#16161A] p-8 rounded-[2rem] border border-white/5">
    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center mb-6">{icon}</div>
    <div className="text-3xl font-black">{value}</div>
    <div className="text-[10px] font-black text-zinc-500 uppercase mt-1">{label}</div>
  </div>
);

export default AdminDashboard;
