import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, Segmented } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { api, token } from '@/lib/api';

type Values = { email: string; password: string; name: string };

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const submit = useMutation({
    mutationFn: (v: Values) => (mode === 'login' ? api.login(v) : api.register(v)),
    onSuccess: (r) => {
      token.set(r.token);
      navigate('/');
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm" title={<span className="text-xl">TrainIQ</span>}>
        <p className="text-gray-500 mb-4">{t('login.tagline')}</p>
        <Segmented
          block
          className="mb-4"
          value={mode}
          onChange={setMode}
          options={[{ value: 'login', label: t('login.signIn') }, { value: 'register', label: t('login.signUp') }]}
        />
        <Form<Values> layout="vertical" onFinish={submit.mutate} requiredMark={false}>
          {mode === 'register' && (
            <Form.Item name="name" label={t('login.name')} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          )}
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input autoComplete="email" />
          </Form.Item>
          <Form.Item name="password" label={t('login.password')} rules={[{ required: true, min: 6 }]}>
            <Input.Password autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </Form.Item>
          {submit.error && <Alert className="mb-4" type="error" title={submit.error.message} />}
          <Button type="primary" htmlType="submit" block loading={submit.isPending}>
            {mode === 'login' ? t('login.signIn') : t('login.signUp')}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
