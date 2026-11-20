# Contributing to TrainIQ

Thanks for helping! Issues and pull requests are welcome.

## Setup

Follow the *Development* section of the [README](README.md). With PostgreSQL running locally:

```bash
createdb trainiq && createdb trainiq_test
DATABASE_URL=postgres://localhost/trainiq_test yarn migrate
yarn test && (cd packages/ml && pytest)
```

## Ground rules

- **One concern per PR.** Small PRs get reviewed quickly.
- **Schema changes go in a new migration** under `packages/backend/migrations`. Never edit one that has been released.
- **Every UI string goes in both** `packages/frontend/src/locales/ru.json` and `en.json`.
- **ML changes need numbers.** Run `packages/ml/notebooks/prototype.py` before and after, and paste the MAE table into the PR. Features must only use data from *before* the session they describe.
- **The ML service stays stateless.** It receives history in the request and never reads the database.
- Prefer less code that does more. Comment *why*, not *what*.

## Commit messages

Short imperative subject: `Add RPE input to workout mode`.
