
import { Episode, Comic, Lesson, Ad, Channel, User } from '../types';

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

  public setToken(token: string) {
    this.token = token;
    localStorage.setItem('lailai_token', token);
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
      throw new Error(errorData.error || 'Erro na requisição');
    }
    return response.json();
  }

  // Canais
  async getMyChannels(): Promise<Channel[]> {
    return this.request('/my-channels');
  }

  async createChannel(data: any): Promise<Channel> {
    return this.request('/channels', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Auth & Conteúdo
  async login(credentials: any) {
    const data = await this.request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
    this.setToken(data.token);
    return data.user;
  }

  async getEpisodes(): Promise<Episode[]> { return this.request('/episodes'); }
  async saveEpisode(ep: any): Promise<Episode> { return this.request('/episodes', { method: 'POST', body: JSON.stringify(ep) }); }
  
  // Fix: Added missing getComics method to support App.tsx
  async getComics(): Promise<Comic[]> { return this.request('/comics'); }
  // Fix: Added missing saveComic method to support App.tsx
  async saveComic(comic: any): Promise<Comic> { return this.request('/comics', { method: 'POST', body: JSON.stringify(comic) }); }

  // Fix: Added missing getLessons method to support App.tsx
  async getLessons(): Promise<Lesson[]> { return this.request('/lessons'); }
  // Fix: Added missing saveLesson method to support App.tsx
  async saveLesson(lesson: any): Promise<Lesson> { return this.request('/lessons', { method: 'POST', body: JSON.stringify(lesson) }); }

  async getAds(): Promise<Ad[]> { return this.request('/ads/active'); }
  // Fix: Added missing saveAd method to support App.tsx
  async saveAd(ad: any): Promise<Ad> { return this.request('/ads', { method: 'POST', body: JSON.stringify(ad) }); }
  async incrementAdView(adId: number): Promise<void> { return this.request(`/ads/impression/${adId}`, { method: 'POST' }); }
}

export const api = ApiService.getInstance();
