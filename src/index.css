@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  -webkit-tap-highlight-color: transparent;
  box-sizing: border-box;
}

html, body {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 14px;
  background-color: #eef2f0; /* offwhite */
  color: #16221c; /* ink */
  -webkit-font-smoothing: antialiased;
  overscroll-behavior: none;
  margin: 0;
}

/* ---------- Dark mode ---------- */
html.dark body {
  background-color: #0d1511; /* darkbg */
  color: #e8f0ec;
}

/* Cards and Containers */
html.dark .bg-white { background-color: #17211c !important; } /* darkcard */
html.dark .bg-offwhite { background-color: #0d1511 !important; }
html.dark .bg-gray-50 { background-color: #17211c !important; }
html.dark .bg-gray-100 { background-color: #26332c !important; }

html.dark .dark\:bg-darkcard { background-color: #17211c !important; }
html.dark .dark\:bg-darkbg { background-color: #0d1511 !important; }
html.dark .dark\:bg-darkline { background-color: #26332c !important; }

/* Text */
html.dark .text-navy,
html.dark .text-gray-900 { color: #e8f0ec !important; }
html.dark .text-gray-800 { color: #e8f0ec !important; }
html.dark .text-gray-700,
html.dark .text-gray-600,
html.dark .text-gray-500 { color: #8fa399 !important; } /* mute */

/* Borders */
html.dark .border-gray-100,
html.dark .border-gray-200 { border-color: #26332c !important; } /* line */

/* Inputs */
html.dark input,
html.dark textarea {
  background-color: #0d1511 !important;
  color: #e8f0ec !important;
  border-color: #26332c !important;
}
html.dark textarea.bg-transparent { background-color: transparent !important; }

/* Keep inline colors for posts */
html.dark [data-inline-bg] {
  background-color: var(--inline-bg, transparent) !important;
  background-image: var(--inline-bg-image, none) !important;
  color: var(--inline-fg, inherit) !important;
}

/* Animations from Claude */
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
.animate-slide-up { animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1); }

.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
/* ---------- Light Mode Contrast Fixes ---------- */
html:not(.dark) .text-white {
  /* If a button has text-white but no background color in light mode, make it dark */
  color: #16221c !important; 
}

/* Exception: Keep text white if it's inside a button with a solid brand/dark background */
html:not(.dark) .bg-brand .text-white,
html:not(.dark) .bg-brand-deeper .text-white,
html:not(.dark) .bg-black .text-white,
html:not(.dark) button.bg-brand {
  color: #ffffff !important;
}

/* Fix for the "Sell" and "Hide demo" buttons that use text-mute */
html:not(.dark) .text-mute {
  color: #16221c !important;
  font-weight: 600;
                             }
