import { PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Button, Card, Empty, Skeleton, Tag } from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { api } from '@/lib/api';
import { groupByExercise, useExercises } from '@/lib/hooks';

export default function Plans() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { name } = useExercises();
  const { data: plans, isLoading } = useQuery({ queryKey: ['plans'], queryFn: api.plans });

  const train = useMutation({
    mutationFn: api.train,
    onSuccess: (r) => message.success(t('plans.trained', { rows: r.rows, mine: r.real_rows })),
    onError: (e) => message.error(e.message),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Link to="/plans/new"><Button type="primary" icon={<PlusOutlined />}>{t('plans.new')}</Button></Link>
        <Button icon={<ThunderboltOutlined />} loading={train.isPending} onClick={() => train.mutate()}>
          {t('plans.retrain')}
        </Button>
      </div>

      {isLoading && <Skeleton active />}
      {plans?.length === 0 && <Empty description={t('plans.empty')} />}

      {plans?.map((p) => (
        <Link key={p.id} to={`/plans/${p.id}`}>
          <Card hoverable size="small">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{p.title}</span>
              <span className="flex items-center gap-2 text-gray-500">
                {p.done && <Tag color="green">{t('plans.done')}</Tag>}
                {dayjs(p.scheduledFor).format('dd, D MMM HH:mm')}
              </span>
            </div>
            <div className="text-gray-500 text-sm mt-1">
              {groupByExercise(p.sets, (s) => s.exerciseId)
                .map((g) => `${name(g.exerciseId)} ${g.sets.length}×${g.sets[0].reps}`)
                .join(' · ')}
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
