"""Application service handling document operations."""

from __future__ import annotations

from typing import Sequence
from uuid import UUID, uuid4

from app.domain.interfaces.document_repository import DocumentRepository
from app.domain.models.document import DocumentRecord
from app.ingestion.pipeline import DocumentIngestionPipeline
from app.infrastructure.storage.file_storage import LocalFileStorage


class DocumentService:
    """Coordinate document CRUD, storage, and indexing."""

    def __init__(
        self,
        repository: DocumentRepository,
        storage: LocalFileStorage,
        ingestion_pipeline: DocumentIngestionPipeline,
    ) -> None:
        self._repository = repository
        self._storage = storage
        self._ingestion_pipeline = ingestion_pipeline

    def list_documents(self) -> Sequence[DocumentRecord]:
        return self._repository.list()

    def get_document(self, document_id: UUID) -> DocumentRecord | None:
        return self._repository.get(document_id)

    def upsert_document(self, filename: str, content: str, document_id: UUID | None = None) -> DocumentRecord:
        if not content.strip():
            raise ValueError("Document does not contain any text.")

        existing = self._repository.get(document_id) if document_id else None

        summary_source = content.strip()
        summary = summary_source[:200] + ("..." if len(summary_source) > 200 else "")

        if existing:
            path = self._storage.save_text(existing.source_path, content)

            existing.filename = filename
            existing.source_path = path
            existing.summary = summary
            record = existing
        else:
            new_id = document_id or uuid4()
            storage_name = self._storage.build_text_filename(filename, new_id)
            path = self._storage.save_text(storage_name, content)
            record = DocumentRecord(id=new_id, filename=filename, source_path=path, summary=summary)

        saved_record = self._repository.upsert(record)
        self._index_document(saved_record, content)
        return saved_record

    def delete_document(self, document_id: UUID) -> None:
        record = self._repository.get(document_id)
        if record:
            self._storage.delete(record.source_path)
        self._repository.delete(document_id)
        self._ingestion_pipeline.delete_document(document_id)

    def get_document_with_content(self, document_id: UUID) -> tuple[DocumentRecord, str] | None:
        record = self._repository.get(document_id)
        if not record:
            return None
        content = self._storage.read_text(record.source_path)
        return record, content

    def reindex_all(self) -> int:
        """Rebuild the vector store from all known documents."""

        total_chunks = 0
        for record in self._repository.list():
            try:
                content = self._storage.read_text(record.source_path)
            except FileNotFoundError:
                continue
            total_chunks += self._index_document(record, content)
        return total_chunks

    def vector_count(self) -> int:
        """Return number of indexed chunks."""

        return self._ingestion_pipeline.count()

    def reset_index(self) -> None:
        """Clear vector index."""

        self._ingestion_pipeline.reset()

    def _index_document(self, record: DocumentRecord, content: str) -> int:
        metadata = {
            "source": str(record.source_path),
            "filename": record.filename,
        }
        return self._ingestion_pipeline.index_document(
            document_id=record.id,
            content=content,
            metadata=metadata,
        )
