from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from trainiq_ml.app import app, state

START = datetime(2026, 9, 1, 18)
client = TestClient(app)


def history(days=range(0, 30, 3), fatigue=1):
    """A lifter who loses `fatigue` reps per set and rests 1.5x longer than the 120s plan."""
    return [
        {"user_id": 1, "session_id": d, "exercise_id": 1, "performed_at": (START + timedelta(days=d)).isoformat(),
         "position": i, "weight_kg": 60 + d / 3 * 2.5, "reps": 8 - fatigue * i, "planned_reps": 8,
         "planned_rest_sec": 120, "rest_sec": 180 if i < 3 else None, "duration_sec": 30}
        for d in days for i in range(4)
    ]


def plan(weight=85):
    return [{"planned_set_id": i, "exercise_id": 1, "position": i, "weight_kg": weight,
             "planned_reps": 8, "planned_rest_sec": 120} for i in range(4)]


@pytest.fixture(autouse=True)
def fresh_model():
    state["model"] = None


def test_cold_start_equals_plan():
    r = client.post("/forecast", json={"user_id": 1, "at": START.isoformat(), "plan": plan()}).json()
    assert not r["personalized"] and [s["predicted_reps"] for s in r["sets"]] == [8] * 4


def test_personalised_forecast_and_recommendation():
    h = history()
    assert client.post("/train", json={"history": h}).json()["real_rows"] == 40
    at = (START + timedelta(days=31)).isoformat()

    fc = client.post("/forecast", json={"user_id": 1, "at": at, "history": h, "plan": plan()}).json()
    reps = [s["predicted_reps"] for s in fc["sets"]]
    assert fc["personalized"] and reps[0] > reps[-1]
    assert fc["sets"][0]["predicted_rest_sec"] > 120
    assert fc["totals"]["predicted_duration_sec"] > fc["totals"]["planned_duration_sec"]

    rec = client.post("/recommend", json={"user_id": 1, "exercise_id": 1, "at": at, "sets": 3, "reps": 5,
                                          "history": h}).json()
    assert rec["weight_kg"] % 2.5 == 0 and len(rec["predicted_reps"]) == 3 and len(rec["trend"]) == 10


def test_train_without_data_is_rejected():
    assert client.post("/train", json={"synthetic": False}).status_code == 400
