
import { Episode, Ad, Comic, Lesson } from '../types';

export const MOCK_EPISODES: Episode[] = [
  {
    id: 1,
    title: "Samurai Neon 1080p",
    description: "Masterizado em H.265 para cores ultra vibrantes. Um guerreiro solitário contra o xogunato corporativo.",
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-girl-in-neon-light-33433-large.mp4",
    duration: 210,
    thumbnail: "https://picsum.photos/seed/neo/1080/1920",
    // Fix: Changed "12.4K" to 12400 to match the expected 'number' type
    likes: 12400,
    comments: 890
  },
  {
    id: 2,
    title: "Ecos da Cidade HD",
    description: "Captura cinematográfica em FullHD. Uma jornada atmosférica pelas ruas chuvosas de uma metrópole esquecida.",
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-curvy-road-in-a-forest-44161-large.mp4",
    duration: 210,
    thumbnail: "https://picsum.photos/seed/rain/1080/1920",
    // Fix: Changed "3.4K" to 3400 to match the expected 'number' type
    likes: 3400,
    comments: 212
  }
];

export const MOCK_LESSONS: Lesson[] = [
  {
    id: 101,
    title: "Dominando Composição Vertical",
    category: "Cinematografia",
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-stars-in-the-night-sky-42400-large.mp4",
    duration: 180,
    thumbnail: "https://picsum.photos/seed/lesson1/400/800",
    date: "Esta Semana"
  },
  {
    id: 102,
    title: "A Arte de Narrativas Curtas",
    category: "Roteiro",
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-slow-motion-of-a-man-practicing-martial-arts-34446-large.mp4",
    duration: 180,
    thumbnail: "https://picsum.photos/seed/lesson2/400/800",
    date: "Semana Passada"
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
    title: "Sombra de Shinjuku",
    author: "Takahiro M.",
    description: "Uma detetive particular descobre uma conspiração que envolve memórias artificiais.",
    thumbnail: "https://picsum.photos/seed/shinjuku-thumb/1080/1920",
    panels: generatePanels("shinjuku"),
    likes: 8900,
    comments: 1020
  },
  {
    id: 3,
    title: "O Último Ritual",
    author: "Lia Duarte",
    description: "Ficção científica brasileira sobre misticismo e tecnologia no sertão do futuro.",
    thumbnail: "https://picsum.photos/seed/ritual-thumb/1080/1920",
    panels: generatePanels("ritual"),
    likes: 12400,
    comments: 2150
  }
];

export const MOCK_ADS: Ad[] = [
  {
    id: 1,
    title: "Destaque da Comunidade",
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-spinning-around-the-earth-42401-large.mp4",
    duration: 90
  }
];
