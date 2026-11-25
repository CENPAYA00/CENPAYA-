import { Navigate } from 'react-router-dom';

export default function ReferralWithdraw() {
  return <Navigate to="/withdraw?source=referral" replace />;
}
