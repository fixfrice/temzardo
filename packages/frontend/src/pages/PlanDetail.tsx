import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Popconfirm, Skeleton, Statistic, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { api, type ReportSet } from '@/lib/api';
import { fmtDuration, fmtReps, useExercises } from '@/lib/hooks';

const COLORS = { plan: '#cbd5e1', forecast: '#2f6bff', actual: '#16a34a' };

const repColor = (actual: number, planned: number) => (actual >= planned ? 'green' : actual >= planned - 1 ? 'orange' : 'red');

export default function PlanDetail() {
  const id = Number(useParams().id);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { name } = useExercises();

  const plan = useQuery({ queryKey: ['plan', id], queryFn: () => api.plan(id) });
  const report = useQuery({ queryKey: ['report', id], queryFn: () => api.report(id) });
  const forecast = useQuery({ queryKey: ['forecast', id], queryFn: () => api.forecast(id), enabled: report.data === null });

  const remove = useMutation({
    mutationFn: () => api.deletePlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      navigate('/', { replace: true });
    },
  });

  const error = plan.error ?? report.error ?? forecast.error;
  if (error) return <Alert type="error" title={error.message} />;
  const data = report.data ?? forecast.data;
  if (!plan.data || !data) return <Skeleton active />;

  const r = report.data;
  const totals = data.totals;
  const rows = data.sets as ReportSet[]; // forecast sets simply have no actual_* fields
  const setNo = new Map<number, number>();
  const chart = rows.map((s) => {
    const n = (setNo.get(s.exercise_id) ?? 0) + 1;
    setNo.set(s.exercise_id, n);
    return { label: `${name(s.exercise_id)} ${n}`, plan: s.planned_reps, forecast: s.predicted_reps, actual: s.actual_reps ?? undefined };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold m-0">{plan.data.title}</h2>
          <span className="text-gray-500">{dayjs(plan.data.scheduledFor).format('dddd, D MMMM HH:mm')}</span>
          {!data.personalized && <Tag className="ml-2">{t('plan.notPersonal')}</Tag>}
        </div>
        <div className="flex gap-2">
          {!r && <Link to={`/plans/${id}/workout`}><Button type="primary">{t('plan.start')}</Button></Link>}
          <Popconfirm title={t('plan.deleteConfirm')} onConfirm={() => remove.mutate()}>
            <Button danger>{t('plan.delete')}</Button>
          </Popconfirm>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card size="small"><Statistic title={t('plan.repsPlan')} value={totals.planned_reps} /></Card>
        <Card size="small"><Statistic title={t('plan.repsForecast')} value={fmtReps(totals.predicted_reps)} styles={{ content: { color: COLORS.forecast } }} /></Card>
        <Card size="small"><Statistic title={t('plan.timePlan')} value={fmtDuration(totals.planned_duration_sec)} /></Card>
        <Card size="small"><Statistic title={t('plan.timeForecast')} value={fmtDuration(totals.predicted_duration_sec)} styles={{ content: { color: COLORS.forecast } }} /></Card>
        {r && (
          <>
            <Card size="small"><Statistic title={t('plan.repsActual')} value={r.actual_reps} styles={{ content: { color: COLORS.actual } }} /></Card>
            <Card size="small"><Statistic title={t('plan.timeActual')} value={fmtDuration(r.actual_duration_sec)} styles={{ content: { color: COLORS.actual } }} /></Card>
            <Card size="small"><Statistic title={t('plan.completion')} value={Math.round(r.completion * 100)} suffix="%" /></Card>
            <Card size="small"><Statistic title={t('plan.volume')} value={r.actual_volume_kg} suffix={t('units.kg')} /></Card>
          </>
        )}
      </div>

      {r && (
        <Alert
          type={r.forecast_mae_reps <= r.plan_mae_reps ? 'success' : 'info'}
          title={t('plan.accuracy', { forecast: r.forecast_mae_reps, plan: r.plan_mae_reps })}
        />
      )}

      <Card size="small" title={t('plan.chart')}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chart}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={60} />
            <YAxis allowDecimals={false} width={30} />
            <Tooltip formatter={(v) => fmtReps(Number(v))} />
            <Legend />
            <Bar dataKey="plan" name={t('plan.legendPlan')} fill={COLORS.plan} radius={[4, 4, 0, 0]} />
            <Bar dataKey="forecast" name={t('plan.legendForecast')} fill={COLORS.forecast} radius={[4, 4, 0, 0]} />
            {r && <Bar dataKey="actual" name={t('plan.legendActual')} fill={COLORS.actual} radius={[4, 4, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Table<ReportSet>
        size="small"
        rowKey="planned_set_id"
        pagination={false}
        dataSource={rows}
        scroll={{ x: true }}
        columns={[
          { title: t('plan.exercise'), render: (_, __, i) => chart[i].label },
          { title: t('editor.weight'), dataIndex: 'weight_kg' },
          { title: t('plan.legendPlan'), dataIndex: 'planned_reps' },
          { title: t('plan.legendForecast'), dataIndex: 'predicted_reps', render: (v: number) => <span style={{ color: COLORS.forecast }}>{fmtReps(v)}</span> },
          ...(r ? [{
            title: t('plan.legendActual'), dataIndex: 'actual_reps',
            render: (v: number | null, s: ReportSet) => (v == null ? '—' : <Tag color={repColor(v, s.planned_reps)}>{v}</Tag>),
          }] : []),
          { title: t('plan.restPlan'), dataIndex: 'planned_rest_sec', render: fmtDuration },
          { title: r ? t('plan.restActual') : t('plan.restForecast'), render: (s: ReportSet) => {
            const v = r ? s.actual_rest_sec : s.predicted_rest_sec;
            return v ? fmtDuration(v) : '—';
          } },
        ]}
      />
    </div>
  );
}
