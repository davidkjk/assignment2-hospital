> **평결: 전면 LangGraph 재작성은 현 시점에는 과설계다. 운영 색인·종단 라우팅을 먼저 계측하고, 확인된 라우팅/스트리밍/검색 결함을 저비용으로 고친 뒤에도 남는 검색 실패에만 “최대 1회” 자기교정 루프를 붙이는 조건부 접근이 타당하다. 신뢰도: 코드 판단 높음, 현재 라이브 상태 중간.**

# AI 상담봇 재설계 독립 평가

평가일: 2026-09-10  
범위: 상담봇 백엔드 구조, RAG 품질, 예약 도구, 요구사항 가드레일  
방법: 저장소 코드와 최신 트랙 기록을 직접 대조한 정적 평가. 원격 DB·Railway·유료 LLM은 자격 증명이 없어 실행하지 않았다.

## 1. 결론 요약

| 판단 | 결론 | 우선순위 |
|---|---|---|
| 현재 구조 | 검색과 답변 생성은 실질적으로 단발이다. 다만 “매번 질의 재작성”, “회복 수단 없음”, “no_answer 즉시 직원 인계”는 사실이 아니다. | 사실관계 정정 |
| 불만의 주원인 | 확인된 최대 장애는 프레임워크가 아니라 운영 KB 청크 0건이었다. 최신 기록상 181청크로 복구 뒤 15문항 중 12문항이 정상화됐다. 남은 문제는 라우팅 원칙과 일부 CT 검색이다. | P0 |
| `HYBRID_FLOOR=0.30` | 실패를 결정하는 관문 중 하나이지, 현재 과잉 인계의 단독 원인으로 볼 근거는 없다. 동일한 0.30에서 저비용 검색 수정만으로 오프라인 Recall이 16%→97%가 됐다. | 측정 후 조정 |
| LangGraph | 관련 문서가 존재하지만 첫 검색이 놓치는 문제에는 제한적 이득이 있다. 색인 공백·KB 내용 공백·오라우팅은 해결하지 못하며, 현재 규모에서 전면 전환 비용이 이득보다 크다. | 보류/조건부 |
| 구조화 출력 | 손 JSON 파싱을 없애는 것은 독립적으로 가치가 높다. LCEL 또는 LangGraph 전환의 선행조건일 필요는 없다. | P1 |
| cross-encoder | 이미 경량 재정렬로 오프라인 97/93/100을 얻었다. 현재 남은 실패군을 종단 평가한 뒤에만 A/B한다. | P2 조건부 |
| 예약 툴 에이전트 | 범용 자율 에이전트는 불필요하다. 현재의 인증·재확인·멱등 카드 액션을 보존한 좁은 타입 도구가 요구사항과 보안에 더 맞다. | 범용형 보류 |
| 순서 | “측정 먼저”는 옳다. 단, 이미 확인된 센티넬 노출과 라우팅 프롬프트 결함은 계측 작업과 병행해도 된다. | P0/P1 병행 |

오프라인 최신 기록은 현행 경량 검색에서 Recall@5 97%, 사실 충실성 93%, 금지 주장 없음 100%를 보고한다. 이 수치는 품질 상한이 낮아서 전면 재작성해야 한다는 주장보다, 운영 배선과 종단 라우팅의 차이를 먼저 찾으라는 증거에 가깝다. 다만 이 평가 러너는 RAG 갈래를 직접 실행하므로 실제 라우터 오분류까지 보증하지 않는다. (`backend/evals/results/2026-09-09-baseline.md:85-93`, `backend/scripts/rag_eval.py:86-113`, `backend/scripts/rag_eval.py:150-152`)

## 2. 현재 구조 검증

### 2.1 오케스트레이션과 안전 순서

요청자 요약의 큰 순서는 맞다. 실행 순서는 응급 → 직원 연결 확인/요청 → 인계 감시 → DB 의도 프리체크 → 라우팅이며, 응급은 LLM 이전의 결정적 키워드 판정이다. 진료시간과 의사 명단도 RAG보다 앞서 DB 원본을 조회한다. (`backend/app/services/chat/orchestrator.py:106-152`, `backend/app/services/chat/safety_watchdog.py:48-74`, `backend/app/services/chat/chat_flow_service.py:246-277`)

다만 인계 감시 전체가 비-LLM인 것은 아니다. 반복·진단/처방 요구 등은 결정적으로 처리하지만, 안내 불일치 주장과 불만 분류는 LLM을 호출한다. 따라서 “응급 게이트는 결정적”과 “인계 감시 전체는 결정적”을 구분해야 한다. (`backend/app/services/chat/safety_watchdog.py:117-151`)

안전 게이트를 LangGraph 내부로 옮길 이유는 없다. 현재처럼 라우팅·검색보다 먼저 두어야 모델 실패나 그래프 루프가 응급 안내와 금지 영역 판정을 우회하지 못한다. 정본도 예약 중 제한 모드를 포함해 긴급 안내가 항상 작동하도록 규정한다. (`backend/app/services/chat/orchestrator.py:113-155`, `docs/고객요구사항.txt:366-371`, `docs/design/chatbot-source-of-truth.md:7-15`, `docs/design/screen-behaviors.md:5233-5237`)

### 2.2 RAG는 단발인가

