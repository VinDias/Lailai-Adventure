
export interface User {
  id: string;
  email: string;
  nome: string;
  avatar?: string;
  isPremium: boolean;
  provider: 'local' | 'google' | 'microsoft';
  criadoEm: string;
  followingChannelIds: number[];
}

export interface Video {
  id: string;
  titulo: string;
  categoria: string;
  descricao: string;
  duracao: number;
  arquivoUrl: string;
  thumbnailUrl: string; // 1080x1920
  isPremium: boolean;
  criadoEm: string;
}

export interface Webtoon {
  id: string;
  titulo: string;
  categoria: string;
  descricao: string;
  numeroPaineis: number;
  isPremium: boolean;
  thumbnailUrl: string; // 160x151
  criadoEm: string;
}

export interface Panel {
  id: string;
  webtoonId: string;
  ordem: number;
  imagemUrl: string;
  image_url?: string; // Used in HQCineHome
  largura: number;
  altura: number;
}

export enum ViewMode {
  AUTH = 'AUTH',
  HOME_VIDEOS = 'HOME_VIDEOS',
  HOME_WEBTOONS = 'HOME_WEBTOONS',
  PLAYER = 'PLAYER',
  READER = 'READER',
  ADMIN = 'ADMIN',
  PROFILE = 'PROFILE'
}

export interface Ad {
  id: number;
  advertiserId: string;
  title: string;
  video_url: string;
  duration: number;
  views: number;
  maxViews: number;
  active: boolean;
  format: 'H.264' | 'H.265';
  resolution: string;
}

export interface Channel {
  id: number;
  name: string;
  handle: string;
  avatar: string;
  banner: string;
  description: string;
  followerCount: number;
  isMonetized: boolean;
}

export interface Series {
  id: number;
  title: string;
  description: string;
  genre: string;
  cover_image: string;
  isPremium: boolean;
  content_type: 'hqcine' | 'vfilm' | 'hiqua';
}

export interface Episode {
  id: number;
  channelId: number;
  series_id?: number;
  series_title?: string;
  episode_number: number;
  title: string;
  description: string;
  video_url: string;
  duration: number;
  thumbnail: string;
  likes: number;
  comments: number;
}

export interface Lesson {
  id: number;
  channelId: number;
  title: string;
  description: string;
  category: string;
  videoUrl: string;
  duration: number;
  thumbnail: string;
  date: string;
  likes: number;
}

export interface Comic {
  id: number;
  channelId: number;
  title: string;
  author: string;
  description: string;
  thumbnail: string;
  panels: string[];
  likes: number;
  comments: number;
}

export interface Chapter {
  id: number;
  series_id: number;
  chapter_number: number;
  title: string;
}
