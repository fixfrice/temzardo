import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { api, type Exercise } from './api';

export function useExercises() {
  const { t } = useTranslation();
  const { data = [] } = useQuery({ queryKey: ['exercises'], queryFn: api.exercises, staleTime: Infinity });
  const label = (e?: Exercise) => (e ? (e.key ? t(`exercise.${e.key}`, e.name) : e.name) : '—');
  const byId = new Map(data.map((e) => [e.id, e]));
  return { exercises: data, label, name: (id: number) => label(byId.get(id)) };
}

export const fmtDuration = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
};

export const fmtReps = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Consecutive sets of the same exercise, for compact display. */
export function groupByExercise<T>(sets: T[], exerciseOf: (s: T) => number) {
  return sets.reduce<{ exerciseId: number; sets: T[] }[]>((acc, s) => {
    const last = acc.at(-1);
    if (last?.exerciseId === exerciseOf(s)) last.sets.push(s);
    else acc.push({ exerciseId: exerciseOf(s), sets: [s] });
    return acc;
  }, []);
}
