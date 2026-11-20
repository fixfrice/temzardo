/** Demo account with 6 weeks of history: `yarn workspace @trainiq/backend seed`. Login demo@trainiq.dev / demo123. */
import bcrypt from 'bcryptjs';

import { Exercise, PerformedSet, Plan, PlannedSet, User, Workout, sequelize } from './db';
import * as ml from './ml';

const EMAIL = 'demo@trainiq.dev';
const DAY = 86_400_000;

async function main() {
  if (await User.findOne({ where: { email: EMAIL } })) return console.log('Demo user already exists');
  const user = await User.create({ email: EMAIL, name: 'Demo', passwordHash: await bcrypt.hash('demo123', 10) });
  const [squat, bench] = await Promise.all(['squat', 'bench'].map((key) => Exercise.findOne({ where: { key } })));

  const start = Date.now() - 42 * DAY;
  for (let k = 0; k < 14; k++) {
    const at = new Date(start + k * 3 * DAY);
    const plan = await Plan.create({ userId: user.id, title: `Workout ${k + 1}`, scheduledFor: at });
    const planned = await PlannedSet.bulkCreate(
      [[squat!, 70], [bench!, 50]].flatMap(([ex, w], e) =>
        Array.from({ length: 4 }, (_, j) => ({
          planId: plan.id, exerciseId: (ex as Exercise).id, position: e * 4 + j,
          reps: 8, weightKg: (w as number) + k * 1.25, restSec: 120,
        }))),
    );
    // This lifter tires fast and rests longer than planned: exactly what the model should pick up.
    const workout = await Workout.create({ userId: user.id, planId: plan.id, startedAt: at, finishedAt: new Date(+at + 35 * 60_000) });
    await PerformedSet.bulkCreate(planned.map((p) => ({
      workoutId: workout.id, plannedSetId: p.id, exerciseId: p.exerciseId, position: p.position,
      reps: Math.max(0, Math.round(p.reps - (p.position % 4) * (0.5 + Math.random() * 0.6))),
      weightKg: p.weightKg, restSec: p.position % 4 === 3 ? null : 150 + Math.random() * 40, durationSec: 25 + Math.random() * 8,
    })));
  }
  console.log('Seeded', EMAIL, await ml.train(true).catch((e) => `(ML not reachable: ${e.message})`));
}

main().finally(() => sequelize.close());
