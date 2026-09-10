# 상담봇 브랜치 B — 에이전트형 RAG(LangGraph) 설계

- 작성일: 2026-09-10
- 상태: 설계 확정(사용자 승인) → 구현 계획(writing-plans) 대기
- 브랜치: `feat/chatbot-branch-b` (base `0d5fe33` = 프로덕션 기준선, 브랜치 A와 동일 base)
- 워크트리: `.claude/worktrees/chatbot-branch-b`

## 1. 배경·목적

두 불만(①틀리거나 엉뚱한 답 ②너무 잦은 직원 연결)의 구조적 원인으로 "단발 RAG(한 번 검색 → 못 찾으면 포기)"가 지목됐다. 재설계안(아티팩트 `6e899956`)은 **에이전트형 RAG**(재검색 루프 + 근거검증)를 제안했고, 독립평가서(`docs/research/chatbot-redesign-eval-2026-09-10.md`)는 이를 **현 시점 과설계**로 평결했다.

**사용자 결정**: 평가서의 "과설계" 평결을 말로 받지 말고, 진짜 에이전트형 RAG를 **실제로 구현해** 브랜치 A(저비용 스위치 3종, 세션56 완료)와 **실환경 A/B로 대조**한다. 이 문서는 그 브랜치 B의 설계다.

측정으로 결론을 낸다: 같은 15문항·같은 프로덕션 KB(181청크)로 ⓪(현재)·Ⓐ(A 켬)·Ⓑ(B 켬)를 대조해, 에이전트 루프가 품질을 얼마나 올리고 지연을 얼마나 늘리는지 숫자로 판단한다.

## 2. 범위

### 넣는 것 (핵심 루프, 사용자 확정 2026-09-10)
1. **문서 채점(grade)** — 검색해 온 자료가 질문과 관련 있는지 판정.
2. **교정형 재검색(corrective)** — 관련 없음/근거부족이면 질의를 고쳐 재검색(최대 N회).
3. **근거 검증(self-RAG)** — 생성한 답이 자료로 뒷받침되는지 검증, 아니면 재생성/인계.
4. **질의 분해(decompose)** — 복합 질문을 하위 질의로 나눠 각각 검색.
5. 위 전부를 **LangGraph 상태그래프**로.

### 뺀 것 (섞으면 A/B 해석이 흐려짐 — 별도 브랜치로)
- **cross-encoder 리랭커** → 나중에 **브랜치 C**(자기만의 A/B). 검색 정밀도 축은 루프 축과 분리.
- **툴콜(실시간 조회·대화형 예약)** → 그 이후. 답변 "품질"이 아니라 "능력"이고 개인정보 가드레일 부담이 큼(평가서 §3.4).
- **시맨틱 캐시** → 보류(시간·사용자 의존 데이터 오재사용 위험, 평가서 §3.5).
- **LangSmith** → 도입 X(요구사항 L410 개인정보). 관측은 내부 DB 계측(§5).

### 발동 정책 (사용자 확정 2026-09-10)
- **항상**: 모든 rag 갈래 질문에서 채점·(필요시)재검색·근거검증을 다 돌린다("검색 약할 때만"은 브랜치 A와 유사해져 실험 의미가 약함). 대신 상한·시간예산으로 폭주를 막고, 지연은 A/B에서 p50/p95로 측정한다.

## 3. 불변식 (그래프 밖의 결정적 코드로 유지)

브랜치 B는 **답변 생성 파이프라인(rag 갈래)만** 그래프로 바꾼다. 아래는 손대지 않는다.

