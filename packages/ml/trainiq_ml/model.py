"""Global model + per-user correction.

One gradient-boosting model learns how people in general respond to load
(relative intensity, set number, rest, layoff). Each user then gets a
personal bias learned from their own residuals, shrunk toward zero while
data is scarce:

    bias_user     = sum(residuals_user) / (n_user + K)
    bias_user_ex  = (sum(residuals_user_ex) + K * bias_user) / (n_user_ex + K)

With 0 sets the user gets the global model; with hundreds the bias is
almost their raw average error. This is empirical-Bayes partial pooling.
"""
from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from .features import FEATURES

SHRINKAGE = 20.0
DEFAULT_SEC_PER_REP = 3.0


def _pooled(values: pd.Series, keys: pd.DataFrame, k: float, prior: float | pd.Series = 0.0):
    grp = values.groupby([keys[c] for c in keys.columns])
    stats = grp.agg(["sum", "count"])
    prior = prior if np.isscalar(prior) else prior.reindex(stats.index.droplevel(-1)).fillna(0).to_numpy()
    return (stats["sum"] + k * prior) / (stats["count"] + k)


@dataclass
class RepsModel:
    shrinkage: float = SHRINKAGE
    est: HistGradientBoostingRegressor = field(
        default_factory=lambda: HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05, random_state=0)
    )

    def fit(self, train: pd.DataFrame) -> "RepsModel":
        self.est.fit(train[FEATURES], train.reps)
        return self

    def predict_global(self, df: pd.DataFrame) -> np.ndarray:
        return self.est.predict(df[FEATURES])

    def personal_bias(self, history: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
        res = history.reps - self.predict_global(history)
        user = _pooled(res, history[["user_id"]], self.shrinkage)
        user_ex = _pooled(res, history[["user_id", "exercise_id"]], self.shrinkage, prior=user)
        return user, user_ex

    def predict(self, df: pd.DataFrame, history: pd.DataFrame | None = None) -> np.ndarray:
        pred = self.predict_global(df)
        if history is not None and not history.empty:
            user, user_ex = self.personal_bias(history)
            idx = pd.MultiIndex.from_frame(df[["user_id", "exercise_id"]])
            bias = user_ex.reindex(idx).to_numpy()
            fallback = user.reindex(df.user_id).to_numpy()
            pred = pred + np.nan_to_num(np.where(np.isnan(bias), fallback, bias))
        return np.clip(pred, 0, df.planned_reps.to_numpy())

    def save(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, path)

    @staticmethod
    def load(path: Path) -> "RepsModel | None":
        return joblib.load(path) if path.exists() else None


def pace(history: pd.DataFrame, user_id: int, k: float = SHRINKAGE) -> tuple[float, float]:
    """(rest multiplier, seconds per rep) for a user, pooled toward population values.

    Rest is modelled as a ratio on the log scale: someone who rests 2x the plan
    and someone who rests 0.5x should cancel out, not average to 1.25x.
    """
    rest = history.dropna(subset=["rest_sec"]).query("planned_rest_sec > 0")
    log_ratio = np.log(rest.rest_sec.clip(lower=1) / rest.planned_rest_sec)
    global_lr = log_ratio.mean() if len(log_ratio) else 0.0
    own = log_ratio[rest.user_id == user_id]
    rest_mult = np.exp((own.sum() + k * global_lr) / (len(own) + k))

    work = history.dropna(subset=["duration_sec"]).query("reps > 0")
    spr = work.duration_sec / work.reps
    global_spr = spr.mean() if len(spr) else DEFAULT_SEC_PER_REP
    own = spr[work.user_id == user_id]
    sec_per_rep = (own.sum() + k * global_spr) / (len(own) + k)
    return float(rest_mult), float(sec_per_rep)
