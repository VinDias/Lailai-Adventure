
import { Episode, Series, Ad, User, Channel } from '../types';

const API_URL = 'http://localhost:5000/api';

class ApiService {
  private static instance: ApiService;
  private token: string | null = null;

  private constructor() {
    this.token = localStorage.getItem('lailai_token');
  }

  public static getInstance(): ApiService {
    if (!ApiService.instance) ApiService.instance = new ApiService();
    return ApiService.instance;
  }

  private async request(path: string, options: RequestInit = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
      ...options.headers,
    };
    const response = await fetch(`${API_URL}${path}`, { ...options, headers });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Erro na API');
    }
    return response.json();
  }

  // Auth
  async login(creds: any) {
    const data = await this.request('/auth/login', { method: 'POST', body: JSON.stringify(creds) });
    this.token = data.token;
    localStorage.setItem('lailai_token', data.token);
    return data.user;
  }

  // Series
  async getSeries(): Promise<Series[]> { return this.request('/series'); }
  async createSeries(data: any): Promise<Series> { return this.request('/series', { method: 'POST', body: JSON.stringify(data) }); }
  
  // Fix: Added missing getSeriesContent method used in HQCine and other content components
  async getSeriesContent(seriesId: number): Promise<{seasons: any[], episodes: Episode[]}> {
    return this.request(`/series/${seriesId}/content`);
  }

  // Episodes
  async getEpisodes(): Promise<Episode[]> { return this.request('/episodes'); }
  async getEpisodesBySeries(seriesId: number): Promise<Episode[]> { return this.request(`/series/${seriesId}/episodes`); }
  async saveEpisode(data: any): Promise<Episode> { return this.request('/episodes', { method: 'POST', body: JSON.stringify(data) }); }

  // Ads
  async getRandomAd(): Promise<Ad> { return this.request('/ads/random'); }

  // Profile/Channel Management
  async getMyChannels(): Promise<Channel[]> { return this.request('/channels/me'); }
  async createChannel(data: any): Promise<Channel> { return this.request('/channels', { method: 'POST', body: JSON.stringify(data) }); }
}

export const api = ApiService.getInstance();
