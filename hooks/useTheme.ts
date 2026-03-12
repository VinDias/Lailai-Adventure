
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
    localStorage.setItem("theme", theme);
  }, [theme]);

  return { theme, setTheme };
}
