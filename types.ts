
export interface User {
  id: string;
  email: string;
  nome: string;
  avatar?: string;
  isPremium: boolean;
  premiumExpiresAt?: string;
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
  bunnyVideoId?: string;
  audioTrack1Url?: string;
  audioTrack2Url?: string;
  thumbnailUrl: string;
  isPremium: boolean;
  criadoEm: string;
  type: 'hqcine' | 'vcine';
  order_index?: number;
}

export interface Webtoon {
  id: string;
  episodeId?: string;
  titulo: string;
  categoria: string;
  descricao: string;
  numeroPaineis: number;
  isPremium: boolean;
  thumbnailUrl: string;
  criadoEm: string;
  order_index?: number;
}

export enum ViewMode {
  AUTH = 'AUTH',
  HQCINE = 'HQCINE',
  VCINE = 'VCINE',
  HIQUA = 'HIQUA',
  PLAYER = 'PLAYER',
  READER = 'READER',
  PROFILE = 'PROFILE',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD',
  ADMIN_USERS = 'ADMIN_USERS',
  ADMIN_CONTENT = 'ADMIN_CONTENT',
  ADMIN_PAYMENTS = 'ADMIN_PAYMENTS',
  ADMIN_ADS = 'ADMIN_ADS',
  ADMIN_SETTINGS = 'ADMIN_SETTINGS'
}

export interface AdminStats {
  totalUsers: number;
  premiumUsers: number;
  totalVideos: number;
  totalWebtoons: number;
  estimatedRevenue: number;
  activeAds?: number;
}

// Fix: Export missing Channel type
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

// Fix: Export missing Episode type
export interface Episode {
  _id?: string;
  id: number;
  channelId?: number;
  episode_number: number;
  title: string;
  description: string;
  video_url: string;
  duration: number;
  thumbnail: string;
  likes?: number;
  comments?: number;
  series_title?: string;
}

// Fix: Export missing Ad type
export interface Ad {
  id: number | string;
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

// Fix: Export missing Lesson type
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

// Fix: Export missing Comic type
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

// Fix: Export missing Series type
export interface Series {
  _id: string;
  title: string;
  genre: string;
  description: string;
  cover_image: string;
  isPremium: boolean;
  content_type?: string;
  order_index?: number;
}

// Fix: Export missing Chapter type
export interface Chapter {
  id: number;
  series_id: number;
  chapter_number: number;
  title: string;
}

// Fix: Export missing Panel type
export interface Panel {
  id: string | number;
  webtoonId?: string;
  ordem?: number;
  imagemUrl?: string; // used in WebtoonReader
  image_url?: string; // used in HQCineHome
  largura?: number;
  altura?: number;
}
