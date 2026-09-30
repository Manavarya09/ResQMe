/** @type {import('tailwindcss').Config} */
// Original ResQMe palette (soft neumorphic, orange accent). Semantic aliases (stone, ink, signal…)
// map onto the same palette so every screen stays visually consistent.
module.exports = {
  content: ['./App.{js,jsx}', './Navigation.js', './src/**/*.{js,jsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#f48c25',
        'primary-light': '#ffb673',
        'primary-dark': '#d9730f',
        'accent-red': '#ef4444',
        'accent-red-light': '#fca5a5',
        'bg-base': '#eef0f5',
        'surface-light': '#eef0f5',
        'surface-white': '#ffffff',
        'text-main': '#374151',
        'text-sub': '#6b7280',
        ok: { DEFAULT: '#16a34a', soft: '#dcfce7' },
        // semantic aliases
        stone: { DEFAULT: '#eef0f5', deep: '#e4e8ef', light: '#f7f8fb' },
        ink: { DEFAULT: '#1e293b', 2: '#475569', 3: '#94a3b8' },
        line: '#e2e8f0',
        signal: { DEFAULT: '#f48c25', dark: '#d9730f', soft: '#fff1e3' },
        sos: { DEFAULT: '#ef4444', dark: '#dc2626', soft: '#fee2e2' },
        info: { DEFAULT: '#3b82f6', soft: '#dbeafe' },
        warn: { DEFAULT: '#ca8a04', soft: '#fef3c7' },
      },
      fontFamily: {
        display: ['display'],
        mono: ['mono'],
        body: ['body'],
      },
    },
  },
  plugins: [],
};
