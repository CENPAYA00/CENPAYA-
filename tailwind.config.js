/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0F5132',
          light: '#1A7A4A',
          dark: '#0A3D25',
        },
        accent: {
          DEFAULT: '#10B981',
          light: '#34D399',
          dark: '#059669',
        },
        darkbg: '#0A0F0D',
        darkcard: '#131A17',
        darkline: '#1F2A25',
        offwhite: '#F5F7F5',
        success: '#22C55E',
        pending: '#F59E0B',
        navy: '#0F5132',
        gold: '#10B981',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'brand': '0 10px 30px -10px rgba(15, 81, 50, 0.3)',
        'accent': '0 10px 30px -10px rgba(16, 185, 129, 0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'pulse-ring': 'pulseRing 1.4s ease-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        pulseRing: {
          '0%':   { transform: 'scale(0.9)', opacity: 0.7 },
          '100%': { transform: 'scale(1.6)', opacity: 0 },
        },
      },
    },
  },
  plugins: [],
}