검색 관점에서는 **단발 구조가 맞다**. 한 번 임베딩하고, 하이브리드 SQL 함수를 한 번 호출하고, 후보를 재정렬한 뒤 한 번 답변을 생성한다. 관련 문서 채점용 별도 모델, 검색 질의 재작성 후 재검색, 답변 근거 검증 후 재생성 루프는 없다. SQL 함수 미배포 때 순수 벡터 검색으로 내리는 예외적 폴백은 있지만 자기교정 루프는 아니다. (`backend/app/services/chat/rag_service.py:65-97`, `backend/app/services/chat/rag_service.py:111-156`)

“질의를 매 메시지마다 1회 재작성한다”는 요약은 틀렸다. legacy 모드에서는 이력이 있고 현재 발화가 짧거나 지시어를 포함할 때만 재작성하고, 첫 질문·자기완결 질문은 원문을 쓴다. llm 모드도 통합 이해기가 만든 재작성 결과를 같은 후속 신호 규칙으로 버릴 수 있다. (`backend/app/services/chat/conversation_understanding.py:23-43`, `backend/app/services/chat/conversation_understanding.py:46-78`, `backend/app/services/chat/conversation_understanding.py:148-156`, `backend/app/services/chat/chat_flow_service.py:224-236`)

“회복이 전혀 없다”도 너무 강한 표현이다. 검색 실패 후 **재검색 회복**은 없지만, 하이브리드 함수 부재 시 벡터 폴백, 검색 전·후 되묻기, no-answer 빠른 질문/직원 연결 선택지, 모델 장애 시 outage, 실시간 전송 실패 시 DB 재조회라는 복구 경로는 있다. (`backend/app/services/chat/rag_service.py:77-89`, `backend/app/services/chat/orchestrator.py:161-210`, `backend/app/services/chat/chat_flow_service.py:168-201`, `backend/app/services/chat/realtime_broadcast.py:8-34`)

### 2.3 `no_answer`는 자동 직원 인계인가

아니다. 현재 `no_answer`는 세션을 유지하면서 FAQ 칩과 “직원에게 연결하기” 칩을 제공하고 `escalated=False`를 반환한다. 사용자가 그 칩을 명시적으로 눌러야 다음 턴에 인계된다. 코드의 “검색 실패는 no_answer 인계로”라는 짧은 주석은 실제 분기와 맞지 않는 오래된 표현이며, 화면 규칙도 자동 티켓 금지를 명시한다. (`backend/app/services/chat/orchestrator.py:22-42`, `backend/app/services/chat/orchestrator.py:118-131`, `backend/app/services/chat/orchestrator.py:194-207`, `docs/design/screen-behaviors.md:5440-5442`)

따라서 사용자 체감의 “직원 연결이 너무 잦다”는 두 지표로 나눠야 한다. 하나는 `no_answer`에서 연결 선택지를 자주 보는 비율이고, 다른 하나는 확인 칩을 거쳐 실제 티켓이 생성되는 비율이다. 둘을 합치면 개선 원인을 잘못 판단한다. 현재 코드는 되묻기를 별도 `route_taken`으로 기록할 기반도 갖췄다. (`backend/app/services/chat/orchestrator.py:203-210`, `docs/research/chatbot-quality-improvement-2026-09-08.md:861-869`)

### 2.4 검색 구현과 0.30 게이트

검색은 승인 문서만 대상으로 vector top-20과 pg_trgm top-20을 RRF로 합친다. 서비스는 그 후보를 `max(vector_similarity, keyword_similarity)`로 재정렬하고 12개 후보 중 상위 5개만 근거로 사용한다. 즉 “SQL RRF top-5를 그대로 답변한다”보다 이미 한 단계 더 정교하다. (`supabase/migrations/00084_kb_hybrid_search.sql:15-54`, `backend/app/services/chat/rag_service.py:19-24`, `backend/app/services/chat/rag_service.py:56-62`, `backend/app/services/chat/rag_service.py:79-95`)

`HYBRID_FLOOR=0.30`은 상위 후보의 vector/keyword 점수가 모두 낮을 때 생성을 막는 관문이다. 그러나 현재 증거는 0.30 자체가 과잉 인계의 주원인이라는 결론을 지지하지 않는다. 같은 0.30을 유지한 채 질의 정규화, 문서 키워드, 관련도 재정렬, 후보 풀 확대만 적용해 Recall@5 16%→97%, 사실 충실성 23%→93%가 됐다. (`backend/app/services/chat/rag_service.py:10-24`, `backend/app/services/chat/rag_service.py:96-97`, `backend/evals/results/2026-09-09-baseline.md:8-12`, `backend/evals/results/2026-09-09-baseline.md:56-89`)

실패 원인도 “점수가 낮다” 하나가 아니었다. CT는 관련 문서가 vector 0.521로 검색됐지만 무관한 RRF 1위가 0.239라 게이트가 잘못 작동했고, 주차 문서는 vector 0.551이지만 RRF 약 9위라 top-5에서 잘렸다. 둘 다 임계값 하향보다 후보 재정렬/확대로 해결됐다. (`backend/evals/results/2026-09-09-baseline.md:56-83`)

따라서 게이트를 일괄 하향하는 것은 지금 권장하지 않는다. 이는 no-answer를 줄이는 대신 무관 문서를 답변 모델에 넘겨 엉뚱한 답을 늘릴 수 있다. 현재 실패 질의별 상위 점수, 정답 문서 순위, 최종 센티넬 원인을 모은 뒤 카테고리별로 조정해야 한다. (`backend/app/services/chat/rag_service.py:96-110`, `docs/고객요구사항.txt:403-410`)

### 2.5 라이브 KB 미임베딩 가설

