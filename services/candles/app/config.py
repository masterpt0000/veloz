from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Safe browser origins for the Veloz SPA (no wildcard).
_DEFAULT_CORS = ",".join(
    [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
        "https://veloz.apps.grok.bot",
    ]
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Required — no guessable fallback password in shipped files.
    database_url: str = Field(min_length=1)
    candles_api_key: str = Field(min_length=16)

    cors_origins: str = _DEFAULT_CORS
    host: str = "0.0.0.0"
    port: int = 8080

    binance_market: str = "spot"  # spot | futures
    # Empty = market default (spot: data-api.binance.vision; futures: fapi.binance.com)
    binance_rest_url: str = ""
    binance_symbols: str = "BTCUSDT,ETHUSDT,SOLUSDT"
    ingest_backfill_days: int = 7
    ingest_poll_seconds: int = 30
    run_ingest: bool = True
    max_bars_per_request: int = 50_000
    default_limit: int = 5_000
    max_backfill_symbols: int = 10
    max_backfill_days: int = 366

    @field_validator("database_url")
    @classmethod
    def _reject_weak_db_url(cls, value: str) -> str:
        url = value.strip()
        if not url:
            raise ValueError("DATABASE_URL is required")
        # Block the old documented default password if someone pastes it.
        if "://veloz:veloz@" in url:
            raise ValueError(
                "DATABASE_URL must not use the weak default password 'veloz'; "
                "set a strong POSTGRES_PASSWORD / DATABASE_URL"
            )
        return url

    @field_validator("candles_api_key")
    @classmethod
    def _require_api_key(cls, value: str) -> str:
        key = value.strip()
        if len(key) < 16:
            raise ValueError(
                "CANDLES_API_KEY is required (min 16 chars); "
                "generate with: openssl rand -hex 32"
            )
        return key

    @field_validator("cors_origins")
    @classmethod
    def _no_wildcard_cors(cls, value: str) -> str:
        raw = value.strip()
        if not raw or raw == "*":
            raise ValueError(
                "CORS_ORIGINS must be an explicit comma-separated allowlist "
                "(wildcard '*' is not allowed)"
            )
        parts = [o.strip() for o in raw.split(",") if o.strip()]
        if any(p == "*" for p in parts):
            raise ValueError("CORS_ORIGINS must not include '*'")
        return ",".join(parts)

    @model_validator(mode="after")
    def _bounds(self) -> "Settings":
        if self.max_backfill_symbols < 1:
            raise ValueError("max_backfill_symbols must be >= 1")
        if self.max_backfill_days < 1:
            raise ValueError("max_backfill_days must be >= 1")
        return self

    @property
    def symbols(self) -> list[str]:
        return [s.strip().upper() for s in self.binance_symbols.split(",") if s.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
