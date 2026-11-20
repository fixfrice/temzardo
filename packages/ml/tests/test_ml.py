import numpy as np

from trainiq_ml.features import build_features
from trainiq_ml.model import RepsModel, pace
from trainiq_ml.synthetic import generate


def test_model_beats_plan_on_unseen_future():
    sets, traits = generate(n_users=15, weeks=8, seed=3)
    df = build_features(sets)
    cut = df.performed_at.quantile(0.75)
    train, test = df[df.performed_at <= cut], df[df.performed_at > cut]
    pred = RepsModel().fit(train).predict(test, history=train)
    assert np.abs(test.reps - pred).mean() < 0.6 * np.abs(test.reps - test.planned_reps).mean()


def test_pace_recovers_hidden_traits():
    sets, traits = generate(n_users=10, weeks=6, seed=4)
    est = [pace(sets, u)[0] for u in traits.user_id]
    assert np.corrcoef(est, traits.rest_mult)[0, 1] > 0.95


def test_no_future_leakage():
    sets, _ = generate(n_users=2, weeks=2, seed=5)
    df = build_features(sets)
    first = df.groupby("user_id").performed_at.transform("min") == df.performed_at
    assert df[first].prior_e1rm.isna().all() and df[first].user_drop.isna().all()
