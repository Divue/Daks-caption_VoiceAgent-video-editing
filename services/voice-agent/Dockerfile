# The voice worker is a SEPARATE deployable from services/api — see README.md and root
# CLAUDE.md's isolation rule. Its dependencies (livekit-agents, the AWS STT plugin) must
# never reach services/api/requirements.txt, which ships to production.
#
# Python 3.12 is a hard floor, not a preference: livekit-plugins-aws depends on
# aws_sdk_transcribe_streaming, which publishes no distribution below 3.12.
FROM python:3.12-slim

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# `start` connects to LIVEKIT_URL and waits for jobs; it does not serve a port.
CMD ["python", "worker.py", "start"]
