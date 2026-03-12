/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./*.{tsx,ts}",
    "./components/**/*.{tsx,ts}",
    "./services/**/*.{tsx,ts}",
    "./hooks/**/*.{tsx,ts}",
    "./config/**/*.{tsx,ts}",
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ['Inter', '-apple-system', 'sans-serif'],
      },
      colors: {
        lorflux: {
          accent: '#E11D48',
        }
      }
    },
  },
  plugins: [],
};

