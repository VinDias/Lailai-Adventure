
export interface User {
  id: number;
  email: string;
  name?: string;
  phone?: string;
  isPremium: boolean;
  avatar?: string;
  followingChannelIds: number[];
}

export interface Channel {
  id: number;
  name: string;
  handle: string;
  avatar: string;
  description: string;
  banner: string;
  followerCount: number;
  isMonetized: boolean;
}

export interface Episode {
  id: number;
  channelId: number;
  title: string;
  description: string;
  videoUrl: string;
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

export interface Ad {
  id: number;
  advertiserId: number | string;
  title: string;
  videoUrl: string;
  duration: number; 
  views: number;
  maxViews: number;
  active: boolean;
  format: 'H.264' | 'H.265';
  resolution: '1080x1920';
  ctaUrl?: string;
}

export enum ViewMode {
  FEED = 'FEED',
  COMICS = 'COMICS',
  DISCOVER = 'DISCOVER',
  AUTH = 'AUTH',
  PREMIUM = 'PREMIUM',
  PROFILE = 'PROFILE',
  LOGOUT = 'LOGOUT',
  ADMIN = 'ADMIN'
}
