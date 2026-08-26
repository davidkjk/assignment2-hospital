from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_jwt_secret: str
    database_url: str
    session_timeout_minutes: int = 30
    # Password-recovery links may only return to this server-owned origin.
    # None is fail-closed: the API keeps its neutral response but sends no link.
    staff_web_origin: str | None = None

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
