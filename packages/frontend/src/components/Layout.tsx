import { useQuery } from '@tanstack/react-query';
import { Button, Segmented } from 'antd';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useNavigate } from 'react-router';

import { api, token } from '@/lib/api';

export default function Layout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: api.me });

  const logout = () => {
    token.set(null);
    navigate('/login');
  };

  const link = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-lg ${isActive ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="mx-auto max-w-4xl flex items-center gap-2 px-4 h-14">
          <span className="font-bold text-lg mr-4">TrainIQ</span>
          <NavLink to="/" end className={link}>{t('nav.plans')}</NavLink>
          <NavLink to="/progress" className={link}>{t('nav.progress')}</NavLink>
          <div className="ml-auto flex items-center gap-3">
            <Segmented size="small" value={i18n.language} options={['ru', 'en']} onChange={(l) => i18n.changeLanguage(l)} />
            <span className="hidden sm:inline text-gray-500">{me?.name}</span>
            <Button size="small" onClick={logout}>{t('nav.logout')}</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
