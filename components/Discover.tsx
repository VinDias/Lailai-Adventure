import React, { useState } from 'react';
import { Lesson } from '../types';

interface DiscoverProps {
  lessons: Lesson[];
}

const Discover: React.FC<DiscoverProps> = ({ lessons }) => {
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);

  if (activeLesson) {
    return (
      <div className="h-screen w-full bg-black flex flex-col z-[300]">
        <div className="p-6 flex items-center justify-between glass-nav z-10 border-b border-white/5">
          <button 
            onClick={() => setActiveLesson(null)}
            className="flex items-center gap-2 text-white/50 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15 19l-7-7 7-7" strokeWidth={2.5}/></svg>
            <span className="font-semibold text-sm">Biblioteca</span>
          </button>
          <div className="text-[10px] font-bold tracking-[0.2em] text-white/30 uppercase">Masterclass Academia</div>
        </div>

        <div className="flex-1 relative flex justify-center bg-black">
          <div className="w-full max-w-md h-full relative group">
            <video 
              src={activeLesson.videoUrl} 
              autoPlay 
              controls 
              className="w-full h-full object-cover"
              onEnded={() => setActiveLesson(null)}
            />
            <div className="absolute top-4 left-4 right-4 flex gap-1 z-20 pointer-events-none">
              <div className="h-[2px] flex-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-white/60 w-1/3" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#0A0A0B] overflow-y-auto p-8 md:p-20">
      <header className="mb-20">
        <h1 className="text-6xl font-extrabold tracking-tighter mb-4 premium-text">Academia</h1>
        <p className="text-[#86868B] text-xl max-w-lg leading-snug">Aulas semanais de 3 minutos sobre a arte do cinema vertical.</p>
      </header>

      <section>
        <div className="flex items-center gap-4 mb-10">
          <h2 className="text-sm font-bold tracking-[0.2em] text-[#86868B] uppercase">Lançamentos Semanais</h2>
          <div className="h-px flex-1 bg-white/5" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
          {lessons.map((lesson) => (
            <div 
              key={lesson.id} 
              className="group cursor-pointer"
              onClick={() => setActiveLesson(lesson)}
            >
              <div className="aspect-[9/16] rounded-[2.5rem] overflow-hidden bg-zinc-900 mb-8 relative transition-all duration-700 group-hover:scale-[0.98]">
                <img src={lesson.thumbnail} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-700" alt={lesson.title} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute inset-0 p-10 flex flex-col justify-end">
                  <div className="w-14 h-14 glass-card rounded-full flex items-center justify-center mb-6 transform scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-500">
                    <svg className="w-6 h-6 ml-1 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  </div>
                  <span className="text-[10px] font-black text-rose-500 tracking-widest uppercase mb-2">{lesson.category}</span>
                  <h3 className="text-2xl font-bold tracking-tight mb-4 text-white">{lesson.title}</h3>
                  <div className="flex items-center gap-3 text-[11px] font-semibold text-[#86868B]">
                    <span>{lesson.date}</span>
                    <span className="w-1 h-1 rounded-full bg-white/10" />
                    <span>3:00 MIN</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Discover;