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

    # 일일 pg_dump 백업이 올라가는 Supabase Storage 버킷(배포 Task 7 · 14일 보관).
    backup_bucket: str = "backups"

    # 브라우저 CORS 허용 오리진(콤마구분). Vercel에 올라간 직원 웹·webchat이
    # 브라우저에서 이 백엔드를 호출할 수 있게 한다(배포 Task 14 Step 3.5).
    # 환자 앱은 Flutter 네이티브라 브라우저 CORS 대상이 아니므로 넣지 않는다.
    # 예: "https://staff.vercel.app,https://webchat.vercel.app"
    allowed_origins: str = ""

    # AI 상담봇(4단계) — LLM/RAG 설정. 키가 비면 자동 테스트는 stub(FakeEmbedder·
    # 주입된 가짜 모델)으로 돌고, 손검수·배포에서 실제 키를 넣으면 진짜 답변이 나온다.
    # 운영시간 판정은 서버 단일 is_open(at)(hospital_hours)이 담당하므로
    # business_hour_* 환경변수는 두지 않는다(정본 §1-9, SCHED-HOURS-03).
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    chat_model: str = "claude-sonnet-5"
    embedding_model: str = "text-embedding-3-small"
    anon_rate_limit_per_hour: int = 30
    # 익명 웹 상담 연락처(전화)의 대칭 암복호 키(Fernet base64). 비면 codec은 import는 되되
    # 실제 암복호 호출 시에만 실패한다(배포에서 설정 — anonymous_contact_codec 지연 초기화).
    anon_contact_encryption_key: str = ""

    model_config = SettingsConfigDict(env_file=".env")

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