이 가설은 단순히 그럴듯했던 정도를 넘어, 최신 트랙 기록상 실제 장애 원인으로 한 번 확인됐다. seed는 문서만 넣고 청크를 만들지 않으며, 데모 재시드는 KB 전체를 지운다. `reembed_kb.py`도 “문서는 있으나 청크 0건이라 항상 no_answer” 상황을 명시한다. (`supabase/seed_kb_bulk.sql:1-9`, `backend/scripts/reembed_kb.py:1-9`)

다만 **현재도 0건이라고 말하면 틀리다**. 최신 상담봇 인수인계에는 프로덕션 162문서/0청크를 발견한 뒤 181청크를 생성했고, 15문항 중 12문항이 정상화됐다고 기록돼 있다. 반면 루트 `HANDOFF.md`에는 아직 “재임베딩 미반영”이라고 남아 있어 오래된 요약이다. 현 시점 상태는 read-only 진단으로 다시 확인해야 한다. (`HANDOFF-chatbot.md:40-46`, `HANDOFF.md:15`)

색인 공백은 다시 생길 수 있는 운영 결함이다. 문서 수가 0보다 큰데 임베딩 청크가 0인 배포를 준비 완료로 간주하지 않는 readiness 검사를 두는 것이 LangGraph보다 먼저다. 기존 `kb_diag`는 문서·승인 문서·청크·임베딩 및 CT 계열 대상 문서를 SELECT로 점검한다. (`backend/scripts/kb_diag.py:1-5`, `backend/scripts/kb_diag.py:22-48`)

### 2.6 모델, LangChain, 구조화 출력

코드 기본값은 답변 Sonnet, 이해 Haiku, 이해 모드 legacy다. `llm` 모드는 형식 실패 시 legacy로 폴백한다. 저장소 문서는 Railway에서 `CHAT_UNDERSTANDING_MODE=llm`을 켜는 절차를 **권장**하지만, 실제 환경변수 값 자체는 저장소로 검증할 수 없다. 따라서 라이브가 llm이라는 주장은 원격 변수 조회 전에는 미확정이다. (`backend/app/core/config.py:38-49`, `backend/app/services/chat/orchestrator.py:153-177`, `docs/research/chatbot-quality-improvement-2026-09-08.md:871-878`)

LangChain 사용은 `ChatAnthropic` 팩토리와 `ChatPromptTemplate` 중심이고, 임베딩은 OpenAI REST를 직접 호출한다. 현재 requirements에도 LangGraph, LangSmith, `langchain-openai`, cross-encoder 패키지는 없다. (`backend/app/integrations/langchain_client.py:1-14`, `backend/app/integrations/embedding_client.py:1-29`, `backend/requirements.txt:11-12`)

LCEL 파이프를 쓰지 않는 이유는 가짜 모델 주입 테스트와 호환하려는 의도다. 실제 호출은 `format_messages + ainvoke`이며, 안전 감시 주석도 이를 명시한다. 이것은 품질 결함이라기보다 테스트 가능성을 위한 어댑터 선택이다. (`backend/app/services/chat/rag_service.py:121-139`, `backend/app/services/chat/safety_watchdog.py:138-149`)

반면 통합 이해기와 직원 인계 요약의 JSON 객체를 중괄호로 잘라 `json.loads`하는 구현은 형식 변화에 취약하다. 구조화 출력 스키마로 바꾸되, 네트워크 없는 가짜 모델을 계속 주입할 수 있는 얇은 어댑터를 유지하는 것은 높은 ROI의 독립 개선이다. 이를 위해 전체 체인을 LCEL이나 LangGraph로 바꿀 필요는 없다. (`backend/app/services/chat/conversation_understanding.py:89-110`, `backend/app/services/chat/conversation_understanding.py:133-166`, `backend/app/services/chat/orchestrator.py:68-102`)

### 2.7 예약 갈래와 실시간 전송

`booking_agent_service` 자체는 웹에서 진료과/의사 카드를 만들고, 앱에서는 예약 마법사로 이동시킨다. 자연어 취소는 앱 또는 직원 상담을 안내할 뿐 실행하지 않는다. 이 범위에 대한 요청자 요약은 맞다. (`backend/app/services/chat/booking_agent_service.py:10-24`, `backend/app/services/chat/booking_agent_service.py:57-89`)

그러나 시스템 전체가 “예약을 쓰지 않는다”는 뜻은 아니다. 사용자가 최종 확인 카드를 누르면 인증 후 슬롯·환자·가족 관계를 서버에서 재검증하고, `source="chatbot"`으로 일반 예약 서비스에 쓰며, `request_id`로 멱등성을 보장한다. 현재 구조는 이미 “대화 안내 → 명시적 확인 → 동일 예약 원장 기록”이라는 요구사항과 정본 카드 계약의 핵심을 구현한다. (`backend/app/services/chat/webchat_service.py:314-352`, `backend/app/services/chat/webchat_service.py:421-448`, `backend/app/services/patient_booking_service.py:43-79`, `docs/고객요구사항.txt:373-381`, `docs/고객요구사항.txt:492-494`, `docs/design/chatbot-source-of-truth.md:44-52`, `docs/design/screen-behaviors.md:5373-5376`)

