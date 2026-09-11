# 상담봇 브랜치 C — LLM 리랭커(후보 재정렬) 설계

- 작성일: 2026-09-10
- 상태: 설계 확정(사용자 승인) → 구현 계획(writing-plans) 대기
- 브랜치: `feat/chatbot-branch-c` (base `0d5fe33` = 프로덕션 기준선, 브랜치 A·B와 동일 base)
- 워크트리: `.claude/worktrees/chatbot-branch-c`

## 1. 배경·목적

검색은 RRF로 후보를 **넓게** 뽑고(`CANDIDATE_POOL=12`), 서비스는 그 후보를 현행 `max(vector, keyword)`로 재정렬해 상위 `match_count=5`만 근거·게이트로 쓴다(`rag_service.py:56-62,89`). 그러나 이 경량 재정렬은 **점수 계산식**일 뿐이라, "관련 청크가 후보엔 있는데 순위 때문에 top-5에서 잘리는" 실패를 남긴다.

독립평가서 §2.4의 실측 사례: **"주차 요금이 어떻게 되나요?"** → 요금 문서는 vector 0.551로 **점수는 멀쩡한데** RRF 약 9위라 top-5 밖으로 잘렸다(`docs/research/chatbot-redesign-eval-2026-09-10.md:54`). 이런 실패는 "점수가 낮은 것"이 아니라 **"순서가 틀린 것"**이라, 게이트 하향(0.30↓)이나 조건부 재정렬로는 잡히지 않는다.

**사용자 결정(2026-09-10)**: 평가서 §3.3의 cross-encoder "지금 보류" 평결을 말로만 받지 말고, **리랭커를 실제로 구현해** 브랜치 A(저비용 스위치 3종)·브랜치 B(에이전트형 RAG)와 **실환경 A/B로 대조**한다. 이 문서는 그 브랜치 C의 설계다.

측정으로 결론을 낸다: 같은 15문항·같은 프로덕션 KB(181청크)로 ⓪(현행 재정렬)·Ⓒ(리랭커)를 대조하고, 가능하면 Ⓐ·Ⓑ와 함께 4자 대조해, 리랭커가 "순위 때문에 잘리던 문서"를 top-5로 끌어올리는지 / 지연 증가분 대비 값어치가 있는지 숫자로 판단한다.

## 2. 리랭커 선택 (사용자 확정 2026-09-10)

"cross-encoder 리랭커"의 구현 수단을 세 후보 중에서 정했다.

| 후보 | 채택 | 이유 |
|---|---|---|
| (a) 로컬 cross-encoder(sentence-transformers/torch) | ✗ | torch 수백 MB → Railway 메모리·콜드스타트 부담, 데모 규모엔 과함. 평가서 §3.3이 "자체 호스팅 비용"으로 후순위 지목. |
| (b) 호스팅 리랭커 API(Cohere/Jina/Voyage) | ✗ | 환자 질의+KB 원문이 **새 외부 업체로 전송** → 요구사항 L410. 마스킹·보존·접근정책 선결 없이는 채택 불가(브랜치 B가 langsmith 뺀 논리와 동일). |
| **(c) LLM 리랭커(Haiku가 후보를 질문 적합도로 채점)** | **✓ 채택** | 새 무거운 의존성 없음. 외부 전송은 **이미 쓰는 Anthropic뿐** → L410 추가 노출 0. 한국어 이해가 좋아 외래어("씨티"·"와이파이")에 강함. 대가는 질의당 1콜 지연(A/B로 측정). |

**핵심**: "cross-encoder"는 여기서 **리랭커(후보 재정렬기)의 통칭**으로 쓴다. 브랜치 C의 실제 구현은 **LLM(Haiku) 리랭커**다. 검색 정밀도 축(순서)을 겨냥하며, 브랜치 B의 루프 축(재검색·근거검증)과 분리해 A/B 해석을 깨끗이 한다.

## 3. 범위

