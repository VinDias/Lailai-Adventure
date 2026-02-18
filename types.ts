
export interface User {
  id: string;
  email: string;
  nome: string;
  avatar?: string;
  isPremium: boolean;
  premiumExpiresAt?: string; // Data de expiração da assinatura
  role: 'user' | 'admin';
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
  thumbnailUrl: string; // 1080x1920 para HQCine/VCine
  isPremium: boolean;
  criadoEm: string;
  type: 'hqcine' | 'vcine';
}

export interface Webtoon {
  id: string;
  titulo: string;
  categoria: string;
  descricao: string;
  numeroPaineis: number;
  isPremium: boolean;
  thumbnailUrl: string; // 160x151 para Hi-Qua
  criadoEm: string;
}

export enum ViewMode {
  AUTH = 'AUTH',
  HQCINE = 'HQCINE',
  VCINE = 'VCINE',
  HIQUA = 'HIQUA',
  PLAYER = 'PLAYER',
  READER = 'READER',
  PROFILE = 'PROFILE',
  // Rotas Administrativas
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD',
  ADMIN_USERS = 'ADMIN_USERS',
  ADMIN_CONTENT = 'ADMIN_CONTENT',
  ADMIN_PAYMENTS = 'ADMIN_PAYMENTS'
}

export interface AdminStats {
  totalUsers: number;
  premiumUsers: number;
  totalVideos: number;
  totalWebtoons: number;
  estimatedRevenue: number;
}

export interface Panel {
  id: string;
  webtoonId: string;
  ordem: number;
  imagemUrl: string;
  image_url?: string;
  largura: number;
  altura: number;
}

export interface Series {
  id: number;
  title: string;
  description: string;
  genre: string;
  cover_image: string;
  isPremium: boolean;
  content_type: 'hqcine' | 'vcine' | 'hiqua';
}

export interface Episode {
  id: number;
  series_id?: number;
  channelId?: number;
  episode_number: number;
  title: string;
  description: string;
  video_url: string;
  thumbnail: string;
  duration?: number;
  likes?: number;
  comments?: number;
  series_title?: string;
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
  format: string;
  resolution: string;
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

export interface Chapter {
  id: number;
  series_id: number;
  chapter_number: number;
  title: string;
}
