export type Background = {
  id: string;
  label: string;
  bgClass: string;
  textClass: string;
  image?: string;
};

export const BACKGROUNDS: Background[] = [
  { id: 'default',  label: 'White',        bgClass: 'bg-white',     textClass: 'text-gray-900' },
  { id: 'pink',     label: 'Vibrant Pink', bgClass: 'bg-[#E40046]', textClass: 'text-white'    },
  { id: 'charcoal', label: 'Deep Black',   bgClass: 'bg-[#1C1E21]', textClass: 'text-white'    },
  { id: 'blue',     label: 'Classic Blue', bgClass: 'bg-[#1877F2]', textClass: 'text-white'    },
  { id: 'maroon',   label: 'Maroon',       bgClass: 'bg-[#6B1426]', textClass: 'text-white'    },
  { id: 'purple-magenta', label: 'Purple to Magenta',
    bgClass: 'bg-gradient-to-br from-[#7F00FF] to-[#E100FF]', textClass: 'text-white' },
  { id: 'sunset',  label: 'Sunset Pink to Yellow',
    bgClass: 'bg-gradient-to-tr from-[#FF416C] to-[#FF4B2B]', textClass: 'text-white' },
  { id: 'cyan-blue', label: 'Cyan to Blue',
    bgClass: 'bg-gradient-to-b from-[#00B4DB] to-[#0083B0]', textClass: 'text-white' },
];

export function getBackground(id: string | null | undefined): Background {
  if (!id) return BACKGROUNDS[0];
  return BACKGROUNDS.find(b => b.id === id) || BACKGROUNDS[0];
}

export function backgroundStyle(bg: Background): React.CSSProperties {
  if (!bg.image) return {};
  return {
    backgroundImage: `url(${bg.image})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
  }
