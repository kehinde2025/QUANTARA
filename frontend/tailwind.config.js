/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0a0a0a",
        charcoal: "#171717",
        gold: "#d4af37",
        champagne: "#f5e6b3",
        muted: "#a3a3a3",
        gain: "#10b981",
        loss: "#ef4444",
      },
    },
  },
  plugins: [],
};