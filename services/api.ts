
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

    let response: Response;
    try {
      response = await fetch(fullUrl, {
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
    } catch (error: any) {
      // Erro de rede real — servidor inacessível
      this.isOffline = true;
      this.onStatusChange?.(true);
      console.warn(`[Lorflux] API offline — fallback ativado para: ${path}`);
      throw error;
    }

    if (!response.ok) {
      throw new Error(`Erro API: ${response.status}`);
    }

    return await response.json();
  }

  setToken(token: string) {
    this.accessToken = token;
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
    return { ...data.user, accessToken: data.accessToken };
  }

  async getSeries(type?: string) {
    const path = type ? `/content/series?type=${type}` : '/content/series';
    return this.request<any[]>(path);
  }

  // Retorna { seasons: [], episodes } para compatibilidade com VFilm e HiQua
  async getSeriesContent(id: string | number) {
    try {
      const episodes = await this.request<any[]>(`/content/series/${id}/episodes`);
      return { seasons: [], episodes };
    } catch (e) {
      return { seasons: [], episodes: [] };
    }
  }

  async getEpisodesBySeries(seriesId: string | number) {
    try {
      return await this.request<any[]>(`/content/series/${seriesId}/episodes`);
    } catch (e) {
      return [];
    }
  }

  async getEpisode(id: string | number) {
    return this.request<any>(`/content/episodes/${id}`);
  }

  async getMyChannels() {
    try {
      return await this.request<any[]>('/channels/me');
    } catch (e) {
      return [];
    }
  }

  async createChannel(data: any) {
    return this.request<any>('/channels', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getRandomAd() {
    try {
      const ads = await this.request<any[]>('/content/ads');
      if (ads.length > 0) return ads[Math.floor(Math.random() * ads.length)];
    } catch (e) {
      // empty state
    }
    return null;
  }

  // Admin
  async getAdminStats() {
    return this.request<any>('/admin/management/stats');
  }

  async getAdminContent(page = 1) {
    return this.request<any>(`/admin/management/content?page=${page}`);
  }

  async createSeries(data: any) {
    return this.request<any>('/content/series', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async createEpisode(data: any) {
    return this.request<any>('/content/episodes', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async deleteSeries(id: string) {
    return this.request<any>(`/content/series/${id}`, { method: 'DELETE' });
  }

  async initBunnyUpload(title: string, episodeId: string) {
    return this.request<any>('/bunny/upload', {
      method: 'POST',
      body: JSON.stringify({ title, episodeId })
    });
  }

  // Votes
  async getMyVote(episodeId: string | number) {
    try {
      return await this.request<{ type: 'like' | 'dislike' } | null>(`/content/episodes/${episodeId}/vote`);
    } catch (e) {
      return null;
    }
  }

  async vote(episodeId: string | number, type: 'like' | 'dislike') {
    return this.request<any>(`/content/episodes/${episodeId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ type })
    });
  }

  async removeVote(episodeId: string | number) {
    return this.request<any>(`/content/episodes/${episodeId}/vote`, { method: 'DELETE' });
  }

  async getEpisodeMetrics(episodeId: string | number) {
    return this.request<{ likes: number; dislikes: number; total: number }>(`/admin/episodes/${episodeId}/metrics`);
  }
}

export const api = ApiService.getInstance();
