/* src/components/PaymentMethodLogo.tsx */

type Method = 'mtn_momo' | 'orange_money' | 'airtel_money' | 'moov_money';

export function PaymentMethodLogo({ method, size = 40 }: { method: Method; size?: number }) {
  const logos: Record<Method, React.ReactNode> = {
    mtn_momo: (
      <svg viewBox="0 0 120 120" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <rect width="120" height="120" rx="16" fill="#FFCC00" />
        <path d="M60 25C40 25 25 40 25 60C25 80 40 95 60 95C80 95 95 80 95 60C95 40 80 25 60 25ZM60 85C46 85 35 74 35 60C35 46 46 35 60 35C74 35 85 46 85 60C85 74 74 85 60 85Z" fill="#000000"/>
        <text x="60" y="68" textAnchor="middle" fontSize="22" fontWeight="900" fill="#000000" fontFamily="sans-serif">MTN</text>
      </svg>
    ),
    orange_money: (
      <svg viewBox="0 0 120 120" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <rect width="120" height="120" rx="16" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="2" />
        <rect x="25" y="25" width="70" height="70" fill="#FF7900" />
        <text x="60" y="75" textAnchor="middle" fontSize="18" fontWeight="700" fill="#FFFFFF" fontFamily="sans-serif">orange</text>
        <text x="90" y="35" textAnchor="end" fontSize="8" fill="#FF7900" fontFamily="sans-serif">™</text>
      </svg>
    ),
    airtel_money: (
      <svg viewBox="0 0 120 120" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <rect width="120" height="120" rx="16" fill="#E40000" />
        <path d="M60 30 C 45 35, 30 50, 40 70 C 50 85, 60 80, 60 70 C 60 60, 45 55, 45 45 C 45 35, 55 30, 60 30 Z" fill="#FFFFFF" />
        <path d="M60 30 C 75 35, 90 50, 80 70 C 70 85, 60 80, 60 70 C 60 60, 75 55, 75 45 C 75 35, 65 30, 60 30 Z" fill="#FFFFFF" opacity="0.8"/>
        <text x="60" y="100" textAnchor="middle" fontSize="20" fontWeight="700" fill="#FFFFFF" fontFamily="sans-serif">airtel</text>
      </svg>
    ),
    moov_money: (
      <svg viewBox="0 0 120 120" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <rect width="120" height="120" rx="16" fill="#005CA9" />
        <text x="50" y="58" textAnchor="middle" fontSize="16" fontWeight="900" fill="#FFFFFF" fontFamily="sans-serif">Moov</text>
        <text x="50" y="76" textAnchor="middle" fontSize="14" fontWeight="700" fill="#FFFFFF" fontFamily="sans-serif">Africa</text>
        <path d="M85 35 C 105 45, 105 75, 85 85 C 90 70, 90 50, 85 35 Z" fill="#F39200" />
      </svg>
    ),
  };

  return (
    <div className="inline-flex items-center justify-center overflow-hidden rounded-xl shadow-sm">
      {logos[method]}
    </div>
  );
}

export const METHOD_LABELS: Record<Method, string> = {
  mtn_momo: 'MTN Mobile Money',
  orange_money: 'Orange Money',
  airtel_money: 'Airtel Money',
  moov_money: 'Moov Money',
};
