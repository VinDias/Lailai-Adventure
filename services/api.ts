
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
      if (error instanceof TypeError || error.message?.includes('fetch')) {
        this.isOffline = true;
        this.onStatusChange?.(true);
        console.warn(`[LaiLai] Servidor offline em ${fullUrl}. Usando modo de simulação local.`);
      }
      throw error;
    }
  }

  async checkHealth() {
    return fetch(`${API_URL.replace('/api', '')}/health`).then(r => r.json());
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
  async getRandomAd() { return this.request<any>('/ads/random'); }
  async saveReadingProgress(episodeId: number, progress: number) { 
    return this.request(`/content/episodes/${episodeId}/progress`, { 
      method: 'POST', 
      body: JSON.stringify({ progress }) 
    }); 
  }

  // Fix: Added missing method getMyChannels
  async getMyChannels() { return this.request<any[]>('/channels/me'); }

  // Fix: Added missing method createChannel
  async createChannel(data: any) {
    return this.request<any>('/channels', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Fix: Added missing method createSeries
  async createSeries(data: any) {
    return this.request<any>('/content/series', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Fix: Added missing method createChapter
  async createChapter(data: any) {
    return this.request<any>('/content/chapters', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Fix: Added missing method saveEpisode
  async saveEpisode(data: any) {
    return this.request<any>('/content/episodes', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Fix: Added missing method getEpisodesBySeries
  async getEpisodesBySeries(seriesId: number) {
    return this.request<any[]>(`/content/series/${seriesId}/episodes`);
  }

  // Fix: Added missing method getChapterPanels
  async getChapterPanels(chapterId: number) {
    return this.request<any[]>(`/content/chapters/${chapterId}/panels`);
  }

  // Fix: Added missing method getPanels
  async getPanels(episodeId: number) {
    return this.request<any[]>(`/content/episodes/${episodeId}/panels`);
  }
}

export const api = ApiService.getInstance();
