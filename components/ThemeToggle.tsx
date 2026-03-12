
import React from 'react';
import useTheme from "../hooks/useTheme";
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      className="flex flex-col items-center gap-1.5 transition-all duration-300 text-zinc-600 hover:text-zinc-400"
      aria-label="Alternar Tema"
    >
      {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      <span className="text-[10px] font-black uppercase tracking-widest">Tema</span>
    </button>
  );
}