| 불변식 | 근거·위치 |
|---|---|
| 안전 게이트 순서(응급 → 직원연결 확인/요청 → 인계 감시 → 의도 프리체크 → 라우팅) | `orchestrator.py:106-177` — **수정 없음** |
| 응급은 LLM 이전 결정적 키워드 판정 | `safety_watchdog.emergency_kind` |
| 하이브리드 검색 SQL(벡터 ∪ pg_trgm RRF) | `supabase/migrations/00084_kb_hybrid_search.sql` — 그대로 호출 |
| 검색 게이트 `HYBRID_FLOOR=0.30` · `CANDIDATE_POOL=12` · `_rank_by_relevance`(max(vector,keyword)) | `rag_service.py:16-24,56-62` — **동일 값·동일 로직 재사용**(import) |
| 제한 자료 처리: 1위가 제한자료면 LLM 없이 원문 블록 + [직원 연결] | `rag_service.py:107-109` — 채점/생성 건너뛰고 그대로 |
| DB 영속(메시지·근거 스냅샷·티켓·인계요약) | `chat_flow_service.py`, `rag_service.record_answer_sources` |
| 실시간 스트리밍 계약(Supabase Broadcast `bot_typing`/`bot_delta`/`bot_done` + DB reconcile) | `realtime_broadcast.py`, `chat_flow_service.py:178-201` |
| 카드 2단계 확인·몰래예약 금지(L377) / 변경·취소 자동실행 금지(L49) / 환자데이터 무단검색 금지(L410) / 진단·자동전화 금지(L545·546) | 요구사항; 그래프는 rag 갈래(정보 안내)만 담당하므로 예약/취소/진단 갈래에 개입하지 않음 |

**핵심**: 그래프는 라우팅이 `rag`로 판정한 **이후에만** 진입한다. 응급·인계·행동형(agent)·진료과(department_guide) 갈래는 그래프를 거치지 않는다. 모델 실패나 그래프 루프가 안전·금지 판정을 우회할 수 없다.

## 4. 아키텍처

### 4.1 배치 — 주입 seam 하나만 분기

`orchestrate()`는 RAG를 의존성 주입 `rag_fn`으로 부른다(`orchestrator.py:290`). 그 `rag_fn`은 `chat_flow_service`의 클로저(`chat_flow_service.py:224-236`)로, 현재 `rag_service.rag_answer(...)`를 호출한다.

**브랜치 B의 유일한 기존파일 수정**: 이 `rag_fn` 클로저에서 플래그 분기.
```
CHAT_AGENTIC_RAG=true  → agentic_rag_service.agentic_rag_answer(m, embedder, model, retrieval_query, on_delta)
CHAT_AGENTIC_RAG=false → rag_service.rag_answer(...)   # 현행 그대로 (기본값)
```
`agentic_rag_answer`는 `rag_answer`와 **동일한 인자·동일한 반환 dict 형태**를 지킨다 → 오케스트레이터·chat_flow_service의 나머지·스트리밍·DB 영속 코드를 그대로 재사용한다.

### 4.2 그래프 (LangGraph `StateGraph`)

상태(TypedDict `AgenticRagState`):
- `message: str` — 환자 원문(화면·LLM 질문·근거 판정에 사용)
- `sub_queries: list[str]` — decompose 산물(복합 아니면 `[검색질의]` 1개)
- `docs: list[dict]` — 현재 검색·재정렬된 청크(중복 제거·관련도순)
- `relevant: bool` — grade 결과
- `attempts: int` — 교정 재검색 횟수(0부터)
- `draft: str` — generate 산물
- `grounded: bool` — verify 결과
- `regen: int` — 재생성 횟수(0부터)
- `deadline: float` — 시간 예산(monotonic 기준 종료 시각)
- `outcome: dict | None` — 최종 `rag_answer` 형태 결과

노드·간선:
```
START
  → decompose            (복합이면 하위질의 N개, 아니면 1개)
  → retrieve             (하위질의 병렬 검색·병합·재정렬·floor·제한자료 검사)
      └[1위 제한자료]→ finalize_restricted → END   (LLM 없이 원문 블록)
  → grade                (docs가 질문에 관련·충분한가?)
  → [relevant? ]
       ├─ 예 ───────────────────────→ generate
       └─ 아니오 & attempts<N ──→ rewrite → retrieve   (교정 루프)
       └─ 아니오 & attempts≥N ──→ finalize_no_answer → END
  → generate             (docs 근거로 답 생성 — 내부 버퍼)
  → verify               (draft가 docs로 뒷받침되나?)
  → [grounded?]
       ├─ 예 ───────────────────────→ finalize_answer(스트림 방출) → END
       └─ 아니오 & regen<1 ─────→ generate (재생성 1회)
       └─ 아니오 & regen≥1 ─────→ finalize_no_answer → END
  (어느 노드든 deadline 초과 시 → 지금까지 최선으로 finalize)
```

