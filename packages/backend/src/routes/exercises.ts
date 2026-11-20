import { Router } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';

import { Exercise } from '../db';
import { notFound } from '../http';
import * as ml from '../ml';

const visibleTo = (userId: number) => ({ [Op.or]: [{ userId: null }, { userId }] });

export const exercisesRouter = Router()
  .get('/', async (req, res) => {
    res.json(await Exercise.findAll({ where: visibleTo(req.userId), order: [['id', 'ASC']] }));
  })
  .post('/', async (req, res) => {
    const body = z.object({ name: z.string().min(1).max(80), bodyweight: z.boolean().default(false) }).parse(req.body);
    res.status(201).json(await Exercise.create({ ...body, userId: req.userId }));
  })
  .get('/:id/recommendation', async (req, res) => {
    const id = Number(req.params.id);
    if (!(await Exercise.findOne({ where: { id, ...visibleTo(req.userId) } }))) throw notFound('Exercise');
    const q = z.object({
      sets: z.coerce.number().int().min(1).max(10).default(3),
      reps: z.coerce.number().int().min(1).max(50).default(8),
      rest_sec: z.coerce.number().int().min(0).default(120),
      at: z.coerce.date().default(() => new Date()),
    }).parse(req.query);
    res.json(await ml.recommend(req.userId, { exercise_id: id, ...q }));
  });
