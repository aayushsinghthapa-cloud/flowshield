"""Vercel serverless entry point: exposes the FlowShield FastAPI app.

Vercel serves the built dashboard (frontend/dist) as static files and routes
/api/* here (see vercel.json).
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
os.environ.setdefault("FLOWSHIELD_DEFER_FRONTEND", "1")  # static files are served by Vercel
os.environ.setdefault("ENSEMBLE_WORKERS", "1")           # no process pools in the sandbox

from server.main import app  # noqa: E402,F401
