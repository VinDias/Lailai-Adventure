
import API_URL from '../config/api';
import { getAnonymousId } from '../utils/anonymousId';

// Formato de PushSubscription.toJSON() (Web Push API) — o que POST /me/push/subscribe espera.
export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
}

// Item de GET /api/content/agenda — ver routes/content.js.
export interface AgendaItem {
  _id: string;
  title: string;
  cover_image?: string;
  content_type?: string;
  releaseDay: number;
}

// Mensagens FIXAS de middlewares/verifyToken.js — as ÚNICAS duas formas de
// um 401 significar "sessão", nunca "negócio" (PIN/senha errados). Usado só
// pelas rotas com `retryAuthOn401=false` (Fase 5 Bloco 2, Task 7, fix round
// MÉDIA 2) para não confundir accessToken expirado com PIN incorreto — ver
// comentário de `request()` abaixo.
const SESSION_401_MESSAGES = ['Token inválido.', 'Acesso negado. Token não fornecido.'];

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
    try {
      const fullUrl = `${API_URL}/auth/refresh-token`;
      // O refresh token vem do cookie httpOnly (credentials: 'include').
      // Para compatibilidade legada, envia no body se ainda estiver em memória.
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.refreshTokenValue ? { refreshToken: this.refreshTokenValue } : {}),
        credentials: 'include'
      });
      if (!response.ok) return false;
      const data = await response.json();
      if (!data.accessToken) return false;
      // Token mantido apenas em memória (não persistido em localStorage → imune a roubo via XSS).
      this.accessToken = data.accessToken;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Restaura a sessão no carregamento do app usando o cookie httpOnly de refresh,
   * sem depender de tokens no localStorage. Retorna o usuário atual ou null.
   */
  async bootstrapSession(): Promise<any | null> {
    const refreshed = await this.tryRefresh();
    if (!refreshed) return null;
    try {
      const data = await this.request<{ user: any }>('/auth/me');
      return data.user;
    } catch {
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch { /* ignora erros de rede no logout */ }
    this.accessToken = null;
    this.refreshTokenValue = null;
  }

  // ─── LGPD: direitos do titular ──────────────────────────────────────────────
  async getMe() {
    const data = await this.request<{ user: any }>('/auth/me');
    return data.user;
  }

  async updateMarketingConsent(marketing: boolean) {
    return this.request<{ success: boolean; marketing: boolean }>('/account/me/consent', {
      method: 'PUT',
      body: JSON.stringify({ marketing })
    });
  }

  async deleteMyAccount(password?: string) {
    return this.request<{ success: boolean; message: string }>('/account/me', {
      method: 'DELETE',
      body: JSON.stringify(password ? { password } : {})
    });
  }

  async uploadAvatar(file: File): Promise<{ avatar: string }> {
    // Multipart não passa pelo request(): o Content-Type do FormData (com
    // boundary) precisa ser definido pelo próprio browser.
    const form = new FormData();
    form.append('avatar', file);
    const response = await fetch(`${API_URL}/account/me/avatar`, {
      method: 'POST',
      headers: this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {},
      body: form,
      credentials: 'include'
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `Erro ${response.status}`);
    }
    return response.json();
  }

  async exportMyData(): Promise<void> {
    const response = await fetch(`${API_URL}/account/me/export`, {
      headers: this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {},
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Não foi possível exportar seus dados.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meus-dados-lorflux.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * `retryAuthOn401` (Fase 5 Bloco 2, Task 7): por padrão, um 401 é tratado
   * como "sessão expirada" — tenta renovar o accessToken e REPETE a mesma
   * chamada. Isso é errado para rotas onde 401 é resultado de NEGÓCIO (PIN
   * errado, senha errada) e não de sessão: o usuário está autenticado de
   * verdade, o refresh teria sucesso, e a chamada original seria reenviada
   * com o MESMO pin/senha errados — dobrando a contagem de tentativas no
   * servidor (services/parentalPinService.js persiste pinTentativas por
   * request). As rotas de PIN (updateParental/setParentalPin/recuperarPin)
   * chamam com `false` por isso — um 401 delas vira erro direto, sem
   * refresh nem replay.
   *
   * Fix round (MÉDIA 2): `retryAuthOn401=false` NÃO significa "nunca é
   * sessão" — essas 3 rotas passam por `verifyToken` (middlewares/
   * verifyToken.js) ANTES da lógica de negócio, então um accessToken
   * expirado enquanto o formulário do PIN estava aberto (>15min parado na
   * Conta) ainda produz 401, só que com uma das DUAS mensagens fixas do
   * middleware (`SESSION_401_MESSAGES` abaixo) — nunca as mensagens de
   * negócio das rotas ("PIN incorreto.", "PIN obrigatório.", "Senha
   * incorreta.", ...). Distinguir pela mensagem: se bater com o middleware,
   * tenta o refresh (mas NUNCA repete a chamada original — o corpo dela,
   * ex. um PIN, nunca chegou a ser avaliado pelo servidor, então repetir
   * não teria o que "confirmar de novo" com segurança) e relança um erro
   * com `sessaoRenovada: true` quando o refresh funciona, para o
   * componente mostrar um aviso neutro (fora do campo de PIN) e manter o
   * formulário aberto; se o refresh falhar, `onAuthExpired` roda normalmente
   * (mesmo desfecho do caminho com retry).
   */
  private async request<T>(path: string, options: RequestInit = {}, retried = false, retryAuthOn401 = true): Promise<T> {
    const fullUrl = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;

    let response: Response;
    try {
      response = await fetch(fullUrl, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {}),
          'X-Anonymous-Id': getAnonymousId(),
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
      // `status` e o resto do corpo (ex.: tentativasRestantes do PIN) vão
      // junto no Error — quem chama (ParentalSettings) precisa deles além
      // da mensagem para decidir a UI (401 com contagem × 429 bloqueado).
      const construirErro = (body: any, status: number) => {
        const error: any = new Error(body.error || `Erro ${status}`);
        error.status = status;
        if (body.tentativasRestantes !== undefined) error.tentativasRestantes = body.tentativasRestantes;
        // Fase 5 Bloco 3: código de negócio (ex.: 'propria_obra') — a UI
        // escolhe a mensagem i18n por ele, não pelo texto PT do servidor.
        if (body.code) error.code = body.code;
        return error;
      };

      if (response.status === 401 && !retried) {
        if (retryAuthOn401) {
          const refreshed = await this.tryRefresh();
          if (refreshed) return this.request<T>(path, options, true, retryAuthOn401);
          this.onAuthExpired?.();
        } else {
          // Response.json() só pode ser lido uma vez — decide aqui (sessão
          // × negócio) e reaproveita o mesmo `body` nos dois desfechos,
          // nunca chama `response.json()` de novo.
          const body = await response.json().catch(() => ({}));
          if (SESSION_401_MESSAGES.includes(body.error)) {
            const refreshed = await this.tryRefresh();
            const error = construirErro(body, 401);
            if (refreshed) error.sessaoRenovada = true;
            else this.onAuthExpired?.();
            throw error;
          }
          throw construirErro(body, response.status);
        }
      }

      const errBody = await response.json().catch(() => ({}));
      throw construirErro(errBody, response.status);
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
    const locale = typeof navigator !== 'undefined' ? navigator.language : 'pt-BR';
    return this.request<{ url: string }>('/payment/create-checkout', {
      method: 'POST',
      body: JSON.stringify({ locale })
    });
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

  async googleLogin(credential: string) {
    const data = await this.request<{ user: any; accessToken: string; refreshToken?: string }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential })
    });
    this.accessToken = data.accessToken;
    if (data.refreshToken) this.refreshTokenValue = data.refreshToken;
    return { ...data.user, accessToken: data.accessToken, refreshToken: data.refreshToken };
  }

  async register(credentials: { email: string; password: string; nome: string; acceptedTerms: boolean }) {
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

  // GET /api/content/recommendations?type= — Fase 4 Bloco 4 (algoritmo).
  // Mesmo shape de getSeries (lista de séries publicadas do tipo), já na
  // ordem 50/30/20 do routes/content.js. A identidade anônima que alimenta a
  // Afinidade do leitor é a MESMA do progresso: request() já injeta
  // X-Anonymous-Id em toda chamada (linha ~152 acima) — nada extra aqui.
  async getRecommendations(type: 'hqcine' | 'vcine' | 'hiqua') {
    return this.request<any[]>(`/content/recommendations?type=${type}`);
  }

  // Busca uma série específica direto na API — ao contrário de procurar num
  // array já carregado pela tela, não depende de nenhum estado local ter
  // chegado antes (usado pelo carrossel "Continuar", que pode aparecer antes
  // da listagem normal da aba terminar de carregar).
  async getSeriesById(id: string | number) {
    return this.request<any>(`/content/series/${id}`);
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

  async deletePanelTranslation(episodeId: string, panelIndex: number, language: string) {
    return this.request<any>(`/content/episodes/${episodeId}/panels/${panelIndex}/translations/${language}`, {
      method: 'DELETE'
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

  // Fase 5 Bloco 2, Task 8 (higiene do Bloco 1): `includeInactive` — só tem
  // efeito para admin (a rota já é admin-only) — devolve TODOS os canais,
  // com `isActive` no shape; sem o parâmetro, só ativos (regressão do shape
  // antigo, usado pelo formulário de séries).
  async listChannels(includeInactive = false) {
    return this.request<any[]>(`/channels${includeInactive ? '?includeInactive=true' : ''}`);
  }

  // ─── Royalties (Fase 3, admin) ─────────────────────────────────────────────
  async getRoyaltyReport(period: string) {
    return this.request<any>(`/admin/royalties/report?period=${encodeURIComponent(period)}`);
  }

  async closeRoyaltyPeriod(period: string, poolFinal: number) {
    return this.request<any>('/admin/royalties/close', {
      method: 'POST',
      body: JSON.stringify({ period, poolFinal })
    });
  }

  async getRoyaltyPeriods() {
    return this.request<any[]>('/admin/royalties/periods');
  }

  async verifyRoyaltyIntegrity() {
    return this.request<{ ok: boolean; checked: number; brokenAt?: number }>('/admin/royalties/verify-integrity');
  }

  async downloadRoyaltyCsv(period: string): Promise<void> {
    const response = await fetch(`${API_URL}/admin/royalties/export.csv?period=${encodeURIComponent(period)}`, {
      headers: this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {},
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Não foi possível exportar o CSV.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `royalties-${period}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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

  // Métricas de anúncio — fire-and-forget: falha de rede nunca afeta a exibição.
  trackAdImpression(adId: string) {
    if (!adId) return;
    this.request(`/admin/ads/${adId}/impression`, { method: 'POST' }).catch(() => {});
  }

  trackAdClick(adId: string) {
    if (!adId) return;
    this.request(`/admin/ads/${adId}/click`, { method: 'POST' }).catch(() => {});
  }

  // Admin
  async getAdminStats() {
    return this.request<any>('/admin/management/stats');
  }

  async getAdminContent(page = 1) {
    return this.request<any>(`/admin/management/content?page=${page}`);
  }

  async reorderContent(items: { id: string; order_index: number }[]) {
    return this.request<any>('/admin/management/reorder', {
      method: 'PUT',
      body: JSON.stringify({ items })
    });
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

  async updateSeries(id: string, data: Partial<{ title: string; genre: string; description: string; isPremium: boolean; channelId: string; isPublished: boolean; releaseDay: number | null; tags: string[]; content_rating: 'kids' | 'teen' | 'young' | null }>) {
    return this.request<any>(`/content/series/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async updateEpisode(id: string, data: Partial<{ thumbnail: string; title: string; description: string; isPremium: boolean; video_url: string; status: string }>) {
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

  async clearSeriesThumbnail(seriesId: string): Promise<void> {
    await this.request(`/content/series/${seriesId}`, {
      method: 'PUT',
      body: JSON.stringify({ cover_image: '' })
    });
  }

  async uploadSeriesThumbnail(seriesId: string, file: File, seriesSlug?: string): Promise<string> {
    // Upload para Bunny Storage e atualiza cover_image da série
    const url = await this.uploadImageToBunny(file, seriesSlug);
    await this.request(`/content/series/${seriesId}`, {
      method: 'PUT',
      body: JSON.stringify({ cover_image: url })
    });
    return url;
  }

  async checkBunnyVideoStatus(videoId: string): Promise<{ bunnyStatus: number; mongoStatus: string }> {
    return this.request(`/bunny/video-status/${encodeURIComponent(videoId)}`);
  }

  async getSignedVideoUrl(videoId: string): Promise<string> {
    const data = await this.request<{ signedUrl: string }>(`/bunny/signed-url?videoId=${encodeURIComponent(videoId)}`);
    return data.signedUrl;
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

  // Votos por série (curtida na obra)
  async getSeriesVote(seriesId: string | number) {
    try {
      return await this.request<{ myVote: 'like' | 'dislike' | null; likes: number }>(`/content/series/${seriesId}/vote`);
    } catch (e) {
      return { myVote: null, likes: 0 };
    }
  }

  async voteSeries(seriesId: string | number, type: 'like' | 'dislike' = 'like') {
    return this.request<any>(`/content/series/${seriesId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ type })
    });
  }

  async removeSeriesVote(seriesId: string | number) {
    return this.request<any>(`/content/series/${seriesId}/vote`, { method: 'DELETE' });
  }

  // Favoritos (Minha Lista)
  async getFavorites() {
    try {
      return await this.request<{ seriesId: string; series: any }[]>('/favorites');
    } catch (e) {
      return [];
    }
  }

  async addFavorite(seriesId: string | number) {
    const result = await this.request<{ favorited: boolean }>(`/favorites/${seriesId}`, { method: 'POST' });
    // Ponto único de integração do prompt contextual de push (Fase 4 Bloco 2,
    // Task 8): PushPrompt escuta este evento — nenhuma das três abas (HQCine/
    // VCine/Hi-Qua) precisa saber de push.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('lorflux:favorited'));
    }
    return result;
  }

  async removeFavorite(seriesId: string | number) {
    return this.request<{ favorited: boolean }>(`/favorites/${seriesId}`, { method: 'DELETE' });
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

  async uploadImageToBunny(file: File, seriesSlug?: string): Promise<string> {
    const formData = new FormData();
    formData.append('image', file);
    if (seriesSlug) formData.append('seriesSlug', seriesSlug);
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

  async uploadImagesBatchToBunny(files: File[], seriesSlug?: string): Promise<{ results: Array<{ success: boolean; filename: string; index: number; url?: string; error?: string }>; successCount: number; failCount: number; total: number }> {
    const formData = new FormData();
    files.forEach(f => formData.append('images', f));
    if (seriesSlug) formData.append('seriesSlug', seriesSlug);
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

  async updateEpisodeAudio(episodeId: string, payload: { audioTrack1Url?: string; audioTrack1Lang?: string; audioTrack2Url?: string; audioTrack2Lang?: string; audioTrack3Url?: string; audioTrack3Lang?: string; audioTrack4Url?: string; audioTrack4Lang?: string; hlsAudioLabels?: string[] }) {
    return this.request<any>(`/admin/management/episodes/${episodeId}/audio`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  async updateEpisodeWebtoonLabels(episodeId: string, webtoonLanguageLabels: { pt?: string; en?: string; es?: string; zh?: string }) {
    return this.request<any>(`/admin/management/episodes/${episodeId}/webtoon-labels`, {
      method: 'PATCH',
      body: JSON.stringify({ webtoonLanguageLabels })
    });
  }

  async searchContent(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 2) return { series: [], episodes: [] };
    try {
      return await this.request<{ series: any[]; episodes: any[] }>(`/content/search?q=${encodeURIComponent(trimmed)}`);
    } catch {
      return { series: [], episodes: [] };
    }
  }

  // Agenda de lançamentos — público, sem auth. Chaves "0".."6" sempre
  // presentes (0=domingo..6=sábado, igual a Date.getDay()); erro de rede
  // propaga (this.request lança) para o AgendaView mostrar seu próprio aviso.
  async getAgenda(): Promise<Record<string, AgendaItem[]>> {
    return this.request<Record<string, AgendaItem[]>>('/content/agenda');
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

  // ─── Fase 4: progresso de leitura ───────────────────────────────────────────
  async saveProgress(dados: {
    seriesId: string; episodeId: string;
    contentType: 'hqcine' | 'vcine' | 'hiqua';
    percent: number; position?: number;
  }) {
    return this.request('/me/progress', { method: 'PUT', body: JSON.stringify(dados) });
  }

  async getContinueList(contentType?: 'hqcine' | 'vcine' | 'hiqua') {
    const path = contentType ? `/me/continue?contentType=${contentType}` : '/me/continue';
    return this.request<any[]>(path);
  }

  // Progresso de UM episódio específico, sem as regras de poda/dedupe/teto do
  // carrossel — usado pela restauração de "onde parei" no leitor/player.
  // Devolve a linha crua ou null (não lança quando não há progresso).
  async getProgressForEpisode(episodeId: string) {
    return this.request<any | null>(`/me/progress/${episodeId}`);
  }

  /** Chamado logo após login/cadastro para levar o histórico do visitante à conta. */
  async claimProgress(anonymousId: string) {
    return this.request<{ movidos: number; fundidos: number }>('/me/progress/claim', {
      method: 'POST',
      body: JSON.stringify({ anonymousId }),
    });
  }

  // ─── Fase 4 Bloco 2: push (notificação de capítulo novo) ───────────────────
  /** Sem auth — chave pública VAPID usada por pushManager para assinar o push deste aparelho. */
  async getPushPublicKey() {
    return this.request<{ publicKey: string | null }>('/push/public-key');
  }

  // Shape real de routes/push.js: 200/201 com { subscribed: true } (upsert por endpoint).
  async subscribePush(sub: PushSubscriptionPayload) {
    return this.request<{ subscribed: true }>('/me/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(sub),
    });
  }

  // Shape real de routes/push.js: { removed: <deletedCount> } (0 ou 1).
  async unsubscribePush(endpoint: string) {
    return this.request<{ removed: number }>('/me/push/subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    });
  }

  /** endpoint vazio ainda é uma consulta válida (aparelho sem subscription local). */
  async getPushStatus(endpoint: string) {
    return this.request<{ thisDevice: boolean; anyDevice: boolean }>(`/me/push/status?endpoint=${encodeURIComponent(endpoint)}`);
  }

  // ─── Fase 4 Bloco 3: Super Reader (apoio direto ao autor) ──────────────────
  /**
   * Exige login (verifyToken em routes/superReader.js). `amountCents` SEMPRE
   * em centavos inteiros (ruling P1 do bloco — o DonateButton morto errou
   * exatamente isso, mandando reais). Devolve a URL da sessão de checkout do
   * Stripe; quem chama redireciona (`window.location.href = url`).
   */
  async createSuperReaderSession(seriesId: string, amountCents: number, currency: string) {
    return this.request<{ url: string }>('/superreader/create-session', {
      method: 'POST',
      body: JSON.stringify({ seriesId, amountCents, currency }),
    });
  }

  // Shape real de routes/superReader.js GET /me: selo derivado (>=1 contribuição
  // própria) + lista das contribuições, mais recente primeiro. Nunca traz
  // stripeSessionId nem os campos de share — só o que a Conta precisa mostrar.
  async getSuperReaderMe() {
    return this.request<{
      superReader: boolean;
      contribuicoes: { seriesTitle: string | null; amountCents: number; currency: string; createdAt: string }[];
    }>('/superreader/me');
  }

  /** Sem auth — o frontend monta os valores rápidos (mínimo, 2x, 4x) a partir daqui. */
  async getSuperReaderMin() {
    return this.request<{ minCents: number }>('/superreader/min');
  }

  // ─── Fase 5 Bloco 1: Portal do Ilustrador (Meu Estúdio) ────────────────────
  // Shapes reais de routes/portal.js — ver comentários lá para o contrato
  // completo de cada rota. 403 (não é dono de canal ativo) chega como Error
  // comum (this.request lança); quem chama decide o que fazer (o cartão da
  // Conta trata qualquer falha como "não mostrar").

  async getMeuEstudio() {
    return this.request<{
      canais: { channelId: string; name: string; avatar: string | null; obras: number; pendentes: number; mensagensNaoLidas: number }[];
    }>('/portal/meu-estudio');
  }

  // period 'YYYY-MM' opcional — sem ele, o backend usa o mês corrente.
  // Mês corrente: canais vêm SEM `amount` (nunca R$ antes do fechamento).
  async getPortalResumo(period?: string) {
    const path = period ? `/portal/resumo?period=${encodeURIComponent(period)}` : '/portal/resumo';
    return this.request<{
      period: string;
      status: 'aberto' | 'fechado';
      canais: { channelId: string; channelName: string; points: number; share: number; amount?: number }[];
      superReader: { porCanal: { channelId: string; channelName: string | null; apoios: number; autorCents: number }[] };
      periodosFechadosDisponiveis: string[];
    }>(path);
  }

  // Lista as próprias séries (rascunho/em análise/publicada), mais recente
  // primeiro — GET /api/portal/series (routes/portal.js).
  async getPortalSeries() {
    return this.request<{ series: any[] }>('/portal/series');
  }

  // `tags` (Fase 5 Bloco 2, Task 6): até 8 slugs do vocabulário fechado —
  // PORTAL_SERIES_FIELDS passou a aceitar (INVERSÃO deliberada do contrato
  // do Bloco 1, ver routes/portal.js).
  async createPortalSeries(data: { title: string; description?: string; content_rating_sugerida?: 'kids' | 'teen' | 'young' | null; channelId?: string; tags?: string[] }) {
    return this.request<any>('/portal/series', { method: 'POST', body: JSON.stringify(data) });
  }

  async updatePortalSeries(id: string, data: Partial<{ title: string; description: string; cover_image: string; content_rating_sugerida: 'kids' | 'teen' | 'young' | null; tags: string[] }>) {
    return this.request<any>(`/portal/series/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async createPortalEpisodio(seriesId: string, data: { title: string; description?: string; episode_number: number; thumbnail?: string }) {
    return this.request<any>(`/portal/series/${seriesId}/episodios`, { method: 'POST', body: JSON.stringify(data) });
  }

  async addPortalPaineis(episodeId: string, panels: { image_url: string; order: number }[]) {
    return this.request<{ success: boolean; panelCount: number; episode: any }>(`/portal/episodios/${episodeId}/paineis`, {
      method: 'POST',
      body: JSON.stringify({ panels }),
    });
  }

  async enviarPortalSerie(seriesId: string) {
    return this.request<any>(`/portal/series/${seriesId}/enviar`, { method: 'POST' });
  }

  async enviarPortalEpisodio(episodeId: string) {
    return this.request<any>(`/portal/episodios/${episodeId}/enviar`, { method: 'POST' });
  }

  // limit default do backend é 100 (thread pequena — não pagina neste bloco,
  // ver spec/plano); `before` (ISO) só quando o caller explicitamente rolar
  // pra cima.
  async getPortalMensagens(params: { canalId?: string; limit?: number; before?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.canalId) qs.set('canalId', params.canalId);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.before) qs.set('before', params.before);
    const query = qs.toString();
    return this.request<{ canalId: string; mensagens: any[] }>(`/portal/mensagens${query ? `?${query}` : ''}`);
  }

  async sendPortalMensagem(data: { texto: string; canalId?: string }) {
    return this.request<any>('/portal/mensagens', { method: 'POST', body: JSON.stringify(data) });
  }

  // Upload do ilustrador (Fase 5 Bloco 1, Task 5): contrato PRÓPRIO, diferente
  // do admin — envia `seriesId` real (não `seriesSlug` texto-livre); o
  // servidor resolve série→canal→dono e deriva o slug lá dentro. Mesmas rotas
  // de uploadImageToBunny/uploadImagesBatchToBunny (upload-image[-batch]),
  // que já aceitam admin OU dono do canal da série alvo.
  async uploadPortalImage(file: File, seriesId: string): Promise<string> {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('seriesId', seriesId);
    const response = await fetch(`${API_URL}/bunny/upload-image`, {
      method: 'POST',
      headers: this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {},
      body: formData,
      credentials: 'include',
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Erro ao fazer upload: ${response.status}`);
    }
    const data = await response.json();
    return data.url;
  }

  async uploadPortalImagesBatch(files: File[], seriesId: string): Promise<{ results: Array<{ success: boolean; filename: string; index: number; url?: string; error?: string }>; successCount: number; failCount: number; total: number }> {
    const formData = new FormData();
    files.forEach(f => formData.append('images', f));
    formData.append('seriesId', seriesId);
    const response = await fetch(`${API_URL}/bunny/upload-image-batch`, {
      method: 'POST',
      headers: this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {},
      body: formData,
      credentials: 'include',
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Erro ao fazer upload em lote: ${response.status}`);
    }
    return response.json();
  }

  // ─── Fase 5 Bloco 1, Task 10: canal público (leitor) ───────────────────────
  // GET /api/channels/:id — shape pinado: followersCount (número) + isFollowing
  // (bool, false se anônimo), SEM o array followers[] (dado pessoal). Público
  // (optionalAuth no backend) — funciona sem token.
  async getChannel(id: string) {
    return this.request<{
      _id: string; name: string; description?: string | null;
      avatar?: string | null; banner?: string | null; isActive: boolean;
      followersCount: number; isFollowing: boolean;
      ownerId?: { _id: string; nome: string; avatar?: string } | string | null;
    }>(`/channels/${id}`);
  }

  // Shape real de routes/channels.js: { success, followers } — followers é a
  // CONTAGEM atualizada (não a lista), já pronta para reconciliar o otimismo
  // da UI depois da resposta do servidor.
  async followChannel(id: string) {
    return this.request<{ success: boolean; followers: number }>(`/channels/${id}/follow`, { method: 'POST' });
  }

  async unfollowChannel(id: string) {
    return this.request<{ success: boolean; followers: number }>(`/channels/${id}/follow`, { method: 'DELETE' });
  }

  // ─── Fase 5 Bloco 1, Task 10: admin — Fila de Aprovação ────────────────────
  // Shape real de routes/adminPortal.js: lista FLAT com `tipo: 'series'|'episode'`.
  // `naoClassificadas` (Fase 5 Bloco 2, Task 6): contagem para o badge do
  // AdminDashboard — MESMA resposta, sem rota dedicada.
  async getAdminAprovacoes() {
    return this.request<{ itens: any[]; naoClassificadas: number }>('/admin/aprovacoes');
  }

  // genre/tags/content_rating são OPCIONAIS na leitura do backend (que usa o
  // que já está salvo na série quando o campo não vem no body), mas
  // content_rating final é OBRIGATÓRIO para aprovar (Fase 5 Bloco 2, Task 6
  // — 400 "Classificação etária é obrigatória para aprovar" sem ele).
  async aprovarSerieAdmin(id: string, data: { genre?: string; tags?: string[]; content_rating?: 'kids' | 'teen' | 'young' | '' } = {}) {
    return this.request<any>(`/admin/aprovacoes/series/${id}/aprovar`, { method: 'POST', body: JSON.stringify(data) });
  }

  async aprovarEpisodioAdmin(id: string) {
    return this.request<any>(`/admin/aprovacoes/episodes/${id}/aprovar`, { method: 'POST' });
  }

  // tipo aceita 'series' | 'episode' | 'episodes' (o backend normaliza o
  // plural — ver routes/adminPortal.js) — a UI sempre manda o `item.tipo`
  // devolvido por getAdminAprovacoes, que já é singular.
  async devolverAprovacao(tipo: 'series' | 'episode' | 'episodes', id: string, texto: string) {
    return this.request<{ success: boolean; mensagem: any }>(`/admin/aprovacoes/${tipo}/${id}/devolver`, {
      method: 'POST',
      body: JSON.stringify({ texto }),
    });
  }

  // ─── Fase 5 Bloco 1, Task 10: admin — form de canal ────────────────────────
  // PUT /api/channels/:id, branch admin: ownerEmail transfere a titularidade
  // (404 se o e-mail não corresponde a nenhum usuário — routes/channels.js).
  async updateChannelAdmin(id: string, data: Partial<{ name: string; description: string; avatar: string; banner: string; ownerEmail: string }>) {
    return this.request<any>(`/channels/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async desativarCanal(id: string) {
    return this.request<any>(`/channels/${id}/desativar`, { method: 'POST' });
  }

  // Fase 5 Bloco 2, Task 8: inverso de desativarCanal — NÃO desarquiva
  // nenhuma thread de MensagemPortal (a arquivada é do ex-dono; o dono atual
  // tem a própria thread vigente) — ver routes/channels.js.
  async reativarCanal(id: string) {
    return this.request<any>(`/channels/${id}/reativar`, { method: 'POST' });
  }

  // ─── Fase 5 Bloco 1, Task 10: admin — mensagens por canal ──────────────────
  // Shape real de routes/adminPortal.js: threads agrupadas (vigente primeiro,
  // depois arquivadas da mais recente para a mais antiga).
  async getAdminMensagensCanal(canalId: string) {
    return this.request<{ canalId: string; threads: any[] }>(`/admin/mensagens/${canalId}`);
  }

  async sendAdminMensagem(canalId: string, data: { texto: string; refTipo?: 'series' | 'episode'; refId?: string }) {
    return this.request<any>(`/admin/mensagens/${canalId}`, { method: 'POST', body: JSON.stringify(data) });
  }

  // ─── Fase 5 Bloco 2, Task 7: "Classificação etária e Preferências de
  // conteúdo" + PIN de proteção (Conta do leitor) ──────────────────────────
  // Shapes reais de routes/parental.js. `vocabulario` do GET é a fonte ÚNICA
  // dos slugs para os toggles do leitor (canal pinado pela spec — NUNCA o
  // import direto de utils/tagsVocabulario.json aqui, esse é o canal dos
  // chips do admin/portal).
  async getParental() {
    return this.request<{
      classificacaoEtaria: 'kids' | 'teen' | 'young';
      tagsBloqueadas: string[];
      temPin: boolean;
      vocabulario: { slug: string; rotuloPt: string }[];
    }>('/parental');
  }

  // `pin` só é enviado quando temPin — e sempre como STRING (um PIN
  // "001234" numérico perderia os zeros à esquerda e o backend recusa
  // number com 401 "PIN obrigatório", ver ledger da T3, achado #5).
  // `retryAuthOn401=false`: ver comentário de `request()` acima.
  async updateParental(data: { classificacaoEtaria?: 'kids' | 'teen' | 'young'; tagsBloqueadas?: string[]; pin?: string }) {
    return this.request<{ classificacaoEtaria: 'kids' | 'teen' | 'young'; tagsBloqueadas: string[]; temPin: boolean }>(
      '/parental',
      { method: 'PUT', body: JSON.stringify(data) },
      false,
      false,
    );
  }

  // novoPin (definir/trocar) | pinAtual+novoPin (trocar) | pinAtual+remover (remover).
  async setParentalPin(data: { novoPin?: string; pinAtual?: string; remover?: boolean }) {
    return this.request<{ temPin: boolean }>('/parental/pin', { method: 'POST', body: JSON.stringify(data) }, false, false);
  }

  // Conta local exige `password` (mesma prova de identidade da exclusão de
  // conta); conta social manda undefined — vira body `{}` (a rota não checa
  // senha pra quem não tem uma, ver routes/parental.js).
  async recuperarPin(password?: string) {
    return this.request<{ message: string }>(
      '/parental/pin/recuperar',
      { method: 'POST', body: JSON.stringify(password ? { password } : {}) },
      false,
      false,
    );
  }

  async confirmarRecuperacaoPin(token: string) {
    return this.request<{ message: string }>('/parental/pin/recuperar/confirmar', { method: 'POST', body: JSON.stringify({ token }) });
  }

  // ─── Fase 5 Bloco 3: sinalização de conteúdo (leitor) ─────────────────────
  // Shapes reais de routes/sinalizacao.js. Nunca devolvem contagens (regra 8
  // do Vin) — só o estado do PRÓPRIO usuário.
  async getMinhaSinalizacao(seriesId: string) {
    return this.request<{ jaSinalizada: boolean; motivo: string | null }>(`/content/series/${seriesId}/sinalizacao`);
  }

  async sinalizarSerie(seriesId: string, data: { motivo: string; descricao?: string }) {
    return this.request<{ jaSinalizada: boolean }>(`/content/series/${seriesId}/sinalizar`, { method: 'POST', body: JSON.stringify(data) });
  }
}

export const api = ApiService.getInstance();
