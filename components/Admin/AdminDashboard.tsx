
import React, { useState, useEffect, useRef } from 'react';
import { ViewMode } from '../../types';
import { api } from '../../services/api';
import {
  Users, Layers, LayoutDashboard, LogOut,
  Trash2, ArrowUp, ArrowDown, DollarSign,
  Film, Plus, X, ThumbsUp, ThumbsDown, Eye, ChevronLeft, List, Camera,
  Megaphone, ToggleLeft, ToggleRight, ExternalLink, BookOpen, ImagePlus, Upload,
  CheckCircle2, AlertCircle, Music, Mic, Music2, Settings
} from 'lucide-react';
import API_URL from '../../config/api';
import ImageWithFallback from '../ImageWithFallback';

function isValidUrl(str: string) {
  try { return Boolean(str && new URL(str).protocol.startsWith('http')); } catch { return false; }
}

interface AdminProps {
  onLogout: () => void;
  currentSubView: ViewMode;
  setSubView: (v: ViewMode) => void;
}

const CONTENT_TYPES = [
  { value: 'hqcine', label: 'HQCine' },
  { value: 'vcine', label: 'VCine' },
  { value: 'hiqua', label: 'Hi-Qua' }
];

const AdminDashboard: React.FC<AdminProps> = ({ onLogout, currentSubView, setSubView }) => {
  const [stats, setStats] = useState<any>(null);
  const [contentList, setContentList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Série selecionada para gerenciar episódios
  const [selectedSeries, setSelectedSeries] = useState<any>(null);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [showEpisodeModal, setShowEpisodeModal] = useState(false);
  const [newEpisode, setNewEpisode] = useState({
    episode_number: 1, title: '', description: '',
    thumbnail: '', video_url: '', bunnyVideoId: '', isPremium: false
  });
  const [creatingEpisode, setCreatingEpisode] = useState(false);
  const [episodeMsg, setEpisodeMsg] = useState('');

  // Estado do formulário de nova série
  const [newSeries, setNewSeries] = useState({
    title: '', genre: '', description: '',
    cover_image: '', content_type: 'hqcine', isPremium: false
  });
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');

  // Configurações Globais
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    adsense_client_id: '',
    adsense_slot_id: '',
    platform_tagline: '',
    bunny_cdn_base: '',
    premium_price_display: '',
    premium_cpm_rate: '',
    ad_skip_seconds: '',
    ad_frequency_feed: '',
    ad_frequency_webtoon: '',
  });

  // Anúncios
  const [adsList, setAdsList] = useState<any[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [showAdModal, setShowAdModal] = useState(false);
  const [editingAd, setEditingAd] = useState<any>(null);
  const [adForm, setAdForm] = useState({ title: '', image_url: '', link_url: '', advertiser: '', startsAt: '', endsAt: '' });
  const [savingAd, setSavingAd] = useState(false);
  const [adMsg, setAdMsg] = useState('');

  // Painéis (Hi-Qua webtoon)
  const [selectedEpisode, setSelectedEpisode] = useState<any>(null);
  const [panelsList, setPanelsList] = useState<any[]>([]);
  const [loadingPanels, setLoadingPanels] = useState(false);
  const [newPanelUrl, setNewPanelUrl] = useState('');
  const [addingPanel, setAddingPanel] = useState(false);

  // Usuários
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersPages, setUsersPages] = useState(1);
  const [userFilter, setUserFilter] = useState<'all' | 'premium' | 'admin'>('all');

  // Upload de imagem de anúncio
  const adImageFileRef = useRef<HTMLInputElement>(null);
  const [uploadingAdImage, setUploadingAdImage] = useState(false);

  // Upload de thumbnail de série
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  // Upload de vídeo direto para Bunny Stream
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const [videoUploadTargetEp, setVideoUploadTargetEp] = useState<any>(null);
  const [uploadingVideoId, setUploadingVideoId] = useState<string | null>(null);
  const [dragOverEpId, setDragOverEpId] = useState<string | null>(null);
  const [checkingStatusId, setCheckingStatusId] = useState<string | null>(null);

  // Modal de thumbnail de episódio
  const [epThumbModal, setEpThumbModal] = useState<{ ep: any; url: string } | null>(null);
  const [savingEpThumb, setSavingEpThumb] = useState(false);
  const epThumbFileRef = useRef<HTMLInputElement>(null);

  // Modal de canais de áudio
  const [audioModalEp, setAudioModalEp] = useState<any>(null);
  const [audioForm, setAudioForm] = useState<{ audioTrack1Url: string; audioTrack2Url: string }>({ audioTrack1Url: '', audioTrack2Url: '' });
  const [uploadingAudio, setUploadingAudio] = useState<{ track1: boolean; track2: boolean }>({ track1: false, track2: false });
  const audioTrack1Ref = useRef<HTMLInputElement>(null);
  const audioTrack2Ref = useRef<HTMLInputElement>(null);

  // Batch upload de painéis
  const [batchFiles, setBatchFiles] = useState<Array<{ file: File; preview: string; status: 'pending' | 'uploading' | 'done' | 'error'; url?: string; error?: string }>>([]);
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchDragOver, setBatchDragOver] = useState(false);
  const batchInputRef = useRef<HTMLInputElement>(null);
  const [batchLanguage, setBatchLanguage] = useState<'original' | 'pt' | 'en' | 'es' | 'zh'>('original');

  // Seleção múltipla de painéis
  const [selectedPanels, setSelectedPanels] = useState<Set<number>>(new Set());
  const [deletingPanels, setDeletingPanels] = useState(false);

  // Modal de traduções de painel
  const [translationModal, setTranslationModal] = useState<{ panelIdx: number; panel: any } | null>(null);
  const [translationLang, setTranslationLang] = useState<'pt' | 'en' | 'es' | 'zh'>('en');
  const [translationUrl, setTranslationUrl] = useState('');
  const [savingTranslation, setSavingTranslation] = useState(false);
  const [translationMsg, setTranslationMsg] = useState('');

  useEffect(() => {
    setSelectedSeries(null);
    setSelectedEpisode(null);
    loadDashboard();
  }, [currentSubView]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      if (currentSubView === ViewMode.ADMIN_DASHBOARD) {
        const s = await api.getAdminStats();
        setStats(s);
      }
      const result = await api.getAdminContent();
      setContentList(result.series ?? []);
    } catch (e) {
      console.error('Admin Load Error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSeries = async (series: any) => {
    setSelectedSeries(series);
    setLoadingEpisodes(true);
    try {
      const eps = await api.getEpisodesBySeries(series._id || series.id);
      setEpisodes(eps);
      setNewEpisode(e => ({ ...e, episode_number: (eps.length || 0) + 1 }));
    } catch (e) {
      setEpisodes([]);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const handleCheckVideoStatus = async (ep: any) => {
    if (!ep.bunnyVideoId) return;
    const epId = ep._id || ep.id;
    setCheckingStatusId(epId);
    try {
      const { mongoStatus } = await api.checkBunnyVideoStatus(ep.bunnyVideoId);
      setEpisodes(prev => prev.map(e => (e._id || e.id) === epId ? { ...e, status: mongoStatus } : e));
    } catch {}
    setCheckingStatusId(null);
  };

  // Polling automático a cada 15s quando há episódios em processing
  useEffect(() => {
    if (!selectedSeries) return;
    const processing = episodes.filter(e => e.bunnyVideoId && e.status !== 'published');
    if (processing.length === 0) return;
    const interval = setInterval(() => {
      processing.forEach(ep => handleCheckVideoStatus(ep));
    }, 15000);
    return () => clearInterval(interval);
  }, [episodes, selectedSeries]);

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
    const index = contentList.findIndex(i => (i._id || i.id) === id);
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === contentList.length - 1)) return;

    const newList = [...contentList];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newList[index], newList[targetIndex]] = [newList[targetIndex], newList[index]];
    const updated = newList.map((item, idx) => ({ ...item, order_index: idx }));
    setContentList(updated);

    try {
      await fetch(`${API_URL}/admin/management/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('lorflux_token')}` },
        body: JSON.stringify({ items: updated.map(i => ({ id: i._id || i.id, order_index: i.order_index })) }),
        credentials: 'include'
      });
    } catch (e) { alert('Erro ao salvar nova ordem.'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir permanentemente esta série e todos os episódios?')) return;
    try {
      await api.deleteSeries(id);
      setContentList(prev => prev.filter(i => (i._id || i.id) !== id));
    } catch (e) { alert('Erro ao excluir.'); }
  };

  const handleDeleteEpisode = async (id: string) => {
    if (!confirm('Excluir este episódio permanentemente?')) return;
    try {
      await api.deleteEpisode(id);
      setEpisodes(prev => prev.filter(e => (e._id || e.id) !== id));
    } catch (e) { alert('Erro ao excluir episódio.'); }
  };

  const handleOpenPanels = async (ep: any) => {
    setSelectedEpisode(ep);
    setLoadingPanels(true);
    setBatchFiles([]);
    try {
      const full = await api.getEpisode(ep._id || ep.id);
      setPanelsList(full.panels ?? []);
    } catch { setPanelsList([]); }
    finally { setLoadingPanels(false); }
  };

  const handleAddPanel = async () => {
    if (!newPanelUrl.trim() || !selectedEpisode) return;
    setAddingPanel(true);
    try {
      const nextOrder = panelsList.length + 1;
      const result = await api.addPanels(selectedEpisode._id || selectedEpisode.id, [{ image_url: newPanelUrl.trim(), order: nextOrder }]);
      setPanelsList(result.episode?.panels ?? [...panelsList, { image_url: newPanelUrl.trim(), order: nextOrder }]);
      setNewPanelUrl('');
    } catch { alert('Erro ao adicionar painel.'); }
    finally { setAddingPanel(false); }
  };

  const handleDeletePanel = async (index: number) => {
    if (!selectedEpisode) return;
    if (!confirm('Remover este painel?')) return;
    try {
      await api.deletePanel(selectedEpisode._id || selectedEpisode.id, index);
      setPanelsList(prev => prev.filter((_, i) => i !== index));
    } catch { alert('Erro ao remover painel.'); }
  };

  const openTranslationModal = (panelIdx: number, panel: any) => {
    setTranslationModal({ panelIdx, panel });
    setTranslationLang('en');
    setTranslationUrl('');
    setTranslationMsg('');
  };

  const handleSaveTranslation = async () => {
    if (!selectedEpisode || !translationModal) return;
    if (!translationUrl.trim()) { setTranslationMsg('Cole a URL da imagem traduzida.'); return; }
    setSavingTranslation(true);
    setTranslationMsg('');
    try {
      const epId = selectedEpisode._id || selectedEpisode.id;
      await api.updatePanelTranslation(epId, translationModal.panelIdx, translationLang, translationUrl.trim());
      // Update local panelsList
      setPanelsList(prev => prev.map((p, i) => {
        if (i !== translationModal.panelIdx) return p;
        const layers = (p.translationLayers ?? []).filter((l: any) => l.language !== translationLang);
        return { ...p, translationLayers: [...layers, { language: translationLang, imageUrl: translationUrl.trim() }] };
      }));
      setTranslationMsg('Tradução salva!');
      setTranslationUrl('');
    } catch { setTranslationMsg('Erro ao salvar tradução.'); }
    setSavingTranslation(false);
  };

  const handleDeleteTranslation = async () => {
    if (!selectedEpisode || !translationModal) return;
    const existing = (translationModal.panel.translationLayers ?? []).find((l: any) => l.language === translationLang);
    if (!existing) { setTranslationMsg('Nenhuma tradução para remover neste idioma.'); return; }
    if (!confirm(`Remover a tradução "${translationLang.toUpperCase()}" do painel #${translationModal.panelIdx + 1}?`)) return;
    setSavingTranslation(true);
    setTranslationMsg('');
    try {
      const epId = selectedEpisode._id || selectedEpisode.id;
      await api.deletePanelTranslation(epId, translationModal.panelIdx, translationLang);
      setPanelsList(prev => prev.map((p, i) => {
        if (i !== translationModal.panelIdx) return p;
        return { ...p, translationLayers: (p.translationLayers ?? []).filter((l: any) => l.language !== translationLang) };
      }));
      setTranslationModal(prev => prev ? {
        ...prev,
        panel: { ...prev.panel, translationLayers: (prev.panel.translationLayers ?? []).filter((l: any) => l.language !== translationLang) }
      } : null);
      setTranslationMsg('Tradução removida!');
      setTranslationUrl('');
    } catch { setTranslationMsg('Erro ao remover tradução.'); }
    setSavingTranslation(false);
  };

  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !videoUploadTargetEp) return;
    const epId = videoUploadTargetEp._id || videoUploadTargetEp.id;
    setUploadingVideoId(epId);
    try {
      const result = await api.uploadVideoToBunny(file, epId, videoUploadTargetEp.title);
      setEpisodes(prev => prev.map(ep =>
        (ep._id || ep.id) === epId
          ? { ...ep, bunnyVideoId: result.bunnyVideoId, status: 'processing' }
          : ep
      ));
    } catch (err: any) {
      alert(`Erro ao enviar vídeo: ${err.message}`);
    } finally {
      setUploadingVideoId(null);
      setVideoUploadTargetEp(null);
    }
  };

  const handleEpVideoDrop = async (ep: any, file: File) => {
    if (!file.type.startsWith('video/')) return;
    const epId = ep._id || ep.id;
    setDragOverEpId(null);
    setUploadingVideoId(epId);
    try {
      const result = await api.uploadVideoToBunny(file, epId, ep.title);
      setEpisodes(prev => prev.map(e =>
        (e._id || e.id) === epId ? { ...e, bunnyVideoId: result.bunnyVideoId, status: 'processing' } : e
      ));
    } catch (err: any) {
      alert(`Erro ao enviar vídeo: ${err.message}`);
    } finally {
      setUploadingVideoId(null);
    }
  };

