from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_jwt_secret: str
    database_url: str
    session_timeout_minutes: int = 30

    # DB 커넥션 풀 크기. Supabase 풀러(Supavisor) 세션 모드는 프로젝트 전체 클라이언트 접속을
    # pool_size(기본 15)로 제한한다. asyncpg 기본값(min=max=10)은 API 프로세스와 cron 프로세스가
    # 각자 10씩 잡아 15를 넘겨 EMAXCONNSESSION을 냈고, 그 여파로 cron·직원 초대(DB 연결 필요)가
    # "잠시 후 다시" 오류로 실패했다(2026-09-06). 작게 잡아 (API + cron + 배포 순간 컨테이너 겹침)이
    # 15 안에 들게 한다. 배포 env(DB_POOL_MAX_SIZE 등)로 조정 가능.
    db_pool_min_size: int = 1
    db_pool_max_size: int = 4
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
    # 분류·라우팅·질의 재작성·인계 사유 판정 등 '이해 계층'용 모델. 답변 생성(chat_model)과 분리해
    #   빠른 모델(Haiku)을 써 답변 앞단 지연을 줄인다(스트리밍 설계 §98: 지연 14→7초). 답변 본문·진료과
    #   추천은 chat_model(Sonnet) 유지. 하드 안전(응급·진단요구·직원요청)은 결정적이라 모델과 무관.
    #   되돌리기=이 값을 chat_model과 같게 두면 전부 Sonnet로 복귀.
    classify_model: str = "claude-haiku-4-5-20251001"
    # 질문 이해 방식(전면 통합, 세션46 GO). legacy=흩어진 이해(② 라우터 classify + 후속질문 rewrite,
    #   호출 2회), llm=이해기 1콜(conversation_understanding.understand)로 통합. 기본 legacy(되돌리기 3겹
    #   중 플래그 OFF). ⚠️ 안전(응급·직원요청·check_escalation)·답변생성은 두 모드 모두 앞/뒤단 그대로.
    #   llm 모드가 실패·형식 위반이면 자동으로 legacy 경로로 폴백한다(장애/자동인계로 안 번짐).
    chat_understanding_mode: str = "legacy"
    # [브랜치 A · 스위치] RAG 스트리밍 센티넬 노출 가드. True면 근거부재(NO_ANSWER)·되묻기(NEEDS_CLARIFY)
    #   센티넬의 영어 원문이 조각(delta)으로 환자 화면에 잠깐 노출되던 버그(2026-09-08 실측, 앱·webchat 공통)를
    #   막는다 — 조각 '전송'만 억제하고 최종 판정(no_answer/되묻기)은 불변. 기본 False=현재 동작 보존(되돌리기).
    #   되돌리기=env CHAT_STREAM_SENTINEL_GUARD 미설정/false.
    chat_stream_sentinel_guard: bool = False
    # [브랜치 A · 스위치] 보수적 라우팅. True면 이해기(understand)·레거시 라우터(classify) 프롬프트에
    #   "정보 질문은 애매해도 agent가 아니라 rag, 확실한 예약·취소·변경·문진 행동일 때만 agent" 원칙을 얹어
    #   정보 질문이 예약(agent)으로 오라우팅돼 막다른 길로 가는 것을 줄인다(세션52 실측). 기본 False=현재 동작.
    #   되돌리기=env CHAT_CONSERVATIVE_ROUTING 미설정/false.
    chat_conservative_routing: bool = False
    # [브랜치 A · 스위치] 이해기 구조화 출력. True면 understand()가 진짜 모델의 with_structured_output으로
    #   JSON을 받아 손파싱(따옴표 깨짐·설명 덧붙임에 취약)을 대체한다. 가짜 모델(테스트)·미지원 모델이면
    #   자동으로 손파싱 폴백이라 위험이 없다. 기본 False=현재 동작. 되돌리기=env CHAT_STRUCTURED_UNDERSTANDING 미설정/false.
    chat_structured_understanding: bool = False
    # 브랜치 B(에이전트형 RAG, LangGraph). 기본 OFF=현행 단발 rag_service 경로. 켜면 rag 갈래 답변 생성이
    #   문서채점→교정재검색→근거검증 그래프로. 되돌리기=이 값 false. env=CHAT_AGENTIC_RAG.
    chat_agentic_rag: bool = False
    embedding_model: str = "text-embedding-3-small"
    # 상담봇 브랜치 C(2026-09-10) — 후보 재정렬을 Haiku LLM 리랭커로. 기본 OFF=현행 max(벡터,키워드)
    #   재정렬(_rank_by_relevance). 켜면 rag_service:89에서 rerank_by_llm 호출, 끄면 즉시 원복.
    #   리랭커 모델은 classify_model(Haiku) 재사용, 외부는 이미 쓰는 Anthropic뿐(L410 추가 노출 0).
    chat_reranker: bool = False
    # 조건부 재검색(2026-09-11) — 무조건 에이전트 루프(브랜치 B: 매 질문 채점·검증으로 p50 +30%) 대신,
    #   **첫 하이브리드 검색이 게이트(HYBRID_FLOOR) 미달일 때만** 질의를 Haiku로 1회 재작성해 재검색한다.
    #   실패한 질문에만 지연이 붙어(대다수 정상 질문은 A단독 속도 유지) 검색 놓침(셔틀·CT금식 등)만 건진다.
    #   기본 OFF=현행 단발 검색. 켜면 rag_service가 miss 시 1회 재시도, 끄면 즉시 원복. env=CHAT_RERETRIEVE_ON_MISS.
    chat_reretrieve_on_miss: bool = False
    anon_rate_limit_per_hour: int = 30
    # 익명 웹 상담 연락처(전화)의 대칭 암복호 키(Fernet base64). 비면 codec은 import는 되되
    # 실제 암복호 호출 시에만 실패한다(배포에서 설정 — anonymous_contact_codec 지연 초기화).
    anon_contact_encryption_key: str = ""

    # 문자 발송(Solapi) — 세 값이 다 차면 실제 발송, 하나라도 비면 개발 폴백(서버 로그만).
    # LLM 키와 같은 원칙: "키만 꽂으면 진짜"(배포 env). 발신번호는 하이픈 없이(예: 029302266).
    solapi_api_key: str = ""
    solapi_api_secret: str = ""
    sms_sender_number: str = ""
    # [보안 F-03] 발송 상태 콜백(웹훅) 서명 검증용 공유 시크릿. 제공자가 콜백에 X-Solapi-Secret
    # 헤더로 실어 보내면 이 값과 상수시간 비교해 위조 콜백을 막는다. 비면 fail-closed —
    # 어떤 콜백도 처리하지 않는다(로컬·개발엔 콜백이 안 오므로 무해, 배포 env에서 설정).
    solapi_webhook_secret: str = ""
    # 푸시 발송(FCM HTTP v1) — 서비스 계정 JSON(내용 또는 경로)·프로젝트 ID. 비면 개발 폴백.
    fcm_credentials_json: str = ""
    fcm_project_id: str = ""
    # 이 서버의 공개 베이스 URL(예: https://api.example.com). 발송 상태 콜백(제공자 리포트
    # 웹훅) 수신 경로를 이 위에 얹는다. 비면 콜백 URL을 만들지 않는다(개발·로컬).
    public_base_url: str = ""

    # 이메일 발송(Resend) — 직원 초대·재초대·비밀번호 재설정 메일을 백엔드가 직접 보낸다.
    # 도메인(withlog.app)을 Resend에 인증한 뒤에만 본인 외 주소로 발송된다(2026-09-07 도메인 검증).
    # 키가 비면 개발 폴백(발송 안 함·로그만) — Solapi·FCM과 같은 "키만 꽂으면 진짜" 원칙.
    # mail_from은 "이름 <주소>" 형식 가능하며 주소의 도메인이 인증된 것이어야 한다.
    resend_api_key: str = ""
    mail_from: str = "가온병원 <hospital@withlog.app>"

    model_config = SettingsConfigDict(env_file=".env")

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
