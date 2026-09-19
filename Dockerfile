# Single container: builds the React app, then serves it and the API with FastAPI.
# Works on Hugging Face Spaces (Docker SDK, port 7860) and Render/Railway (uses $PORT).
FROM node:22-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npx vite build

FROM python:3.11-slim
RUN useradd -m -u 1000 app
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY --from=web /app/frontend/dist frontend/dist
RUN chown -R app /app
USER app
WORKDIR /app/backend
ENV PORT=7860
EXPOSE 7860
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT}"]
