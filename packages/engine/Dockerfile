FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
COPY packages/engine/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY . ./packages/engine/
ENV PYTHONPATH=/app
ENTRYPOINT ["python", "-m", "packages.engine.main"]