### 넣는 것 (사용자 확정 2026-09-10)
1. **LLM 리랭커(listwise)** — Haiku에게 질문 + 후보 12개(제목 + 본문 발췌)를 **한 번에** 주고, 각 후보의 **관련도 점수(0~1)**를 받아 재정렬한다.
2. **발동 = 항상** — 모든 rag 갈래 질문에서 재정렬한다("검색 약할 때만"은 목적한 순위-누락 실패(점수는 멀쩡·순서만 틀림)를 못 잡고 브랜치 A와 성격이 겹친다). 지연은 A/B에서 p50/p95로 측정한다.
3. 플래그 OFF 시 **현행 `_rank_by_relevance`로 완전 원복**.

### 뺀 것 (섞으면 A/B 해석이 흐려짐 — 별도 브랜치)
- **에이전트 루프(재검색·근거검증·질의분해)** → 브랜치 B(자기만의 A/B).
- **저비용 스위치(센티넬 가드·보수 라우팅·구조화 이해)** → 브랜치 A.
- **툴콜·시맨틱 캐시·LangSmith** → 그 이후/보류(평가서 §3.4·§3.5, L410).

## 4. 불변식 (리랭커가 손대지 않는 것)

브랜치 C는 **후보 재정렬 한 단계(`_rank_by_relevance` 자리)만** 바꾼다. 아래는 무수정으로 유지한다.

| 불변식 | 근거·위치 |
|---|---|
| 검색 자체(하이브리드 SQL 벡터 ∪ pg_trgm RRF) | `supabase/migrations/00084_kb_hybrid_search.sql` — 그대로 호출 |
| `HYBRID_FLOOR=0.30` · `CANDIDATE_POOL=12` · `EXAMPLE_*` 상수 | `rag_service.py:16-24` — 동일 값 |
| **0.30 게이트는 여전히 벡터·키워드 점수로 판정** | `rag_service.py:96` — 재정렬 후 1위의 `similarity`/`keyword_sim`로 판정(리랭커 점수 아님) |
| 제한 자료 처리: 재정렬 후 1위가 제한자료면 LLM 없이 원문 블록 + [직원 연결] | `rag_service.py:107-109` — 재정렬 결과의 1위에 그대로 적용 |
| 순수 벡터 폴백(마이그 00084 미배포 시) | `rag_service.py:83-85` — 그대로 |
| few-shot 예시 은행 · 센티넬(NO_ANSWER/NEEDS_CLARIFY) 판정 | `rag_service.py:90-95,143-152` — 무변경 |
| 안전 게이트 순서(응급 → 직원연결 확인/요청 → 인계 감시 → 의도 프리체크 → 라우팅) | `orchestrator.py:106-177` — **수정 없음** |
| DB 영속(메시지·근거 스냅샷·티켓·인계요약) | `chat_flow_service.py`, `rag_service.record_answer_sources` |
| 실시간 스트리밍 계약(Broadcast `bot_typing`/`bot_delta`/`bot_done` + DB reconcile) | `realtime_broadcast.py`, `chat_flow_service.py:178-201` |
| 카드 2단계 확인·몰래예약 금지(L377) / 변경·취소 자동실행 금지(L49) / 환자데이터 무단검색 금지(L410) / 진단·자동전화 금지(L545·546) | 요구사항; 리랭커는 rag 갈래 근거 재정렬만 담당, 예약/취소/진단 갈래에 개입하지 않음 |

**핵심**: 리랭커는 **순서만** 바꾼다. "근거가 부족하면 답하지 않는다"는 판정(0.30 바닥 + 모델 NO_ANSWER)과 제한자료 원문 규칙은 재정렬 **뒤에도 동일 코드**가 그대로 판정한다. 리랭커 때문에 봇이 근거 없이 답하거나 제한 원문을 지어내는 일은 구조적으로 없다.

## 5. 아키텍처

### 5.1 배치 — `rag_service.py:89` 한 곳만 분기

