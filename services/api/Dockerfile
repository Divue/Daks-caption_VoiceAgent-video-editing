FROM python:3.12-slim

# ffmpeg for audio extraction and frame grabs; libsndfile for librosa
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Test deps only for local dev (docker-compose sets INSTALL_DEV=true). Production builds skip them.
ARG INSTALL_DEV=false
RUN if [ "$INSTALL_DEV" = "true" ]; then pip install --no-cache-dir -r requirements-dev.txt; fi

COPY app ./app
COPY pytest.ini ./

ENV PORT=8000
EXPOSE 8000
# App Runner runs this; docker-compose overrides it with --reload for local dev
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
