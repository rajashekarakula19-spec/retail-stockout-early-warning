# FastAPI Backend

This backend serves the React frontend from PostgreSQL.

## Run

```bash
cd retail-stockout-early-warning
DATABASE_URL=postgresql:///retail_stockout .venv/bin/uvicorn backend.app.main:app --reload --port 8000
```

API docs:

```text
http://localhost:8000/docs
```

The React frontend reads this API through `VITE_API_BASE_URL`.

## Ollama Assistant

The `/api/assistant` endpoint calls Ollama when it is running, using PostgreSQL project context.

Start Ollama:

```bash
ollama serve
ollama pull llama3.2
```

Optional environment variables:

```bash
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

If Ollama is offline, the endpoint returns a simple built-in fallback response instead of failing.
