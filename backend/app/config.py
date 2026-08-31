import secrets
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env relative to the backend/ directory (parent of app/), so the file is
# loaded no matter which working directory uvicorn is started from. A relative
# "env_file" would silently fall back to the random SECRET_KEY default whenever the
# process is launched from somewhere other than backend/, invalidating all tokens.
_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), extra="ignore")

    # App
    APP_ENV: str = "development"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000

    # CORS – comma-separated list of allowed origins; must be explicit when using cookies
    CORS_ORIGINS: str = "http://localhost:3000"

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/recircula_db"

    # JWT – SECRET_KEY must be set in production via environment variable
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Session cookie used by frontend middleware route protection
    SESSION_COOKIE_NAME: str = "rc_session"
    SESSION_COOKIE_PATH: str = "/"
    SESSION_COOKIE_DOMAIN: str = ""
    SESSION_COOKIE_SAMESITE: str = "lax"
    SESSION_COOKIE_SECURE: bool = False

    # Email (SMTP) – leave SMTP_HOST empty to disable email sending
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@recircula.app"
    SMTP_TLS: bool = True

    # Frontend base URL used in e-mail links
    FRONTEND_URL: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        if self.CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def session_cookie_domain(self) -> str | None:
        domain = self.SESSION_COOKIE_DOMAIN.strip()
        return domain or None


settings = Settings()
