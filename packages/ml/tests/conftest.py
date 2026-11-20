import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("MODEL_PATH", str(Path(__file__).parent / ".tmp" / "reps.joblib"))
