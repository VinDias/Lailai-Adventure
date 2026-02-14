
import { Episode, Ad, Comic, Lesson, Channel } from '../types';

export const MOCK_CHANNELS: Channel[] = [
  {
    id: 1,
    name: "Neo Tokyo Studios",
    handle: "neotokyo",
    avatar: "https://picsum.photos/seed/tokyo/200",
    banner: "https://picsum.photos/seed/tokyobanner/1200/400",
    description: "Líderes em produções cinematográficas verticais cyberpunk e futuristas.",
    followerCount: 15400,
    // Fix: Added missing required isMonetized property
    isMonetized: true
  },
  {
    id: 2,
    name: "Urban Echoes",
    handle: "urbanecho",
    avatar: "https://picsum.photos/seed/urban/200",
    banner: "https://picsum.photos/seed/urbanbanner/1200/400",
    description: "Capturando a alma das metrópoles através de enquadramentos 9:16 únicos.",
    followerCount: 8900,
    // Fix: Added missing required isMonetized property
    isMonetized: true
  },
  {
    id: 3,
    name: "Ink & Pixel Lab",
    handle: "inkpixel",
    avatar: "https://picsum.photos/seed/art/200",
    banner: "https://picsum.photos/seed/artbanner/1200/400",
    description: "Estúdio focado em Webtoons de alta fidelidade e narrativas visuais experimentais.",
    followerCount: 12100,
    // Fix: Added missing required isMonetized property
    isMonetized: true
  },
  {
    id: 4,
    name: "CineVibe Brasil",
    handle: "cinevibe",
    avatar: "https://picsum.photos/seed/vibe/200",
    banner: "https://picsum.photos/seed/vibebanner/1200/400",
    description: "O melhor do entretenimento vertical brasileiro. Curta-metragens e vlogs cinematográficos.",
    followerCount: 45000,
    // Fix: Added missing required isMonetized property
    isMonetized: true
  }
];

export const MOCK_EPISODES: Episode[] = [
  {
    id: 1,
    channelId: 1,
    // Fix: Added missing required episode_number property
    episode_number: 1,
    title: "Samurai Neon 1080p",
    description: "Masterizado em H.265 para cores ultra vibrantes. Um guerreiro solitário contra o xogunato corporativo.",
    // Fix: Updated videoUrl to video_url to match Episode interface and HiQuaFeed usage
    video_url: "https://v.ftcdn.net/05/56/67/02/700_F_556670233_G9O8h6e9r6M1X6P2A2D9qG6v9zL6x8P9_ST.mp4",
    duration: 210,
    thumbnail: "https://picsum.photos/seed/neo/1080/1920",
    likes: 12400,
    comments: 890
  },
  {
    id: 2,
    channelId: 2,
    // Fix: Added missing required episode_number property
    episode_number: 1,
    title: "Ecos da Cidade HD",
    description: "Captura cinematográfica em FullHD. Uma jornada atmosférica pelas ruas chuvosas de uma metrópole esquecida.",
    // Fix: Updated videoUrl to video_url to match Episode interface and HiQuaFeed usage
    video_url: "https://v.ftcdn.net/04/81/76/89/700_F_481768913_uS6WqT7pG1E8j6hA2D9Xq7v9zL6x8P9_ST.mp4",
    duration: 210,
    thumbnail: "https://picsum.photos/seed/rain/1080/1920",
    likes: 3400,
    comments: 212
  }
];

export const MOCK_LESSONS: Lesson[] = [
  {
    id: 101,
    channelId: 4,
    title: "O Despertar da IA",
    description: "Um curta-metragem sobre o primeiro pensamento consciente de uma rede neural.",
    category: "Sci-Fi",
    videoUrl: "https://v.ftcdn.net/03/61/89/72/700_F_361897241_uG6WqT7pG1E8j6hA2D9Xq7v9zL6x8P9_ST.mp4",
    duration: 300,
    thumbnail: "https://picsum.photos/seed/scifi1/1080/1920",
    date: "2 dias atrás",
    likes: 25400
  },
  {
    id: 102,
    channelId: 1,
    title: "Neon Streets: Part 2",
    description: "A continuação da saga visual mais premiada do Neo Tokyo Studios.",
    category: "CineVertical",
    videoUrl: "https://v.ftcdn.net/05/11/45/67/700_F_511456721_uG6WqT7pG1E8j6hA2D9Xq7v9zL6x8P9_ST.mp4",
    duration: 300,
    thumbnail: "https://picsum.photos/seed/neon2/1080/1920",
    date: "1 semana atrás",
    likes: 18900
  },
  {
    id: 103,
    channelId: 4,
    title: "Ritmos Urbanos",
    description: "Uma exploração visual do breakdance nas capitais brasileiras.",
    category: "Cultura",
    videoUrl: "https://v.ftcdn.net/04/81/76/89/700_F_481768913_uS6WqT7pG1E8j6hA2D9Xq7v9zL6x8P9_ST.mp4",
    duration: 300,
    thumbnail: "https://picsum.photos/seed/dance/1080/1920",
    date: "3 dias atrás",
    likes: 12000
  }
];

const generatePanels = (seed: string) => {
  return Array.from({ length: 22 }, (_, i) => 
    `https://picsum.photos/seed/${seed}-${i}/1080/1920`
  );
};

export const MOCK_COMICS: Comic[] = [
  {
    id: 1,
    channelId: 3,
    title: "Alma-Cyber: Transmissão",
    author: "Kira V.",
    description: "O pós-vida digital não é o que parece. Junte-se a Zero nos setores corrompidos.",
    thumbnail: "https://picsum.photos/seed/cyber-thumb/1080/1920",
    panels: generatePanels("cyber"),
    likes: 5600,
    comments: 432
  },
  {
    id: 2,
    channelId: 3,
    title: "Sombra de Shinjuku",
    author: "Takahiro M.",
    description: "Uma detetive particular descobre uma conspiração que envolve memórias artificiais.",
    thumbnail: "https://picsum.photos/seed/shinjuku-thumb/1080/1920",
    panels: generatePanels("shinjuku"),
    likes: 8900,
    comments: 1020
  }
];

export const MOCK_ADS: Ad[] = [
  {
    id: 999,
    advertiserId: 'system',
    title: "Destaque da Comunidade",
    // Fix: Updated videoUrl to video_url to match Ad interface and HiQuaFeed usage
    video_url: "https://v.ftcdn.net/04/55/67/02/700_F_455670233_uG6WqT7pG1E8j6hA2D9Xq7v9zL6x8P9_ST.mp4",
    duration: 90,
    views: 0,
    maxViews: 5000,
    active: true,
    format: 'H.264',
    resolution: '1080x1920'
  }
];
