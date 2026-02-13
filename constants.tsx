
import React from 'react';
import { Home, User, CreditCard, Sparkles, LogOut, ChevronUp, ChevronDown, MessageCircle, Heart, Share2, BookOpen } from 'lucide-react';

export const COLORS = {
  primary: '#E11D48', // Rose 600
  secondary: '#4F46E5', // Indigo 600
  accent: '#FCD34D', // Amber 300
};

export const ICONS = {
  Home: <Home className="w-6 h-6" />,
  User: <User className="w-6 h-6" />,
  Premium: <CreditCard className="w-6 h-6" />,
  AI: <Sparkles className="w-6 h-6 text-amber-400" />,
  Logout: <LogOut className="w-6 h-6 text-red-500" />,
  Up: <ChevronUp className="w-8 h-8" />,
  Down: <ChevronDown className="w-8 h-8" />,
  Message: <MessageCircle className="w-7 h-7" />,
  Heart: <Heart className="w-7 h-7" />,
  Share: <Share2 className="w-7 h-7" />,
  Comics: <BookOpen className="w-6 h-6" />,
};
