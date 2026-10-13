type Method = 'mtn_momo' | 'orange_money' | 'airtel_money' | 'moov_money';

export function PaymentMethodLogo({ method, size = 32 }: { method: Method; size?: number }) {
  const logos: Record<Method, JSX.Element> = {
    mtn_momo: (
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <rect width="40" height="40" rx="6" fill="#FFCC00" />
        <text x="20" y="27" textAnchor="middle" fontSize="16" fontWeight="900" fill="#000">MTN</text>
      </svg>
    ),
    orange_money: (
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <rect width="40" height="40" rx="6" fill="#FF7900" />
        <rect x="6" y="14" width="28" height="12" fill="#000" />
        <text x="20" y="24" textAnchor="middle" fontSize="9" fontWeight="900" fill="#FFF">orange</text>
      </svg>
    ),
    airtel_money: (
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <rect width="40" height="40" rx="6" fill="#E40000" />
        <text x="20" y="27" textAnchor="middle" fontSize="14" fontWeight="900" fill="#FFF">airtel</text>
      </svg>
    ),
    moov_money: (
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <rect width="40" height="40" rx="6" fill="#0055A4" />
        <text x="20" y="27" textAnchor="middle" fontSize="14" fontWeight="900" fill="#FFF">moov</text>
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
