
import { Episode, Comic, Lesson, Ad, Channel, User } from '../types';
import { MOCK_CHANNELS, MOCK_EPISODES, MOCK_COMICS, MOCK_LESSONS, MOCK_ADS } from './mockData';

/**
 * API Service - Camada de abstração para o Backend.
 * Em produção, estes métodos fariam fetch() para um endpoint real.
 */
class ApiService {
  private static instance: ApiService;
  
  private constructor() {}

  public static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  // Simulação de delay de rede
  private async delay(ms: number = 300) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // EPISODES (HQCINE)
  async getEpisodes(): Promise<Episode[]> {
    await this.delay();
    const saved = localStorage.getItem('lailai_eps');
    return saved ? JSON.parse(saved) : MOCK_EPISODES;
  }

  async saveEpisode(ep: Episode): Promise<void> {
    const eps = await this.getEpisodes();
    const updated = [ep, ...eps];
    localStorage.setItem('lailai_eps', JSON.stringify(updated));
  }

  // COMICS (HI-QUA)
  async getComics(): Promise<Comic[]> {
    await this.delay();
    const saved = localStorage.getItem('lailai_coms');
    return saved ? JSON.parse(saved) : MOCK_COMICS;
  }

  async saveComic(comic: Comic): Promise<void> {
    const comics = await this.getComics();
    const updated = [comic, ...comics];
    localStorage.setItem('lailai_coms', JSON.stringify(updated));
  }

  // LESSONS (VE-FILME)
  async getLessons(): Promise<Lesson[]> {
    await this.delay();
    const saved = localStorage.getItem('lailai_lesss');
    return saved ? JSON.parse(saved) : MOCK_LESSONS;
  }

  async saveLesson(lesson: Lesson): Promise<void> {
    const lessons = await this.getLessons();
    const updated = [lesson, ...lessons];
    localStorage.setItem('lailai_lesss', JSON.stringify(updated));
  }

  // ADS & MONETIZATION
  async getAds(): Promise<Ad[]> {
    await this.delay();
    const saved = localStorage.getItem('lailai_ads');
    return saved ? JSON.parse(saved) : MOCK_ADS;
  }

  async saveAd(ad: Ad): Promise<void> {
    const ads = await this.getAds();
    const updated = [ad, ...ads];
    localStorage.setItem('lailai_ads', JSON.stringify(updated));
  }

  async incrementAdView(adId: number): Promise<void> {
    const ads = await this.getAds();
    const updated = ads.map(ad => {
      if (ad.id === adId) {
        const newViews = ad.views + 1;
        return { ...ad, views: newViews, active: newViews < ad.maxViews };
      }
      return ad;
    });
    localStorage.setItem('lailai_ads', JSON.stringify(updated));
  }

  // CHANNELS
  async getChannels(): Promise<Channel[]> {
    await this.delay();
    return MOCK_CHANNELS;
  }
}

export const api = ApiService.getInstance();
