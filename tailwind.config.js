/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
      colors: {
        volt: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          900: '#14532d',
        },
        court: {
          900: '#0a0f0d',
          800: '#111a14',
          700: '#182218',
          600: '#1e2b1f',
          500: '#263028',
          400: '#3a4a3c',
          300: '#6b7c6e',
          200: '#a8b8aa',
          100: '#d4ddd5',
        }
      }
    },
  },
  plugins: [],
}