일반 카드 실행기에는 취소 실행 코드도 있지만, 자연어 상담봇 갈래는 취소 안내만 반환한다. 따라서 “취소 도구가 코드베이스에 전혀 없다”가 아니라 “상담봇 자연어 계약은 취소 안내만”이 정확하다. 화면 정본도 웹 취소 실행 카드는 대화 진입점이 없어 미사용이라고 못 박는다. (`backend/app/services/chat/booking_agent_service.py:16-29`, `backend/app/services/chat/webchat_service.py:460-475`, `docs/고객요구사항.txt:47-51`, `docs/design/screen-behaviors.md:5536-5544`)

스트리밍은 SSE가 아니라 Supabase Broadcast의 `bot_typing`, `bot_delta`, `bot_done`이며 최종 상태는 DB 재조회로 회복한다. 이는 화면 규칙의 동일 토픽 broadcast+DB reconcile 계약과 일치한다. 다만 RAG가 생성 조각을 먼저 내보낸 뒤 완성본에서 센티넬을 검사하므로 `NO_ANSWER`나 `NEEDS_CLARIFY`가 잠시 환자에게 노출될 수 있다. 이것은 그래프 전환과 무관하게 먼저 고쳐야 할 확인된 결함이다. (`backend/app/services/chat/realtime_broadcast.py:8-34`, `backend/app/services/chat/chat_flow_service.py:168-201`, `backend/app/services/chat/rag_service.py:123-152`, `docs/design/screen-behaviors.md:5444-5446`, `HANDOFF-chatbot.md:47`)

## 3. 재설계안의 비례성 평가

### 3.1 LangGraph 자기교정 루프

가설은 일부 조건에서 타당하다. 정답 문서가 색인돼 있고 첫 검색 질의만 나빠 놓쳤다면, 저점수/no-answer 시 다른 질의로 한 번 재검색하는 것은 no-answer를 줄일 수 있다. 복합 질문에서 하위 질문별 근거를 찾는 것도 같은 범주다. 그러나 문서나 임베딩이 없거나 라우터가 정보 질문을 `agent`로 잘못 보내면 RAG 그래프 자체에 진입하지 않아 아무 효과가 없다. (`backend/app/services/chat/orchestrator.py:153-203`, `backend/app/services/chat/rag_service.py:65-97`, `HANDOFF-chatbot.md:42-46`)

현재 제안처럼 검색→문서 채점→재작성/재검색 N회→생성→근거 검증→재생성을 모든 질문에 적용하는 것은 비례하지 않는다. 이미 오프라인 검색/안전 지표가 97/93/100이고, 운영 대량 장애는 재임베딩 한 단계로 크게 복구됐다. 문서 채점과 근거 검증도 LLM 판정이므로 오류가 사라지는 것이 아니라 판단 지점, 비용, 지연, 테스트 조합이 늘어난다. (`backend/evals/results/2026-09-09-baseline.md:85-99`, `HANDOFF-chatbot.md:42-46`)

또한 이해 계층을 Haiku로 분리해 앞단 지연을 약 44~46% 줄였다는 실측이 있다. 여기에 매번 grade/verify를 추가하면 최근의 지연 개선을 상쇄할 가능성이 높다. 그래프는 품질 조건을 통과한 질문에는 추가 호출이 0이어야 하며, 재시도 상한과 전체 시간 예산이 필요하다. (`backend/evals/results/2026-09-09-baseline.md:242-260`)

권고는 전면 오케스트레이터 교체가 아니라 **RAG 내부의 한정된 상태기계**다. 첫 검색이 실패했고, 승인 문서/청크가 존재하며, 응급·의료판단·행동형이 아닌 경우에만 대체 질의로 최대 1회 재검색한다. 재시도 후에도 부족하면 기존 no-answer 선택지로 끝낸다. 실제 실패 표본에서 1회 재검색의 순이익이 입증될 때만 LangGraph를 구현 수단 후보로 삼는다. (`backend/app/services/chat/orchestrator.py:113-180`, `backend/app/services/chat/orchestrator.py:203-210`, `docs/고객요구사항.txt:385-410`)

### 3.2 LCEL, 병렬 조회, retry/fallback

`with_structured_output`은 권장하지만, LCEL 문법 자체는 답변 품질을 높이지 않는다. 먼저 현재 모델 팩토리에 타입 출력과 검증/폴백을 감싼 뒤 통합 이해기와 인계 요약 두 군데에 적용하면 손파싱 위험의 대부분을 작은 변경으로 제거할 수 있다. (`backend/app/integrations/langchain_client.py:6-26`, `backend/app/services/chat/conversation_understanding.py:133-166`, `backend/app/services/chat/orchestrator.py:89-102`)

`RunnableParallel`로 KB·스케줄·예시를 모든 턴에 동시에 조회하는 것은 권장하지 않는다. 현재 의도 프리체크는 진료시간/의사명단을 DB에서 결정적으로 답해 불필요한 임베딩과 생성 호출을 피한다. 병렬화는 라우팅 뒤에 실제로 동시에 필요한 독립·비개인 조회만 대상으로 해야 하며, 개인 예약 조회는 인증/RLS 문맥 때문에 별도로 취급해야 한다. (`backend/app/services/chat/orchestrator.py:143-152`, `backend/app/services/chat/chat_flow_service.py:246-277`, `docs/고객요구사항.txt:410`)

재시도도 무조건 적용하면 안 된다. 타임아웃·일시적 5xx에는 제한된 backoff 재시도가 적합하지만, 모델이 `NO_ANSWER`를 냈다는 이유만으로 같은 입력을 반복하면 비용만 늘어난다. 검색 재시도는 질의나 검색 전략이 실제로 달라질 때만 의미가 있다. (`backend/app/integrations/embedding_client.py:13-26`, `backend/app/services/chat/rag_service.py:140-152`)

