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

## Ollama RAG Assistant

The `/api/assistant` endpoint uses a lightweight RAG flow:

```text
User question
→ retrieve relevant PostgreSQL summaries and project markdown docs
→ send retrieved context to Ollama
→ return a concise business-friendly answer
```

It retrieves from:

- PostgreSQL summaries for data coverage, scored rows, model metrics, root causes, and recommended actions
- `README.md`
- `docs/rag_calculation_guide.md`
- `docs/work_summary.md`
- `docs/project_book_short.md`
- `docs/project_explanation.md`

`docs/rag_calculation_guide.md` is prioritized for questions about formulas such as revenue protected, missed revenue, precision, recall, warning days, and thresholds.

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

Check RAG and Ollama status:

```text
http://localhost:8000/api/rag/status
```
