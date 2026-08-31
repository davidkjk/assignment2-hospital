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

    # AI 상담봇(4단계) — LLM/RAG 설정. 키가 비면 자동 테스트는 stub(FakeEmbedder·
    # 주입된 가짜 모델)으로 돌고, 손검수·배포에서 실제 키를 넣으면 진짜 답변이 나온다.
    # 운영시간 판정은 서버 단일 is_open(at)(hospital_hours)이 담당하므로
    # business_hour_* 환경변수는 두지 않는다(정본 §1-9, SCHED-HOURS-03).
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    chat_model: str = "claude-sonnet-5"
    embedding_model: str = "text-embedding-3-small"
    anon_rate_limit_per_hour: int = 30

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
