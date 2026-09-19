"""Hugging Face Space entry point (Gradio SDK, free CPU tier).

Runs the FlowShield FastAPI app, which serves the API under /api and the built
React dashboard at /. A small Gradio page is mounted at /gradio.
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))
os.environ["FLOWSHIELD_DEFER_FRONTEND"] = "1"

import uvicorn  # noqa: E402
from api.main import app, mount_frontend  # noqa: E402

try:
    import gradio as gr

    with gr.Blocks(title="FlowShield") as info:
        gr.Markdown("## FlowShield Bengaluru\nThe dashboard runs at the root of this Space: open **/** .")
    app = gr.mount_gradio_app(app, info, path="/gradio")
except Exception as e:  # the dashboard does not depend on Gradio
    print("Gradio page not mounted:", e)

mount_frontend()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 7860)))
