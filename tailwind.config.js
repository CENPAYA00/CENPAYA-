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
          DEFAULT: '#12935a', // The exact bright green from Claude
          dark: '#0a3d2b',    // Deep green
          deeper: '#06281c',  // Almost black green
        },
        // Claude's Dark Mode Colors
        darkbg: '#0d1511', 
        darkcard: '#17211c',
        darkline: '#26332c',
        
        // Claude's Light Mode Colors
        offwhite: '#eef2f0',
        navy: '#16221c',
        ink: '#16221c',
        mute: '#7a8a82',
        chip: '#eaf6ef',
        
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
