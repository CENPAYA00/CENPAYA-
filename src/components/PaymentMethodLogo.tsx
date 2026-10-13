type Method = 'mtn_momo' | 'orange_money' | 'airtel_money' | 'moov_money';

export function PaymentMethodLogo({ method, size = 40 }: { method: Method; size?: number }) {
  const logos: Record<Method, JSX.Element> = {
    mtn_momo: (
      <svg viewBox="0 0 120 120" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <rect width="120" height="120" rx="12" fill="#FFCC00" />
        <ellipse cx="60" cy="60" rx="42" ry="24" fill="none" stroke="#000000" strokeWidth="3" />
        <ellipse cx="60" cy="60" rx="42" ry="14" fill="none" stroke="#000000" strokeWidth="3" />
        <text x="60" y="70" textAnchor="middle" fontSize="26" fontWeight="900" fill="#000000" fontFamily="Arial, sans-serif">MTN</text>
      </svg>
    ),
    orange_money: (
      <svg viewBox="0 0 120 120" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <rect width="120" height="120" rx="12" fill="#FFFFFF" />
        <rect x="24" y="24" width="72" height="72" fill="#FF7900" />
        <text x="60" y="80" textAnchor="middle" fontSize="20" fontWeight="700" fill="#FFFFFF" fontFamily="Arial, sans-serif">orange</text>
        <text x="96" y="30" textAnchor="end" fontSize="6" fill="#FF7900" fontFamily="Arial, sans-serif">™</text>
      </svg>
    ),
    airtel_money: (
      <svg viewBox="0 0 120 120" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <rect width="120" height="120" rx="12" fill="#E40000" />
        <path d="M60 34 C 42 42, 34 56, 42 70 C 48 78, 60 76, 60 68 C 60 62, 52 60, 50 54 C 48 48, 54 42, 60 40 C 66 42, 72 48, 70 54 C 68 60, 60 62, 60 68 C 60 76, 72 78, 78 70 C 86 56, 78 42, 60 34 Z" fill="#FFFFFF" />
        <text x="60" y="100" textAnchor="middle" fontSize="22" fontWeight="700" fill="#FFFFFF" fontFamily="Arial, sans-serif">airtel</text>
      </svg>
    ),
    moov_money: (
      <svg viewBox="0 0 120 120" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <rect width="120" height="120" rx="12" fill="#005CA9" />
        <text x="46" y="52" textAnchor="middle" fontSize="15" fontWeight="900" fill="#FFFFFF" fontFamily="Arial, sans-serif">Moov</text>
        <text x="46" y="70" textAnchor="middle" fontSize="13" fontWeight="700" fill="#FFFFFF" fontFamily="Arial, sans-serif">Africa</text>
        <path d="M74 44 C 92 46, 102 60, 96 78 C 92 68, 82 58, 72 54 Z" fill="#F39200" />
      </svg>
    ),
  };
  return logos[method];
}

export const METHOD_LABELS: Record<Method, string> = {
  mtn_momo: 'MTN Mobile Money',
  orange_money: 'Orange Money',
  airtel_money: 'Airtel Money',
  moov_money: 'Moov Money',
};
