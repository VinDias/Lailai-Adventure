
import { Series, Episode, User, Ad, Channel, Panel, Chapter } from '../types';
import API_URL from '../config/api';
import { MOCK_CHANNELS, MOCK_EPISODES, MOCK_ADS } from './mockData';

class ApiService {
  private static instance: ApiService;
  private token: string | null = localStorage.getItem('lailai_token');
  public isOffline: boolean = false;
  private onStatusChange: ((offline: boolean) => void) | null = null;
  private cache: Map<string, any> = new Map();

  public static getInstance() {
    if (!ApiService.instance) ApiService.instance = new ApiService();
    return ApiService.instance;
  }

  public setStatusCallback(callback: (offline: boolean) => void) {
    this.onStatusChange = callback;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const cacheKey = `${options.method || 'GET'}_${path}`;
    
    // Cache de leitura simples para GET
    if (options.method === 'GET' && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const headers = {
      'Content-Type': 'application/json',
      ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
      ...options.headers,
    };

    try {
      const response = await fetch(`${API_URL}${path}`, { ...options, headers });
      
      if (this.isOffline) {
        this.isOffline = false;
        this.onStatusChange?.(false);
      }

      if (response.status === 401) {
        this.logout();
        throw new Error('Sessão expirada.');
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `Erro ${response.status}`);
      }

      const data = await response.json();
      if (options.method === 'GET') this.cache.set(cacheKey, data);
      return data;
    } catch (error) {
      if (error instanceof TypeError) {
        this.isOffline = true;
        this.onStatusChange?.(true);
        return this.localFallback<T>(path, options);
      }
      throw error;
    }
  }

  private logout() {
    this.token = null;
    localStorage.removeItem('lailai_token');
    localStorage.removeItem('lailai_session');
  }

  private async localFallback<T>(path: string, options: RequestInit): Promise<T> {
    console.warn(`[LAILAI] Fallback Local: ${path}`);
    
    // Simulação de delay para manter UX consistente
    await new Promise(r => setTimeout(r, 200));

    const db = (key: string) => JSON.parse(localStorage.getItem(`lailai_db_${key}`) || '[]');
    const save = (key: string, data: any) => localStorage.setItem(`lailai_db_${key}`, JSON.stringify(data));

    if (path.includes('/auth/login')) {
      return { user: { id: 1, name: 'Usuário Offline', isPremium: true, followingChannelIds: [] }, token: 'mock' } as any;
    }

    if (path === '/content/series') {
      const stored = db('series');
      return (stored.length > 0 ? stored : []) as any;
    }

    if (path === '/content/episodes') {
      return db('episodes') as any;
    }

    if (path.includes('/health')) return { status: 'offline_mode' } as any;

    return [] as any;
  }

  // Métodos expostos
  async checkHealth() { return this.request('/health'); }
  async getSeries() { return this.request<Series[]>('/content/series'); }
  async getSeriesContent(id: number) { return this.request<any>(`/content/series/${id}`); }
  async getEpisodesBySeries(id: number) { return this.request<Episode[]>(`/content/series/${id}/episodes`); }
  async getPanels(episodeId: number) { return this.request<Panel[]>(`/content/episodes/${episodeId}/panels`); }
  // Fix: Added missing getChapterPanels for HQCineHome compatibility
  async getChapterPanels(chapterId: number) { return this.getPanels(chapterId); }
  async getEpisodes() { return this.request<Episode[]>('/content/episodes'); }
  async getRandomAd() { return this.request<Ad | null>('/ads/random'); }
  async saveReadingProgress(id: number, p: number) { return this.request(`/content/episodes/${id}/progress`, { method: 'POST', body: JSON.stringify({ p }) }); }
  async getMyChannels() { return this.request<Channel[]>('/channels/me'); }
  async createChannel(data: any) { return this.request<Channel>('/channels', { method: 'POST', body: JSON.stringify(data) }); }
  // Fix: Added missing createSeries for AdminDashboard
  async createSeries(data: any) { return this.request<Series>('/content/series', { method: 'POST', body: JSON.stringify(data) }); }
  // Fix: Added missing createChapter for AdminDashboard
  async createChapter(data: any) { return this.request<any>('/content/chapters', { method: 'POST', body: JSON.stringify(data) }); }
  // Fix: Added missing saveEpisode for AdminDashboard
  async saveEpisode(data: any) { return this.request<Episode>('/content/episodes', { method: 'POST', body: JSON.stringify(data) }); }
}

export const api = ApiService.getInstance();
