# Backend API Overview

Base URL: `/api/v1`

## Health

- `GET /health/` → status `{ "status": "ok" }`

## Conversations

- `GET /conversations` → List the five most recent conversations.
- `POST /conversations` → Create a conversation. Payload `{ "title": "..." }` (optional).
- `GET /conversations/{conversation_id}` → Fetch full message history.
- `PATCH /conversations/{conversation_id}` → Rename a conversation. Payload `{ "title": "..." }`.

## Chat

- `POST /chat/{conversation_id}` → Request a non-streaming answer. Body `{ "question": "..." }`.
- `POST /chat/{conversation_id}/stream` → Server-Sent Events stream (`token`, `end`, `error` events).

## Documents

- `GET /documents` → List uploaded `.txt` documents.
- `GET /documents/{document_id}` → Retrieve metadata and full content.
- `POST /documents` → Create a document. Payload `{ "filename": "doc.txt", "content": "..." }`.
- `PUT /documents/{document_id}` → Update a document (filename/content).
- `DELETE /documents/{document_id}` → Remove a document and associated vectors.

All endpoints return JSON except the streaming chat endpoint, which emits SSE frames.
