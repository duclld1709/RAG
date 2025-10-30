"""FastAPI application entrypoint."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langchain_openai import OpenAIEmbeddings

from app.api.routes import api_router
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.ingestion.pipeline import DocumentIngestionPipeline
from app.infrastructure.llm import OpenAIChatClient
from app.infrastructure.persistence import FileDocumentRepository, InMemoryConversationRepository
from app.infrastructure.storage import LocalFileStorage
from app.infrastructure.vectorstores import ChromaVectorStore
from app.services import ChatService, ConversationService, DocumentService


def create_application() -> FastAPI:
    settings = get_settings()
    configure_logging(settings)

    app = FastAPI(title=settings.app_name)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    bootstrap_dependencies(app, settings)
    app.include_router(api_router, prefix=settings.api_prefix)

    return app


def bootstrap_dependencies(app: FastAPI, settings: Settings) -> None:
    embedding_model = OpenAIEmbeddings(model=settings.embedding_model, api_key=settings.openai_api_key)
    vector_store = ChromaVectorStore(settings.vectorstore_path, embedding_model)

    ingestion_pipeline = DocumentIngestionPipeline(settings=settings, vector_store=vector_store)

    conversation_repository = InMemoryConversationRepository()
    conversation_service = ConversationService(conversation_repository, settings)

    metadata_index = settings.vectorstore_path.parent / "documents_index.json"
    document_repository = FileDocumentRepository(metadata_index)
    storage = LocalFileStorage(settings.docs_path)
    document_service = DocumentService(document_repository, storage, ingestion_pipeline)

    llm_client = OpenAIChatClient(model_name=settings.chat_model, api_key=settings.openai_api_key)
    chat_service = ChatService(
        settings=settings,
        conversation_service=conversation_service,
        vector_store=vector_store,
        llm_client=llm_client,
    )

    _warm_vector_store(document_service)

    app.state.settings = settings
    app.state.chat_service = chat_service
    app.state.conversation_service = conversation_service
    app.state.document_service = document_service


def _warm_vector_store(document_service: DocumentService) -> None:
    try:
        if document_service.vector_count() == 0:
            document_service.reindex_all()
    except FileNotFoundError:
        document_service.reset_index()


app = create_application()
