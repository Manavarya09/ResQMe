/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx}', './src/**/*.{js,jsx}'],
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
        'surface-white': '#ffffff',
        'text-main': '#374151',
        'text-sub': '#6b7280',
        ok: '#16a34a',
      },
    },
  },
  plugins: [],
};