### 3.3 질의 분해와 cross-encoder

질의 분해는 한 발화에 서로 다른 사실 질문이 둘 이상 있을 때만 선택적으로 유용하다. 단순 질문까지 분해하면 검색/생성 호출과 합성 오류가 늘어난다. 먼저 골든셋에 복합 질문과 답변 완전성 채점을 추가하고, 해당 실패율이 유의할 때 도입해야 한다. 현재 64케이스 평가 기록과 러너는 RAG와 triage를 분리 채점하며 복합질문 종단 합성 품질을 측정하지 않는다. (`backend/evals/results/2026-09-09-baseline.md:160-197`, `backend/scripts/rag_eval.py:139-210`)

cross-encoder는 지금 보류가 맞다. 현재 경량 재정렬과 후보 확대가 이미 큰 폭의 이득을 냈고, 기존 품질 보고서도 데모 규모·Railway 서비스 한도·자체 호스팅 비용·외부 전송 프라이버시 때문에 후순위로 판단했다. 남은 실제 실패를 수집한 뒤 현재 `max(vector, keyword)` 대비 블라인드 A/B에서 유의한 개선이 있을 때만 채택한다. (`backend/app/services/chat/rag_service.py:19-24`, `backend/app/services/chat/rag_service.py:56-62`, `docs/research/chatbot-quality-improvement-2026-09-08.md:660-667`, `docs/research/chatbot-quality-improvement-2026-09-08.md:684-715`)

### 3.4 툴콜 에이전트와 개인정보

“내 예약 언제” 같은 인증된 실시간 조회를 지원하는 것은 요구사항과 맞지만, 범용 자율 에이전트가 필수는 아니다. 현재처럼 의도를 좁게 판별하고 타입이 고정된 서버 액션을 호출하는 편이 예측 가능하며, 예약 완료도 이미 카드 확인 경로로 가능하다. (`backend/app/services/chat/webchat_service.py:409-448`, `docs/고객요구사항.txt:421`, `docs/고객요구사항.txt:492-494`)

도구를 추가한다면 다음은 필수 조건이다.

1. 예약 대상/소유자는 모델 인자가 아니라 Bearer 인증 사용자로부터 서버가 정하고, DB 연결은 해당 `auth_user_id`의 RLS 문맥으로 연다. 현재 예약 경로가 이 방식을 사용한다. (`backend/app/services/chat/webchat_service.py:299-323`, `backend/app/services/patient_booking_service.py:43-56`)
2. 조회·쓰기 대상은 본인과 활성 가족 연결로 제한한다. 모델이 임의 `patient_id`, SQL, 전체 진료기록 범위를 만들 수 없어야 한다. (`backend/app/services/chat/webchat_service.py:314-323`, `docs/고객요구사항.txt:410`)
3. 예약 쓰기는 서버가 최신 슬롯/의사/대상자를 재검증하고, 환자에게 최종 요약을 보여준 뒤 명시적 버튼 입력에서만 실행하며 멱등 키를 요구한다. (`backend/app/services/chat/webchat_service.py:326-352`, `backend/app/services/chat/webchat_service.py:421-448`, `backend/app/services/patient_booking_service.py:43-79`, `docs/고객요구사항.txt:377-381`)
4. 변경·취소 자연어 계약은 안내로 유지하고, 진단·약·치료 추천 또는 자동 전화 도구는 등록하지 않는다. (`backend/app/services/chat/booking_agent_service.py:16-24`, `docs/고객요구사항.txt:545-546`)
5. 예약 중 제한 상담 모드에서는 행동형 도구 호출을 차단하는 현재 규칙을 유지한다. (`backend/app/services/chat/orchestrator.py:178-180`, `docs/design/chatbot-source-of-truth.md:14`, `docs/design/screen-behaviors.md:5153-5161`)

이 조건이 없는 툴콜 에이전트는 L377의 최종 확인과 L410의 개인정보 제한을 모델의 프롬프트 준수에 맡기게 되므로 승인할 수 없다. 프롬프트는 권한 경계가 아니며, RLS·서버 재검증·허용 목록이 경계여야 한다. (`docs/고객요구사항.txt:377-381`, `docs/고객요구사항.txt:403-410`)

### 3.5 LangSmith와 시맨틱 캐시

관측 자체는 필요하지만 LangSmith가 아니어도 P0 지표는 수집할 수 있다. 현재 DB에는 route와 답변 근거 스냅샷을 남기는 경로가 있으므로, 먼저 no-answer 원인·되묻기율·실제 인계율·검색 점수·p50/p95 지연을 내부 데이터로 연결해야 한다. 외부 추적을 쓰려면 환자 발화와 상담 요약의 개인정보를 기본 전송하지 않도록 마스킹, 보존기간, 접근권한을 먼저 정한다. (`backend/app/services/chat/rag_service.py:159-167`, `backend/app/services/chat/chat_flow_service.py:309-324`, `docs/고객요구사항.txt:393-410`)

시맨틱 캐시는 후순위다. 병원 운영시간·의사 일정·예약 가능 시간·개인 예약·제한 의료 답변은 시간 또는 사용자에 따라 달라져 잘못 재사용될 위험이 크다. 도입하더라도 비개인·정적·승인 KB 답변만 대상으로 하고 KB revision, 모델, 프롬프트, 라우트 버전을 키에 포함해야 한다. 현재 일정/의사 정보가 KB가 아닌 DB 원본을 쓰는 설계도 보존해야 한다. (`backend/app/services/chat/chat_flow_service.py:246-277`, `supabase/seed_kb_bulk.sql:2-7`, `docs/고객요구사항.txt:416-422`)

