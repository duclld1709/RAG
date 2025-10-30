# RAG Chatbot Platform

Modular Retrieval-Augmented Generation (RAG) chatbot with a FastAPI backend and a Next.js frontend. The solution follows a layered architecture that isolates presentation, service, domain, and infrastructure logic.

## Structure

- `backend/` – FastAPI application (REST + SSE), document ingestion pipeline, LangChain integrations.
- `frontend/` – Next.js App Router UI with streaming chat and document management.
- `docs/` – Additional documentation (architecture, API overview).

Refer to [ARCHITECTURE.md](ARCHITECTURE.md) for the full directory map and layering overview.

## Getting Started

### Backend

```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate  # or source .venv/bin/activate on macOS/Linux
pip install -e .
cp .env.example .env
uvicorn app.main:app --reload
```

Key env vars (set in `.env`):

- `OPENAI_API_KEY` – required for embeddings and chat completion.
- `COHERE_API_KEY` – optional, reserved for future reranking.
- `DOCS_PATH`, `VECTORSTORE_PATH` – customise storage locations if needed.

API base URL defaults to `http://localhost:8000/api/v1`. See [docs/backend-api.md](docs/backend-api.md).

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Ensure `NEXT_PUBLIC_API_BASE_URL` matches the backend URL. Frontend dev server runs at `http://localhost:3000`.

## Core Features

- Streamed chat answers (SSE) grounded in indexed `.txt` documents.
- Conversation management limited to the five most recent threads.
- Document CRUD with automatic re-indexing of the Chroma vector store.
- Multi-query retrieval + reciprocal rank fusion implemented via LangChain.
- Modular layering: API ↔ Services ↔ Domain ↔ Infrastructure ↔ Ingestion.

## Next Steps

- Add persistence for conversations (e.g., PostgreSQL or MongoDB).
- Extend ingestion CLI for batch operations and schedule indexing jobs.
- Expand test coverage (unit tests for services, integration tests for API).
- Containerize with Docker Compose for one-command startup.
