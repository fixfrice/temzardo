import '@/index.css';
import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import ruRU from 'antd/locale/ru_RU';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router';

import Layout from '@/components/Layout';
import { token } from '@/lib/api';
import Login from '@/pages/Login';
import PlanDetail from '@/pages/PlanDetail';
import PlanEditor from '@/pages/PlanEditor';
import Plans from '@/pages/Plans';
import Progress from '@/pages/Progress';
import Workout from '@/pages/Workout';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: <Layout />,
    loader: () => (token.get() ? null : Response.redirect('/login')),
    children: [
      { index: true, element: <Plans /> },
      { path: 'plans/new', element: <PlanEditor /> },
      { path: 'plans/:id', element: <PlanDetail /> },
      { path: 'plans/:id/workout', element: <Workout /> },
      { path: 'progress', element: <Progress /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

function Root() {
  const { i18n } = useTranslation();
  return (
    <ConfigProvider locale={i18n.language === 'en' ? enUS : ruRU} theme={{ token: { colorPrimary: '#2f6bff', borderRadius: 10 } }}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