현재:
```python
chunks = _rank_by_relevance(chunks)[:match_count]   # :89
```
브랜치 C:
```python
if settings.chat_reranker:
    ranked = await rerank_by_llm(search_query, chunks, model=reranker_model)
else:
    ranked = _rank_by_relevance(chunks)
chunks = ranked[:match_count]
```
- `rerank_by_llm`은 **새 모듈** `backend/app/services/chat/reranker.py`.
- 실패·가짜모델·미지원·시간초과 등 어떤 예외에도 **현행 `_rank_by_relevance(chunks)`로 폴백**한다(무회귀·fail-safe). 리랭커는 "더 좋게 만들 뿐, 나쁘게 만들지 않는다".
- 재정렬 **이후** 코드(게이트·제한자료·sources 스냅샷·생성·센티넬)는 **전부 그대로 재사용**된다 — 반환 dict 형태·스트리밍·DB 영속 불변.

### 5.2 리랭커 함수 `rerank_by_llm(query, chunks, *, model=None) -> list[dict]`

- **입력**: `query`(검색용 정규화 질의 `search_query`), `chunks`(RRF 후보 ≤12, 각 dict에 `id`·`title`·`content`·`similarity`·`keyword_sim`·`is_restricted`).
- **동작(listwise, 1콜)**:
  1. 후보 12개를 `[0] 제목 | 본문 앞 RERANK_SNIPPET_CHARS자` 형식의 번호 목록으로 만든다(토큰 절감 — 리랭킹용 발췌만, 답변 생성엔 여전히 본문 전체를 쓴다).
  2. Haiku(`model` 또는 `get_chat_model(settings.classify_model)`)에게 질문 + 목록을 주고 **구조화 출력**으로 `{"scores": [{"index": int, "score": float(0~1)}...]}`를 받는다.
  3. 정렬 키 = `(llm_score, max(similarity, keyword_sim))` **내림차순**. 리랭커가 점수를 빠뜨린 후보는 `llm_score=-1`로 두어 **기존 순서를 보존**하며 맨 뒤로(출력 누락에도 안전).
  4. 재정렬된 `chunks` 리스트를 반환(원본 dict를 그대로 재배열 — 필드 손실 없음).
- **폴백**: `with_structured_output` 미지원(가짜 주입 모델)·`json` 파싱 실패·타임아웃·빈 응답 → `_rank_by_relevance(chunks)`(rag_service에서 import). 로그만 남기고 조용히 폴백(장애로 안 번짐).
- **동점·안정성**: 동일 `llm_score`면 기존 `max(vector,keyword)`가 2차 키라 결정적이다(테스트 재현성).

### 5.3 프롬프트 (리랭커 전용, 단일출처)

- 시스템: "너는 검색 결과 재정렬기다. 아래 후보들이 **질문에 답하는 데 얼마나 관련 있는지** 0~1로 채점하라. 답을 지어내지 말고 **관련도만** 판단하라. 각 후보 index와 score만 낸다." (진단·안내 생성 금지 — 순수 채점기)
- 사용자: `질문: {query}\n\n후보:\n{numbered_snippets}`
- 스키마: `RerankScores = {scores: list[{index: int, score: float}]}`.
- ⚠️ 리랭커는 **정보 생성 없이 채점만** 한다 — 환자에게 리랭커 출력이 직접 노출되지 않는다(오케스트레이터·화면 무관).

### 5.4 모델·상한

- 모델 = **Haiku**(`settings.classify_model`) — 브랜치 B 판정 노드와 일관, 가볍고 빠름. 답변 생성(Sonnet)과 분리.
- 발췌 길이 `RERANK_SNIPPET_CHARS`(제안 500, 계획 단계 확정) — 12개×발췌로 리랭커 1콜 토큰을 bound.
- 추가 비용은 rag 질의당 **Haiku 1콜**로 한정(발동=항상이지만 재검색 루프가 없어 호출 수 고정).
- (선택) 시간 예산: 리랭커 콜이 느리면 폴백. 기본은 embedding_client와 같은 짧은 타임아웃에 기대고, 초과 시 `_rank_by_relevance` 폴백(계획 단계 확정).

### 5.5 반환 계약 (rag_answer 무변경)

