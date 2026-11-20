"""Synthetic athletes with hidden traits, so we can check the model recovers them.

Each user has a true 1RM per exercise that grows over time, plus personal
fatigue, rest discipline and tempo. Plans are written from a *noisy* guess of
the 1RM, just like real programs, so reality regularly differs from the plan.
"""
import numpy as np
import pandas as pd

from .features import SET_COLUMNS

EXERCISES = {1: ("Присед", 100), 2: ("Жим лёжа", 70), 3: ("Становая тяга", 120), 4: ("Тяга штанги", 60)}


def _round(w, step=2.5):
    return np.round(w / step) * step


def generate(n_users=40, weeks=12, seed=0) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(seed)
    rows, traits = [], []
    session_id = 0
    for user in range(1, n_users + 1):
        t = {
            "user_id": user,
            "strength": rng.lognormal(0, 0.25),
            "growth_per_week": rng.uniform(0.0, 0.015),
            "fatigue": rng.uniform(0.2, 1.5),
            "rest_mult": rng.lognormal(0.1, 0.25),
            "sec_per_rep": rng.uniform(2.0, 4.5),
            "ambition": rng.uniform(0.95, 1.08),
        }
        traits.append(t)
        start = pd.Timestamp("2026-06-01 18:00")
        day = 0.0
        while day < weeks * 7:
            day += rng.choice([2, 2, 3, 3, 4, 7], p=[0.3, 0.2, 0.2, 0.15, 0.1, 0.05])
            session_id += 1
            at = start + pd.Timedelta(days=day)
            for ex in rng.choice(list(EXERCISES), size=rng.integers(2, 4), replace=False):
                true_1rm = EXERCISES[ex][1] * t["strength"] * (1 + t["growth_per_week"]) ** (day / 7)
                reps_plan = int(rng.choice([5, 6, 8, 10, 12]))
                guess = true_1rm * rng.normal(t["ambition"], 0.05)
                weight = max(_round(guess / (1 + reps_plan / 30)), 20.0)
                rest_plan = int(rng.choice([90, 120, 150, 180]))
                n_sets = int(rng.integers(3, 6))
                rest_prev = 0.0
                for i in range(n_sets):
                    capacity = (
                        30 * (true_1rm / weight - 1)
                        - t["fatigue"] * i
                        + 1.2 * np.log1p(rest_prev / 120) * (i > 0)
                        + rng.normal(0, 0.8)
                    )
                    reps = int(np.clip(np.floor(min(reps_plan, capacity)), 0, reps_plan))
                    rest = rest_plan * t["rest_mult"] * rng.lognormal(0, 0.15) if i < n_sets - 1 else np.nan
                    rows.append({
                        "user_id": user, "session_id": session_id, "exercise_id": int(ex),
                        "performed_at": at, "set_index": i, "weight_kg": weight,
                        "planned_reps": reps_plan, "planned_rest_sec": rest_plan, "reps": reps,
                        "rest_sec": rest, "duration_sec": reps * t["sec_per_rep"] * rng.lognormal(0, 0.1),
                    })
                    rest_prev = 0.0 if np.isnan(rest) else rest
                at += pd.Timedelta(minutes=15)
    return pd.DataFrame(rows, columns=SET_COLUMNS), pd.DataFrame(traits)
