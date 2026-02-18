
import API_URL from '../config/api';
import { MOCK_CHANNELS, MOCK_EPISODES, MOCK_ADS } from './mockData';

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
    const fullUrl = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
    
    try {
      const response = await fetch(fullUrl, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {}),
          ...options.headers,
        },
        credentials: 'include'
      });

      if (this.isOffline) {
        this.isOffline = false;
        this.onStatusChange?.(false);
      }

      if (!response.ok) {
        throw new Error(`Erro API: ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      this.isOffline = true;
      this.onStatusChange?.(true);
      
      console.warn(`[LaiLai] Fallback local ativado.`);
      if (path.includes('/content/series')) {
        return [{ id: 1, title: 'Samurai Neon', genre: 'Cyberpunk', cover_image: 'https://picsum.photos/seed/offline1/1080/1920', content_type: 'hqcine' }] as unknown as T;
      }
      throw error;
    }
  }

  async createCheckoutSession() {
    return this.request<{ url: string }>('/payment/create-checkout-session', { method: 'POST' });
  }

  async login(credentials: any) {
    const data = await this.request<{ user: any; accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
    this.accessToken = data.accessToken;
    return data.user;
  }

  async getSeries() { return this.request<any[]>('/content/series'); }
  async getSeriesContent(id: number) { return this.request<any>(`/content/series/${id}`); }
  async getEpisodes() { return this.request<any[]>('/content/episodes'); }
  async getMyChannels() { try { return await this.request<any[]>('/channels/me'); } catch(e) { return MOCK_CHANNELS; } }
  async getEpisodesBySeries(seriesId: number) { try { return await this.request<any[]>(`/content/series/${seriesId}/episodes`); } catch (e) { return MOCK_EPISODES; } }
  async getChapterPanels(chapterId: number) { return this.request<any[]>(`/content/chapters/${chapterId}/panels`); }

  async createChannel(data: any) {
    return this.request<any>('/channels', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getRandomAd() {
    try {
      const ads = await this.request<any[]>('/content/ads');
      return ads[Math.floor(Math.random() * ads.length)];
    } catch (e) {
      return MOCK_ADS[Math.floor(Math.random() * MOCK_ADS.length)];
    }
  }
}

export const api = ApiService.getInstance();
