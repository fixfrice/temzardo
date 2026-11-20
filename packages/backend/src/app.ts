import cors from 'cors';
import express from 'express';

import { auth, errorHandler } from './http';
import * as ml from './ml';
import { authRouter } from './routes/auth';
import { exercisesRouter } from './routes/exercises';
import { plansRouter } from './routes/plans';

export const app = express()
  .use(cors())
  .use(express.json({ limit: '1mb' }))
  .get('/api/health', (_req, res) => {
    res.json({ ok: true });
  })
  .use('/api/auth', authRouter)
  .use('/api/exercises', auth, exercisesRouter)
  .use('/api/plans', auth, plansRouter)
  // Retrains the shared model on everyone's data; on a public instance put this behind an admin check.
  .post('/api/ml/train', auth, async (req, res) => {
    res.json(await ml.train(req.query.synthetic !== 'false'));
  })
  .use(errorHandler);
