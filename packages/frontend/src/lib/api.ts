const TOKEN_KEY = 'trainiq.token';

export const token = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)),
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token.get() && { Authorization: `Bearer ${token.get()}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && token.get()) {
    token.set(null);
    location.assign('/login');
  }
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.error ?? res.statusText);
  return res.status === 204 ? (undefined as T) : res.json();
}

export type User = { id: number; email: string; name: string };
export type Exercise = { id: number; key: string | null; name: string; bodyweight: boolean; userId: number | null };
export type PlannedSetIn = { exerciseId: number; reps: number; weightKg: number; restSec: number };
export type PlannedSet = PlannedSetIn & { id: number; position: number };
export type Plan = { id: number; title: string; scheduledFor: string; sets: PlannedSet[]; done?: boolean };
export type PerformedSetIn = {
  plannedSetId: number; exerciseId: number; reps: number; weightKg: number;
  restSec: number | null; durationSec: number | null;
};

export type SetForecast = {
  planned_set_id: number; exercise_id: number; weight_kg: number;
  planned_reps: number; predicted_reps: number; planned_rest_sec: number; predicted_rest_sec: number;
};
export type Totals = {
  planned_reps: number; predicted_reps: number; planned_volume_kg: number; predicted_volume_kg: number;
  planned_duration_sec: number; predicted_duration_sec: number;
};
export type Forecast = { personalized: boolean; sets: SetForecast[]; totals: Totals };
export type ReportSet = SetForecast & { actual_reps: number | null; actual_weight_kg: number | null; actual_rest_sec: number | null };
export type Report = Omit<Forecast, 'sets'> & {
  sets: ReportSet[]; actual_reps: number; actual_volume_kg: number; actual_duration_sec: number;
  completion: number; forecast_mae_reps: number; plan_mae_reps: number;
};
export type Recommendation = {
  weight_kg: number | null; projected_e1rm: number | null; predicted_reps: number[];
  trend: { performed_at: string; e1rm: number }[];
};

type Auth = { token: string; user: User };

export const api = {
  register: (b: { email: string; name: string; password: string }) => request<Auth>('POST', '/auth/register', b),
  login: (b: { email: string; password: string }) => request<Auth>('POST', '/auth/login', b),
  me: () => request<User>('GET', '/auth/me'),
  exercises: () => request<Exercise[]>('GET', '/exercises'),
  createExercise: (b: { name: string; bodyweight: boolean }) => request<Exercise>('POST', '/exercises', b),
  recommend: (id: number, q: Record<string, string | number>) =>
    request<Recommendation>('GET', `/exercises/${id}/recommendation?${new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]))}`),
  plans: () => request<Plan[]>('GET', '/plans'),
  plan: (id: number) => request<Plan>('GET', `/plans/${id}`),
  createPlan: (b: { title: string; scheduledFor: string; sets: PlannedSetIn[] }) => request<Plan>('POST', '/plans', b),
  deletePlan: (id: number) => request<void>('DELETE', `/plans/${id}`),
  logWorkout: (planId: number, b: { startedAt: string; finishedAt: string; sets: PerformedSetIn[] }) =>
    request('POST', `/plans/${planId}/workouts`, b),
  forecast: (id: number) => request<Forecast>('GET', `/plans/${id}/forecast`),
  report: (id: number) =>
    request<Report>('GET', `/plans/${id}/report`).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }),
  train: () => request<{ rows: number; real_rows: number; train_mae_reps: number }>('POST', '/ml/train'),
};
