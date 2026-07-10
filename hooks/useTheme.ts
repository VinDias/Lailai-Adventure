
import { useEffect, useState } from "react";

export default function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    (localStorage.getItem("theme") as 'light' | 'dark') || "dark"
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute("data-theme", theme);
    // Informa o esquema ao navegador — impede o dark mode forçado (Chrome
    // "auto-dark" / Samsung Internet) de reprocessar/inverter cores do site.
    root.style.colorScheme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  return { theme, setTheme };
}