### 4.3 노드 상세

- **decompose** (Haiku, 구조화 출력) — 발화에 서로 다른 사실 질문이 둘 이상이면 하위 질의 리스트, 아니면 원 질의 1개. 오탐(단순 질문을 쪼갬)을 줄이려 "명백히 둘 이상일 때만" 프롬프트. 실패/미지원 모델이면 `[검색질의]` 1개로 폴백.
- **retrieve** — `rag_service`의 검색 로직을 **동일하게 재사용**: `normalize_query` → `embedder.embed` → `match_kb_chunks_hybrid`(UndefinedFunctionError 시 순수 벡터 폴백) → `_rank_by_relevance` → 상위 `match_count`. 하위질의 여러 개면 병렬(asyncio.gather)로 각각 검색해 청크 병합·중복 제거·관련도순 정렬. 1위가 floor 미만이면 `relevant=False` 신호(→ grade 없이 바로 교정 루프 판단). **1위가 제한자료면 즉시 `finalize_restricted`**(현행 `rag_service.py:107-109`와 동일).
- **grade** (Haiku, 구조화 출력 `{relevant: bool, reason: str}`) — docs 요약이 `message`(복합이면 하위질의 전부)를 답하기에 관련·충분한가. floor 미만이면 grade 생략하고 `relevant=False`.
- **rewrite** (Haiku, 구조화 출력) — 왜 못 찾았는지 근거로 검색 질의를 고쳐 재작성(동의어·상위어·구체화). 화면·LLM 질문엔 여전히 `message` 원문을 쓴다(재작성은 검색에만 — 현행 원칙 유지). `attempts += 1`.
- **generate** (Sonnet) — 현행 `_ANSWER_SYSTEM_PROMPT`·few-shot 예시 로직 재사용. **내부 버퍼**로 전체 답을 만든다(사용자에게 아직 안 보냄 — §4.5). NO_ANSWER/NEEDS_CLARIFY 센티넬 판정은 현행과 동일하게 완성본에서 수행.
- **verify** (Haiku, 구조화 출력 `{grounded: bool, reason: str}`) — draft의 각 주장(진료비·시간·절차 등 사실)이 docs에 실제로 있는지. 센티넬(NO_ANSWER/NEEDS_CLARIFY)이면 verify 생략(각각 no_answer/되묻기로 finalize).
- **finalize_answer** — 검증 통과분만 스트림으로 방출(§4.5) 후 `{reply, sources(+restricted_block?)}`.
- **finalize_no_answer** — `{no_answer: True}`(오케스트레이터가 FAQ 칩 + [직원에게 연결] 칩으로 렌더, 자동 인계 아님 — `orchestrator.py:203-207`).
- **finalize_restricted** — `{reply: None, restricted_block, actions:["직원 연결"], sources}`.

### 4.4 상한·시간 예산

- 교정 재검색 상한 `N = 2`(검색 총 최대 3회). 재생성 상한 `1`. → 무한루프·비용 폭주 방지.
- 시간 예산(그래프 진입 시 `deadline` 설정, 기본 제안 20초 — 계획 단계에서 확정): 초과하면 진행 중 최선(있으면 draft, 없으면 no_answer)으로 즉시 finalize.
- **품질 통과 질문은 추가 호출 0에 근접**: grade가 첫 검색을 관련으로 판정하고 verify가 통과하면 재검색·재생성 없음. 추가 비용은 grade 1콜 + verify 1콜(+decompose 1콜)로 한정.

