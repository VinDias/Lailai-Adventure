
import { Episode, Series, Ad, User, Channel, Panel } from '../types';
import { MOCK_CHANNELS, MOCK_EPISODES, MOCK_ADS } from './mockData';

class ApiService {
  private static instance: ApiService;
  private token: string | null = null;
  private useMock: boolean = true; // Define como true para ambiente de preview

  private constructor() {
    this.token = localStorage.getItem('lailai_token');
    this.initStorage();
  }

  public static getInstance(): ApiService {
    if (!ApiService.instance) ApiService.instance = new ApiService();
    return ApiService.instance;
  }

  private initStorage() {
    if (!localStorage.getItem('lailai_db_series')) {
      // Inicializa o "banco de dados" local com os mocks iniciais de produção
      localStorage.setItem('lailai_db_series', JSON.stringify([
        { id: 1, title: "Samurai Neon", description: "Cibercultura em 1080p.", cover_image: "https://picsum.photos/seed/neo/1080/1920", genre: "Sci-Fi", content_type: 'hqcine', is_published: true },
        { id: 2, title: "Ecos da Cidade", description: "Drama vertical experimental.", cover_image: "https://picsum.photos/seed/rain/1080/1920", genre: "Drama", content_type: 'vfilm', is_published: true },
        { id: 3, title: "Cyber Transmission", description: "Webtoon HI-QUA de luxo.", cover_image: "https://picsum.photos/seed/cyber-thumb/1080/1920", genre: "Cyberpunk", content_type: 'hiqua', is_published: true }
      ]));
    }
  }

  private async request(path: string, options: RequestInit = {}) {
    if (this.useMock) return this.mockRequest(path, options);

    const headers = {
      'Content-Type': 'application/json',
      ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
      ...options.headers,
    };

    try {
      const response = await fetch(`http://localhost:5000/api${path}`, { ...options, headers });
      if (!response.ok) throw new Error('Erro na API');
      return response.json();
    } catch (e) {
      console.warn("API Offline, usando fallback local...");
      return this.mockRequest(path, options);
    }
  }

  // Motor de simulação de backend para evitar "Failed to Fetch"
  private async mockRequest(path: string, options: RequestInit) {
    await new Promise(r => setTimeout(r, 400)); // Simula latência de rede

    if (path === '/series') {
      // Fix: Support POST for createSeries in mock mode
      if (options.method === 'POST') {
        const body = JSON.parse(options.body as string);
        const seriesList = JSON.parse(localStorage.getItem('lailai_db_series') || '[]');
        const newSeries = { ...body, id: seriesList.length + 1, is_published: true };
        seriesList.push(newSeries);
        localStorage.setItem('lailai_db_series', JSON.stringify(seriesList));
        return newSeries;
      }
      return JSON.parse(localStorage.getItem('lailai_db_series') || '[]');
    }

    // Fix: Support POST and GET for /episodes in mock mode
    if (path === '/episodes') {
      if (options.method === 'POST') {
        const body = JSON.parse(options.body as string);
        return { ...body, id: Date.now() };
      }
      return MOCK_EPISODES;
    }

    if (path.startsWith('/series/') && path.endsWith('/content')) {
      const seriesId = parseInt(path.split('/')[2]);
      return {
        seasons: [{ id: 1, season_number: 1, title: "Temp 1" }],
        episodes: MOCK_EPISODES.map(ep => ({ ...ep, series_title: "LaiLai Original" }))
      };
    }

    if (path.startsWith('/episodes/') && path.endsWith('/panels')) {
      // Simula a validação rigorosa de 50 painéis
      return Array.from({ length: 45 }, (_, i) => ({
        id: i,
        episode_id: 1,
        image_url: `https://picsum.photos/seed/panel-${i}/800/1280`,
        order_index: i
      }));
    }

    if (path === '/ads/random') {
      return MOCK_ADS[0];
    }

    if (path === '/auth/login') {
      const body = JSON.parse(options.body as string);
      const user: User = {
        id: 1,
        email: body.email || 'user@lailai.com',
        name: (body.email || 'Usuário').split('@')[0],
        isPremium: localStorage.getItem('lailai_premium') === 'true',
        followingChannelIds: []
      };
      this.token = 'mock_jwt_token';
      localStorage.setItem('lailai_token', this.token);
      return { user, token: this.token };
    }

    return {};
  }

  // Métodos Públicos
  async login(creds: any) { return this.request('/auth/login', { method: 'POST', body: JSON.stringify(creds) }); }
  async getSeries(): Promise<Series[]> { return this.request('/series'); }
  async getSeriesContent(seriesId: number) { return this.request(`/series/${seriesId}/content`); }
  async getEpisodes(): Promise<Episode[]> { return this.request('/episodes'); }
  async getEpisodesBySeries(seriesId: number): Promise<Episode[]> { return this.request(`/series/${seriesId}/episodes`); }
  async getPanels(episodeId: number): Promise<Panel[]> { return this.request(`/episodes/${episodeId}/panels`); }
  async saveReadingProgress(episodeId: number, progress: number) { return this.request(`/episodes/${episodeId}/progress`, { method: 'POST', body: JSON.stringify({ progress }) }); }
  async getRandomAd(): Promise<Ad> { return this.request('/ads/random'); }
  async getMyChannels(): Promise<Channel[]> { return this.request('/channels/me'); }
  async createChannel(data: any): Promise<Channel> { return this.request('/channels', { method: 'POST', body: JSON.stringify(data) }); }
  
  // Fix: Added missing createSeries method used in AdminDashboard.tsx
  async createSeries(data: any): Promise<Series> { return this.request('/series', { method: 'POST', body: JSON.stringify(data) }); }
  // Fix: Added missing saveEpisode method used in AdminDashboard.tsx
  async saveEpisode(data: any): Promise<Episode> { return this.request('/episodes', { method: 'POST', body: JSON.stringify(data) }); }
}

export const api = ApiService.getInstance();
