from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Open-LAN default: any browser origin. Set an explicit comma-list to lock down.
_DEFAULT_CORS = "*"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Required — no guessable fallback password in shipped files.
    database_url: str = Field(min_length=1)
    # Empty = open mode (no X-API-Key). If set, must be ≥16 chars.
    candles_api_key: str = ""

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
    def _optional_api_key(cls, value: str) -> str:
        key = (value or "").strip()
        if not key:
            return ""
        if len(key) < 16:
            raise ValueError(
                "CANDLES_API_KEY, when set, must be at least 16 chars; "
                "generate with: openssl rand -hex 32 (or leave empty for open LAN)"
            )
        return key

    @field_validator("cors_origins")
    @classmethod
    def _normalize_cors(cls, value: str) -> str:
        raw = (value or "").strip()
        if not raw or raw == "*":
            return "*"
        parts = [o.strip() for o in raw.split(",") if o.strip()]
        if not parts:
            return "*"
        # Mixed "*" + specific origins is meaningless — treat as open.
        if any(p == "*" for p in parts):
            return "*"
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
    def api_auth_enabled(self) -> bool:
        return bool(self.candles_api_key)

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
