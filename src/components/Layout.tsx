import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, Store, Wallet, Users, User } from 'lucide-react';

export default function Layout() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-offwhite pb-20">
      <header className="bg-gradient-to-r from-brand to-brand-dark text-white p-4 flex justify-between items-center sticky top-0 z-50 shadow-lg shadow-brand/20">
        <h1 className="text-xl font-black tracking-tight">CenPaya</h1>
        <button
          onClick={() => navigate('/settings')}
          className="bg-accent text-white text-xs font-bold px-3 py-1.5 rounded-full active:scale-95 transition-transform"
        >
          Subscribe
        </button>
      </header>

      <main className="p-4">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 w-full bg-white border-t border-gray-100 flex justify-around p-2 z-50 shadow-[0_-4px_20px_-4px_rgba(15,81,50,0.08)]">
        {[
          { path: '/home', icon: <Home size={20} />, label: 'Home' },
          { path: '/market', icon: <Store size={20} />, label: 'Market' },
          { path: '/wallet', icon: <Wallet size={20} />, label: 'Wallet' },
          { path: '/referrals', icon: <Users size={20} />, label: 'Referrals' },
          { path: '/profile', icon: <User size={20} />, label: 'Profile' },
        ].map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-col items-center p-2 rounded-xl transition-all ${
                isActive ? 'text-accent' : 'text-gray-400'
              }`
            }
          >
            {item.icon}
            <span className="text-xs mt-1 font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
        }
