# %% [markdown]
# # TrainIQ — ML prototype
# Runs as a script or cell-by-cell in VS Code / Jupyter (`# %%` cells).
# Question: given a planned workout, how many reps will *this* person actually do?

# %%
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error

from trainiq_ml.features import FEATURES, build_features
from trainiq_ml.model import RepsModel, pace
from trainiq_ml.synthetic import generate

sets, traits = generate(n_users=60, weeks=12, seed=42)
df = build_features(sets)
print(f"{len(df)} sets, {df.session_id.nunique()} sessions, {df.user_id.nunique()} users")
df[FEATURES + ["reps"]].describe().round(2)

# %% [markdown]
# ## Time-based split
# Random splits leak the future into training. Each user's last 25% of
# training days is held out: we predict their future from their past.

# %%
cutoff = df.groupby("user_id").performed_at.transform(lambda t: t.min() + (t.max() - t.min()) * 0.75)
train, test = df[df.performed_at <= cutoff], df[df.performed_at > cutoff]

model = RepsModel().fit(train)
results = {
    "plan (reps = planned)": test.planned_reps,
    "global model": np.clip(model.predict_global(test), 0, test.planned_reps),
    "global + personal bias": model.predict(test, history=train),
}
pd.Series({k: mean_absolute_error(test.reps, v) for k, v in results.items()}, name="MAE, reps").round(3)

# %% [markdown]
# ## Does personalisation help the people who differ most?
# Heavy-fatigue users drop reps set after set; the plan ignores that.

# %%
test = test.assign(err_plan=(test.reps - results["plan (reps = planned)"]).abs(),
                   err_personal=(test.reps - results["global + personal bias"]).abs())
by_user = test.groupby("user_id")[["err_plan", "err_personal"]].mean().join(traits.set_index("user_id").fatigue)
by_user.assign(fatigue_bucket=pd.qcut(by_user.fatigue, 3, labels=["low", "mid", "high"])) \
    .groupby("fatigue_bucket", observed=True)[["err_plan", "err_personal"]].mean().round(2)

# %% [markdown]
# ## Rest and tempo: can we recover hidden traits?
# True `rest_mult` and `sec_per_rep` were generated per user; compare estimates.

# %%
est = pd.DataFrame([(u, *pace(train, u)) for u in traits.user_id], columns=["user_id", "rest_mult_est", "spr_est"])
cmp = traits.merge(est, on="user_id")
print("corr rest:", round(cmp.rest_mult.corr(cmp.rest_mult_est), 3),
      "| corr tempo:", round(cmp.sec_per_rep.corr(cmp.spr_est), 3))

# %% [markdown]
# ## Cold start: how fast does a new user become "known"?
# Train on 45 users, then follow 15 never-seen users from their first session.
# Error is grouped by how many sessions that user had logged before.

# %%
new_users = traits.user_id.sample(15, random_state=1)
seen, unseen = df[~df.user_id.isin(new_users)], df[df.user_id.isin(new_users)]
cold = RepsModel().fit(seen)
session_no = unseen.groupby("user_id").session_id.rank(method="dense") - 1
bucket = pd.cut(session_no, [-1, 0, 2, 5, 10, 20, 100], labels=["1st", "2-3", "4-6", "7-11", "12-21", "22+"])
online = unseen.assign(
    bucket=bucket,
    err_plan=(unseen.reps - unseen.planned_reps).abs(),
    err_model=(unseen.reps - cold.predict_global(unseen).clip(0, unseen.planned_reps)).abs(),
)
online.groupby("bucket", observed=True)[["err_plan", "err_model"]].mean().round(2)