`rag_answer`의 반환 dict 형태는 **완전히 동일**하다(리랭커는 `chunks` 순서만 바꿈):
- `{no_answer: True}` / `{reply: None, restricted_block, actions, sources}` / `{needs_clarification: True, reply}` / `{reply, sources, restricted_block?}`
- `sources`의 `rank`·`similarity`는 재정렬 후 순서·원본 벡터 유사도를 그대로 기록(리랭커 점수는 sources에 넣지 않음 — 스냅샷 계약 무변경).

## 6. 관측 (내부 로그, 외부 전송 없음)

턴마다 리랭커 효과를 내부 `logging`으로 남긴다(외부 전송 없음 — L410, LangSmith 미도입). 최소 지표: `reranked`(적용 여부)·`top1_moved`(현행 재정렬 1위와 리랭커 1위가 달라졌는가)·`reranker_latency_ms`·폴백 여부. 근거 스냅샷은 현행 `chat_message_sources`를 그대로 유지한다. DB 스키마 변경·마이그레이션 **없음**.

## 7. 되돌리기

- config 플래그 `CHAT_RERANKER` **기본 False**. 배포해도 동작 불변, env로 켜야 발동, 끄면 즉시 `_rank_by_relevance`로 원복.
- 독립 브랜치·워크트리라 A·B와 격리. A/B 종료 후 채택 시에만 병합, 미채택이면 브랜치 폐기.

## 8. 파일 경계 (A·B와 겹침 최소)

| 구분 | 파일 | 성격 |
|---|---|---|
| 신규 | `backend/app/services/chat/reranker.py`(=`rerank_by_llm` + 프롬프트·스키마·상수) | 새 모듈 |
| 신규 | `backend/tests/test_reranker.py` | 새 테스트 |
| 수정(최소) | `backend/app/services/chat/rag_service.py` — :89 재정렬 지점 플래그 분기 + `reranker_model=None` 인자 추가(수 줄) | seam 1곳 |
| 수정(최소) | `backend/app/core/config.py` — `chat_reranker: bool = False` 1줄 | 플래그 |
| 이식 | `backend/scripts/bot_probe.py` — 브랜치 A에서 이식(동일 도구, `--label branchC`) | 측정도구 |
| 재사용(수정 없음, import) | `rag_service`(`_rank_by_relevance`·상수·`_ANSWER_SYSTEM_PROMPT`) · `query_normalizer` · `langchain_client`(`get_chat_model`·`resp_text`) | 그대로 |

**A·B와의 겹침**: `config.py`(서로 다른 플래그 추가 — 라인만 인접, 논리 충돌 없음)와 `rag_service.py`(**브랜치 A도 rag_service를 수정**함 — `_astream_reply` 추출·센티넬 가드). C의 rag_service 수정은 **:89 재정렬 지점 한 곳**이라 A의 스트리밍 부분(:123-152)과 물리적으로 다른 위치지만, 병합 시 대조 대상이다. C는 독립 브랜치로 유지하고 병합은 코디가 대조한다.

## 9. 테스트 전략

- **순수 단위(가짜 모델 주입)**: `rerank_by_llm`에 정해진 점수를 내는 가짜 모델을 주입해 —
  1. 리랭커 점수대로 재정렬되는가(순서 뒤집힘 검증: "주차" 사례처럼 낮은 원래순위 문서가 top으로).
  2. 리랭커가 점수를 빠뜨린 후보는 기존 순서로 맨 뒤에 보존되는가.
  3. 동점이면 `max(vector,keyword)` 2차 키로 결정적 정렬.
  4. 구조화 출력 미지원(가짜)·파싱 실패·빈 응답 → `_rank_by_relevance` 폴백(예외가 rag_answer로 안 새어나감).
  5. 제한자료가 재정렬로 1위가 되면 rag_answer가 원문 블록 경로로 가는가(seam 통합 테스트, 가짜 검색+가짜 리랭커).