### 4.5 스트리밍·센티넬 (근거검증과의 정합)

근거검증은 완성본을 봐야 하므로, 브랜치 B는 **"버퍼 → 검증 → 방출"** 순으로 간다.
- generate는 델타를 **내부 버퍼**에만 쌓는다(`bot_typing`은 유지해 "입력 중" 표시).
- verify 통과 시에만 finalize_answer가 버퍼를 `on_delta`로 흘려보내고(UI 연속성) `bot_done`으로 확정.
- 결과: `NO_ANSWER`/`NEEDS_CLARIFY` 영어 원문이 환자에게 노출되던 버그(세션52 #3)가 **구조적으로 사라진다** — 센티넬은 방출 전에 판정된다.
- 트레이드오프: 답 첫 글자까지 지연이 늘어난다(gen + verify 후 방출). 이 지연은 A/B에서 측정하는 브랜치 B의 고유 특성이다.

### 4.6 모델 배치

- 판정 노드(decompose·grade·rewrite·verify) = **Haiku**(`config.classify_model`, `classify_model_for()` — 세션51 이해계층 분리와 일관). 가볍고 빠르고 일관.
- 답변 생성(generate) = **Sonnet**(현행과 동일).
- 테스트는 노드별 가짜 모델 주입(§8).

### 4.7 반환 계약 (rag_answer와 동일)

`agentic_rag_answer`는 아래 중 하나를 반환(현행 `rag_answer`와 동형):
- `{no_answer: True}`
- `{reply: None, restricted_block, actions, sources}`
- `{needs_clarification: True, reply}`
- `{reply, sources, restricted_block?}`

## 5. 관측 (내부 DB, LangSmith 없음)

턴마다 루프 지표를 내부에 남긴다(외부 전송 없음 — L410). 근거 스냅샷은 현행 `chat_message_sources`(`rag_service.record_answer_sources`)를 유지하고, 다음을 추가 기록한다: `search_attempts`(재검색 횟수)·`graded_relevant`·`grounded`·`regen`·`decomposed`(하위질의 수)·경과시간. 저장 위치·스키마는 계획 단계에서 확정(기존 route/근거 DB 경로 확장, 새 외부 의존성 없음).

## 6. 되돌리기

- config 플래그 `CHAT_AGENTIC_RAG` **기본 False**. 배포해도 동작 불변, env로 켜야 발동, 끄면 즉시 원복.
- 독립 브랜치·워크트리라 A와 격리. A/B 종료 후 채택 시에만 병합, 미채택이면 브랜치 폐기.

## 7. 파일 경계 (브랜치 A와 겹침 최소)

| 구분 | 파일 | 성격 |
|---|---|---|
| 신규 | `backend/app/services/chat/agentic_rag/state.py` · `nodes.py` · `graph.py` · `service.py`(=`agentic_rag_answer`) | 새 모듈 |
| 신규 | `backend/tests/test_agentic_rag*.py` | 새 테스트 |
| 수정(최소) | `backend/app/services/chat/chat_flow_service.py` — `rag_fn` 클로저 플래그 분기(224-236 부근, 수 줄) | seam 1곳 |
| 수정(최소) | `backend/app/core/config.py` — `agentic_rag_enabled` 플래그 추가 | 1줄 |
| 수정 | `backend/requirements.txt` — `langgraph` 추가(langsmith 없음) | 1줄 |
| 재사용(수정 없음, import) | `rag_service`(검색·재정렬·프롬프트·상수·센티넬·record_answer_sources) · `query_normalizer` · `langchain_client` · `db.pool` | 그대로 |

브랜치 A가 건드린 파일: `rag_service.py`·`conversation_understanding.py`·`chat_router.py`·`config.py`(3플래그). 겹치는 것은 `config.py`(서로 다른 플래그 추가 — 병합 시 라인만 인접, 논리 충돌 없음)와 재사용 대상 `rag_service.py`(B는 **import만** 하고 수정 안 함)뿐.

## 8. 테스트 전략

- **노드 단위**: 각 노드는 얇은 `langchain_client` 팩토리를 통해 모델을 받으므로, 가짜 모델(정해진 grade/verify/answer 반환)을 주입해 순수 테스트한다(현행 패턴과 동일).
- **루프 동작**: ①grade 관련X → rewrite → 재검색(상한 N에서 멈춤 → no_answer) ②verify 근거부족 → 재생성 1회 → 그래도 부족 → no_answer ③통과 경로는 추가 호출 없음 ④제한자료 1위 → LLM 없이 원문 블록 ⑤센티넬은 방출 전 판정(노출 0) ⑥deadline 초과 → 최선 finalize.
- **안전 무회귀**: 기존 `test_orchestrator`(안전 게이트 순서·응급·인계 골든)·`test_safety_watchdog`가 무변경 통과. 그래프는 rag 갈래 이후에만 도므로 안전 경로 불변.
- **실행법(공용 DB truncate 회피)**: `--noconftest` + 더미 env(`DATABASE_URL`·`SUPABASE_*`)로 순수 테스트만. venv=메인 `backend/.venv`(워크트리엔 없음). DB 통합 테스트는 플래그 OFF=현행 경로라 평상시 회귀로 커버.

## 9. A/B 측정 (완료 판정)

- 도구: `backend/scripts/bot_probe.py`(익명 curl 15문항 종단, 문항마다 새 세션). Ⓑ 측정용 `--label branchB`.
- 대조: ⓪(현재, 스위치 OFF) · Ⓐ(A 3스위치 ON) · Ⓑ(B 플래그 ON) — 셋 다 같은 프로덕션 KB(181청크). Railway `gaonhospital-api` 소스 브랜치 전환으로 순차 배포(A와 순차, 겹치지 않게).
- 지표: 정확답 · no_answer율 · 되묻기율 · **실제 인계율**(칩 클릭 티켓 생성, no_answer 표시와 분리 — 평가서 §2.3) · **p50/p95 지연** · 재검색/재생성 횟수 분포.
- **안전 불변식 무회귀**: 응급·진단요구·명시적 직원요청 프로브가 Ⓑ에서도 그대로 인계/안내되는지 확인(그래프가 안전 갈래를 우회하지 않음을 실측).
- 판정: "지연 증가분 대비 품질 향상이 값어치가 있나"를 숫자로 사용자와 결정. 채택 시 병합, 미채택이면 폐기(플래그로 무위험).

## 10. 요구사항 준수 대조표

| 요구사항 | 브랜치 B 판정 | 근거 |
|---|---|---|
| L23·421 (예약 공용 원장) | 무관 — rag 갈래는 정보 안내만, 예약 write 미개입 | 그래프는 rag 갈래 전용 |
| L377 (몰래예약 금지·2단계 확인) | 무관 — 카드 확인 경로 불변(agent 갈래) | §3 |
| L49 (변경·취소 안내만) | 무관 — 취소 실행 갈래 미개입 | §3 |
| L410 (개인정보 무단검색 금지, 외부전송 금지) | 준수 — KB 검색만, LangSmith 미도입, 관측은 내부 DB | §2·§5 |
| L545·546 (진단·자동전화 금지) | 준수 — 진단요구는 그래프 밖 결정적 denylist가 선점(인계) | §3, `safety_watchdog.check_diagnosis_request` |
| 제한 자료(A3·`KBADM-EDITOR-04`) | 준수 — 1위 제한자료면 LLM 없이 원문 블록 | §4.3 finalize_restricted |

## 11. 후속 (범위 밖)

- **브랜치 C**: cross-encoder 리랭커, 자기만의 A/B(현행 `max(vector,keyword)` 대비).
- **그 이후**: 좁은 인증 툴콜(RLS·확인 게이트·멱등, 평가서 §3.4 조건 5개), 사전문진 자동채움.
- 이번 A/B 결과에 따라 위 순서·필요성 재판단.
