
export interface User {
  id: number;
  email: string;
  name?: string;
  phone?: string;
  isPremium: boolean;
  avatar?: string;
  userAdUrl?: string;
}

export interface Episode {
  id: number;
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
  title: string;
  category: string;
  videoUrl: string;
  duration: number;
  thumbnail: string;
  date: string;
}

export interface Comic {
  id: number;
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
  title: string;
  videoUrl: string;
  duration: number;
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
