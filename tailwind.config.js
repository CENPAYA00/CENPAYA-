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
          DEFAULT: '#2864f0', // The exact bright green from Claude
          dark: '#1748c7',    // Deep green
          deeper: '#0c245e',  // Almost black green
        },
        // Claude's Dark Mode Colors
        darkbg: '#081426', 
        darkcard: '#111d32',
        darkline: '#263955',
        
        // Claude's Light Mode Colors
        offwhite: '#f3f6fc',
        navy: '#101c32',
        ink: '#101c32',
        mute: '#6c7890',
        chip: '#eaf0ff',
        
        gold: '#f5a524',
        danger: '#e5484d',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'card': '22px', // Claude uses 22px for main cards
        'pill': '9999px',
      },
      boxShadow: {
        'soft': '0 2px 8px -2px rgba(0, 0, 0, 0.05)',
      }
    },
  },
  plugins: [],
}
