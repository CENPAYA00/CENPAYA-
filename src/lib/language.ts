@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  -webkit-tap-highlight-color: transparent;
}

html, body {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  background-color: #F5F7F5;
  color: #1F2937;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overscroll-behavior: none;
}

h1 { font-size: 1.15rem; line-height: 1.3; }
h2 { font-size: 1rem; line-height: 1.3; }
h3 { font-size: 0.9rem; line-height: 1.3; }

/* Force all big Tailwind sizes down to Jumia/Facebook scale */
.text-4xl { font-size: 1.25rem !important; line-height: 1.3 !important; font-weight: 700 !important; }
.text-3xl { font-size: 1.1rem !important; line-height: 1.3 !important; font-weight: 700 !important; }
.text-2xl { font-size: 1rem !important; line-height: 1.3 !important; font-weight: 700 !important; }
.text-xl  { font-size: 0.9rem !important; line-height: 1.3 !important; font-weight: 600 !important; }
.text-lg  { font-size: 0.85rem !important; line-height: 1.3 !important; }

.text-sm  { font-size: 0.78rem !important; }
.text-xs  { font-size: 0.68rem !important; }

/* Tighter padding on cards and containers */
.p-6 { padding: 0.9rem !important; }
.p-5 { padding: 0.75rem !important; }
.p-4 { padding: 0.65rem !important; }
.p-3 { padding: 0.55rem !important; }
.px-4 { padding-left: 0.75rem !important; padding-right: 0.75rem !important; }
.py-3 { padding-top: 0.55rem !important; padding-bottom: 0.55rem !important; }

/* Slightly tighter rounded corners */
.rounded-3xl { border-radius: 1rem !important; }
.rounded-2xl { border-radius: 0.75rem !important; }

/* Smooth scroll for the whole app */
html {
  scroll-behavior: smooth;
}

/* Clean tabular numbers for balances */
.tabular-nums {
  font-variant-numeric: tabular-nums;
}

/* Fade-in animation used by many screens */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fadeIn 0.25s ease-out;
   }
