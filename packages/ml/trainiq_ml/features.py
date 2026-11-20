"""One table of sets in, model features out.

Both the synthetic generator and the database produce the same "sets frame",
so training and serving share exactly one feature pipeline (no train/serve skew).
"""
import numpy as np
import pandas as pd

SET_COLUMNS = [
    "user_id", "session_id", "exercise_id", "performed_at", "set_index",
    "weight_kg", "planned_reps", "planned_rest_sec", "reps", "rest_sec", "duration_sec",
]
FEATURES = [
    "set_index", "weight_kg", "rel_intensity", "planned_reps",
    "rest_before_sec", "days_since_last", "experience", "user_drop", "user_completion",
]
E1RM_WINDOW = 3
PROFILE_SPAN = 10


def epley(weight, reps):
    """Estimated one-rep max. Bodyweight work (weight 0) uses reps as the strength proxy."""
    weight, reps = np.asarray(weight, float), np.asarray(reps, float)
    return np.where(weight > 0, weight * (1 + reps / 30), reps)


def session_table(sets: pd.DataFrame) -> pd.DataFrame:
    """Best e1RM per (user, exercise, session), ordered in time."""
    s = sets.assign(e1rm=epley(sets.weight_kg, sets.reps))
    return (
        s.groupby(["user_id", "exercise_id", "session_id"], as_index=False)
        .agg(performed_at=("performed_at", "min"), e1rm=("e1rm", "max"))
        .sort_values(["user_id", "exercise_id", "performed_at"], ignore_index=True)
    )


def _context(sessions: pd.DataFrame) -> pd.DataFrame:
    """Per session: what we knew *before* it started. shift(1) is what prevents leakage."""
    g = sessions.groupby(["user_id", "exercise_id"])
    return sessions.assign(
        prior_e1rm=g.e1rm.transform(lambda x: x.rolling(E1RM_WINDOW, min_periods=1).max().shift(1)),
        last_at=g.performed_at.shift(1),
        experience=g.cumcount(),
    )


def user_sessions(sets: pd.DataFrame) -> pd.DataFrame:
    """Per user session: how much reps fall from first to last set, and plan completion.

    These become the user's "profile" features, so the global model can learn
    interactions like "high-fatigue person on set 4" instead of a flat offset.
    """
    blocks = (
        sets.sort_values("set_index")
        .groupby(["user_id", "session_id", "exercise_id"])
        .agg(at=("performed_at", "min"), first=("reps", "first"), last=("reps", "last"),
             n=("reps", "size"), reps=("reps", "sum"), planned=("planned_reps", "sum"))
    )
    blocks["drop"] = (blocks["first"] - blocks["last"]) / (blocks.n - 1).clip(lower=1)
    s = (
        blocks.groupby(["user_id", "session_id"])
        .agg(at=("at", "min"), drop=("drop", "mean"), reps=("reps", "sum"), planned=("planned", "sum"))
        .reset_index()
        .sort_values(["user_id", "at"], ignore_index=True)
    )
    return s.assign(completion=s.reps / s.planned)


def _ewm(x: pd.Series) -> pd.Series:
    return x.ewm(span=PROFILE_SPAN).mean()


def _profile(s: pd.DataFrame) -> pd.DataFrame:
    g = s.groupby("user_id")
    return s.assign(
        user_drop=g["drop"].transform(lambda x: _ewm(x).shift(1)),
        user_completion=g["completion"].transform(lambda x: _ewm(x).shift(1)),
    )[["user_id", "session_id", "user_drop", "user_completion"]]


def profile_at(sets: pd.DataFrame, user_id: int, at: pd.Timestamp) -> dict:
    hist = sets[(sets.user_id == user_id) & (sets.performed_at < at)]
    if hist.empty:
        return {"user_drop": np.nan, "user_completion": np.nan}
    s = user_sessions(hist)
    return {"user_drop": _ewm(s["drop"]).iloc[-1], "user_completion": _ewm(s.completion).iloc[-1]}


def build_features(sets: pd.DataFrame) -> pd.DataFrame:
    ctx = _context(session_table(sets))[
        ["user_id", "exercise_id", "session_id", "prior_e1rm", "last_at", "experience"]
    ]
    df = (
        sets.merge(ctx, on=["user_id", "exercise_id", "session_id"], how="left")
        .merge(_profile(user_sessions(sets)), on=["user_id", "session_id"], how="left")
    )
    return _finish(df)


def context_at(sets: pd.DataFrame, user_id: int, exercise_id: int, at: pd.Timestamp) -> dict:
    """Same context as in training, computed for a future (planned) session."""
    hist = sets[(sets.user_id == user_id) & (sets.exercise_id == exercise_id) & (sets.performed_at < at)]
    if hist.empty:
        return {"prior_e1rm": np.nan, "last_at": pd.NaT, "experience": 0}
    sess = session_table(hist)
    return {
        "prior_e1rm": sess.e1rm.tail(E1RM_WINDOW).max(),
        "last_at": sess.performed_at.iloc[-1],
        "experience": len(sess),
    }


def planned_features(plan: pd.DataFrame, sets: pd.DataFrame) -> pd.DataFrame:
    """plan: user_id, exercise_id, performed_at, set_index, weight_kg, planned_reps, planned_rest_sec."""
    profile = profile_at(sets, plan.user_id.iloc[0], plan.performed_at.min())
    ctx = pd.DataFrame(
        [{**context_at(sets, r.user_id, r.exercise_id, r.performed_at), **profile} for r in plan.itertuples()],
        index=plan.index,
    )
    return _finish(pd.concat([plan.assign(session_id=-1), ctx], axis=1))


def _finish(df: pd.DataFrame) -> pd.DataFrame:
    weight_or_reps = df.weight_kg.where(df.weight_kg > 0, df.planned_reps)
    ordered = df.sort_values("set_index")
    rest_before = ordered.groupby(["user_id", "exercise_id", "session_id"]).planned_rest_sec.shift(1)
    return df.assign(
        rest_before_sec=rest_before.reindex(df.index).fillna(0),
        rel_intensity=weight_or_reps / df.prior_e1rm,
        days_since_last=(df.performed_at - df.last_at).dt.total_seconds() / 86400,
    )
