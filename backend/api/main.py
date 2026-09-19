"""FlowShield HTTP API. Routes are mounted under /api; the built frontend is served at /."""
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()

app = FastAPI(title="FlowShield API")
app.add_middleware(GZipMiddleware, minimum_size=1024)
api = APIRouter(prefix="/api")


@api.get("/health")
def health():
    return {"status": "ok"}


app.include_router(api)

DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
