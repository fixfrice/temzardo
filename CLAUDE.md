# TrainIQ — notes for Claude Code

Workout planner with a personalised ML forecast: plan sets/reps/weight/rest → predict what the user will actually do → compare plan / forecast / actual after the workout.

## Stack (yarn workspaces monorepo)

- `packages/frontend` — React 19, Vite, Ant Design 6, Tailwind 4, recharts, i18next, TanStack Query, react-router
- `packages/backend` — Express 5, TypeScript, Sequelize 6, PostgreSQL, zod, JWT
- `packages/ml` — Python, FastAPI, scikit-learn, pandas

## Commands

```bash
yarn install && pip install -e "packages/ml[dev]"
yarn migrate                                                     # backend migrations
uvicorn trainiq_ml.app:app --port 8001 --app-dir packages/ml     # ML service
yarn dev:backend                                                 # :8000
yarn dev:frontend                                                # :5173, proxies /api
yarn seed                                                        # demo@trainiq.dev / demo123

yarn workspace @trainiq/backend typecheck && yarn test           # backend (DB trainiq_test)
yarn workspace @trainiq/frontend build                           # frontend typecheck + build
cd packages/ml && pytest                                         # ML
```

## Architecture rules

- The ML service is **stateless**: the backend sends user history with every request (`src/ml.ts::history`). ML never reads the DB.
- ML features use only data from **before** the session they describe (`shift(1)` in `features.py`). Training and serving share one feature pipeline.
- The report recomputes the forecast from history before the workout started, so the accuracy score stays honest.
- Schema changes = a new migration in `packages/backend/migrations`. Never edit an applied one.
- Sequelize attribute definitions are created by factories in `db.ts`: Sequelize mutates them, so they must not be shared objects.
- Every UI string goes into both `locales/ru.json` and `locales/en.json`.
- ML changes: rerun `packages/ml/notebooks/prototype.py` and report the MAE table before/after.

## Working with the owner

- Senior-level code: less code that does more, few comments (only the *why*).
- The owner is learning ML and coding: explain decisions and non-obvious code in the chat, not in code comments.
- **Do not run `git commit`, `git push` or `git rebase`.** Prepare and stage changes; the owner commits and pushes himself.
- Communicate in Russian.
