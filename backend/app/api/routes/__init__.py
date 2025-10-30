"""API route registrations."""

from fastapi import APIRouter

from . import chat, conversations, documents, health

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
