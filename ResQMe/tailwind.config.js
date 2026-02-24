/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./App.{js,jsx,ts,tsx}", "./screens/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        "primary": "#f48c25",
        "primary-light": "#ffb673",
        "accent-red": "#ef4444",
        "accent-red-light": "#fca5a5",
        "bg-base": "#eef0f5",
        "surface-light": "#eef0f5",
        "surface-white": "#ffffff",
        "text-main": "#374151",
        "text-sub": "#6b7280",
      },
      fontFamily: {
        "display": ["Manrope", "sans-serif"] // Note: Manrope needs to be loaded in RN
      },
    },
  },
  plugins: [],
}
