/* src/components/PaymentMethodLogo.tsx */
type Method = 'mtn_momo' | 'orange_money' | 'airtel_money' | 'moov_money';

export function PaymentMethodLogo({ method, size = 40 }: { method: Method; size?: number }) {
  const logos: Record<Method, React.ReactNode> = {
    mtn_momo: (
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="MTN Mobile Money" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="mtn-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE36A"/><stop offset="1" stopColor="#FFC400"/></linearGradient></defs>
        <rect x="3" y="3" width="114" height="114" rx="25" fill="url(#mtn-bg)"/>
        <path d="M18 40Q18 25 34 25H86Q102 25 102 40V72Q102 87 86 87H54L34 101V87Q18 87 18 72Z" fill="#111111"/>
        <text x="60" y="66" textAnchor="middle" fontSize="29" fontWeight="900" letterSpacing="-2" fill="#FFD000" fontFamily="Arial, sans-serif">MTN</text>
        <path d="M31 96H89" stroke="#111111" strokeWidth="4" strokeLinecap="round" opacity=".22"/>
      </svg>
    ),
    orange_money: (
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="Orange Money" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="114" height="114" rx="25" fill="#FFFFFF" stroke="#E8E8E8" strokeWidth="2"/>
        <rect x="17" y="17" width="86" height="86" rx="12" fill="#FF7900"/>
        <text x="60" y="57" textAnchor="middle" fontSize="21" fontWeight="800" letterSpacing="-1.2" fill="#FFFFFF" fontFamily="Arial, sans-serif">orange</text>
        <path d="M31 68H89" stroke="#FFFFFF" strokeWidth="1.5" opacity=".65"/>
        <text x="60" y="84" textAnchor="middle" fontSize="13" fontWeight="700" letterSpacing="2" fill="#FFFFFF" fontFamily="Arial, sans-serif">MONEY</text>
      </svg>
    ),
    airtel_money: (
      <svg viewBox="0 0 120 120" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="114" height="114" rx="25" fill="#E40000"/>
        <path d="M60 18C42 39 32 55 39 72C44 85 56 89 66 83C82 74 85 56 75 39C71 31 65 24 60 18Z" fill="#FFFFFF"/>
        <path d="M56 49C48 61 49 69 58 73C64 75 69 70 68 64" fill="none" stroke="#E40000" strokeWidth="5" strokeLinecap="round"/>
        <text x="60" y="103" textAnchor="middle" fontSize="17" fontWeight="800" fill="#FFFFFF" fontFamily="Arial, sans-serif">airtel</text>
      </svg>
    ),
    moov_money: (
      <svg viewBox="0 0 120 120" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="114" height="114" rx="25" fill="#005CA9"/>
        <text x="54" y="55" textAnchor="middle" fontSize="22" fontWeight="900" fill="#FFFFFF" fontFamily="Arial, sans-serif">Moov</text>
        <text x="54" y="75" textAnchor="middle" fontSize="13" fontWeight="700" letterSpacing="1" fill="#FFFFFF" fontFamily="Arial, sans-serif">MONEY</text>
        <path d="M91 27C106 44 106 76 87 91C94 69 94 48 91 27Z" fill="#F39200"/>
      </svg>
    ),
  };
  return <div className="inline-flex items-center justify-center overflow-hidden rounded-xl shadow-sm">{logos[method]}</div>;
}

export const METHOD_LABELS: Record<Method, string> = {
  mtn_momo: 'MTN Mobile Money',
  orange_money: 'Orange Money',
  airtel_money: 'Airtel Money',
  moov_money: 'Moov Money',
};