const handleOpenAudioModal = (ep: any) => {
    setAudioModalEp(ep);
    setAudioForm({ audioTrack1Url: ep.audioTrack1Url || '', audioTrack2Url: ep.audioTrack2Url || '' });
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>, track: 'track1' | 'track2') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !audioModalEp) return;
    setUploadingAudio(prev => ({ ...prev, [track]: true }));
    try {
      const { url } = await api.uploadAudioToBunny(file);
      const field = track === 'track1' ? 'audioTrack1Url' : 'audioTrack2Url';
      const updated = { ...audioForm, [field]: url };
      setAudioForm(updated);
      await api.updateEpisodeAudio(audioModalEp._id || audioModalEp.id, { [field]: url });
      setEpisodes(prev => prev.map(ep => (ep._id || ep.id) === (audioModalEp._id || audioModalEp.id) ? { ...ep, [field]: url } : ep));
      setAudioModalEp((prev: any) => ({ ...prev, [field]: url }));
    } catch (err: any) {
      alert(`Erro ao enviar áudio: ${err.message}`);
    } finally {
      setUploadingAudio(prev => ({ ...prev, [track]: false }));
    }
  };

  const handleRemoveAudio = async (track: 'track1' | 'track2') => {
    if (!audioModalEp) return;
    const field = track === 'track1' ? 'audioTrack1Url' : 'audioTrack2Url';
    try {
      await api.updateEpisodeAudio(audioModalEp._id || audioModalEp.id, { [field]: '' });
      setAudioForm(prev => ({ ...prev, [field]: '' }));
      setEpisodes(prev => prev.map(ep => (ep._id || ep.id) === (audioModalEp._id || audioModalEp.id) ? { ...ep, [field]: '' } : ep));
      setAudioModalEp((prev: any) => ({ ...prev, [field]: '' }));
    } catch (err: any) {
      alert(`Erro ao remover áudio: ${err.message}`);
    }
  };

  const handleBatchFilesSelect = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter(f => f.type.startsWith('image/'));
    if (arr.length === 0) return;
    const newEntries = arr.map(f => ({ file: f, preview: URL.createObjectURL(f), status: 'pending' as const }));
    setBatchFiles(prev => [...prev, ...newEntries]);
  };

  const handleBatchUpload = async () => {
    if (!selectedEpisode || batchUploading) return;
    const pending = batchFiles.filter(f => f.status === 'pending');
    if (pending.length === 0) return;
    setBatchUploading(true);
    setBatchFiles(prev => prev.map(f => f.status === 'pending' ? { ...f, status: 'uploading' } : f));
    try {
      const result = await api.uploadImagesBatchToBunny(pending.map(f => f.file));
      let idx = 0;
      setBatchFiles(prev => prev.map(f => {
        if (f.status !== 'uploading') return f;
        const r = result.results[idx++];
        if (!r) return { ...f, status: 'error', error: 'Sem resposta do servidor.' };
        return r.success ? { ...f, status: 'done', url: r.url } : { ...f, status: 'error', error: r.error };
      }));
      const successUrls = result.results.filter(r => r.success && r.url).map(r => r.url!);
      const epId = selectedEpisode._id || selectedEpisode.id;
      if (successUrls.length > 0) {
        if (batchLanguage === 'original') {
          const panels = successUrls.map((url, i) => ({ image_url: url, order: panelsList.length + i + 1 }));
          const updated = await api.addPanels(epId, panels);
          setPanelsList(updated.episode?.panels ?? [...panelsList, ...panels]);
        } else {
          // Sobrescreve translation layers dos painéis existentes por índice
          await Promise.all(successUrls.map((url, i) => api.updatePanelTranslation(epId, i, batchLanguage, url)));
          const full = await api.getEpisode(epId);
          setPanelsList(full.panels ?? panelsList);
        }
      }
    } catch (err: any) {
      setBatchFiles(prev => prev.map(f => f.status === 'uploading' ? { ...f, status: 'error', error: err.message } : f));
    } finally {
      setBatchUploading(false);
    }
  };

  const togglePanelSelection = (idx: number) => {
    setSelectedPanels(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const handleBatchDeletePanels = async () => {
    if (selectedPanels.size === 0 || !selectedEpisode) return;
    if (!confirm(`Excluir ${selectedPanels.size} painel${selectedPanels.size !== 1 ? 'is' : ''} permanentemente? Esta ação não pode ser desfeita.`)) return;
    setDeletingPanels(true);
    try {
      const epId = selectedEpisode._id || selectedEpisode.id;
      // Deleta do maior índice para o menor para não deslocar os índices
      const indices = Array.from(selectedPanels).sort((a, b) => b - a);
      for (const i of indices) await api.deletePanel(epId, i);
      setSelectedPanels(new Set());
      const full = await api.getEpisode(epId);
      setPanelsList(full.panels ?? []);
    } catch { alert('Erro ao excluir painéis.'); }
    setDeletingPanels(false);
  };

  const loadUsers = async (page = usersPage, filter = userFilter) => {
    setLoadingUsers(true);
    try {
      const filters: any = {};
      if (filter === 'premium') filters.isPremium = true;
      if (filter === 'admin') filters.role = 'admin';
      const data = await api.getAdminUsers(page, filters);
      setUsersList(data.users);
      setUsersTotal(data.total);
      setUsersPages(data.pages);
      setUsersPage(data.page);
    } catch { setUsersList([]); }
    finally { setLoadingUsers(false); }
  };

  useEffect(() => {
    if (currentSubView === ViewMode.ADMIN_USERS || currentSubView === ViewMode.ADMIN_PAYMENTS) {
      loadUsers(1, userFilter);
    }
  }, [currentSubView]);

  const handleTogglePremium = async (user: any) => {
    try {
      const result = await api.toggleUserPremium(user._id || user.id);
      setUsersList(prev => prev.map(u => (u._id || u.id) === (user._id || user.id) ? { ...u, isPremium: result.isPremium } : u));
    } catch { alert('Erro ao atualizar premium.'); }
  };

  const handleToggleActive = async (user: any) => {
    try {
      await api.toggleUserActive(user._id || user.id, !user.isActive);
      setUsersList(prev => prev.map(u => (u._id || u.id) === (user._id || user.id) ? { ...u, isActive: !u.isActive } : u));
    } catch { alert('Erro ao atualizar status.'); }
  };

  const loadAds = async () => {
    setLoadingAds(true);
    try { setAdsList(await api.getAds()); }
    catch { setAdsList([]); }
    finally { setLoadingAds(false); }
  };

  const loadSettings = async () => {
    setLoadingSettings(true);
    try {
      const list = await api.getAdminSettings();
      const map: Record<string, string> = {};
      list.forEach((s: any) => { map[s.key] = s.value; });
      setSettingsForm(prev => ({ ...prev, ...map }));
    } catch {
      // silently ignore
    } finally {
      setLoadingSettings(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMsg('');
    try {
      await Promise.all([
        api.updateSetting('adsense_client_id',    settingsForm.adsense_client_id,    'AdSense Publisher ID'),
        api.updateSetting('adsense_slot_id',       settingsForm.adsense_slot_id,       'AdSense Slot ID'),
        api.updateSetting('platform_tagline',      settingsForm.platform_tagline,      'Tagline da plataforma'),
        api.updateSetting('bunny_cdn_base',        settingsForm.bunny_cdn_base,        'Bunny CDN Base URL'),
        api.updateSetting('premium_price_display', settingsForm.premium_price_display, 'Preço Premium (exibição)'),
        api.updateSetting('premium_cpm_rate',      settingsForm.premium_cpm_rate,      'CPM Rate (R$)'),
        api.updateSetting('ad_skip_seconds',       settingsForm.ad_skip_seconds,       'Segundos para pular anúncio'),
        api.updateSetting('ad_frequency_feed',     settingsForm.ad_frequency_feed,     'Frequência de anúncio no feed'),
        api.updateSetting('ad_frequency_webtoon',  settingsForm.ad_frequency_webtoon,  'Frequência de anúncio no webtoon'),
      ]);
      setSettingsMsg('Configurações salvas!');
      setTimeout(() => setSettingsMsg(''), 3000);
    } catch {
      setSettingsMsg('Erro ao salvar configurações.');
    } finally {
      setSavingSettings(false);
    }
  };

  useEffect(() => {
    if (currentSubView === ViewMode.ADMIN_ADS) loadAds();
    if (currentSubView === ViewMode.ADMIN_SETTINGS) loadSettings();
  }, [currentSubView]);

  const openNewAd = () => {
    setEditingAd(null);
    setAdForm({ title: '', image_url: '', link_url: '', advertiser: '', startsAt: '', endsAt: '' });
    setAdMsg('');
    setShowAdModal(true);
  };

  const openEditAd = (ad: any) => {
    setEditingAd(ad);
    setAdForm({
      title: ad.title, image_url: ad.image_url, link_url: ad.link_url ?? '',
      advertiser: ad.advertiser ?? '',
      startsAt: ad.startsAt ? ad.startsAt.slice(0, 10) : '',
      endsAt: ad.endsAt ? ad.endsAt.slice(0, 10) : ''
    });
    setAdMsg('');
    setShowAdModal(true);
  };

  const handleAdImageUpload = async (file: File) => {
    setUploadingAdImage(true);
    try {
      const url = await api.uploadImageToBunny(file);
      setAdForm(f => ({ ...f, image_url: url }));
    } catch {
      alert('Erro ao fazer upload da imagem do anúncio.');
    } finally {
      setUploadingAdImage(false);
    }
  };

  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAd(true);
    setAdMsg('');
    try {
      const payload = { ...adForm, startsAt: adForm.startsAt || undefined, endsAt: adForm.endsAt || undefined };
      if (editingAd) {
        const updated = await api.updateAd(editingAd._id || editingAd.id, payload);
        setAdsList(prev => prev.map(a => (a._id || a.id) === (editingAd._id || editingAd.id) ? updated : a));
      } else {
        const created = await api.createAd(payload);
        setAdsList(prev => [created, ...prev]);
      }
      setAdMsg(editingAd ? 'Anúncio atualizado!' : 'Anúncio criado!');
      setTimeout(() => { setAdMsg(''); setShowAdModal(false); }, 1200);
    } catch {
      setAdMsg('Erro ao salvar anúncio.');
    } finally {
      setSavingAd(false);
    }
  };

  const handleDeleteAd = async (id: string) => {
    if (!confirm('Excluir este anúncio?')) return;
    try {
      await api.deleteAd(id);
      setAdsList(prev => prev.filter(a => (a._id || a.id) !== id));
    } catch { alert('Erro ao excluir.'); }
  };

  const handleToggleAd = async (ad: any) => {
    const id = ad._id || ad.id;
    try {
      const updated = await api.updateAd(id, { isActive: !ad.isActive });
      setAdsList(prev => prev.map(a => (a._id || a.id) === id ? updated : a));
    } catch { alert('Erro ao atualizar status.'); }
  };

  const handleSaveEpThumb = async () => {
    if (!epThumbModal) return;
    const url = epThumbModal.url.trim();
    if (url && !isValidUrl(url)) { alert('URL inválida. Use http:// ou https://'); return; }
    setSavingEpThumb(true);
    try {
      const epId = epThumbModal.ep._id || epThumbModal.ep.id;
      const updated = await api.updateEpisode(epId, { thumbnail: url });
      setEpisodes(prev => prev.map(e => (e._id || e.id) === epId ? { ...e, thumbnail: updated.thumbnail } : e));
      setEpThumbModal(null);
    } catch { alert('Erro ao salvar thumbnail.'); }
    finally { setSavingEpThumb(false); }
  };

  const handleEpThumbFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !epThumbModal) return;
    setSavingEpThumb(true);
    try {
      const epId = epThumbModal.ep._id || epThumbModal.ep.id;
      const url = await api.uploadImageToBunny(file);
      const updated = await api.updateEpisode(epId, { thumbnail: url });
      setEpisodes(prev => prev.map(ep => (ep._id || ep.id) === epId ? { ...ep, thumbnail: updated.thumbnail } : ep));
      setEpThumbModal(null);
    } catch { alert('Erro ao fazer upload da imagem.'); }
    finally { setSavingEpThumb(false); e.target.value = ''; }
  };

  const handleThumbnailClick = (id: string) => {
    setUploadTargetId(id);
    fileInputRef.current?.click();
  };

  const handleThumbnailFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTargetId) return;
    setUploadingId(uploadTargetId);
    try {
      const url = await api.uploadSeriesThumbnail(uploadTargetId, file);
      setContentList(prev => prev.map(s => (s._id || s.id) === uploadTargetId ? { ...s, cover_image: url } : s));
    } catch {
      alert('Erro ao fazer upload da imagem.');
    } finally {
      setUploadingId(null);
      setUploadTargetId(null);
      e.target.value = '';
    }
  };

  const handleCreateSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newSeries.cover_image && !isValidUrl(newSeries.cover_image)) {
      setCreateMsg('URL da capa inválida. Use http:// ou https://'); return;
    }
    setCreating(true);
    setCreateMsg('');
    try {
      const created = await api.createSeries({ ...newSeries, isPublished: true });
      if (coverFile) {
        const id = created._id || created.id;
        try {
          const url = await api.uploadSeriesThumbnail(id, coverFile);
          created.cover_image = url;
        } catch { /* não crítico */ }
      }
      setContentList(prev => [created, ...prev]);
      setNewSeries({ title: '', genre: '', description: '', cover_image: '', content_type: 'hqcine', isPremium: false });
      setCoverFile(null);
      setCreateMsg('Série criada com sucesso!');
      setTimeout(() => { setCreateMsg(''); setShowCreateModal(false); }, 1500);
    } catch (e: any) {
      setCreateMsg(`Erro: ${e?.message || 'Erro ao criar série.'}`);
    } finally {
      setCreating(false);
    }
  };

  const handleCreateEpisode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newEpisode.thumbnail && !isValidUrl(newEpisode.thumbnail)) {
      setEpisodeMsg('URL da thumbnail inválida. Use http:// ou https://'); return;
    }
    if (newEpisode.video_url && !isValidUrl(newEpisode.video_url)) {
      setEpisodeMsg('URL do vídeo inválida. Use http:// ou https://'); return;
    }
    setCreatingEpisode(true);
    setEpisodeMsg('');
    try {
      const seriesId = selectedSeries._id || selectedSeries.id;
      const payload: any = {
        seriesId,
        episode_number: newEpisode.episode_number,
        title: newEpisode.title,
        description: newEpisode.description,
        thumbnail: newEpisode.thumbnail,
        isPremium: newEpisode.isPremium,
        status: 'published'
      };
      if (newEpisode.bunnyVideoId) payload.bunnyVideoId = newEpisode.bunnyVideoId;
      if (newEpisode.video_url) payload.video_url = newEpisode.video_url;

      const created = await api.createEpisode(payload);
      setEpisodes(prev => [...prev, created]);
      setNewEpisode({ episode_number: episodes.length + 2, title: '', description: '', thumbnail: '', video_url: '', bunnyVideoId: '', isPremium: false });
      setEpisodeMsg('Episódio criado com sucesso!');
      setTimeout(() => { setEpisodeMsg(''); setShowEpisodeModal(false); }, 1500);
    } catch (e) {
      setEpisodeMsg('Erro ao criar episódio.');
    } finally {
      setCreatingEpisode(false);
    }
  };

  return (
    <div className="flex h-screen bg-[var(--bg-color)] text-[var(--text-color)] font-inter">
      {/* Sidebar */}
      <aside className="w-64 bg-[var(--card-bg)] border-r border-[var(--border-color)] flex flex-col p-6 shrink-0">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center font-black italic text-sm">LF</div>
          <h1 className="text-lg font-black tracking-tighter">Lorflux Studio</h1>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarLink active={currentSubView === ViewMode.ADMIN_DASHBOARD} onClick={() => setSubView(ViewMode.ADMIN_DASHBOARD)} icon={<LayoutDashboard size={18} />} label="Dashboard" />
          <SidebarLink active={currentSubView === ViewMode.ADMIN_CONTENT} onClick={() => { setSelectedSeries(null); setSelectedEpisode(null); setSubView(ViewMode.ADMIN_CONTENT); }} icon={<Layers size={18} />} label="Gerenciar Conteúdo" />
          <SidebarLink active={currentSubView === ViewMode.ADMIN_ADS} onClick={() => setSubView(ViewMode.ADMIN_ADS)} icon={<Megaphone size={18} />} label="Anúncios" />
          <SidebarLink active={currentSubView === ViewMode.ADMIN_SETTINGS} onClick={() => setSubView(ViewMode.ADMIN_SETTINGS)} icon={<Settings size={18} />} label="Configurações" />
          <SidebarLink active={currentSubView === ViewMode.ADMIN_USERS} onClick={() => setSubView(ViewMode.ADMIN_USERS)} icon={<Users size={18} />} label="Usuários" />
          <SidebarLink active={currentSubView === ViewMode.ADMIN_PAYMENTS} onClick={() => setSubView(ViewMode.ADMIN_PAYMENTS)} icon={<DollarSign size={18} />} label="Assinantes" />
        </nav>

        <button onClick={onLogout} className="mt-auto flex items-center gap-3 p-4 rounded-2xl text-zinc-500 hover:text-rose-500 font-bold text-sm transition-all">
          <LogOut size={18} /> Sair
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-12 scrollbar-hide">

        {/* DASHBOARD */}
        {currentSubView === ViewMode.ADMIN_DASHBOARD && (
          <div className="animate-apple">
            <h2 className="text-4xl font-black tracking-tighter mb-12">Visão Geral</h2>
            {loading ? (
              <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /></div>
            ) : stats ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                  <StatCard label="Usuários Ativos" value={stats.totalUsers ?? 0} icon={<Users size={20} />} />
                  <StatCard label="Assinantes Premium" value={stats.premiumUsers ?? 0} icon={<DollarSign size={20} />} />
                  <StatCard label="Conteúdos Publicados" value={stats.totalContent ?? 0} icon={<Film size={20} />} />
                  <StatCard label="Receita Estimada" value={`R$ ${(stats.estimatedMonthlyRevenue ?? 0).toFixed(2)}`} icon={<DollarSign size={20} />} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard label="Séries" value={stats.totalSeries ?? 0} icon={<Layers size={20} />} />
                  <StatCard label="Episódios" value={stats.totalEpisodes ?? 0} icon={<Film size={20} />} />
                  <StatCard label="Anúncios Ativos" value={stats.activeAds ?? 0} icon={<Layers size={20} />} />
                </div>
              </>
            ) : (
              <p className="text-zinc-600 text-sm">Erro ao carregar estatísticas.</p>
            )}
          </div>
        )}

        {/* CONTEÚDO — Lista de Séries */}
        {currentSubView === ViewMode.ADMIN_CONTENT && !selectedSeries && (
          <div className="max-w-4xl animate-apple">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-4xl font-black tracking-tighter">Gerenciar Séries</h2>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-rose-600 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-rose-500 transition-all"
              >
                <Plus size={16} /> Nova Série
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /></div>
            ) : (
              <div className="bg-[var(--card-bg)] rounded-[2.5rem] border border-[var(--border-color)] overflow-hidden">
                {contentList.length === 0 ? (
                  <div className="p-16 text-center">
                    <p className="text-zinc-600 text-xs font-black uppercase tracking-widest">Nenhuma série cadastrada</p>
                    <p className="text-zinc-700 text-xs mt-2">Clique em "Nova Série" para começar</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {contentList.map((item, idx) => {
                      const id = item._id || item.id;
                      return (
                        <div key={id} className="flex items-center gap-6 p-6 hover:bg-white/5 transition-all">
                          <button
                            onClick={() => handleThumbnailClick(id)}
                            className="w-12 h-20 bg-zinc-800 rounded-lg overflow-hidden shrink-0 border border-[var(--border-color)] relative group cursor-pointer"
                            title="Clique para trocar a capa"
                          >
                            <ImageWithFallback src={item.cover_image} className="w-full h-full object-cover" alt={item.title} />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                              {uploadingId === id
                                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                : <Camera size={14} className="text-white" />
                              }
                            </div>
                          </button>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-sm mb-1 truncate">{item.title}</h4>
                            <div className="flex gap-3 flex-wrap">
                              <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest">{item.content_type}</span>
                              <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">#{idx + 1}</span>
                              {item.isPremium && <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">PREMIUM</span>}
                            </div>
                            <div className="flex gap-4 mt-2">
                              <span className="flex items-center gap-1 text-[10px] text-zinc-500"><Eye size={11} />{item.totalViews ?? 0}</span>
                              <span className="flex items-center gap-1 text-[10px] text-emerald-500"><ThumbsUp size={11} />{item.totalLikes ?? 0}</span>
                              <span className="flex items-center gap-1 text-[10px] text-rose-500"><ThumbsDown size={11} />{item.totalDislikes ?? 0}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => handleSelectSeries(item)} className="p-2 bg-white/5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all" title="Gerenciar episódios"><List size={16} /></button>
                            <button onClick={() => handleReorder(id, 'up')} className="p-2 bg-white/5 rounded-lg text-zinc-500 hover:text-white"><ArrowUp size={16} /></button>
                            <button onClick={() => handleReorder(id, 'down')} className="p-2 bg-white/5 rounded-lg text-zinc-500 hover:text-white"><ArrowDown size={16} /></button>
                            <button onClick={() => handleDelete(id)} className="p-2 bg-rose-600/10 rounded-lg text-rose-500 hover:bg-rose-600 hover:text-white transition-all"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* EPISÓDIOS — Lista de episódios da série selecionada */}
        {currentSubView === ViewMode.ADMIN_CONTENT && selectedSeries && !selectedEpisode && (
          <div className="max-w-4xl animate-apple">
            <div className="flex items-center gap-4 mb-2">
              <button onClick={() => { setSelectedSeries(null); setSelectedEpisode(null); }} className="p-2 bg-white/5 rounded-xl text-zinc-400 hover:text-white transition-all">
                <ChevronLeft size={20} />
              </button>
              <div>
                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Episódios de</p>
                <h2 className="text-3xl font-black tracking-tighter">{selectedSeries.title}</h2>
              </div>
            </div>
            <div className="flex items-center justify-between mb-8 mt-6">
              <span className="text-xs font-bold text-zinc-500">{episodes.length} episódio{episodes.length !== 1 ? 's' : ''}</span>
              <button
                onClick={() => setShowEpisodeModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-rose-600 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-rose-500 transition-all"
              >
                <Plus size={16} /> Novo Episódio
              </button>
            </div>

            {loadingEpisodes ? (
              <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /></div>
            ) : (
              <div className="bg-[var(--card-bg)] rounded-[2.5rem] border border-[var(--border-color)] overflow-hidden">
                {episodes.length === 0 ? (
                  <div className="p-16 text-center">
                    <p className="text-zinc-600 text-xs font-black uppercase tracking-widest">Nenhum episódio cadastrado</p>
                    <p className="text-zinc-700 text-xs mt-2">Clique em "Novo Episódio" para adicionar</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {episodes.map((ep) => {
                      const epId = ep._id || ep.id;
                      return (
                        <div
                          key={epId}
                          className={`flex items-center gap-6 p-6 transition-all relative ${dragOverEpId === epId ? 'bg-sky-600/10 ring-2 ring-sky-500 ring-inset rounded-2xl' : 'hover:bg-white/5'}`}
                          onDragOver={e => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) setDragOverEpId(epId); }}
                          onDragLeave={() => setDragOverEpId(null)}
                          onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) handleEpVideoDrop(ep, file); }}
                        >
                          {dragOverEpId === epId && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                              <span className="text-sky-400 font-black text-xs uppercase tracking-widest bg-[var(--bg-color)] px-4 py-2 rounded-xl border border-sky-500/40">Soltar para enviar ao Bunny</span>
                            </div>
                          )}
                          <button
                            onClick={() => setEpThumbModal({ ep, url: ep.thumbnail || '' })}
                            className="w-16 h-10 bg-zinc-800 rounded-lg overflow-hidden shrink-0 border border-[var(--border-color)] relative group cursor-pointer"
                            title="Clique para trocar a thumbnail"
                          >
                            <ImageWithFallback src={ep.thumbnail} className="w-full h-full object-cover" alt={ep.title} />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                              <Camera size={12} className="text-white" />
                            </div>
                          </button>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-sm mb-1 truncate">
                              <span className="text-zinc-500 mr-2">Ep.{ep.episode_number}</span>{ep.title}
                            </h4>
                            <div className="flex gap-3 flex-wrap">
                              {ep.bunnyVideoId && <span className="text-[9px] font-black text-sky-400 uppercase tracking-widest">BUNNY</span>}
                              {ep.video_url && !ep.bunnyVideoId && <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">URL</span>}
                              {ep.isPremium && <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">PREMIUM</span>}
                              {ep.bunnyVideoId && ep.status !== 'published' ? (
                                <button
                                  onClick={() => handleCheckVideoStatus(ep)}
                                  disabled={checkingStatusId === epId}
                                  className="text-[9px] font-black uppercase tracking-widest text-amber-400 hover:text-emerald-400 transition-colors disabled:opacity-50 flex items-center gap-1"
                                  title="Clique para verificar status no Bunny"
                                >
                                  {checkingStatusId === epId ? '...' : `↻ ${ep.status ?? 'draft'}`}
                                </button>
                              ) : (
                                <span className={`text-[9px] font-black uppercase tracking-widest ${ep.status === 'published' ? 'text-emerald-500' : 'text-amber-400'}`}>{ep.status ?? 'draft'}</span>
                              )}
                            </div>
                            {ep.description && <p className="text-zinc-600 text-[11px] mt-1 truncate">{ep.description}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="flex items-center gap-1 text-[10px] text-zinc-600"><Eye size={11} />{ep.views ?? 0}</span>
                            {selectedSeries?.content_type !== 'hiqua' && (
                              <button
                                onClick={() => { setVideoUploadTargetEp(ep); videoFileInputRef.current?.click(); }}
                                disabled={uploadingVideoId === epId}
                                className="p-2 bg-white/5 rounded-lg text-zinc-400 hover:text-sky-400 hover:bg-sky-600/20 transition-all disabled:opacity-50"
                                title={ep.bunnyVideoId ? 'Substituir vídeo no Bunny' : 'Fazer upload de vídeo para Bunny'}
                              >
                                {uploadingVideoId === epId
                                  ? <div className="w-4 h-4 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
                                  : <Film size={15} />
                                }
                              </button>
                            )}
                            {selectedSeries?.content_type === 'hiqua' && (
                              <button onClick={() => handleOpenPanels(ep)} className="p-2 bg-white/5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all" title="Gerenciar painéis"><BookOpen size={15} /></button>
                            )}
                            {selectedSeries?.content_type !== 'hiqua' && (
                              <button
                                onClick={() => handleOpenAudioModal(ep)}
                                className="p-2 bg-white/5 rounded-lg transition-all"
                                title="Gerenciar canais de áudio"
                              >
                                {(ep.audioTrack1Url || ep.audioTrack2Url)
                                  ? <Music size={15} className="text-violet-400" />
                                  : <Music size={15} className="text-zinc-500 hover:text-violet-400" />
                                }
                              </button>
                            )}
                            <button onClick={() => handleDeleteEpisode(epId)} className="p-2 bg-rose-600/10 rounded-lg text-rose-500 hover:bg-rose-600 hover:text-white transition-all"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {/* PAINÉIS — Webtoon Hi-Qua */}
        {currentSubView === ViewMode.ADMIN_CONTENT && selectedSeries && selectedEpisode && (
          <div className="max-w-4xl animate-apple">
            <div className="flex items-center gap-4 mb-6">
              <button onClick={() => setSelectedEpisode(null)} className="p-2 bg-white/5 rounded-xl text-zinc-400 hover:text-white transition-all">
                <ChevronLeft size={20} />
              </button>
              <div>
                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Painéis de</p>
                <h2 className="text-3xl font-black tracking-tighter truncate">{selectedEpisode.title}</h2>
              </div>
            </div>

            {/* Adicionar painéis — Batch Upload */}
            <div className="space-y-3 mb-6">

              {/* Seletor de idioma dos painéis */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest shrink-0">Idioma:</span>
                {([
                  { value: 'original', label: 'Original (Base)' },
                  { value: 'pt', label: 'PT' },
                  { value: 'en', label: 'EN' },
                  { value: 'es', label: 'ES' },
                  { value: 'zh', label: 'ZH' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setBatchLanguage(opt.value)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${batchLanguage === opt.value ? (opt.value === 'original' ? 'bg-sky-600 text-white' : 'bg-rose-600 text-white') : 'bg-white/5 text-zinc-500 hover:bg-white/10'}`}
                  >
                    {opt.label}
                  </button>
                ))}
                {batchLanguage !== 'original' && (
                  <span className="text-[10px] text-amber-400 font-bold">
                    As imagens serão adicionadas como camada {batchLanguage.toUpperCase()} nos painéis existentes (por ordem)
                  </span>
                )}
              </div>

              {/* Zona drag-and-drop */}
              <div
                onClick={() => batchInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setBatchDragOver(true); }}
                onDragLeave={() => setBatchDragOver(false)}
                onDrop={e => { e.preventDefault(); setBatchDragOver(false); handleBatchFilesSelect(e.dataTransfer.files); }}
                className={`flex flex-col items-center justify-center gap-2 w-full py-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all select-none ${batchDragOver ? 'border-sky-500 bg-sky-500/10' : 'border-white/10 hover:border-sky-500/50 hover:bg-white/5'}`}
              >
                <Upload size={22} className="text-zinc-500" />
                <span className="text-sm font-black text-zinc-400 uppercase tracking-widest">Selecionar ou arrastar imagens</span>
                <span className="text-[10px] text-zinc-600 font-bold">JPG · PNG · WEBP · até 138 painéis</span>
              </div>
              <input
                ref={batchInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={e => { handleBatchFilesSelect(e.target.files!); e.target.value = ''; }}
              />

              {/* Fila de arquivos selecionados */}
              {batchFiles.length > 0 && (
                <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
                  {/* Cabeçalho da fila */}
                  <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
                    <span className="text-xs font-black text-zinc-400 uppercase tracking-widest">
                      {batchFiles.length} imagem{batchFiles.length !== 1 ? 'ns' : ''} &nbsp;·&nbsp;
                      <span className="text-emerald-400">{batchFiles.filter(f => f.status === 'done').length} ok</span>
                      {batchFiles.filter(f => f.status === 'error').length > 0 && (
                        <span className="text-rose-400"> &nbsp;·&nbsp; {batchFiles.filter(f => f.status === 'error').length} erro{batchFiles.filter(f => f.status === 'error').length !== 1 ? 's' : ''}</span>
                      )}
                    </span>
                    <button
                      onClick={() => setBatchFiles(prev => prev.filter(f => f.status === 'pending' || f.status === 'uploading'))}
                      disabled={batchUploading}
                      className="text-[10px] font-black text-zinc-600 hover:text-rose-400 uppercase tracking-widest transition-colors disabled:opacity-30"
                    >
                      Limpar concluídos
                    </button>
                  </div>

                  {/* Lista de miniaturas */}
                  <div className="max-h-60 overflow-y-auto p-3 grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {batchFiles.map((f, i) => (
                      <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-zinc-900 border border-[var(--border-color)] group">
                        <img src={f.preview} alt="" className="w-full h-full object-cover" />
                        {/* Status overlay */}
                        <div className={`absolute inset-0 flex items-center justify-center transition-all ${f.status === 'pending' ? 'bg-black/0' : 'bg-black/50'}`}>
                          {f.status === 'uploading' && <div className="w-5 h-5 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />}
                          {f.status === 'done' && <CheckCircle2 size={20} className="text-emerald-400" />}
                          {f.status === 'error' && <span title={f.error}><AlertCircle size={20} className="text-rose-400" /></span>}
                        </div>
                        {/* Número de ordem */}
                        <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1 text-[8px] font-black text-zinc-300">
                          {i + 1}
                        </div>
                        {/* Remover (só pendentes) */}
                        {f.status === 'pending' && !batchUploading && (
                          <button
                            onClick={e => { e.stopPropagation(); setBatchFiles(prev => prev.filter((_, idx) => idx !== i)); URL.revokeObjectURL(f.preview); }}
                            className="absolute top-1 right-1 p-0.5 bg-rose-600/80 rounded opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <X size={10} className="text-white" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Botão de envio em lote */}
              {batchFiles.filter(f => f.status === 'pending').length > 0 && (
                <button
                  onClick={handleBatchUpload}
                  disabled={batchUploading}
                  className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all disabled:opacity-50 ${batchLanguage === 'original' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-rose-600 hover:bg-rose-500'}`}
                >
                  {batchUploading
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enviando...</>
                    : <><Upload size={16} /> Enviar {batchFiles.filter(f => f.status === 'pending').length} imagem{batchFiles.filter(f => f.status === 'pending').length !== 1 ? 'ns' : ''} {batchLanguage !== 'original' ? `· Idioma ${batchLanguage.toUpperCase()}` : '· Base'}</>
                  }
                </button>
              )}

              {/* Alternativa: colar URL */}
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newPanelUrl}
                  onChange={e => setNewPanelUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddPanel()}
                  placeholder="Ou cole a URL da imagem..."
                  className="flex-1 bg-black/5 dark:bg-white/5 border border-[var(--border-color)] rounded-2xl px-4 py-3 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500 transition-colors"
                />
                <button
                  onClick={handleAddPanel}
                  disabled={addingPanel || !newPanelUrl.trim()}
                  className="flex items-center gap-2 px-5 py-3 bg-rose-600 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-rose-500 transition-all disabled:opacity-50"
                >
                  {addingPanel ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><ImagePlus size={16} /> Adicionar</>}
                </button>
              </div>
            </div>

            {loadingPanels ? (
              <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /></div>
            ) : panelsList.length === 0 ? (
              <div className="bg-[var(--card-bg)] rounded-[2.5rem] border border-[var(--border-color)] p-16 text-center">
                <p className="text-zinc-600 text-xs font-black uppercase tracking-widest">Nenhum painel</p>
                <p className="text-zinc-700 text-xs mt-2">Faça upload de imagens ou cole URLs acima</p>
              </div>
            ) : (
              <>
              {/* Controles de seleção múltipla */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedPanels(selectedPanels.size === panelsList.length ? new Set() : new Set(panelsList.map((_: any, i: number) => i)))}
                    className="text-[10px] font-black text-zinc-500 hover:text-white uppercase tracking-widest transition-colors"
                  >
                    {selectedPanels.size === panelsList.length ? 'Desselecionar todos' : 'Selecionar todos'}
                  </button>
                  {selectedPanels.size > 0 && (
                    <span className="text-[10px] font-black text-zinc-400">{selectedPanels.size} selecionado{selectedPanels.size !== 1 ? 's' : ''}</span>
                  )}
                </div>
                {selectedPanels.size > 0 && (
                  <button
                    onClick={handleBatchDeletePanels}
                    disabled={deletingPanels}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-600/20 border border-rose-500/30 rounded-xl text-rose-400 text-[11px] font-black uppercase tracking-widest hover:bg-rose-600/40 transition-all disabled:opacity-50"
                  >
                    {deletingPanels ? <div className="w-3 h-3 border-2 border-rose-400/30 border-t-rose-400 rounded-full animate-spin" /> : <Trash2 size={13} />}
                    Excluir {selectedPanels.size}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {panelsList.map((panel, idx) => {
                  const langs: string[] = (panel.translationLayers ?? []).map((l: any) => l.language);
                  return (
                    <div
                      key={idx}
                      className={`relative group rounded-2xl overflow-hidden border bg-zinc-900 flex flex-col transition-all ${selectedPanels.has(idx) ? 'border-rose-500 ring-1 ring-rose-500' : 'border-[var(--border-color)]'}`}
                    >
                      <div className="relative">
                        <img src={panel.image_url} alt={`Painel ${idx + 1}`} className="w-full object-cover" loading="lazy" />
                        {/* Checkbox de seleção */}
                        <button
                          onClick={() => togglePanelSelection(idx)}
                          className={`absolute top-2 left-2 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${selectedPanels.has(idx) ? 'bg-rose-600 border-rose-500' : 'bg-black/60 border-white/20 opacity-0 group-hover:opacity-100'}`}
                        >
                          {selectedPanels.has(idx) && <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </button>
                        <div className="absolute top-2 left-9 bg-black/60 rounded-lg px-2 py-1 text-[10px] font-black text-zinc-300">
                          #{idx + 1}
                        </div>
                        <button
                          onClick={() => handleDeletePanel(idx)}
                          className="absolute top-2 right-2 p-1.5 bg-rose-600/80 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-600"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="p-2 flex flex-wrap gap-1 bg-zinc-900">
                        {(['pt','en','es','zh'] as const).map(lang => (
                          <button
                            key={lang}
                            onClick={() => openTranslationModal(idx, panel)}
                            className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest transition-all ${langs.includes(lang) ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-500 hover:bg-white/10'}`}
                          >
                            {lang}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Modal de tradução de painel */}
              {translationModal && (
                <div className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6">
                  <div className="bg-[#1C1C1E] rounded-[2.5rem] border border-white/10 p-8 w-full max-w-md">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-black">Painel #{translationModal.panelIdx + 1} — Tradução</h3>
                      <button onClick={() => setTranslationModal(null)} className="p-2 rounded-full hover:bg-white/10"><X size={18} /></button>
                    </div>

                    <div className="flex gap-2 mb-4">
                      {(['pt','en','es','zh'] as const).map(lang => {
                        const existing = (translationModal.panel.translationLayers ?? []).find((l: any) => l.language === lang);
                        return (
                          <button
                            key={lang}
                            onClick={() => {
                              setTranslationLang(lang);
                              setTranslationUrl(existing?.imageUrl ?? '');
                              setTranslationMsg('');
                            }}
                            className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${translationLang === lang ? 'bg-rose-600 text-white' : existing ? 'bg-white/10 text-white' : 'bg-white/5 text-zinc-500'}`}
                          >
                            {lang}{existing ? ' ✓' : ''}
                          </button>
                        );
                      })}
                    </div>

                    <input
                      type="text"
                      placeholder="URL da imagem traduzida"
                      value={translationUrl}
                      onChange={e => setTranslationUrl(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none mb-4"
                    />

                    {translationUrl && (
                      <img src={translationUrl} className="w-full rounded-xl mb-4 max-h-48 object-cover opacity-80" onError={e => (e.currentTarget.style.display = 'none')} />
                    )}

                    {translationMsg && (
                      <p className={`text-xs font-bold mb-3 ${translationMsg.includes('Erro') ? 'text-rose-400' : 'text-emerald-400'}`}>{translationMsg}</p>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={handleDeleteTranslation}
                        disabled={savingTranslation}
                        className="flex-1 py-3 bg-white/5 border border-white/10 text-zinc-400 rounded-2xl font-black text-sm hover:bg-rose-600/20 hover:text-rose-400 hover:border-rose-500/30 transition-all flex items-center justify-center gap-2"
                      >
                        <Trash2 size={14} /> Remover
                      </button>
                      <button
                        onClick={handleSaveTranslation}
                        disabled={savingTranslation}
                        className="flex-1 py-3 bg-rose-600 text-white rounded-2xl font-black text-sm hover:bg-rose-500 transition-all flex items-center justify-center"
                      >
                        {savingTranslation ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Salvar'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              </>
            )}
          </div>
        )}

        {/* ANÚNCIOS */}
        {currentSubView === ViewMode.ADMIN_ADS && (
          <div className="max-w-4xl animate-apple">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-4xl font-black tracking-tighter">Anúncios</h2>
              <button onClick={openNewAd} className="flex items-center gap-2 px-6 py-3 bg-rose-600 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-rose-500 transition-all">
                <Plus size={16} /> Novo Anúncio
              </button>
            </div>

            {loadingAds ? (
              <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /></div>
            ) : (
              <div className="bg-[var(--card-bg)] rounded-[2.5rem] border border-[var(--border-color)] overflow-hidden">
                {adsList.length === 0 ? (
                  <div className="p-16 text-center">
                    <p className="text-zinc-600 text-xs font-black uppercase tracking-widest">Nenhum anúncio cadastrado</p>
                    <p className="text-zinc-700 text-xs mt-2">Clique em "Novo Anúncio" para começar</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {adsList.map((ad) => {
                      const id = ad._id || ad.id;
                      return (
                        <div key={id} className="flex items-center gap-5 p-5 hover:bg-white/5 transition-all">
                          <div className="w-20 h-14 bg-zinc-800 rounded-lg overflow-hidden shrink-0 border border-[var(--border-color)]">
                            <ImageWithFallback src={ad.image_url} className="w-full h-full object-cover" alt={ad.title} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-sm truncate">{ad.title}</h4>
                            {ad.advertiser && <p className="text-zinc-500 text-xs mt-0.5">{ad.advertiser}</p>}
                            <div className="flex gap-3 mt-1 flex-wrap">
                              <span className={`text-[9px] font-black uppercase tracking-widest ${ad.isActive ? 'text-emerald-400' : 'text-zinc-600'}`}>{ad.isActive ? 'ATIVO' : 'INATIVO'}</span>
                              <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">{ad.impressions ?? 0} imp · {ad.clicks ?? 0} cliques</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {ad.link_url && <a href={ad.link_url} target="_blank" rel="noreferrer" className="p-2 bg-white/5 rounded-lg text-zinc-500 hover:text-white transition-all"><ExternalLink size={15} /></a>}
                            <button onClick={() => handleToggleAd(ad)} className="p-2 bg-white/5 rounded-lg transition-all" title={ad.isActive ? 'Desativar' : 'Ativar'}>
                              {ad.isActive ? <ToggleRight size={18} className="text-emerald-400" /> : <ToggleLeft size={18} className="text-zinc-600" />}
                            </button>
                            <button onClick={() => openEditAd(ad)} className="p-2 bg-white/5 rounded-lg text-zinc-400 hover:text-white transition-all"><Film size={15} /></button>
                            <button onClick={() => handleDeleteAd(id)} className="p-2 bg-rose-600/10 rounded-lg text-rose-500 hover:bg-rose-600 hover:text-white transition-all"><Trash2 size={15} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CONFIGURAÇÕES GLOBAIS */}
        {currentSubView === ViewMode.ADMIN_SETTINGS && (
          <div className="max-w-2xl animate-apple">
            <h2 className="text-4xl font-black tracking-tighter mb-8">Configurações</h2>

            {loadingSettings ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
              </div>
            ) : (
              <form onSubmit={handleSaveSettings} className="bg-[var(--card-bg)] rounded-[2.5rem] border border-[var(--border-color)] p-8 space-y-8">

                {/* Plataforma */}
                <div>
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-4">Plataforma</p>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Tagline <span className="text-zinc-600 font-normal">(exibida na tela de login)</span></label>
                      <input
                        type="text"
                        placeholder="Cinematic Comics. O futuro é aqui."
                        value={settingsForm.platform_tagline}
                        onChange={e => setSettingsForm(p => ({ ...p, platform_tagline: e.target.value }))}
                        className="w-full bg-white/5 border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-rose-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Bunny CDN Base URL <span className="text-zinc-600 font-normal">(URL base dos vídeos)</span></label>
                      <input
                        type="text"
                        placeholder="https://vz-fbaa1d24-d2c.b-cdn.net"
                        value={settingsForm.bunny_cdn_base}
                        onChange={e => setSettingsForm(p => ({ ...p, bunny_cdn_base: e.target.value }))}
                        className="w-full bg-white/5 border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-rose-500/50"
                      />
                    </div>
                  </div>
                </div>

                {/* Preços */}
                <div>
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-4">Preços</p>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Preço Premium <span className="text-zinc-600 font-normal">(exibido ao usuário)</span></label>
                      <input
                        type="text"
                        placeholder="R$ 3,99"
                        value={settingsForm.premium_price_display}
                        onChange={e => setSettingsForm(p => ({ ...p, premium_price_display: e.target.value }))}
                        className="w-full bg-white/5 border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-rose-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">CPM Rate <span className="text-zinc-600 font-normal">(R$ por 1.000 impressões)</span></label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="15.00"
                        value={settingsForm.premium_cpm_rate}
                        onChange={e => setSettingsForm(p => ({ ...p, premium_cpm_rate: e.target.value }))}
                        className="w-full bg-white/5 border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-rose-500/50"
                      />
                    </div>
                  </div>
                </div>

                {/* Anúncios */}
                <div>
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-4">Anúncios</p>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Segundos para pular anúncio</label>
                      <input
                        type="number"
                        min="0"
                        max="60"
                        placeholder="5"
                        value={settingsForm.ad_skip_seconds}
                        onChange={e => setSettingsForm(p => ({ ...p, ad_skip_seconds: e.target.value }))}
                        className="w-full bg-white/5 border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-rose-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Frequência de anúncio no feed <span className="text-zinc-600 font-normal">(exibir a cada N séries)</span></label>
                      <input
                        type="number"
                        min="1"
                        placeholder="4"
                        value={settingsForm.ad_frequency_feed}
                        onChange={e => setSettingsForm(p => ({ ...p, ad_frequency_feed: e.target.value }))}
                        className="w-full bg-white/5 border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-rose-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Frequência de anúncio no webtoon <span className="text-zinc-600 font-normal">(exibir a cada N painéis)</span></label>
                      <input
                        type="number"
                        min="1"
                        placeholder="7"
                        value={settingsForm.ad_frequency_webtoon}
                        onChange={e => setSettingsForm(p => ({ ...p, ad_frequency_webtoon: e.target.value }))}
                        className="w-full bg-white/5 border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-rose-500/50"
                      />
                    </div>
                  </div>
                </div>

                {/* Google AdSense */}
                <div>
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-4">Google AdSense</p>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Publisher ID <span className="text-zinc-600 font-normal">(data-ad-client)</span></label>
                      <input
                        type="text"
                        placeholder="ca-pub-XXXXXXXXXXXXXXXX"
                        value={settingsForm.adsense_client_id}
                        onChange={e => setSettingsForm(p => ({ ...p, adsense_client_id: e.target.value }))}
                        className="w-full bg-white/5 border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-rose-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-zinc-400 block mb-1">Slot ID <span className="text-zinc-600 font-normal">(data-ad-slot)</span></label>
                      <input
                        type="text"
                        placeholder="XXXXXXXXXX"
                        value={settingsForm.adsense_slot_id}
                        onChange={e => setSettingsForm(p => ({ ...p, adsense_slot_id: e.target.value }))}
                        className="w-full bg-white/5 border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-rose-500/50"
                      />
                      <p className="text-[10px] text-zinc-600 mt-1">Gere o Slot ID no painel do Google AdSense em <span className="font-mono">Anúncios → Por unidade de anúncio</span>.</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="px-8 py-3 bg-rose-600 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-rose-500 transition-all disabled:opacity-50"
                  >
                    {savingSettings ? 'Salvando...' : 'Salvar'}
                  </button>
                  {settingsMsg && (
                    <p className={`text-xs font-bold ${settingsMsg.includes('Erro') ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {settingsMsg}
                    </p>
                  )}
                </div>
              </form>
            )}
          </div>
        )}

        {/* USUÁRIOS */}
        {(currentSubView === ViewMode.ADMIN_USERS || currentSubView === ViewMode.ADMIN_PAYMENTS) && (
          <div className="max-w-4xl animate-apple">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-4xl font-black tracking-tighter">
                {currentSubView === ViewMode.ADMIN_PAYMENTS ? 'Assinantes Premium' : 'Usuários'}
              </h2>
              <span className="text-xs font-bold text-zinc-500">{usersTotal} total</span>
            </div>

            {/* Filtros */}
            {currentSubView === ViewMode.ADMIN_USERS && (
              <div className="flex gap-2 mb-6">
                {(['all', 'premium', 'admin'] as const).map(f => (
                  <button key={f} onClick={() => { setUserFilter(f); loadUsers(1, f); }}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${userFilter === f ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-500 hover:bg-white/10'}`}>
                    {f === 'all' ? 'Todos' : f === 'premium' ? 'Premium' : 'Admin'}
                  </button>
                ))}
              </div>
            )}

            {loadingUsers ? (
              <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /></div>
            ) : (
              <div className="bg-[var(--card-bg)] rounded-[2.5rem] border border-[var(--border-color)] overflow-hidden">
                {usersList.length === 0 ? (
                  <div className="p-16 text-center">
                    <p className="text-zinc-600 text-xs font-black uppercase tracking-widest">Nenhum usuário encontrado</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {(currentSubView === ViewMode.ADMIN_PAYMENTS ? usersList.filter(u => u.isPremium) : usersList).map((u) => {
                      const uid = u._id || u.id;
                      return (
                        <div key={uid} className="flex items-center gap-4 px-6 py-4 hover:bg-white/5 transition-all">
                          <div className="w-9 h-9 rounded-full bg-zinc-800 border border-[var(--border-color)] shrink-0 flex items-center justify-center text-xs font-black text-zinc-400">
                            {(u.nome || u.email || '?')[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate">{u.nome || '—'}</p>
                            <p className="text-zinc-500 text-xs truncate">{u.email}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                            {u.role !== 'user' && (
                              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-violet-600/20 text-violet-400">{u.role}</span>
                            )}
                            <button onClick={() => handleTogglePremium(u)}
                              className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-all ${u.isPremium ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/40' : 'bg-white/5 text-zinc-600 hover:bg-white/10'}`}>
                              {u.isPremium ? 'PREMIUM' : 'free'}
                            </button>
                            <button onClick={() => handleToggleActive(u)}
                              className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-all ${u.isActive ? 'bg-emerald-500/10 text-emerald-500 hover:bg-rose-600/20 hover:text-rose-400' : 'bg-rose-600/10 text-rose-400 hover:bg-emerald-500/10 hover:text-emerald-400'}`}>
                              {u.isActive ? 'ATIVO' : 'INATIVO'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Paginação */}
            {usersPages > 1 && (
              <div className="flex justify-center gap-2 mt-6">
                {Array.from({ length: usersPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => loadUsers(p, userFilter)}
                    className={`w-9 h-9 rounded-xl text-xs font-black transition-all ${p === usersPage ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-500 hover:bg-white/10'}`}>
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Input de arquivo oculto para upload de thumbnail */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleThumbnailFileChange}
      />
      {/* Input oculto para thumbnail de episódio */}
      <input ref={epThumbFileRef} type="file" accept="image/*" className="hidden" onChange={handleEpThumbFileChange} />
      {/* Input de arquivo oculto para upload de vídeo para Bunny Stream */}
      <input
        ref={videoFileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/x-matroska"
        className="hidden"
        onChange={handleVideoFileChange}
      />

      {/* Inputs ocultos para upload de áudio */}
      <input ref={audioTrack1Ref} type="file" accept="audio/mpeg,audio/mp3,audio/aac,audio/mp4,audio/x-m4a,audio/ogg,audio/wav" className="hidden" onChange={e => handleAudioUpload(e, 'track1')} />
      <input ref={audioTrack2Ref} type="file" accept="audio/mpeg,audio/mp3,audio/aac,audio/mp4,audio/x-m4a,audio/ogg,audio/wav" className="hidden" onChange={e => handleAudioUpload(e, 'track2')} />

      {/* Modal — Thumbnail do Episódio */}
      {epThumbModal && (
        <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-[var(--card-bg)] rounded-[2.5rem] border border-[var(--border-color)] p-10 w-full max-w-md">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-black tracking-tighter">Thumbnail do Episódio</h3>
              <button onClick={() => setEpThumbModal(null)} className="text-zinc-500 hover:text-white transition-all"><X size={24} /></button>
            </div>
            <p className="text-xs text-zinc-600 font-bold mb-6 truncate">Ep.{epThumbModal.ep.episode_number} — {epThumbModal.ep.title}</p>

            {/* Preview */}
            <div className="w-full h-36 rounded-2xl overflow-hidden mb-6 bg-zinc-900">
              <ImageWithFallback src={epThumbModal.url || epThumbModal.ep.thumbnail} className="w-full h-full object-cover" alt="preview" />
            </div>

            <div className="space-y-3">
              <input
                type="url"
                placeholder="https://cdn.exemplo.com/thumb.jpg"
                value={epThumbModal.url}
                onChange={e => setEpThumbModal(m => m ? { ...m, url: e.target.value } : m)}
                className="w-full bg-black/5 dark:bg-white/5 border border-[var(--border-color)] rounded-2xl px-5 py-3 text-sm text-[var(--text-color)] focus:outline-none focus:border-rose-500 transition-all"
              />
              <button
                onClick={() => epThumbFileRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 rounded-2xl text-sm font-bold text-zinc-400 hover:text-white hover:bg-white/10 transition-all border border-[var(--border-color)]"
              >
                <Upload size={15} /> Fazer upload de imagem
              </button>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setEpThumbModal(null)} className="flex-1 py-3 bg-white/5 rounded-2xl text-sm font-bold text-zinc-400 hover:bg-white/10 transition-all">Cancelar</button>
              <button
                onClick={handleSaveEpThumb}
                disabled={savingEpThumb}
                className="flex-1 py-3 bg-rose-600 rounded-2xl text-sm font-black text-white hover:bg-rose-500 transition-all disabled:opacity-50"
              >
                {savingEpThumb ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Canais de Áudio */}
      {audioModalEp && (
        <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-[var(--card-bg)] rounded-[2.5rem] border border-[var(--border-color)] p-10 w-full max-w-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-2xl font-black tracking-tighter">Canais de Áudio</h3>
              <button onClick={() => setAudioModalEp(null)} className="text-zinc-500 hover:text-white transition-all"><X size={24} /></button>
            </div>
            <p className="text-xs text-zinc-600 font-bold mb-8 truncate">Ep.{audioModalEp.episode_number} — {audioModalEp.title}</p>

            <div className="space-y-5">
              {/* Canal 1 — Dublagem / Voice Comic */}
              <AudioChannelRow
                label="Canal 1 — Dublagem / Voice Comic"
                icon={<Mic size={16} />}
                url={audioForm.audioTrack1Url}
                uploading={uploadingAudio.track1}
                onUpload={() => audioTrack1Ref.current?.click()}
                onRemove={() => handleRemoveAudio('track1')}
              />

              {/* Canal 2 — Trilha Sonora / Áudio Alternativo */}
              <AudioChannelRow
                label="Canal 2 — Trilha Sonora / Alternativo"
                icon={<Music2 size={16} />}
                url={audioForm.audioTrack2Url}
                uploading={uploadingAudio.track2}
                onUpload={() => audioTrack2Ref.current?.click()}
                onRemove={() => handleRemoveAudio('track2')}
              />
            </div>

            <p className="text-[10px] text-zinc-700 font-bold mt-8">MP3 · AAC · M4A · OGG · WAV — máx. 200 MB por arquivo</p>
          </div>
        </div>
      )}

      {/* Modal — Nova Série */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-[var(--card-bg)] rounded-[2.5rem] border border-[var(--border-color)] p-10 w-full max-w-lg">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black tracking-tighter">Nova Série</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-zinc-500 hover:text-white transition-all"><X size={24} /></button>
            </div>

            <form onSubmit={handleCreateSeries} className="space-y-4">
              <FormField label="Título" value={newSeries.title} onChange={v => setNewSeries(s => ({ ...s, title: v }))} required />
              <FormField label="Gênero" value={newSeries.genre} onChange={v => setNewSeries(s => ({ ...s, genre: v }))} required />
              <FormField label="Descrição" value={newSeries.description} onChange={v => setNewSeries(s => ({ ...s, description: v }))} />
              <div>
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Capa</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={coverFile ? coverFile.name : newSeries.cover_image}
                    onChange={e => { setCoverFile(null); setNewSeries(s => ({ ...s, cover_image: e.target.value })); }}
                    placeholder="URL da imagem ou selecione um arquivo..."
                    readOnly={!!coverFile}
                    className="flex-1 bg-black/5 dark:bg-white/5 border border-[var(--border-color)] rounded-2xl px-4 py-3 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500 transition-colors"
                  />
                  <label className="flex items-center gap-2 px-4 py-3 bg-black/5 dark:bg-white/5 border border-[var(--border-color)] rounded-2xl text-zinc-500 dark:text-zinc-400 hover:text-[var(--text-color)] hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer transition-all shrink-0">
                    <Camera size={16} />
                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) { setCoverFile(f); setNewSeries(s => ({ ...s, cover_image: '' })); }
                    }} />
                  </label>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Tipo de Conteúdo</label>
                <select
                  value={newSeries.content_type}
                  onChange={e => setNewSeries(s => ({ ...s, content_type: e.target.value }))}
                  className="w-full bg-black/5 dark:bg-zinc-900 border border-[var(--border-color)] rounded-2xl px-4 py-3 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500"
                >
                  {CONTENT_TYPES.map(ct => <option key={ct.value} value={ct.value} className="bg-zinc-900 text-white">{ct.label}</option>)}
                </select>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={newSeries.isPremium} onChange={e => setNewSeries(s => ({ ...s, isPremium: e.target.checked }))} className="w-4 h-4 accent-rose-500" />
                <span className="text-sm font-bold text-[var(--text-color)]">Conteúdo Premium</span>
              </label>

              {createMsg && <p className={`text-sm font-bold text-center ${createMsg.includes('Erro') ? 'text-rose-500' : 'text-green-400'}`}>{createMsg}</p>}

              <button type="submit" disabled={creating || !newSeries.title || !newSeries.genre} className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl hover:bg-rose-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {creating ? 'Criando...' : 'CRIAR SÉRIE'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Novo Episódio */}
      {showEpisodeModal && (
        <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-[var(--card-bg)] rounded-[2.5rem] border border-[var(--border-color)] p-10 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black tracking-tighter">Novo Episódio</h3>
              <button onClick={() => setShowEpisodeModal(false)} className="text-zinc-500 hover:text-white transition-all"><X size={24} /></button>
            </div>

            <form onSubmit={handleCreateEpisode} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Número do Episódio</label>
                <input
                  type="number" min={1}
                  value={newEpisode.episode_number}
                  onChange={e => setNewEpisode(ep => ({ ...ep, episode_number: parseInt(e.target.value) || 1 }))}
                  className="w-full bg-black/5 dark:bg-white/5 border border-[var(--border-color)] rounded-2xl px-4 py-3 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500 transition-colors"
                />
              </div>
              <FormField label="Título" value={newEpisode.title} onChange={v => setNewEpisode(ep => ({ ...ep, title: v }))} required />
              <FormField label="Descrição" value={newEpisode.description} onChange={v => setNewEpisode(ep => ({ ...ep, description: v }))} />
              <FormField label="URL da Thumbnail" value={newEpisode.thumbnail} onChange={v => setNewEpisode(ep => ({ ...ep, thumbnail: v }))} />

              <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 space-y-3">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Vídeo — opcional (envie pelo botão <Film size={10} className="inline" /> após criar)</p>
                <FormField label="Bunny Video ID (ex: abc-123-def)" value={newEpisode.bunnyVideoId} onChange={v => setNewEpisode(ep => ({ ...ep, bunnyVideoId: v }))} />
                <FormField label="Ou URL direta do vídeo (mp4/m3u8)" value={newEpisode.video_url} onChange={v => setNewEpisode(ep => ({ ...ep, video_url: v }))} />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={newEpisode.isPremium} onChange={e => setNewEpisode(ep => ({ ...ep, isPremium: e.target.checked }))} className="w-4 h-4 accent-rose-500" />
                <span className="text-sm font-bold text-[var(--text-color)]">Episódio Premium</span>
              </label>

              {episodeMsg && <p className={`text-sm font-bold text-center ${episodeMsg.includes('Erro') ? 'text-rose-500' : 'text-green-400'}`}>{episodeMsg}</p>}

              <button type="submit" disabled={creatingEpisode || !newEpisode.title} className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl hover:bg-rose-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {creatingEpisode ? 'Criando...' : 'CRIAR EPISÓDIO'}
              </button>
            </form>
          </div>
        </div>
      )}
      {/* Modal — Novo/Editar Anúncio */}
      {showAdModal && (
        <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-[var(--card-bg)] rounded-[2.5rem] border border-[var(--border-color)] p-10 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black tracking-tighter">{editingAd ? 'Editar Anúncio' : 'Novo Anúncio'}</h3>
              <button onClick={() => setShowAdModal(false)} className="text-zinc-500 hover:text-white transition-all"><X size={24} /></button>
            </div>
            <form onSubmit={handleSaveAd} className="space-y-4">
              <FormField label="Título *" value={adForm.title} onChange={v => setAdForm(f => ({ ...f, title: v }))} required />

              {/* Upload de imagem */}
              <div>
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Imagem do Anúncio *</label>
                <input ref={adImageFileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleAdImageUpload(f); e.target.value = ''; }} />
                <div
                  onClick={() => adImageFileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleAdImageUpload(f); }}
                  className="relative border-2 border-dashed border-white/10 rounded-2xl overflow-hidden cursor-pointer hover:border-rose-500/50 transition-colors"
                  style={{ minHeight: 120 }}
                >
                  {adForm.image_url ? (
                    <img src={adForm.image_url} alt="preview" className="w-full max-h-48 object-contain bg-black/30" />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
                      <ImagePlus size={28} className="mb-2" />
                      <span className="text-xs font-bold">{uploadingAdImage ? 'Enviando...' : 'Clique ou arraste a imagem aqui'}</span>
                    </div>
                  )}
                  {uploadingAdImage && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-white text-xs font-black animate-pulse">ENVIANDO...</span>
                    </div>
                  )}
                  {adForm.image_url && !uploadingAdImage && (
                    <div className="absolute bottom-2 right-2 bg-black/60 rounded-lg px-2 py-1 text-[10px] text-zinc-300 font-bold">Clique para trocar</div>
                  )}
                </div>
                {/* URL manual como alternativa */}
                <input
                  type="url"
                  placeholder="Ou cole uma URL de imagem..."
                  value={adForm.image_url}
                  onChange={e => setAdForm(f => ({ ...f, image_url: e.target.value }))}
                  className="mt-2 w-full bg-white/5 border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs font-mono text-zinc-400 outline-none focus:border-rose-500 transition-colors"
                />
              </div>
              <FormField label="URL de Destino (link)" value={adForm.link_url} onChange={v => setAdForm(f => ({ ...f, link_url: v }))} />
              <FormField label="Anunciante" value={adForm.advertiser} onChange={v => setAdForm(f => ({ ...f, advertiser: v }))} />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Início</label>
                  <input type="date" value={adForm.startsAt} onChange={e => setAdForm(f => ({ ...f, startsAt: e.target.value }))}
                    className="w-full bg-black/5 dark:bg-white/5 border border-[var(--border-color)] rounded-2xl px-4 py-3 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500 transition-colors" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Fim</label>
                  <input type="date" value={adForm.endsAt} onChange={e => setAdForm(f => ({ ...f, endsAt: e.target.value }))}
                    className="w-full bg-black/5 dark:bg-white/5 border border-[var(--border-color)] rounded-2xl px-4 py-3 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500 transition-colors" />
                </div>
              </div>
              {adMsg && <p className={`text-sm font-bold text-center ${adMsg.includes('Erro') ? 'text-rose-500' : 'text-green-400'}`}>{adMsg}</p>}
              <button type="submit" disabled={savingAd || !adForm.title || !adForm.image_url}
                className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl hover:bg-rose-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {savingAd ? 'Salvando...' : editingAd ? 'SALVAR ALTERAÇÕES' : 'CRIAR ANÚNCIO'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const SidebarLink = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all font-bold text-sm ${active ? 'bg-rose-600 text-white' : 'text-zinc-500 hover:bg-white/5'}`}>
    {icon} {label}
  </button>
);

const StatCard = ({ label, value, icon }: any) => (
  <div className="bg-[var(--card-bg)] p-8 rounded-[2rem] border border-[var(--border-color)]">
    <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center mb-6 text-rose-500">{icon}</div>
    <div className="text-3xl font-black text-[var(--text-color)]">{value}</div>
    <div className="text-[10px] font-black text-zinc-500 uppercase mt-2 tracking-widest">{label}</div>
  </div>
);

const FormField = ({ label, value, onChange, required = false }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) => (
  <div>
    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">{label}</label>
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      required={required}
      className="w-full bg-black/5 dark:bg-white/5 border border-[var(--border-color)] rounded-2xl px-4 py-3 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500 transition-colors"
    />
  </div>
);

const AudioChannelRow = ({ label, icon, url, uploading, onUpload, onRemove }: {
  label: string;
  icon: React.ReactNode;
  url: string;
  uploading: boolean;
  onUpload: () => void;
  onRemove: () => void;
}) => (
  <div className="bg-white/5 rounded-2xl border border-[var(--border-color)] p-5 space-y-3">
    <div className="flex items-center gap-2">
      <span className="text-violet-400">{icon}</span>
      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{label}</span>
      {url
        ? <span className="ml-auto flex items-center gap-1 text-[9px] font-black text-emerald-400 uppercase tracking-widest"><CheckCircle2 size={12} /> Configurado</span>
        : <span className="ml-auto text-[9px] font-black text-zinc-600 uppercase tracking-widest">Não configurado</span>
      }
    </div>
    {url && (
      <p className="text-[10px] text-zinc-600 font-mono truncate" title={url}>{url}</p>
    )}
    <div className="flex gap-2">
      <button
        onClick={onUpload}
        disabled={uploading}
        className="flex items-center gap-2 px-4 py-2 bg-violet-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-violet-500 transition-all disabled:opacity-50"
      >
        {uploading
          ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enviando...</>
          : <><Upload size={13} /> {url ? 'Substituir' : 'Upload'}</>
        }
      </button>
      {url && (
        <button
          onClick={onRemove}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 bg-rose-600/20 rounded-xl text-xs font-black text-rose-400 uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all disabled:opacity-30"
        >
          <Trash2 size={13} /> Remover
        </button>
      )}
    </div>
  </div>
);

export default AdminDashboard;
