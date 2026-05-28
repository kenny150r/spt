/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Class-based dark mode: we toggle the `dark` class on <html> from
  // src/lib/theme.ts based on the user's stored pref (or
  // prefers-color-scheme when on "System").
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Slightly customized "blue" — the full Tailwind scale is included
        // so we can reach for any shade in dark mode (brand-300/400 read
        // better on dark backgrounds than the original 600/700).
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
