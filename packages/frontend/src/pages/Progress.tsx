import { useQuery } from '@tanstack/react-query';
import { Card, Empty, Select, Skeleton, Statistic } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { api } from '@/lib/api';
import { useExercises } from '@/lib/hooks';

const TARGET = { sets: 3, reps: 5, rest_sec: 180 };

export default function Progress() {
  const { t } = useTranslation();
  const { exercises, label } = useExercises();
  const [picked, setPicked] = useState<number>();
  const exerciseId = picked ?? exercises[0]?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['recommend', exerciseId],
    queryFn: () => api.recommend(exerciseId!, TARGET),
    enabled: exerciseId != null,
  });

  const points = data?.trend.map((p) => ({ date: dayjs(p.performed_at).format('D MMM'), e1rm: p.e1rm })) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Select
        className="w-64"
        value={exerciseId}
        onChange={setPicked}
        options={exercises.map((e) => ({ value: e.id, label: label(e) }))}
      />
      {isLoading && <Skeleton active />}
      {data && !points.length && <Empty description={t('progress.empty')} />}
      {data && points.length > 0 && (
        <>
          <Card size="small" title={t('progress.e1rm')}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={points}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={['dataMin - 5', 'dataMax + 5']} width={40} tickFormatter={(v: number) => String(Math.round(v))} />
                <Tooltip />
                <Line type="monotone" dataKey="e1rm" name="e1RM" stroke="#2f6bff" strokeWidth={2} dot />
                {data.projected_e1rm != null && (
                  <ReferenceLine y={data.projected_e1rm} stroke="#2f6bff" strokeDasharray="6 4" label={{ value: t('progress.projected'), position: 'insideTopLeft', fontSize: 11 }} />
                )}
              </LineChart>
            </ResponsiveContainer>
            <p className="text-gray-500 text-sm m-0">{t('progress.explain')}</p>
          </Card>
          <div className="grid sm:grid-cols-2 gap-3">
            <Card size="small"><Statistic title={t('progress.next', TARGET)} value={data.weight_kg ?? '—'} suffix={t('units.kg')} /></Card>
            <Card size="small">
              <Statistic title={t('progress.expected')} value={data.predicted_reps.map((r) => r.toFixed(1)).join(' / ')} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
