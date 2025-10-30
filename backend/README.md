# Backend (FastAPI)

## Prerequisites

- Python 3.10+
- `pip` or a compatible package manager
- OpenAI API key saved in `.env`

## Setup

```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate  # Windows
pip install -e .
```

`pyproject.toml` contains the runtime and development dependencies. Installing with `pip install -e .[dev]` will add the optional tooling (linting, tests).

Create a `.env` file inside `backend/`:

```
OPENAI_API_KEY=sk-...
COHERE_API_KEY=...
```

## Running the API

```bash
uvicorn app.main:app --reload
```

Default base URL: `http://localhost:8000/api/v1`.

## Key Endpoints

- `GET /api/v1/health/` – healthcheck
- `GET /api/v1/conversations` – list the five most recent conversations
- `POST /api/v1/conversations` – create a new conversation
- `POST /api/v1/chat/{conversation_id}` – synchronous answer
- `POST /api/v1/chat/{conversation_id}/stream` – Server-Sent Events stream (tokens)
- `GET /api/v1/documents` – list uploaded documents
- `POST /api/v1/documents` – upload `.txt` content
- `PUT /api/v1/documents/{id}` – replace document
- `DELETE /api/v1/documents/{id}` – delete document

## Document Ingestion

Place `.txt` files inside `docs/` at the repository root. The ingestion pipeline runs automatically when the server starts and whenever documents change through the API.

## LangSmith Tracing (optional)

To capture detailed traces (retrieval metadata, token usage, costs) in [LangSmith](https://smith.langchain.com):

1. Install the client (already in `backend` requirements after `pip install langsmith`).
2. Export these environment variables before starting the API:
   ```
   LANGCHAIN_TRACING_V2=true
   LANGSMITH_API_KEY=sk-...
   LANGCHAIN_PROJECT=rag-basic   # optional, choose your own project name
   ```
3. Start the backend as usual (`uvicorn app.main:app --reload`).

**What gets logged**
- `ChatService.stream_answer` and `generate_answer` produce top-level LangSmith runs, including:
  - Retrieval spans with document IDs, chunk indices, and previews for the context that fed the LLM.
  - Citation metadata captured once an answer is generated.
- `DocumentIngestionPipeline.index_document` and `delete_document` create runs for ingestion, showing chunk counts per document.

With tracing enabled, LangChain LLM calls automatically include token usage so you can track cost per request inside LangSmith.
