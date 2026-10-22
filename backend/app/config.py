from functools import lru_cache
from urllib.parse import urlsplit

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./cakecity-dev.db"
    jwt_secret: str = "development-only-change-me"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    cors_origins: str = "*"
    woocommerce_store_url: str = "https://cakecity.co.ke/wp-json/wc/store/v1"
    environment: str = "development"
    club_event_secret: str = ""
    woocommerce_webhook_secret: str = ""
    woocommerce_api_url: str = "https://cakecity.co.ke/wp-json/wc/v3"
    woocommerce_consumer_key: str = ""
    woocommerce_consumer_secret: str = ""
    redis_url: str = ""
    database_pool_size: int = Field(default=5, ge=1, le=50)
    database_max_overflow: int = Field(default=5, ge=0, le=50)
    club_earn_minor: int = Field(default=10000, gt=0)
    club_point_value_minor: int = Field(default=100, gt=0)
    club_expiry_days: int = Field(default=365, ge=1, le=3650)

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url.startswith("postgres://"):
            return "postgresql+psycopg://" + self.database_url[len("postgres://") :]
        if self.database_url.startswith("postgresql://"):
            return "postgresql+psycopg://" + self.database_url[len("postgresql://") :]
        return self.database_url

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


def validate_production_settings(settings: Settings) -> None:
    """Apply on every launch path; errors name keys, never their values."""
    if settings.environment.casefold() != "production":
        return
    if not settings.sqlalchemy_url.startswith("postgresql"):
        raise RuntimeError("Set a persistent PostgreSQL DATABASE_URL before starting production.")
    secret = settings.jwt_secret.strip()
    if len(secret) < 32 or any(word in secret.casefold() for word in ("change-me", "replace-with", "development-only", "test-secret")):
        raise RuntimeError("Set a unique random JWT_SECRET of at least 32 characters before starting production.")
    for origin in settings.cors_origin_list:
        parsed = urlsplit(origin)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment or "*" in origin:
            raise RuntimeError("CORS_ORIGINS must contain explicit HTTPS origins, or be empty for native-only access.")
    if not settings.redis_url:
        raise RuntimeError("Set REDIS_URL to enable shared production authentication and mutation rate limits.")
