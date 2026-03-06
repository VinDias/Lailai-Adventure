/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ['Inter', '-apple-system', 'sans-serif'],
      },
      colors: {
        loreflux: {
          accent: '#E11D48',
        }
      }
    },
  },
  plugins: [],
};

