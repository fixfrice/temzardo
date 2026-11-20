import { Router } from 'express';
import { Op, type FindOptions } from 'sequelize';
import { z } from 'zod';

import { Exercise, PerformedSet, Plan, PlannedSet, Workout, sequelize } from '../db';
import { HttpError, notFound } from '../http';
import * as ml from '../ml';

const planBody = z.object({
  title: z.string().min(1).max(120),
  scheduledFor: z.coerce.date(),
  sets: z.array(z.object({
    exerciseId: z.number().int(),
    reps: z.number().int().min(1).max(100),
    weightKg: z.number().min(0).max(1000),
    restSec: z.number().int().min(0).max(3600),
  })).min(1).max(100),
});

const workoutBody = z.object({
  startedAt: z.coerce.date(),
  finishedAt: z.coerce.date(),
  sets: z.array(z.object({
    plannedSetId: z.number().int().nullable(),
    exerciseId: z.number().int(),
    reps: z.number().int().min(0).max(200),
    weightKg: z.number().min(0).max(1000),
    restSec: z.number().min(0).nullable(),
    durationSec: z.number().min(0).nullable(),
  })).min(1),
}).refine((w) => w.finishedAt >= w.startedAt, { message: 'finishedAt before startedAt' });

const sets = { model: PlannedSet, as: 'sets' };
const withSets = (...order: [string, string][]): FindOptions => ({
  include: [sets],
  order: [...order, [sets, 'position', 'ASC']],
});

async function ownPlan(userId: number, id: string | string[]) {
  const plan = await Plan.findOne({ where: { id: Number(id), userId }, ...withSets() });
  if (!plan) throw notFound('Plan');
  return plan;
}

const latestWorkout = (planId: number) =>
  Workout.findOne({ where: { planId }, include: [{ association: 'sets' }], order: [['startedAt', 'DESC']] });

async function assertExercises(userId: number, ids: number[]) {
  const found = await Exercise.count({
    where: { id: [...new Set(ids)], [Op.or]: [{ userId: null }, { userId }] },
  });
  if (found !== new Set(ids).size) throw new HttpError(400, 'Unknown exercise');
}

const mae = (pairs: [number, number][]) =>
  pairs.length ? +(pairs.reduce((s, [a, b]) => s + Math.abs(a - b), 0) / pairs.length).toFixed(2) : 0;

export const plansRouter = Router()
  .get('/', async (req, res) => {
    const plans = await Plan.findAll({ where: { userId: req.userId }, ...withSets(['scheduledFor', 'DESC']) });
    const done = new Set((await Workout.findAll({ where: { userId: req.userId }, attributes: ['planId'] })).map((w) => w.planId));
    res.json(plans.map((p) => ({ ...p.toJSON(), done: done.has(p.id) })));
  })

  .post('/', async (req, res) => {
    const body = planBody.parse(req.body);
    await assertExercises(req.userId, body.sets.map((s) => s.exerciseId));
    const plan = await sequelize.transaction(async (transaction) => {
      const p = await Plan.create({ userId: req.userId, title: body.title, scheduledFor: body.scheduledFor }, { transaction });
      await PlannedSet.bulkCreate(body.sets.map((s, position) => ({ ...s, position, planId: p.id })), { transaction });
      return p;
    });
    res.status(201).json(await ownPlan(req.userId, String(plan.id)));
  })

  .get('/:id', async (req, res) => {
    res.json(await ownPlan(req.userId, req.params.id));
  })

  .delete('/:id', async (req, res) => {
    await (await ownPlan(req.userId, req.params.id)).destroy();
    res.status(204).end();
  })

  .post('/:id/workouts', async (req, res) => {
    const plan = await ownPlan(req.userId, req.params.id);
    const body = workoutBody.parse(req.body);
    const planned = new Set(plan.sets!.map((s) => s.id));
    if (body.sets.some((s) => s.plannedSetId !== null && !planned.has(s.plannedSetId))) {
      throw new HttpError(400, 'Set does not belong to this plan');
    }
    await assertExercises(req.userId, body.sets.map((s) => s.exerciseId));
    const { sets: performed, ...times } = body;
    const workout = await sequelize.transaction(async (transaction) => {
      const w = await Workout.create({ userId: req.userId, planId: plan.id, ...times }, { transaction });
      await PerformedSet.bulkCreate(performed.map((s, position) => ({ ...s, position, workoutId: w.id })), { transaction });
      return w;
    });
    res.status(201).json(await Workout.findByPk(workout.id, { include: ['sets'] }));
  })

  .get('/:id/forecast', async (req, res) => {
    res.json(await ml.forecast(await ownPlan(req.userId, req.params.id)));
  })

  /** Plan vs forecast vs reality. The forecast is recomputed from history *before* the workout: an honest score. */
  .get('/:id/report', async (req, res) => {
    const plan = await ownPlan(req.userId, req.params.id);
    const workout = await latestWorkout(plan.id);
    if (!workout) throw notFound('Workout for this plan');

    const fc = await ml.forecast(plan, workout.startedAt);
    const actual = new Map(workout.sets!.map((s) => [s.plannedSetId, s]));
    const rows = fc.sets.map((f) => {
      const a = actual.get(f.planned_set_id);
      return { ...f, actual_reps: a?.reps ?? null, actual_weight_kg: a?.weightKg ?? null, actual_rest_sec: a?.restSec ?? null };
    });
    const hit = rows.filter((s) => s.actual_reps !== null);

    res.json({
      workout_id: workout.id,
      personalized: fc.personalized,
      sets: rows,
      totals: fc.totals,
      actual_reps: workout.sets!.reduce((n, s) => n + s.reps, 0),
      actual_volume_kg: +workout.sets!.reduce((n, s) => n + s.reps * s.weightKg, 0).toFixed(1),
      actual_duration_sec: Math.round((+workout.finishedAt - +workout.startedAt) / 1000),
      completion: +(hit.reduce((n, s) => n + s.actual_reps!, 0) / fc.totals.planned_reps).toFixed(3),
      forecast_mae_reps: mae(hit.map((s) => [s.actual_reps!, s.predicted_reps])),
      plan_mae_reps: mae(hit.map((s) => [s.actual_reps!, s.planned_reps])),
    });
  });
