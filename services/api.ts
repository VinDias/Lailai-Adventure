
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
        // If server returns error, we still try to fallback for specific content routes
        throw new Error(`Erro API: ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      this.isOffline = true;
      this.onStatusChange?.(true);
      
      console.warn(`[LaiLai] Erro na requisição: ${fullUrl}. Ativando fallback local.`);

      // Provide intelligent fallbacks for "Failed to fetch" or 404s
      if (path.includes('/content/series')) {
        return [
          {
            id: 1,
            title: 'Samurai Neon (Local)',
            genre: 'Cyberpunk',
            cover_image: 'https://picsum.photos/seed/offline1/1080/1920',
            content_type: 'hqcine'
          },
          {
            id: 2,
            title: 'Ecos da Cidade (Local)',
            genre: 'Drama',
            cover_image: 'https://picsum.photos/seed/offline2/1080/1920',
            content_type: 'vfilm'
          }
        ] as unknown as T;
      }
      
      if (path.includes('/content/episodes')) {
        return MOCK_EPISODES as unknown as T;
      }

      if (path.includes('/ads/random')) {
        return MOCK_ADS[0] as unknown as T;
      }

      throw error;
    }
  }

  async checkHealth() {
    try {
      const response = await fetch(`${API_URL.replace('/api', '')}/health`);
      return await response.json();
    } catch (e) {
      this.isOffline = true;
      this.onStatusChange?.(true);
      return { status: 'offline' };
    }
  }

  async login(credentials: any) {
    try {
      const data = await this.request<{ user: any; accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials)
      });
      this.accessToken = data.accessToken;
      return data.user;
    } catch (e) {
      // Offline login fallback for testing
      console.warn("Usando login de emergência (Offline)");
      const user = { 
        id: 'off-1', 
        nome: 'Admin Offline', 
        email: credentials.email, 
        isPremium: true,
        avatar: 'https://picsum.photos/seed/admin/200'
      };
      return user;
    }
  }

  async getSeries() { return this.request<any[]>('/content/series'); }
  async getSeriesContent(id: number) { return this.request<any>(`/content/series/${id}`); }
  async getEpisodes() { return this.request<any[]>('/content/episodes'); }
  async getRandomAd() { return this.request<any>('/ads/random'); }
  
  async saveReadingProgress(episodeId: number, progress: number) { 
    try {
      return await this.request(`/content/episodes/${episodeId}/progress`, { 
        method: 'POST', 
        body: JSON.stringify({ progress }) 
      }); 
    } catch (e) { return { success: true, local: true }; }
  }

  async getMyChannels() { 
    try { return await this.request<any[]>('/channels/me'); } 
    catch(e) { return MOCK_CHANNELS; }
  }

  async createChannel(data: any) {
    return this.request<any>('/channels', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async createSeries(data: any) {
    return this.request<any>('/content/series', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async createChapter(data: any) {
    return this.request<any>('/content/chapters', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async saveEpisode(data: any) {
    return this.request<any>('/content/episodes', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getEpisodesBySeries(seriesId: number) {
    try {
      return await this.request<any[]>(`/content/series/${seriesId}/episodes`);
    } catch (e) {
      return MOCK_EPISODES.filter(ep => ep.series_id === seriesId || !ep.series_id);
    }
  }

  async getChapterPanels(chapterId: number) {
    return this.request<any[]>(`/content/chapters/${chapterId}/panels`);
  }

  async getPanels(episodeId: number) {
    return this.request<any[]>(`/content/episodes/${episodeId}/panels`);
  }
}

export const api = ApiService.getInstance();
