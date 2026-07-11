
import React, { useState } from 'react';
import { Play, Film, BookOpen, Heart, ChevronRight } from 'lucide-react';
import { useT } from '../contexts/I18nContext';
import type { TranslationKey } from '../i18n/translations';

const STORAGE_KEY = 'lorflux_onboarded';

export function hasSeenOnboarding(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return true; }
}

interface OnboardingProps {
  onFinish: () => void;
}

// Títulos HQCine/VCine/Hi-Qua são marcas — não são traduzidos.
const STEPS: { icon: React.ReactNode; title?: string; titleKey?: TranslationKey; textKey: TranslationKey }[] = [
  { icon: <Play size={40} />, title: 'HQCine', textKey: 'onboarding.hqcineText' },
  { icon: <Film size={40} />, title: 'VCine', textKey: 'onboarding.vcineText' },
  { icon: <BookOpen size={40} />, title: 'Hi-Qua', textKey: 'onboarding.hiquaText' },
  { icon: <Heart size={40} />, titleKey: 'onboarding.accountTitle', textKey: 'onboarding.accountText' },
];

const Onboarding: React.FC<OnboardingProps> = ({ onFinish }) => {
  const t = useT();
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  const finish = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* storage indisponível */ }
    onFinish();
  };

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-[4000] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-8 animate-apple">
      <div className="w-full max-w-sm text-center">
        <div className="w-24 h-24 mx-auto mb-8 rounded-[2rem] bg-rose-600/15 border border-rose-500/30 flex items-center justify-center text-rose-500">
          {current.icon}
        </div>

        <h2 className="text-3xl font-black text-white tracking-tighter mb-4 italic">
          {current.title ?? t(current.titleKey!)}
        </h2>
        <p className="text-zinc-400 text-sm leading-relaxed mb-10 min-h-[80px]">{t(current.textKey)}</p>

        {/* Indicador de progresso */}
        <div className="flex justify-center gap-2 mb-10">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-rose-500' : 'w-1.5 bg-white/20'}`} />
          ))}
        </div>

        <button
          onClick={() => (isLast ? finish() : setStep(s => s + 1))}
          className="w-full py-5 bg-rose-600 text-white font-black rounded-2xl hover:bg-rose-500 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-sm"
        >
          {isLast ? t('onboarding.start') : t('onboarding.next')}
          {!isLast && <ChevronRight size={18} />}
        </button>

        {!isLast && (
          <button onClick={finish} className="mt-4 text-zinc-600 hover:text-white font-bold text-xs uppercase tracking-widest transition-colors py-2">
            {t('onboarding.skip')}
          </button>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
