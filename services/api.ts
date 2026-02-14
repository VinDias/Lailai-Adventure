
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

      return await response.json();
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
    // DB Simulado via LocalStorage para persistência entre reloads mesmo sem servidor
    const db = (key: string) => JSON.parse(localStorage.getItem(`lailai_db_${key}`) || '[]');
    
    if (path.includes('/auth/login')) {
      return { user: { id: 1, name: 'Usuário Local', isPremium: true, followingChannelIds: [] }, token: 'mock' } as any;
    }

    if (path === '/content/series') return db('series').length ? db('series') : seriesFallback as any;
    if (path === '/content/episodes') return MOCK_EPISODES as any;
    if (path.includes('/health')) return { status: 'offline' } as any;

    // Added local fallbacks for missing endpoints used in components
    if (path.includes('/channels/me')) return MOCK_CHANNELS.slice(0, 1) as any;
    if (path === '/content/chapters' && options.method === 'POST') return { id: Date.now(), ...JSON.parse(options.body as string || '{}') } as any;
    if (path === '/content/progress' && options.method === 'POST') return { success: true } as any;

    return [] as any;
  }

  async checkHealth() { return this.request('/health'); }
  async getSeries() { return this.request<Series[]>('/content/series'); }
  async getSeriesContent(id: number) { return this.request<any>(`/content/series/${id}`); }
  async getEpisodesBySeries(id: number) { return this.request<Episode[]>(`/content/series/${id}/episodes`); }
  async getPanels(episodeId: number) { return this.request<Panel[]>(`/content/episodes/${episodeId}/panels`); }
  async getChapterPanels(chapterId: number) { return this.getPanels(chapterId); }
  async getEpisodes() { return this.request<Episode[]>('/content/episodes'); }
  async getRandomAd() { return this.request<Ad | null>('/ads/random'); }
  async createChannel(data: any) { return this.request<Channel>('/channels', { method: 'POST', body: JSON.stringify(data) }); }
  async createSeries(data: any) { return this.request<Series>('/content/series', { method: 'POST', body: JSON.stringify(data) }); }
  async saveEpisode(data: any) { return this.request<Episode>('/content/episodes', { method: 'POST', body: JSON.stringify(data) }); }

  // Fix: Added missing method required by Profile.tsx to fetch user-owned channels
  async getMyChannels() { return this.request<Channel[]>('/channels/me'); }

  // Fix: Added missing method required by AdminDashboard.tsx to publish new comic chapters
  async createChapter(data: any) { return this.request<any>('/content/chapters', { method: 'POST', body: JSON.stringify(data) }); }

  // Fix: Added missing method required by WebtoonReader.tsx to track user reading progress
  async saveReadingProgress(episodeId: number, progress: number) { 
    return this.request<any>('/content/progress', { 
      method: 'POST', 
      body: JSON.stringify({ episodeId, progress }) 
    }); 
  }
}

const seriesFallback = [
  { id: 1, title: "Samurai Neon (Local)", cover_image: "https://picsum.photos/seed/neo/1080/1920", genre: "Cyberpunk" }
];

export const api = ApiService.getInstance();
