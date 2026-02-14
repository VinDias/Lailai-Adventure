
import { Series, Episode, User, Ad, Channel, Panel } from '../types';

const API_BASE = process.env.NODE_ENV === 'production' ? 'https://api.lailai.com/api' : 'http://localhost:5000/api';

class ApiService {
  private static instance: ApiService;
  private token: string | null = localStorage.getItem('lailai_token');

  public static getInstance() {
    if (!ApiService.instance) ApiService.instance = new ApiService();
    return ApiService.instance;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
      ...options.headers,
    };

    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (response.status === 401) {
      localStorage.removeItem('lailai_token');
      window.location.reload();
      throw new Error('Sessão expirada');
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Erro na comunicação com o servidor');
    }

    return response.json();
  }

  // Auth
  async login(creds: any): Promise<{ user: User, token: string }> {
    const data = await this.request<{ user: User, token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(creds)
    });
    this.token = data.token;
    localStorage.setItem('lailai_token', data.token);
    return data;
  }

  // Conteúdo
  async getSeries(): Promise<Series[]> {
    return this.request<Series[]>('/content/series');
  }

  async getSeriesContent(id: number): Promise<{ seasons: any[], episodes: Episode[] }> {
    return this.request(`/content/series/${id}`);
  }

  async getPanels(episodeId: number): Promise<Panel[]> {
    return this.request<Panel[]>(`/content/episodes/${episodeId}/panels`);
  }

  // Fix: Added missing getMyChannels method for Profile component
  async getMyChannels(): Promise<Channel[]> {
    return this.request<Channel[]>('/channels/me');
  }

  // Fix: Added missing createChannel method for Profile component
  async createChannel(channelData: any): Promise<Channel> {
    return this.request<Channel>('/channels', {
      method: 'POST',
      body: JSON.stringify(channelData)
    });
  }

  // Fix: Added missing createSeries method for AdminDashboard component
  async createSeries(seriesData: any): Promise<Series> {
    return this.request<Series>('/content/series', {
      method: 'POST',
      body: JSON.stringify(seriesData)
    });
  }

  // Fix: Added missing saveEpisode method for AdminDashboard component
  async saveEpisode(episodeData: any): Promise<Episode> {
    return this.request<Episode>('/content/episodes', {
      method: 'POST',
      body: JSON.stringify(episodeData)
    });
  }

  // Fix: Added missing getEpisodesBySeries method for HQCineHome component
  async getEpisodesBySeries(seriesId: number): Promise<Episode[]> {
    return this.request<Episode[]>(`/content/series/${seriesId}/episodes`);
  }

  // Fix: Added missing getEpisodes method for HiQuaFeed component
  async getEpisodes(): Promise<Episode[]> {
    return this.request<Episode[]>('/content/episodes');
  }

  // Fix: Added missing getRandomAd method for HiQuaFeed component
  async getRandomAd(): Promise<Ad | null> {
    return this.request<Ad | null>('/ads/random');
  }

  // Fix: Added missing saveReadingProgress method for WebtoonReader component
  async saveReadingProgress(episodeId: number, progress: number): Promise<void> {
    return this.request(`/content/episodes/${episodeId}/progress`, {
      method: 'POST',
      body: JSON.stringify({ progress })
    });
  }

  // Ads
  async getAdTagUrl(): Promise<string> {
    // Retorna a URL do VAST tag do Google Ad Manager ou parceiro
    return "https://pubads.g.doubleclick.net/gampad/ads?sz=640x480&iu=/124319096/external/single_ad_samples&ciu_szs=300x250&impl=s&gdfp_req=1&env=vp&output=vast&unviewed_position_start=1&cust_params=deployment%3Ddevsite%26sample_ct%3Dlinear&correlator=";
  }

  // Billing
  async createStripeSession(): Promise<{ url: string }> {
    return this.request('/billing/create-checkout-session', { method: 'POST' });
  }
}

export const api = ApiService.getInstance();
