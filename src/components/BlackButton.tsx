import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function BackButton({ fallback = -1 }: { fallback?: number | string }) {
  const navigate = useNavigate();
  const onClick = () => {
    if (typeof fallback === 'string') navigate(fallback);
    else navigate(fallback);
  };
  return (
    <button onClick={onClick} className="text-brand cursor-pointer" aria-label="Go back">
      <ArrowLeft size={18} />
    </button>
  );
    }
