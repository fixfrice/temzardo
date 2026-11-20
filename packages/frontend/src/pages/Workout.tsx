import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, InputNumber, Progress, Skeleton, Statistic } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

import { api, type PerformedSetIn } from '@/lib/api';
import { fmtDuration, fmtReps, useExercises } from '@/lib/hooks';

type Phase = 'ready' | 'work' | 'rest';

function useTick(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

const beep = () => {
  navigator.vibrate?.(300);
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  osc.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.25);
};

/**
 * Guided session: ready → work → rest → work … Each transition is a timestamp,
 * which is how we measure real rest and set duration without asking the user.
 */
export default function Workout() {
  const id = Number(useParams().id);
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { name } = useExercises();
  const plan = useQuery({ queryKey: ['plan', id], queryFn: () => api.plan(id) });
  const forecast = useQuery({ queryKey: ['forecast', id], queryFn: () => api.forecast(id) });

  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [reps, setReps] = useState(0);
  const [weight, setWeight] = useState(0);
  const [done, setDone] = useState<PerformedSetIn[]>([]);
  const startedAt = useRef(new Date());
  const phaseAt = useRef(Date.now());
  const beeped = useRef(false);
  const now = useTick(phase !== 'ready');

  const sets = plan.data?.sets ?? [];
  const current = sets[i];
  useEffect(() => {
    if (current) {
      setReps(current.reps);
      setWeight(current.weightKg);
    }
  }, [current]);

  const elapsed = (now - phaseAt.current) / 1000;
  const plannedRest = sets[i - 1]?.restSec ?? 0;
  const restLeft = plannedRest - elapsed;
  useEffect(() => {
    if (phase === 'rest' && restLeft <= 0 && !beeped.current) {
      beeped.current = true;
      beep();
    }
  }, [phase, restLeft]);

  const finish = useMutation({
    mutationFn: (all: PerformedSetIn[]) =>
      api.logWorkout(id, { startedAt: startedAt.current.toISOString(), finishedAt: new Date().toISOString(), sets: all }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['report', id] });
      navigate(`/plans/${id}`, { replace: true });
    },
    onError: (e) => message.error(e.message),
  });

  if (!current || !forecast.data) return <Skeleton active />;
  const predicted = forecast.data.sets[i]?.predicted_reps;
  const isLast = i === sets.length - 1;

  const startSet = () => {
    if (phase === 'rest') {
      setDone((d) => d.with(-1, { ...d.at(-1)!, restSec: Math.round(elapsed) }));
    } else if (!done.length) {
      startedAt.current = new Date();
    }
    phaseAt.current = Date.now();
    setPhase('work');
  };

  const completeSet = () => {
    const set: PerformedSetIn = {
      plannedSetId: current.id, exerciseId: current.exerciseId, reps, weightKg: weight,
      restSec: null, durationSec: Math.round(elapsed),
    };
    if (isLast) return finish.mutate([...done, set]);
    setDone([...done, set]);
    setI(i + 1);
    phaseAt.current = Date.now();
    beeped.current = false;
    setPhase('rest');
  };

  return (
    <div className="flex flex-col gap-4 max-w-md mx-auto">
      <Progress percent={Math.round((done.length / sets.length) * 100)} format={() => `${i + 1} / ${sets.length}`} />

      {phase === 'rest' && (
        <Card className="text-center">
          <div className="text-gray-500">{t('workout.rest')}</div>
          <div className={`text-6xl font-bold tabular-nums ${restLeft < 0 ? 'text-amber-600' : ''}`}>
            {restLeft < 0 && '+'}{fmtDuration(Math.abs(restLeft))}
          </div>
          <div className="text-gray-500">
            {restLeft < 0 ? t('workout.overtime') : t('workout.restPlan', { time: fmtDuration(plannedRest) })}
          </div>
        </Card>
      )}

      <Card title={name(current.exerciseId)}>
        <div className="grid grid-cols-3 gap-2">
          <Statistic title={t('editor.weight')} value={current.weightKg} suffix={t('units.kg')} />
          <Statistic title={t('plan.legendPlan')} value={current.reps} />
          <Statistic title={t('plan.legendForecast')} value={predicted != null ? fmtReps(predicted) : '—'} styles={{ content: { color: '#2f6bff' } }} />
        </div>
      </Card>

      {phase === 'work' ? (
        <Card title={`${t('workout.howMany')} · ${fmtDuration(elapsed)}`}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div><div className="text-gray-500 mb-1">{t('editor.reps')}</div><InputNumber size="large" min={0} value={reps} onChange={(v) => setReps(v ?? 0)} className="w-full" /></div>
            <div><div className="text-gray-500 mb-1">{t('editor.weight')}</div><InputNumber size="large" min={0} step={2.5} value={weight} onChange={(v) => setWeight(v ?? 0)} className="w-full" /></div>
          </div>
          <Button type="primary" size="large" block loading={finish.isPending} onClick={completeSet}>
            {isLast ? t('workout.finish') : t('workout.setDone')}
          </Button>
        </Card>
      ) : (
        <Button type="primary" size="large" block onClick={startSet}>{t('workout.startSet')}</Button>
      )}
    </div>
  );
}
