# services/api — owner P1 (agent subfolder: P4)

FastAPI backend: upload → speech-to-text → Roman script → prosody signals → Bedrock tagging → Project JSON.
Container on App Runner. `app/schema.py` mirrors the shared TS schema (do not edit without the lead).

`app/agent/` (P4): Bedrock Converse tool loop. Tools: get_timeline, find_words, update_style,
apply_preset, locate_in_frame, add_overlay. Returns validated patches, never mutates pixels.