- **플래그 OFF 무회귀**: `CHAT_RERANKER=false`(기본)면 `rerank_by_llm`이 호출되지 않고 현행 경로와 **바이트 동일** 결과(기존 rag 테스트 무변경 통과).
- **안전 무회귀**: 기존 `test_orchestrator`·`test_safety_watchdog`·`test_rag_*`가 무변경 통과(리랭커는 rag 갈래 재정렬만, 안전 경로 불변).
- **실행법(공용 DB truncate 회피)**: `--noconftest` + 더미 env(`DATABASE_URL`·`SUPABASE_*`)로 순수 테스트만. venv=메인 `backend/.venv`(워크트리엔 없음). DB 통합은 플래그 OFF=현행 경로라 평상시 회귀로 커버.

## 10. A/B 측정 (완료 판정)

- 도구: `backend/scripts/bot_probe.py`(익명 curl 15문항 종단, 문항마다 새 세션). Ⓒ 측정용 `--label branchC`.
- 대조: ⓪(현행 재정렬, 플래그 OFF) · Ⓒ(리랭커 ON) — 둘 다 같은 프로덕션 KB(181청크). 가능하면 Ⓐ·Ⓑ와 함께 **4자 대조**. Railway `gaonhospital-api` 소스 브랜치 전환으로 **순차 배포**(A·B와 겹치지 않게 — 한 번에 하나).
- 지표: 정확답 · no_answer율 · 되묻기율 · **실제 인계율**(칩 클릭 티켓, no_answer 표시와 분리 — 평가서 §2.3) · **p50/p95 지연** · top1 변경 빈도.
- ⭐ 핵심 관찰: **"순위 때문에 잘리던 문서"(예: 주차 요금)가 리랭커로 top-5에 들어와 정답이 나오는가**, 지연 증가분 대비 값어치가 있는가.
- **안전 불변식 무회귀**: 응급·진단요구·명시적 직원요청 프로브가 Ⓒ에서도 그대로 인계/안내되는지 실측.
- 판정: "지연 증가분 대비 품질 향상이 값어치가 있나"를 숫자로 사용자와 결정. 채택 시 병합, 미채택이면 폐기(플래그로 무위험).
- 배포·유료 A/B는 원격 자격이 필요하니 **사용자가 `!`로 직접 실행**. 워커는 로컬 구현·검증·push까지.

## 11. 요구사항 준수 대조표

| 요구사항 | 브랜치 C 판정 | 근거 |
|---|---|---|
| L405 (승인 자료만 근거) | 준수 — 리랭커는 **후보 순서만** 바꿈, 승인 KB 청크 밖 자료를 만들지 않음 | §4·§5 |
| L406 (근거 확인 가능) | 준수 — `chat_message_sources` 스냅샷 계약 무변경 | §5.5 |
| L407 (모르는 것 지어내지 않음) | 준수 — 0.30 게이트·모델 NO_ANSWER 판정 무변경, 리랭커는 채점만 | §4 |
| L410 (개인정보 무단검색·외부전송 금지) | 준수 — KB 후보 재정렬만, 외부 전송은 **이미 쓰는 Anthropic뿐**(새 업체 없음), 관측은 내부 로그 | §2·§6 |
| L377 (몰래예약·2단계 확인) / L49 (변경·취소 안내만) | 무관 — 리랭커는 rag 갈래 근거 재정렬만, 예약/취소 갈래 미개입 | §4 |
| L545·546 (진단·자동전화 금지) | 준수 — 진단요구는 그래프/리랭커 밖 결정적 denylist가 선점(인계) | §4, `safety_watchdog.check_diagnosis_request` |
| 제한 자료(A3·`KBADM-EDITOR-04`) | 준수 — 재정렬 후 1위가 제한자료면 LLM 없이 원문 블록 | §4 |

## 12. 후속 (범위 밖)

- 이번 ⓪/Ⓐ/Ⓑ/Ⓒ A/B 결과로 리랭커 채택 여부·발동 정책(항상 vs 조건부) 재판단.
- 채택 시: 발췌 길이·타임아웃 튜닝, listwise vs 포인트와이즈 재검토, 상위 후보만 재정렬(비용↓) 등.
- 미채택 시: 브랜치 폐기(플래그로 무위험), 평가서 §3.3 "보류" 유지.
