
import React, { useEffect, useState } from 'react';

interface AdComponentProps {
  onFinish: () => void;
}

const AdComponent: React.FC<AdComponentProps> = ({ onFinish }) => {
  const [timeLeft, setTimeLeft] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="absolute inset-0 z-[5000] bg-black flex flex-col items-center justify-center p-8 text-center animate-apple">
      <div className="w-full max-w-xs aspect-[9/16] bg-zinc-900 rounded-3xl overflow-hidden border border-white/10 mb-8 relative">
        <img src={`https://picsum.photos/seed/ad-${Date.now()}/1080/1920`} className="w-full h-full object-cover opacity-80" alt="Anúncio" />
        <div className="absolute top-6 left-6 px-3 py-1 bg-amber-500 text-black text-[9px] font-black rounded-sm tracking-widest">PATROCINADO</div>
      </div>
      
      <h3 className="text-xl font-black text-white mb-2 italic">Apoiando o Cinema Gratuito</h3>
      <p className="text-zinc-500 text-xs mb-8">Seu conteúdo começará em breve...</p>

      <button 
        onClick={timeLeft === 0 ? onFinish : undefined}
        className={`px-12 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${timeLeft === 0 ? 'bg-white text-black scale-105' : 'bg-white/5 text-white/20 border border-white/10 cursor-not-allowed'}`}
      >
        {timeLeft > 0 ? `Pular em ${timeLeft}s` : 'Pular Anúncio'}
      </button>
    </div>
  );
};

export default AdComponent;
