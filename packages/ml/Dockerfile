FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
COPY trainiq_ml trainiq_ml
RUN pip install --no-cache-dir .
ENV MODEL_PATH=/data/reps.joblib
EXPOSE 8001
CMD ["uvicorn", "trainiq_ml.app:app", "--host", "0.0.0.0", "--port", "8001"]
