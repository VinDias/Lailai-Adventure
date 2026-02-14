
import { Series, Episode, User, Ad, Channel, Panel, Chapter } from '../types';
import API_URL from '../config/api';
import { MOCK_CHANNELS, MOCK_EPISODES, MOCK_ADS } from './mockData';

class ApiService {
  private static instance: ApiService;
  private token: string | null = localStorage.getItem('lailai_token');
  public isOffline: boolean = false;
  private onStatusChange: ((offline: boolean) => void) | null = null;

  public static getInstance() {
    if (!ApiService.instance) ApiService.instance = new ApiService();
    return ApiService.instance;
  }

  public setStatusCallback(callback: (offline: boolean) => void) {
    this.onStatusChange = callback;
  }

  private updateStatus(offline: boolean) {
    if (this.isOffline !== offline) {
      this.isOffline = offline;
      this.onStatusChange?.(offline);
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
      ...options.headers,
    };

    try {
      const response = await fetch(`${API_URL}${path}`, { ...options, headers });
      
      this.updateStatus(false);

      if (response.status === 401) {
        localStorage.removeItem('lailai_token');
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erro na API: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      // Se for um erro de conexão (Failed to fetch), ativamos o Fallback de Engenharia
      if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('NetworkError'))) {
        this.updateStatus(true);
        console.warn(`[API] Servidor ${API_URL} inacessível. Ativando Base de Dados Local de Contingência.`);
        return this.localDatabaseFallback<T>(path, options);
      }
      throw error;
    }
  }

  /**
   * DATABASE DE CONTINGÊNCIA (MODO LOCAL)
   * Garante que o app funcione mesmo sem o servidor rodando, 
   * persistindo dados no LocalStorage para simular o backend.
   */
  private async localDatabaseFallback<T>(path: string, options: RequestInit): Promise<T> {
    await new Promise(resolve => setTimeout(resolve, 300)); // Latência simulada

    const dbGet = (key: string, defaultValue: any) => {
      const data = localStorage.getItem(`lailai_db_${key}`);
      return data ? JSON.parse(data) : defaultValue;
    };

    const dbSave = (key: string, data: any) => {
      localStorage.setItem(`lailai_db_${key}`, JSON.stringify(data));
    };

    // Inicialização do DB Local se vazio
    if (!localStorage.getItem('lailai_db_series')) dbSave('series', []);
    if (!localStorage.getItem('lailai_db_episodes')) dbSave('episodes', MOCK_EPISODES);

    if (path.includes('/auth/login')) {
      return { user: { id: 1, name: 'Usuário Local', isPremium: true, followingChannelIds: [] }, token: 'local_token' } as any;
    }

    if (path === '/content/series') {
      return dbGet('series', []) as any;
    }

    if (path.startsWith('/content/series/') && path.includes('/episodes')) {
      return dbGet('episodes', []).filter((e: any) => e.series_id === parseInt(path.split('/')[3])) as any;
    }

    if (path === '/content/episodes' && options.method === 'POST') {
      const current = dbGet('episodes', []);
      const newEp = { id: Date.now(), ...JSON.parse(options.body as string) };
      dbSave('episodes', [...current, newEp]);
      return newEp as any;
    }

    if (path === '/content/series' && options.method === 'POST') {
      const current = dbGet('series', []);
      const newSeries = { id: Date.now(), ...JSON.parse(options.body as string) };
      dbSave('series', [...current, newSeries]);
      return newSeries as any;
    }

    if (path === '/channels/me') return MOCK_CHANNELS as any;
    if (path === '/ads/random') return MOCK_ADS[0] as any;
    if (path === '/health') return { status: 'local_mode' } as any;

    return [] as any;
  }

  // Métodos da API
  async checkHealth() { return this.request('/health'); }
  
  async login(creds: any) {
    const data = await this.request<{ user: User, token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(creds)
    });
    this.token = data.token;
    localStorage.setItem('lailai_token', data.token);
    return data;
  }

  async getSeries(): Promise<Series[]> { return this.request<Series[]>('/content/series'); }
  
  // Fix: Added explicit return type to fix unknown type errors in HQCine, HiQua, and VFilm
  async getSeriesContent(id: number): Promise<{seasons: any[], episodes: Episode[]}> { 
    return this.request<{seasons: any[], episodes: Episode[]}>(`/content/series/${id}`); 
  }
  
  async getEpisodesBySeries(seriesId: number): Promise<Episode[]> {
    return this.request<Episode[]>(`/content/series/${seriesId}/episodes`);
  }

  async createSeries(data: any): Promise<Series> {
    return this.request<Series>('/content/series', { method: 'POST', body: JSON.stringify(data) });
  }

  async createChapter(data: any): Promise<Chapter> {
    return this.request<Chapter>('/content/chapters', { method: 'POST', body: JSON.stringify(data) });
  }

  async getChapterPanels(chapterId: number): Promise<Panel[]> {
    return this.request<Panel[]>(`/content/chapters/${chapterId}/panels`);
  }

  // Fix: Added missing getPanels method used in WebtoonReader
  async getPanels(episodeId: number): Promise<Panel[]> {
    return this.request<Panel[]>(`/content/episodes/${episodeId}/panels`);
  }

  async saveEpisode(data: any): Promise<Episode> {
    return this.request<Episode>('/content/episodes', { method: 'POST', body: JSON.stringify(data) });
  }

  async getMyChannels(): Promise<Channel[]> { return this.request<Channel[]>('/channels/me'); }
  
  // Fix: Added missing createChannel method used in Profile
  async createChannel(data: any): Promise<Channel> {
    return this.request<Channel>('/channels', { method: 'POST', body: JSON.stringify(data) });
  }

  async getRandomAd(): Promise<Ad | null> { return this.request<Ad | null>('/ads/random'); }
  
  async getEpisodes(): Promise<Episode[]> { return this.request<Episode[]>('/content/episodes'); }

  async saveReadingProgress(episodeId: number, progress: number): Promise<void> {
    return this.request(`/content/episodes/${episodeId}/progress`, {
      method: 'POST',
      body: JSON.stringify({ progress })
    });
  }
}

export const api = ApiService.getInstance();
