/** @type {import('tailwindcss').Config} */
module.exports = {
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
        loreflux: {
          accent: '#E11D48',
        }
      }
    },
  },
  plugins: [],
};