## 4. 더 싼 대안과 기대효과

### P0 — 먼저 사실을 확정

- 배포/재시드 후 `approved_docs > 0 && embedded_chunks == 0`을 실패로 보는 read-only readiness 검사를 둔다. 이는 과거 “거의 모든 질문 no_answer” 장애를 직접 막는다. (`supabase/seed_kb_bulk.sql:6-9`, `backend/scripts/kb_diag.py:22-46`, `HANDOFF-chatbot.md:42`)
- RAG 평가 외에 **실제 `orchestrate()`를 통과하는 종단 골든셋**을 만든다. 현재 `rag_eval`은 expected_route가 rag인 사례에서 직접 `rag_answer`를 호출하므로 “진단서 발급”이 agent로 새는 문제를 검출하지 못한다. 기존 손검수 목록의 DB/RAG/안전/no-answer/멀티턴/직원연결/예약 질문을 종단셋의 출발점으로 재사용할 수 있다. (`backend/scripts/rag_eval.py:86-113`, `backend/scripts/rag_eval.py:150-189`, `HANDOFF-chatbot.md:45`, `docs/research/상담봇-QA-질문리스트.md:58-145`)
- `no_answer`를 `no_chunks`, `below_floor`, `model_no_answer`, `route_miss`로 나누고, `needs_clarification`, 연결 칩 표시, 칩 클릭, 실제 티켓을 별도로 계측한다. 현재 되묻기는 점수 분모에서 제외되므로 비율을 따로 보지 않으면 품질이 과대평가될 수 있다. (`backend/scripts/rag_eval.py:160-189`, `backend/app/services/chat/orchestrator.py:203-210`)

### P1 — 확인된 결함부터 수정

- 라우팅 원칙을 “실제 예약/변경/취소 행동만 agent, 병원 이용 방법·발급·준비·문진 안내와 애매한 입력은 rag”로 좁히고 회귀 케이스를 추가한다. 현재 프롬프트의 `agent(예약·취소·문진 등 행동)`은 “사전문진이 무엇인가” 같은 정보 질문까지 끌어당길 수 있고, 최신 라이브 기록도 같은 실패를 보고한다. (`backend/app/services/chat/chat_router.py:9-21`, `backend/app/services/chat/conversation_understanding.py:89-99`, `HANDOFF-chatbot.md:44-46`)
- 센티넬은 확정 전까지 사용자 스트림으로 보내지 않거나, 서버가 센티넬 prefix를 버퍼링해 노출을 막는다. 이 결함은 LangGraph 도입 여부와 독립적이다. (`backend/app/services/chat/rag_service.py:123-152`, `HANDOFF-chatbot.md:47`)
- CT 실패는 현재 프로덕션과 동일한 정규화→후보 12→관련도 재정렬→상위 5 경로에서 점수와 순위를 다시 본다. 기존 `rag_diag.py`는 원문 질의를 SQL에 `match_count=5`로 직접 보내므로 현행 정규화·후보 풀·서비스 재정렬을 재현하지 않아 최종 판정 도구로는 불충분하다. (`backend/scripts/rag_diag.py:31-47`, `backend/app/services/chat/rag_service.py:71-95`)
- 통합 이해기와 인계 요약부터 타입 구조화 출력을 적용하고, 실패 시 기존 안전한 폴백을 유지한다. (`backend/app/services/chat/conversation_understanding.py:133-166`, `backend/app/services/chat/orchestrator.py:89-102`)

이 P0/P1만으로 해결 가능한 범위가 크다. 실제로 색인 복구만으로 라이브 표본이 12/15까지 회복했고, 오프라인에서는 정규화·키워드·경량 재정렬·후보 확대만으로 97/93/100에 도달했다. “대부분의 이득”이라는 표현은 합리적이지만, 표본이 작고 현재 종단 러너가 없으므로 정확한 백분율을 단정할 수는 없다. (`HANDOFF-chatbot.md:42-46`, `backend/evals/results/2026-09-09-baseline.md:85-99`)

### P2 — 계측으로 필요가 입증될 때

- 정답 청크가 존재하지만 최초 검색에서 누락된 사례가 충분히 남으면 최대 1회 대체 질의 재검색을 A/B한다.
- 관련 청크가 후보군에 있으나 순위 때문에 빠지는 사례가 충분히 남으면 cross-encoder를 현재 경량 재정렬과 A/B한다.
- 복합 질문 실패가 실제로 반복되면 해당 발화에만 질의 분해를 적용한다.
- 이 단계에서 지연, 토큰 비용, no-answer 감소, 오답 증가, 실제 인계 감소를 함께 비교한다. (`backend/app/services/chat/rag_service.py:56-97`, `backend/evals/results/2026-09-09-baseline.md:76-99`)

### P3 — 그래프가 필요한 복잡도가 생길 때

둘 이상의 재검색 전략, 여러 승인 도구, 중단/재개 가능한 장기 상태, 사람 승인 노드가 실제 요구로 생기고 P2의 작은 상태기계가 관리 불가능해질 때 LangGraph를 채택한다. 채택하더라도 응급·의료판단·직원요청 게이트와 인증/권한 경계는 그래프 밖의 결정적 코드로 남긴다. (`backend/app/services/chat/orchestrator.py:113-180`, `docs/고객요구사항.txt:366-410`)

