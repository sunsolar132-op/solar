/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        'panel': '2.5rem',
        'pill-lg': '1.25rem',
      },
      colors: {
        primary: {
          DEFAULT: '#2563eb', // Blue-600
          hover: '#1d4ed8',
        },
        secondary: {
          DEFAULT: '#f59e0b', // Amber-500
          hover: '#d97706',
        },
      },
    },
  },
  plugins: [],
}
