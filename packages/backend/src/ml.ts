import { QueryTypes } from 'sequelize';

import { HttpError } from './http';
import { Plan, sequelize } from './db';

const ML_URL = process.env.ML_URL ?? 'http://localhost:8001';

export type SetRow = {
  user_id: number;
  session_id: number;
  exercise_id: number;
  performed_at: string;
  position: number;
  weight_kg: number;
  reps: number;
  planned_reps: number | null;
  planned_rest_sec: number | null;
  rest_sec: number | null;
  duration_sec: number | null;
};

export type SetForecast = {
  planned_set_id: number;
  exercise_id: number;
  weight_kg: number;
  planned_reps: number;
  predicted_reps: number;
  planned_rest_sec: number;
  predicted_rest_sec: number;
};

export type Forecast = {
  personalized: boolean;
  sets: SetForecast[];
  totals: Record<string, number>;
};

/** Everything the model needs, in the ML service's wire format. One query, no N+1. */
export function history(opts: { userId?: number; before?: Date } = {}) {
  return sequelize.query<SetRow>(
    `SELECT w.user_id, w.id AS session_id, ps.exercise_id, w.started_at AS performed_at, ps.position,
            ps.weight_kg, ps.reps, pl.reps AS planned_reps, pl.rest_sec AS planned_rest_sec,
            ps.rest_sec, ps.duration_sec
       FROM performed_sets ps
       JOIN workouts w ON w.id = ps.workout_id
  LEFT JOIN planned_sets pl ON pl.id = ps.planned_set_id
      WHERE (:userId::int IS NULL OR w.user_id = :userId)
        AND (:before::timestamptz IS NULL OR w.started_at < :before)
   ORDER BY w.started_at, ps.position`,
    { type: QueryTypes.SELECT, replacements: { userId: opts.userId ?? null, before: opts.before ?? null } },
  );
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(ML_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {
    throw new HttpError(503, 'ML service unavailable');
  });
  if (!res.ok) throw new HttpError(res.status === 400 ? 400 : 502, `ML: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function forecast(plan: Plan, before?: Date) {
  return call<Forecast>('/forecast', {
    user_id: plan.userId,
    at: plan.scheduledFor,
    history: await history({ userId: plan.userId, before: before ?? plan.scheduledFor }),
    plan: plan.sets!.map((s) => ({
      planned_set_id: s.id, exercise_id: s.exerciseId, position: s.position,
      weight_kg: s.weightKg, planned_reps: s.reps, planned_rest_sec: s.restSec,
    })),
  });
}

export async function recommend(userId: number, q: { exercise_id: number; sets: number; reps: number; rest_sec: number; at: Date }) {
  return call('/recommend', { user_id: userId, ...q, history: await history({ userId }) });
}

export async function train(synthetic: boolean) {
  return call('/train', { history: await history(), synthetic });
}
