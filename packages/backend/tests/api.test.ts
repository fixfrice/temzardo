import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { app } from '../src/app';
import { User, sequelize } from '../src/db';

// The ML service is stubbed: these tests check what the backend sends and how it merges the answer.
const mlCalls: { path: string; body: any }[] = [];
vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
  const path = new URL(url).pathname;
  const body = JSON.parse(String(init.body));
  mlCalls.push({ path, body });
  const sets = (body.plan ?? []).map((p: any, i: number) => ({
    ...p, predicted_reps: p.planned_reps - i, predicted_rest_sec: p.planned_rest_sec * 1.5,
  }));
  return Response.json({ personalized: true, sets, totals: { planned_reps: sets.reduce((n: number, s: any) => n + s.planned_reps, 0) } });
});

let token: string;
const api = () => ({
  get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${token}`),
  post: (u: string, b?: object) => request(app).post(u).set('Authorization', `Bearer ${token}`).send(b),
});

beforeAll(async () => {
  await User.destroy({ where: {} }); // FK cascades remove their data; built-in exercises stay
  const res = await request(app).post('/api/auth/register').send({ email: 'A@test.dev', name: 'A', password: 'secret1' });
  token = res.body.token;
});
afterAll(() => sequelize.close());

describe('auth', () => {
  it('rejects requests without a token', async () => {
    expect((await request(app).get('/api/plans')).status).toBe(401);
  });
  it('logs in case-insensitively and rejects a wrong password', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: 'a@test.dev', password: 'secret1' })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: 'a@test.dev', password: 'nope123' })).status).toBe(401);
  });
});

describe('plan → workout → report', () => {
  it('runs the full cycle', async () => {
    const [squat] = (await api().get('/api/exercises')).body;
    const plan = (await api().post('/api/plans', {
      title: 'Leg day', scheduledFor: '2026-09-01T18:00:00Z',
      sets: Array(3).fill({ exerciseId: squat.id, reps: 8, weightKg: 60, restSec: 120 }),
    })).body;
    expect(plan.sets.map((s: any) => s.position)).toEqual([0, 1, 2]);

    expect((await api().get(`/api/plans/${plan.id}/report`)).status).toBe(404);

    const workout = await api().post(`/api/plans/${plan.id}/workouts`, {
      startedAt: '2026-09-01T18:05:00Z', finishedAt: '2026-09-01T18:20:00Z',
      sets: plan.sets.map((s: any, i: number) => ({
        plannedSetId: s.id, exerciseId: squat.id, reps: 8 - i * 2, weightKg: 60, restSec: i < 2 ? 170 : null, durationSec: 25,
      })),
    });
    expect(workout.status).toBe(201);

    mlCalls.length = 0;
    const report = (await api().get(`/api/plans/${plan.id}/report`)).body;
    expect(mlCalls[0].body.history).toEqual([]); // forecast is built only from data before this workout
    expect(report.sets.map((s: any) => s.actual_reps)).toEqual([8, 6, 4]);
    expect(report.completion).toBe(0.75);
    expect(report.actual_duration_sec).toBe(900);
    expect(report.forecast_mae_reps).toBeLessThan(report.plan_mae_reps);

    await api().get(`/api/exercises/${squat.id}/recommendation?reps=5`);
    const sent = mlCalls.at(-1)!.body;
    expect(sent.history).toHaveLength(3);
    expect(sent.history[1]).toMatchObject({ planned_reps: 8, planned_rest_sec: 120, reps: 6, rest_sec: 170 });
  });

  it("hides other users' plans", async () => {
    const other = await request(app).post('/api/auth/register').send({ email: 'b@test.dev', name: 'B', password: 'secret1' });
    const mine = (await api().get('/api/plans')).body[0];
    const res = await request(app).get(`/api/plans/${mine.id}`).set('Authorization', `Bearer ${other.body.token}`);
    expect(res.status).toBe(404);
  });

  it('validates input', async () => {
    const res = await api().post('/api/plans', { title: '', scheduledFor: 'x', sets: [] });
    expect(res.status).toBe(400);
  });
});
