/* Brand-led payment method marks. Keep the marks crisp at small mobile sizes. */
type Method = 'mtn_momo' | 'orange_money' | 'airtel_money' | 'moov_money';

export function PaymentMethodLogo({ method, size = 40 }: { method: Method; size?: number }) {
  const marks: Record<Method, React.ReactNode> = {
    mtn_momo: (
      <svg viewBox="0 0 120 76" width={size * 1.42} height={size} role="img" aria-label="MTN Mobile Money">
        <rect x="2" y="4" width="116" height="68" rx="25" fill="#FFCC00" />
        <path d="M82 61 L105 61 L93 73 Z" fill="#FFCC00" />
        <text x="60" y="51" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="43" fontWeight="900" letterSpacing="-3" fill="#111111">MTN</text>
      </svg>
    ),
    orange_money: (
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Orange Money">
        <rect width="100" height="100" rx="17" fill="#FF7900" />
        <text x="50" y="57" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="19" fontWeight="700" letterSpacing="-1.1" fill="#FFFFFF">orange</text>
        <text x="82" y="37" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="7" fontWeight="700" fill="#FFFFFF">®</text>
      </svg>
    ),
    airtel_money: (
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Airtel Money">
        <rect width="100" height="100" rx="17" fill="#E40000" />
        <path d="M48 19 C35 34 29 43 34 54 C38 64 49 67 56 58 C62 50 56 40 50 34 C51 45 44 47 43 41 C41 34 46 26 48 19Z" fill="#FFFFFF"/>
        <text x="50" y="82" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="15" fontWeight="800" fill="#FFFFFF">airtel</text>
      </svg>
    ),
    moov_money: (
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Moov Money">
        <rect width="100" height="100" rx="17" fill="#005CA9" />
        <text x="43" y="51" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="18" fontWeight="900" fill="#FFFFFF">moov</text>
        <text x="43" y="68" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="9" fontWeight="700" letterSpacing="1.4" fill="#FFFFFF">AFRICA</text>
        <path d="M75 23 C91 36 91 62 75 77 C81 59 81 41 75 23Z" fill="#F39200"/>
      </svg>
    ),
  };
  return <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl" style={{ width: method === 'mtn_momo' ? size * 1.42 : size, height: size }}>{marks[method]}</span>;
}

export const METHOD_LABELS: Record<Method, string> = {
  mtn_momo: 'MTN Mobile Money',
  orange_money: 'Orange Money',
  airtel_money: 'Airtel Money',
  moov_money: 'Moov Money',
};
