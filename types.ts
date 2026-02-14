
export interface User {
  id: number;
  email: string;
  name: string;
  isPremium: boolean;
  isEmailVerified: boolean;
  stripeCustomerId?: string;
  subscriptionStatus?: 'active' | 'expired' | 'canceled' | 'none';
  avatar?: string;
  followingChannelIds: number[];
}

// Added missing Channel interface
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
  cover_image: string;
  genre: string;
  content_type: 'hqcine' | 'vfilm' | 'hiqua';
  is_published: boolean;
}

export interface Episode {
  id: number;
  episode_number: number;
  title: string;
  description?: string;
  video_url?: string;
  thumbnail: string;
  series_title?: string;
  // Added missing channelId property
  channelId?: number;
  duration?: number;
  likes?: number;
  comments?: number;
}

export interface Panel {
  id: number;
  episode_id: number;
  image_url: string;
  order_index: number;
}

export interface Ad {
  id: number;
  video_url: string;
  active: boolean;
  // Added missing properties used in mockData and Premium components
  advertiserId?: string | number;
  title?: string;
  duration?: number;
  views?: number;
  maxViews?: number;
  format?: 'H.264' | 'H.265';
  resolution?: string;
}

// Added missing Lesson interface
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

// Added missing Comic interface
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

// Added missing Chapter interface
export interface Chapter {
  id: number;
  series_id: number;
  chapter_number: number;
  title: string;
}

export enum ViewMode {
  HQCINE = 'HQCINE',
  HIQUA = 'HIQUA',
  VFILM = 'VFILM',
  USER = 'USER',
  SUBSCRIPTION = 'SUBSCRIPTION',
  AUTH = 'AUTH',
  READER = 'READER',
  PLAYER = 'PLAYER'
}
