
import API_URL from '../config/api';

class ApiService {
  private static instance: ApiService;
  private accessToken: string | null = null;
  private refreshTokenValue: string | null = null;
  public isOffline: boolean = false;
  private onStatusChange: ((offline: boolean) => void) | null = null;
  private onAuthExpired: (() => void) | null = null;

  public static getInstance() {
    if (!ApiService.instance) ApiService.instance = new ApiService();
    return ApiService.instance;
  }

  public setStatusCallback(callback: (offline: boolean) => void) {
    this.onStatusChange = callback;
  }

  public setAuthExpiredCallback(callback: () => void) {
    this.onAuthExpired = callback;
  }

  private async tryRefresh(): Promise<boolean> {
    if (!this.refreshTokenValue) return false;
    try {
      const fullUrl = `${API_URL}/auth/refresh-token`;
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshTokenValue }),
        credentials: 'include'
      });
      if (!response.ok) return false;
      const data = await response.json();
      if (!data.accessToken) return false;
      this.accessToken = data.accessToken;
      localStorage.setItem('lorflux_token', data.accessToken);
      return true;
    } catch {
      return false;
    }
  }

  private async request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
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
      if (response.status === 401 && !retried) {
        const refreshed = await this.tryRefresh();
        if (refreshed) return this.request<T>(path, options, true);
        this.onAuthExpired?.();
      }
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ${response.status}`);
    }

    return await response.json();
  }

  setToken(token: string) {
    this.accessToken = token;
  }

  setRefreshToken(token: string) {
    this.refreshTokenValue = token;
  }

  async createCheckoutSession() {
    return this.request<{ url: string }>('/payment/create-checkout', { method: 'POST' });
  }

  async login(credentials: any) {
    const data = await this.request<{ user: any; accessToken: string; refreshToken?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
    this.accessToken = data.accessToken;
    if (data.refreshToken) this.refreshTokenValue = data.refreshToken;
    return { ...data.user, accessToken: data.accessToken, refreshToken: data.refreshToken };
  }

  async register(credentials: { email: string; password: string; nome: string }) {
    const data = await this.request<{ user: any; accessToken: string; refreshToken?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
    this.accessToken = data.accessToken;
    if (data.refreshToken) this.refreshTokenValue = data.refreshToken;
    return { ...data.user, accessToken: data.accessToken, refreshToken: data.refreshToken };
  }

  async forgotPassword(email: string) {
    return this.request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }

  async resetPassword(token: string, password: string) {
    return this.request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password })
    });
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

  async addPanels(episodeId: string, panels: { image_url: string; order: number }[]) {
    return this.request<any>(`/content/episodes/${episodeId}/panels`, {
      method: 'POST',
      body: JSON.stringify({ panels })
    });
  }

  async deletePanel(episodeId: string, index: number) {
    return this.request<any>(`/content/episodes/${episodeId}/panels/${index}`, { method: 'DELETE' });
  }

  async updatePanelTranslation(episodeId: string, panelIndex: number, language: string, imageUrl: string) {
    return this.request<any>(`/content/episodes/${episodeId}/panels/${panelIndex}/translations`, {
      method: 'PUT',
      body: JSON.stringify({ language, imageUrl })
    });
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

  async updateEpisode(id: string, data: Partial<{ thumbnail: string; title: string; description: string; isPremium: boolean; video_url: string }>) {
    return this.request<any>(`/content/episodes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteSeries(id: string) {
    return this.request<any>(`/content/series/${id}`, { method: 'DELETE' });
  }

  async deleteEpisode(id: string) {
    return this.request<any>(`/content/episodes/${id}`, { method: 'DELETE' });
  }

  async uploadSeriesThumbnail(seriesId: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('thumbnail', file);
    const fullUrl = `${(await import('../config/api')).default}/admin/management/update-thumbnail/${seriesId}`;
    const response = await fetch(fullUrl, {
      method: 'PUT',
      headers: this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {},
      body: formData,
      credentials: 'include'
    });
    if (!response.ok) throw new Error(`Erro API: ${response.status}`);
    const data = await response.json();
    return data.url;
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

  // Settings (público)
  async getPublicSettings(): Promise<Record<string, string>> {
    try {
      return await this.request<Record<string, string>>('/settings/public');
    } catch {
      return {};
    }
  }

  // Settings (admin)
  async getAdminSettings(): Promise<any[]> {
    return this.request<any[]>('/settings');
  }

  async updateSetting(key: string, value: string, label?: string): Promise<any> {
    return this.request<any>(`/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value, label })
    });
  }

  // Ads (admin)
  async getAds() {
    return this.request<any[]>('/admin/ads');
  }

  async createAd(data: { title: string; image_url: string; link_url?: string; advertiser?: string; startsAt?: string; endsAt?: string }) {
    return this.request<any>('/admin/ads', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateAd(id: string, data: Partial<{ title: string; image_url: string; link_url: string; advertiser: string; isActive: boolean; startsAt: string; endsAt: string }>) {
    return this.request<any>(`/admin/ads/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteAd(id: string) {
    return this.request<any>(`/admin/ads/${id}`, { method: 'DELETE' });
  }

  // Users (admin)
  async getAdminUsers(page = 1, filters: { role?: string; isPremium?: boolean } = {}) {
    const params = new URLSearchParams({ page: String(page) });
    if (filters.role) params.set('role', filters.role);
    if (filters.isPremium !== undefined) params.set('isPremium', String(filters.isPremium));
    return this.request<{ users: any[]; total: number; pages: number; page: number }>(`/admin/users?${params}`);
  }

  async toggleUserPremium(id: string) {
    return this.request<{ id: string; isPremium: boolean }>(`/admin/users/${id}/toggle-premium`, { method: 'PUT' });
  }

  async toggleUserActive(id: string, isActive: boolean) {
    return this.request<any>(`/admin/users/toggle-status/${id}`, { method: 'PUT', body: JSON.stringify({ isActive }) });
  }

  async uploadImageToBunny(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('image', file);
    const fullUrl = `${API_URL}/bunny/upload-image`;
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {},
      body: formData,
      credentials: 'include'
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Erro ao fazer upload: ${response.status}`);
    }
    const data = await response.json();
    return data.url;
  }

  async uploadImagesBatchToBunny(files: File[]): Promise<{ results: Array<{ success: boolean; filename: string; index: number; url?: string; error?: string }>; successCount: number; failCount: number; total: number }> {
    const formData = new FormData();
    files.forEach(f => formData.append('images', f));
    const fullUrl = `${API_URL}/bunny/upload-image-batch`;
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {},
      body: formData,
      credentials: 'include'
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Erro ao fazer upload em lote: ${response.status}`);
    }
    return response.json();
  }

  async uploadAudioToBunny(file: File): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append('audio', file);
    const fullUrl = `${API_URL}/bunny/upload-audio`;
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {},
      body: formData,
      credentials: 'include'
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Erro ao fazer upload de áudio: ${response.status}`);
    }
    return response.json();
  }

  async updateEpisodeAudio(episodeId: string, payload: { audioTrack1Url?: string; audioTrack2Url?: string }) {
    return this.request<any>(`/admin/management/episodes/${episodeId}/audio`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  async uploadVideoToBunny(file: File, episodeId: string, title: string): Promise<{ bunnyVideoId: string; videoUrl?: string }> {
    const formData = new FormData();
    formData.append('video', file);
    formData.append('episodeId', episodeId);
    formData.append('title', title);
    const fullUrl = `${API_URL}/bunny/upload-video`;
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {},
      body: formData,
      credentials: 'include'
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Erro ao fazer upload do vídeo: ${response.status}`);
    }
    return response.json();
  }
}

export const api = ApiService.getInstance();
