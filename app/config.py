from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    twelvelabs_api_key: str = ""
    twelvelabs_index_id: str = ""
    database_url: str = "sqlite:///./atlas.db"
    twelvelabs_base_url: str = "https://api.twelvelabs.io/v1.3"
    claude_model: str = "claude-opus-4-7"
    poll_interval_seconds: int = 10

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
