
import { Series, Episode, User, Ad, Panel, Channel } from '../types';
import API_URL from '../config/api';

class ApiService {
  private static instance: ApiService;
  private accessToken: string | null = null;
  public isOffline: boolean = false;
  private onStatusChange: ((offline: boolean) => void) | null = null;

  public static getInstance() {
    if (!ApiService.instance) ApiService.instance = new ApiService();
    return ApiService.instance;
  }

  public setStatusCallback(callback: (offline: boolean) => void) {
    this.onStatusChange = callback;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    // Garante que o path comece com /
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const fullUrl = `${API_URL}${cleanPath}`;
    
    const headers = {
      'Content-Type': 'application/json',
      ...(this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {}),
      ...options.headers,
    };

    try {
      const response = await fetch(fullUrl, { 
        ...options, 
        headers,
        credentials: 'include' 
      });

      if (this.isOffline) {
        this.isOffline = false;
        this.onStatusChange?.(false);
      }

      if (response.status === 401 && !path.includes('/auth/')) {
        const refreshed = await this.refreshToken();
        if (refreshed) return this.request(path, options);
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `Erro ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      // Falha catastrófica de rede ou CORS
      if (error instanceof TypeError || error.message?.includes('fetch')) {
        console.warn(`[API] Falha de conexão com: ${fullUrl}`);
        this.isOffline = true;
        this.onStatusChange?.(true);
      }
      throw error;
    }
  }

  private async refreshToken(): Promise<boolean> {
    try {
      const { accessToken } = await this.request<{ accessToken: string }>('/auth/refresh', { method: 'POST' });
      this.accessToken = accessToken;
      return true;
    } catch (e) {
      this.logout();
      return false;
    }
  }

  public logout() {
    this.accessToken = null;
    localStorage.removeItem('lailai_session');
  }

  async login(credentials: any) {
    const data = await this.request<{ user: User; accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
    this.accessToken = data.accessToken;
    return data.user;
  }

  async checkHealth() { 
    // Tenta primeiro a rota com prefixo /api, depois a rota raiz
    try {
      return await this.request('/health');
    } catch (e) {
      // Fallback para a raiz se o prefixo /api falhar
      const rootUrl = API_URL.replace('/api', '') + '/health';
      return fetch(rootUrl).then(r => r.json());
    }
  }
  
  async getSeries() { return this.request<Series[]>('/content/series'); }
  async getSeriesContent(id: number) { return this.request<any>(`/content/series/${id}`); }
  async getEpisodes() { return this.request<Episode[]>('/content/episodes'); }
  async getPanels(episodeId: number) { return this.request<Panel[]>(`/content/episodes/${episodeId}/panels`); }
  async createStripeSession() { return this.request<{ url: string }>('/subscription/create-checkout', { method: 'POST' }); }
  async getMyChannels() { return this.request<Channel[]>('/channels/me'); }
  async createChannel(data: any) { return this.request<Channel>('/channels', { method: 'POST', body: JSON.stringify(data) }); }
  async createSeries(data: any) { return this.request<Series>('/content/series', { method: 'POST', body: JSON.stringify(data) }); }
  async createChapter(data: any) { return this.request<any>('/content/chapters', { method: 'POST', body: JSON.stringify(data) }); }
  async saveEpisode(data: any) { return this.request<Episode>('/content/episodes', { method: 'POST', body: JSON.stringify(data) }); }
  async getEpisodesBySeries(seriesId: number) { return this.request<Episode[]>(`/content/series/${seriesId}/episodes`); }
  async getChapterPanels(chapterId: number) { return this.request<Panel[]>(`/content/chapters/${chapterId}/panels`); }
  async getRandomAd() { return this.request<Ad>('/ads/random'); }
  async saveReadingProgress(episodeId: number, progress: number) { 
    return this.request(`/content/episodes/${episodeId}/progress`, { 
      method: 'POST', 
      body: JSON.stringify({ progress }) 
    }); 
  }
}

export const api = ApiService.getInstance();