## 5. 권장 실행 순서

1. **운영 상태 확정:** KB 문서/청크/임베딩 수, 실패 질의의 현행 파이프라인 점수, 실제 Railway 이해 모드를 read-only로 확인한다. (`backend/scripts/kb_diag.py:22-48`, `backend/app/core/config.py:44-49`)
2. **종단 기준선:** 라우팅→검색/DB/카드→no-answer/인계까지 포함해 골든셋을 실행하고, no-answer와 실제 인계를 분리 집계한다. (`backend/app/services/chat/orchestrator.py:106-210`, `backend/scripts/rag_eval.py:139-210`)
3. **병행 가능한 P1:** 라우팅 원칙, 센티넬 노출, 구조화 출력, 색인 readiness를 처리한다. 각각 독립적이고 현재 증거가 있는 결함이다. (`HANDOFF-chatbot.md:44-47`, `backend/app/services/chat/conversation_understanding.py:133-166`)
4. **재측정:** 같은 종단셋으로 정확 답, no-answer, 되묻기, 연결 칩 클릭, 실제 인계, p50/p95 지연을 비교한다. (`docs/고객요구사항.txt:383-410`, `backend/scripts/rag_eval.py:183-210`)
5. **조건부 P2:** 남은 검색 실패에만 1회 재검색, cross-encoder, 복합질문 분해를 각각 독립 A/B한다. (`backend/app/services/chat/rag_service.py:65-156`)
6. **마지막으로 도구/그래프:** 좁은 인증 도구부터 추가하고, 실제 상태 전이가 복잡해졌을 때만 그래프 런타임을 도입한다. (`backend/app/services/chat/webchat_service.py:421-448`, `docs/고객요구사항.txt:377-410`)

“측정 먼저” 때문에 모든 수정이 멈출 필요는 없다. 운영 상태와 종단 기준선을 먼저 **동결**하되, 이미 재현 근거가 있는 센티넬 노출과 명백히 넓은 라우팅 문구는 병행하는 것이 적절하다. (`HANDOFF-chatbot.md:44-47`)

## 6. 요구사항 준수 판정

| 요구사항 | 현재/제안 판정 | 필요한 조건 |
|---|---|---|
| L23·25·421 | 현재 예약은 공용 예약 서비스에 `source="chatbot"`으로 기록하므로 같은 원장 연결 원칙에 부합한다. (`docs/고객요구사항.txt:23-25`, `docs/고객요구사항.txt:418-422`, `backend/app/services/chat/webchat_service.py:436-448`) | 공용 서비스 우회 금지 |
| L49·492~494 | 웹챗 예약은 카드 흐름과 최종 확인 뒤 완료 가능하다. 앱 상담은 정본상 의도적으로 마법사 이동이므로 시나리오의 “상담봇을 통한 예약”으로 인정할지 인수 기준을 명시해야 한다. (`docs/고객요구사항.txt:47-51`, `docs/고객요구사항.txt:492-494`, `backend/app/services/chat/booking_agent_service.py:75-89`, `docs/design/screen-behaviors.md:5523-5534`) | 채널별 완료 정의 합의 |
| L377 | 현재 재확인 카드는 자동 실행하지 않고, 사용자의 신청 액션 후 실제 write를 한다. (`docs/고객요구사항.txt:377-381`, `backend/app/services/chat/webchat_service.py:421-448`) | 툴콜도 동일한 2단계 확인 |
| L410 | 현재 write는 인증 사용자 RLS 문맥과 본인/활성 가족 관계를 사용한다. (`docs/고객요구사항.txt:410`, `backend/app/services/chat/webchat_service.py:299-323`, `backend/app/services/patient_booking_service.py:43-56`) | 모델 임의 ID/범용 검색 금지 |
| L545·546 | 진단·약·치료 추천은 결정적 감시 대상으로 남고 자동 전화 도구는 없어야 한다. (`docs/고객요구사항.txt:545-546`, `backend/app/services/chat/safety_watchdog.py:92-114`) | 안전 게이트를 그래프/에이전트 밖에 유지 |

툴콜 제안은 위 서버 측 조건을 설계 계약으로 명시할 때만 조건부 승인이다. 단순히 시스템 프롬프트에 “본인 것만 조회”와 “확인 후 예약”을 쓰는 안은 요구사항 준수로 인정할 수 없다. (`docs/고객요구사항.txt:377-410`)

## 7. 요청자 요약에서 정정한 것

