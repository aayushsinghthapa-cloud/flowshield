"""Deploy FlowShield to a free Hugging Face Space (Gradio SDK, CPU basic).

What it does:
  1. builds the React app (frontend/dist)
  2. stages the committed files (git archive) + dist + app.py + root requirements.txt
  3. creates the Space if needed and uploads everything (binary-safe HF upload API)
  4. optionally copies GEMINI_API_KEY from .env into the Space's secrets

Usage (from the repo root):
  .venv/bin/pip install huggingface_hub
  .venv/bin/python deploy/push_hf.py <hf-username>/flowshield [--set-secret]

Auth: set HF_TOKEN to a token with "write" scope, or run `hf auth login` first.
"""
from __future__ import annotations

import argparse
import io
import os
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path

from dotenv import dotenv_values
from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parents[1]
GRADIO_VERSION = "6.28.0"
HEADER = f"""---
title: FlowShield Bengaluru
emoji: 🌊
colorFrom: blue
colorTo: indigo
sdk: gradio
sdk_version: {GRADIO_VERSION}
python_version: "3.11"
app_file: app.py
pinned: false
short_description: Flood simulation and early warning for Bengaluru lakes
---

"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("space", help="<hf-username>/<space-name>")
    ap.add_argument("--set-secret", action="store_true", help="copy GEMINI_API_KEY from .env to the Space")
    ap.add_argument("--skip-build", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="stage files and list them, upload nothing")
    args = ap.parse_args()

    if not args.skip_build:
        print("building frontend ...")
        subprocess.run(["npx", "vite", "build"], cwd=ROOT / "frontend", check=True)

    with tempfile.TemporaryDirectory() as tmp:
        stage = Path(tmp) / "space"
        stage.mkdir()
        archive = subprocess.run(["git", "archive", "HEAD"], cwd=ROOT, check=True, capture_output=True).stdout
        with tarfile.open(fileobj=io.BytesIO(archive)) as tf:
            tf.extractall(stage, filter="data")
        for drop in ("Dockerfile", ".dockerignore", "frontend/src", "frontend/public", "backend/pipeline"):
            p = stage / drop
            if p.is_dir():
                shutil.rmtree(p)
            elif p.exists():
                p.unlink()
        shutil.copytree(ROOT / "frontend" / "dist", stage / "frontend" / "dist")
        shutil.copy(ROOT / "deploy" / "hf_app.py", stage / "app.py")
        shutil.copy(ROOT / "backend" / "requirements.txt", stage / "requirements.txt")
        readme = stage / "README.md"
        readme.write_text(HEADER + readme.read_text())

        if args.dry_run:
            files = sorted(p for p in stage.rglob("*") if p.is_file())
            size = sum(p.stat().st_size for p in files)
            for f in files:
                print("  ", f.relative_to(stage))
            print(f"{len(files)} files, {size / 1e6:.1f} MB (dry run, nothing uploaded)")
            print((stage / "README.md").read_text()[:400])
            return

        api = HfApi(token=os.environ.get("HF_TOKEN"))
        api.create_repo(args.space, repo_type="space", space_sdk="gradio", exist_ok=True)
        if args.set_secret:
            key = dotenv_values(ROOT / ".env").get("GEMINI_API_KEY")
            if not key:
                raise SystemExit("GEMINI_API_KEY not found in .env")
            api.add_space_secret(args.space, "GEMINI_API_KEY", key)
            print("secret GEMINI_API_KEY set on the Space")
        print("uploading ...")
        api.upload_folder(repo_id=args.space, repo_type="space", folder_path=stage,
                          commit_message="Deploy FlowShield", delete_patterns=["*"])
    print(f"Done. App: https://huggingface.co/spaces/{args.space}")
    print(f"Build logs: https://huggingface.co/spaces/{args.space}?logs=build")


if __name__ == "__main__":
    main()
