"""Stateless ML service: the backend owns the data and sends history with every request.

The only state here is the trained model file. That keeps the service trivial
to scale and to replace: any backend that can produce SetRow lists can use it.
"""
import os
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import synthetic
from .features import SET_COLUMNS, build_features
from .forecast import forecast_plan, recommend
from .model import RepsModel

MODEL_PATH = Path(os.getenv("MODEL_PATH", "models/reps.joblib"))
app = FastAPI(title="TrainIQ ML")
state = {"model": RepsModel.load(MODEL_PATH)}


class SetRow(BaseModel):
    user_id: int
    session_id: int
    exercise_id: int
    performed_at: datetime
    position: int
    weight_kg: float
    reps: int
    planned_reps: int | None = None
    planned_rest_sec: float | None = None
    rest_sec: float | None = None
    duration_sec: float | None = None


class PlanRow(BaseModel):
    planned_set_id: int
    exercise_id: int
    position: int
    weight_kg: float
    planned_reps: int
    planned_rest_sec: float


class ForecastIn(BaseModel):
    user_id: int
    at: datetime
    history: list[SetRow] = []
    plan: list[PlanRow] = Field(min_length=1)


class RecommendIn(BaseModel):
    user_id: int
    exercise_id: int
    at: datetime
    sets: int = Field(3, ge=1, le=10)
    reps: int = Field(8, ge=1, le=50)
    rest_sec: int = Field(120, ge=0)
    history: list[SetRow] = []


class TrainIn(BaseModel):
    history: list[SetRow] = []
    synthetic: bool = True


def history_frame(rows: list[SetRow]) -> pd.DataFrame:
    """Rows -> canonical sets frame. Unplanned sets count as "planned what was done"."""
    if not rows:
        return pd.DataFrame(columns=SET_COLUMNS).astype({"performed_at": "datetime64[ns]"})
    df = pd.DataFrame([r.model_dump() for r in rows])
    df["performed_at"] = pd.to_datetime(df.performed_at).dt.tz_localize(None)
    df["planned_reps"] = df.planned_reps.fillna(df.reps)
    df["planned_rest_sec"] = df.planned_rest_sec.fillna(df.rest_sec).fillna(0)
    df["set_index"] = df.groupby(["session_id", "exercise_id"]).position.rank(method="first").astype(int) - 1
    return df[SET_COLUMNS].astype({"rest_sec": float, "duration_sec": float})


def plan_frame(user_id: int, at: datetime, rows: list[PlanRow]) -> pd.DataFrame:
    df = pd.DataFrame([r.model_dump() for r in rows]).sort_values("position", ignore_index=True)
    return df.assign(
        user_id=user_id,
        performed_at=pd.Timestamp(at).tz_localize(None),
        set_index=df.groupby("exercise_id").position.rank(method="first").astype(int) - 1,
    )


def totals(fc: pd.DataFrame) -> dict:
    return {
        "planned_reps": int(fc.planned_reps.sum()),
        "predicted_reps": round(float(fc.predicted_reps.sum()), 1),
        "planned_volume_kg": round(float((fc.planned_reps * fc.weight_kg).sum()), 1),
        "predicted_volume_kg": round(float((fc.predicted_reps * fc.weight_kg).sum()), 1),
        "planned_duration_sec": int(fc.planned_work_sec.sum() + fc.planned_rest_sec.iloc[:-1].sum()),
        "predicted_duration_sec": int(fc.predicted_work_sec.sum() + fc.predicted_rest_sec.sum()),
    }


SET_FIELDS = ["planned_set_id", "exercise_id", "weight_kg", "planned_reps", "predicted_reps",
              "planned_rest_sec", "predicted_rest_sec"]


@app.get("/health")
def health():
    return {"ok": True, "model_loaded": state["model"] is not None}


@app.post("/forecast")
def forecast(body: ForecastIn):
    fc = forecast_plan(state["model"], history_frame(body.history), plan_frame(body.user_id, body.at, body.plan))
    return {"personalized": state["model"] is not None, "sets": fc[SET_FIELDS].to_dict("records"), "totals": totals(fc)}


@app.post("/recommend")
def recommendation(body: RecommendIn):
    at = pd.Timestamp(body.at).tz_localize(None)
    r = recommend(state["model"], history_frame(body.history), body.user_id, body.exercise_id,
                  body.sets, body.reps, body.rest_sec, at)
    return {
        "weight_kg": r["weight_kg"],
        "projected_e1rm": None if r["projected_e1rm"] is None else round(r["projected_e1rm"], 1),
        "predicted_reps": [] if r["sets"] is None else r["sets"].predicted_reps.tolist(),
        "trend": r["e1rm_trend"].round({"e1rm": 1}).to_dict("records"),
    }


@app.post("/train")
def train(body: TrainIn):
    frames = [history_frame(body.history)]
    if body.synthetic:
        syn, _ = synthetic.generate(seed=7)
        frames.append(syn.assign(user_id=-syn.user_id, session_id=-syn.session_id))
    frames = [f for f in frames if not f.empty]
    if not frames:
        raise HTTPException(400, "No training data")
    data = build_features(pd.concat(frames, ignore_index=True))
    model = RepsModel().fit(data)
    model.save(MODEL_PATH)
    state["model"] = model
    mae = float(np.abs(data.reps - model.predict_global(data).clip(0, data.planned_reps)).mean())
    return {"rows": len(data), "real_rows": len(body.history), "train_mae_reps": round(mae, 3)}