1. **질의 재작성:** 매 메시지 1회가 아니라 후속 신호가 있을 때만 수행한다. llm 모드도 자기완결 질문의 과잉 재작성을 버린다. (`backend/app/services/chat/conversation_understanding.py:34-43`, `backend/app/services/chat/conversation_understanding.py:152-156`)
2. **no-answer 인계:** 자동 직원 인계가 아니다. 선택 칩을 보여주고 사용자가 누를 때만 인계한다. (`backend/app/services/chat/orchestrator.py:22-42`, `backend/app/services/chat/orchestrator.py:203-207`)
3. **회복 없음:** 재검색 루프는 없지만 벡터 폴백, 되묻기, 선택형 인계, outage, DB reconcile은 있다. (`backend/app/services/chat/rag_service.py:77-89`, `backend/app/services/chat/orchestrator.py:161-210`, `backend/app/services/chat/realtime_broadcast.py:8-34`)
4. **0.30 원인:** 과거 실패의 직접 원인은 단일 임계값뿐 아니라 RRF 1위/후보 컷오프와 운영 청크 0건이었다. (`backend/evals/results/2026-09-09-baseline.md:56-83`, `HANDOFF-chatbot.md:42`)
5. **라이브 미임베딩:** 실제였지만 최신 기록상 181청크로 복구됐다. 현재 상태는 다시 조회해야 한다. (`HANDOFF-chatbot.md:42`, `HANDOFF.md:15`)
6. **예약 write:** `booking_agent_service`는 카드만 만들지만, 사용자가 확인하면 별도 인증 액션이 실제 예약을 공용 서비스에 기록한다. (`backend/app/services/chat/booking_agent_service.py:57-72`, `backend/app/services/chat/webchat_service.py:436-457`)
7. **취소:** 자연어 상담봇 계약은 안내만이지만 공용 카드 실행기에는 인증·재확인형 취소 구현이 있다. (`backend/app/services/chat/booking_agent_service.py:16-29`, `backend/app/services/chat/webchat_service.py:460-475`)
8. **라이브 이해 모드:** 코드 기본은 legacy이고 문서는 llm 전환 절차만 증명한다. 실제 Railway 값은 저장소만으로 확인할 수 없다. (`backend/app/core/config.py:44-49`, `docs/research/chatbot-quality-improvement-2026-09-08.md:871-878`)
9. **과거 품질 문서:** 같은 보고서 §9.1의 “재랭킹/평가 러너 없음”은 당시 스냅샷이며 현재 코드에는 경량 재정렬과 평가 러너가 있다. 최신 절과 현행 코드를 우선해야 한다. (`docs/research/chatbot-quality-improvement-2026-09-08.md:636-650`, `backend/app/services/chat/rag_service.py:56-62`, `backend/scripts/rag_eval.py:1-20`)

## 8. 검증상의 한계

- 원격 DB와 Railway 자격 증명이 없어 현재 문서/청크 수, 실제 환경변수, 15문항 최신 결과를 독립 재실행하지 못했다. 따라서 라이브 상태 판단은 최신 인수인계 기록에 의존하며 신뢰도는 중간이다. (`HANDOFF-chatbot.md:42-51`)
- 기존 `rag_eval`은 RAG와 triage 품질에는 유용하지만 실제 라우터와 예약/인계 상태 전이를 통과하지 않는다. 97%를 전체 상담 성공률로 해석하면 안 된다. (`backend/scripts/rag_eval.py:86-136`, `backend/scripts/rag_eval.py:139-210`)
- `needs_clarification`을 정상 흐름으로 보고 분모에서 제외하므로 불필요한 되묻기 증가를 별도 관찰해야 한다. (`backend/scripts/rag_eval.py:160-189`)
- 저장소의 pytest 공통 fixture는 실행 뒤 채팅 루트 테이블과 `kb_documents`를 `TRUNCATE ... CASCADE`한다. 공용/운영 DB를 가리킨 상태에서는 평가 목적으로도 pytest를 실행하면 안 된다. (`backend/tests/conftest.py:159-180`)

## 9. 확정하려면 실행해야 할 검증 명령

아래 명령은 순서대로 실행한다. 1~3은 읽기/조회 중심이다. pytest는 공통 정리 fixture가 데이터를 지우므로 명령 목록에서 제외했고, 추후 실행하더라도 **반드시 폐기 가능한 격리 테스트 DB에서만** 해야 한다. `reembed_kb` 실실행도 쓰기 작업이므로 이 평가에서는 제외했다.

1. 현재 Railway의 비밀값 전체를 노출하지 않고 이해 모드와 분류 모델만 확인:

   ```bash
   railway variables --service gaonhospital-api --json | jq '{CHAT_UNDERSTANDING_MODE, CLASSIFY_MODEL}'
   ```

2. 프로덕션 KB 문서·청크·임베딩과 CT 계열 문서 상태 확인(`DATABASE_URL`이 주입돼야 함, SELECT만 수행):

   ```bash
   cd backend
   railway run -s gaonhospital-api .venv/bin/python -m scripts.kb_diag
   ```

3. 격리된 평가 DB에 181개 전후 청크와 실제 OpenAI/Anthropic 키가 준비된 상태에서 현행 RAG/이해기와 triage 재측정(API 비용 발생, DB write 없음):

   ```bash
   cd backend
   .venv/bin/python -m scripts.rag_eval --route rag --mode legacy --verbose
   .venv/bin/python -m scripts.rag_eval --route rag --mode llm --verbose
   .venv/bin/python -m scripts.rag_eval --route department_guide --mode llm --verbose
   ```

4. 종단 라우터/예약/인계 평가 러너를 추가한 뒤, **폐기 가능한 전용 테스트 DB URL**로만 해당 테스트 실행. 현재 저장소에는 이를 한 번에 실행하는 기존 명령이 없으므로 새 러너가 생기기 전에는 97%를 종단 성공률로 확정할 수 없다. 기존 pytest를 꼭 돌릴 때의 안전 조건 확인 명령:

   ```bash
   cd backend
   rg -n "truncate table chat_threads|kb_documents cascade" tests/conftest.py
   ```

5. 현행 검색을 그대로 재현하지 않는 `rag_diag`의 차이를 확인하고, 결과 해석 시 정규화·후보 12·서비스 재정렬 누락을 명시:

   ```bash
   cd backend
   rg -n "normalize_query|CANDIDATE_POOL|_rank_by_relevance" app/services/chat/rag_service.py scripts/rag_diag.py
   ```
