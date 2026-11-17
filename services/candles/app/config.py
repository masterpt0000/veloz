from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://veloz:veloz@localhost:5432/veloz_candles"
    candles_api_key: str = ""
    cors_origins: str = "*"
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

    @property
    def symbols(self) -> list[str]:
        return [s.strip().upper() for s in self.binance_symbols.split(",") if s.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        raw = self.cors_origins.strip()
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]


settings = Settings()
