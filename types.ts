
export interface User {
  id: number;
  email: string;
  name: string;
  address?: string;
  isPremium: boolean;
  avatar?: string;
  // Added followingChannelIds property to support social features
  followingChannelIds: number[];
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
  // Made season_id optional as mock data sometimes omits it
  season_id?: number;
  episode_number: number;
  title: string;
  // Added description property used in mock data and feeds
  description?: string;
  video_url?: string;
  duration?: number;
  thumbnail: string;
  // Added metadata properties used for feed display and engagement
  channelId?: number;
  likes?: number;
  comments?: number;
  series_title?: string;
}

export interface Panel {
  id: number;
  episode_id: number;
  image_url: string;
  order_index: number;
}

export interface Ad {
  id: number;
  // Added advertiserId to support business features
  advertiserId?: number | string;
  title: string;
  video_url: string;
  duration: number;
  // Added monetization metrics and technical metadata
  views: number;
  maxViews: number;
  active: boolean;
  format: string;
  resolution: string;
}

// Added missing Channel interface for studio/creator management
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

// Added missing Lesson interface for educational/category content
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

// Added missing Comic interface for Hi-Qua reader
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

// Added missing Chapter interface used in HQCine vertical stories
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
