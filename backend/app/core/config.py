"""Application configuration powered by pydantic settings."""

from functools import lru_cache
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Ensure .env values populate os.environ for downstream libraries (LangSmith, OpenAI SDK, etc.)
load_dotenv()


class Settings(BaseSettings):
    """Central application settings."""

    app_name: str = "RAG Chatbot Backend"
    environment: str = Field(default="development", alias="APP_ENV")
    api_prefix: str = "/api/v1"

    docs_path: Path = Path("docs")
    vectorstore_path: Path = Path("db") / "chroma_db"
    logs_path: Path = Path("logs")

    openai_api_key: Optional[str] = Field(default=None, alias="OPENAI_API_KEY")
    cohere_api_key: Optional[str] = Field(default=None, alias="COHERE_API_KEY")

    chat_model: str = Field(default="gpt-4o-mini")
    embedding_model: str = Field(default="text-embedding-3-small")

    max_conversation_history: int = 5
    query_variations: int = 3
    retrieval_k: int = 3
    retrieval_fetch_k: int = 10
    retrieval_lambda: float = 0.5
    rrf_k: int = 60
    max_stream_tokens: int = 1024

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""

    settings = Settings()  # type: ignore[call-arg]
    settings.docs_path.mkdir(parents=True, exist_ok=True)
    settings.vectorstore_path.parent.mkdir(parents=True, exist_ok=True)
    settings.logs_path.mkdir(parents=True, exist_ok=True)
    return settings
