import numpy as np
import pandas as pd

from .features import build_features, planned_features, session_table
from .model import RepsModel, pace

WEIGHT_STEP = 2.5
TREND_SESSIONS = 8


def forecast_plan(model: RepsModel | None, history: pd.DataFrame, plan: pd.DataFrame) -> pd.DataFrame:
    """Predict reps, rest and time for every planned set.

    Without a trained model we fall back to "you'll do what you planned",
    so the app works from day one and gets smarter as data arrives.
    """
    feats = planned_features(plan, history)
    if model:
        reps = model.predict(feats, build_features(history) if not history.empty else None)
    else:
        reps = feats.planned_reps.to_numpy(float)
    rest_mult, sec_per_rep = pace(history, int(plan.user_id.iloc[0]))
    is_last = feats.index == feats.index[-1]
    return feats.assign(
        predicted_reps=np.round(reps, 1),
        predicted_rest_sec=np.where(is_last, 0, np.round(feats.planned_rest_sec * rest_mult)),
        predicted_work_sec=np.round(reps * sec_per_rep),
        planned_work_sec=np.round(feats.planned_reps * sec_per_rep),
    )


def e1rm_trend(history: pd.DataFrame, user_id: int, exercise_id: int) -> pd.DataFrame:
    s = session_table(history)
    return s[(s.user_id == user_id) & (s.exercise_id == exercise_id)][["performed_at", "e1rm"]]


def projected_e1rm(trend: pd.DataFrame, at: pd.Timestamp) -> float | None:
    """Linear fit over recent sessions; growth is never extrapolated more than 2 weeks ahead."""
    recent = trend.tail(TREND_SESSIONS)
    if recent.empty:
        return None
    if len(recent) < 3:
        return float(recent.e1rm.max())
    days = (recent.performed_at - recent.performed_at.iloc[-1]).dt.total_seconds() / 86400
    slope, intercept = np.polyfit(days, recent.e1rm, 1)
    ahead = min((at - recent.performed_at.iloc[-1]).total_seconds() / 86400, 14)
    return float(max(intercept + max(slope, 0) * ahead, recent.e1rm.max() * 0.9))


def recommend(model: RepsModel | None, history: pd.DataFrame, user_id: int, exercise_id: int,
              sets: int, reps: int, rest_sec: int, at: pd.Timestamp) -> dict:
    """Heaviest weight at which the personalised model expects every set to hit the target."""
    trend = e1rm_trend(history, user_id, exercise_id)
    e1rm = projected_e1rm(trend, at)
    base = {"e1rm_trend": trend, "projected_e1rm": e1rm}
    if e1rm is None:
        return {**base, "weight_kg": None, "sets": None}

    own = history[(history.user_id == user_id) & (history.exercise_id == exercise_id)]
    bodyweight = own.weight_kg.max() == 0
    start = 0.0 if bodyweight else np.floor(e1rm / (1 + reps / 30) / WEIGHT_STEP) * WEIGHT_STEP
    if model is None or bodyweight:
        return {**base, "weight_kg": float(start),
                "sets": forecast_plan(None, history, _plan(user_id, exercise_id, at, sets, start, reps, rest_sec))}
    candidates = np.arange(start + 2 * WEIGHT_STEP, max(start - 6 * WEIGHT_STEP, 0) - 1e-9, -WEIGHT_STEP)
    for w in candidates:
        plan = _plan(user_id, exercise_id, at, sets, w, reps, rest_sec)
        fc = forecast_plan(model, history, plan)
        if (fc.predicted_reps >= reps - 0.5).all():
            return {**base, "weight_kg": float(w), "sets": fc}
    return {**base, "weight_kg": float(candidates[-1]), "sets": fc}


def _plan(user_id, exercise_id, at, sets, weight, reps, rest_sec) -> pd.DataFrame:
    return pd.DataFrame({
        "user_id": user_id, "exercise_id": exercise_id, "performed_at": at,
        "set_index": range(sets), "weight_kg": float(weight),
        "planned_reps": reps, "planned_rest_sec": rest_sec,
    })

