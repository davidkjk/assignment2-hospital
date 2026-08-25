# AGENTS.md — Codex 자동 로드 규칙 (병원 예약 시스템)

> Codex는 이 파일을 세션 시작 시 자동으로 읽는다(Claude의 `CLAUDE.md`와 같은 역할).
> **앞으로 ~3일간 이 저장소를 Codex가 진행한다**(원 코디네이터 Claude는 토큰 회복 후 복귀·리뷰). 아래는 **코드·git으로는 얻을 수 없는 규칙만** 추린 것 — 실행 순서·태스크 표는 진입 문서에 있다.

## 🚪 진입 문서 (착수 전 이 순서로)
1. `docs/superpowers/CODEX-3DAY-EXECUTION-SHEET.md` — **무엇을·어떤 순서·어떤 모델·어떤 파일에** (태스크 표·seam·병렬 규율·리뷰·복귀 절차). ⭐ 시작점.
2. `docs/superpowers/IMPL-ORCHESTRATION-PLAYBOOK.md` — 워커 스폰·세션 죽음 대비·orca 명령.
3. `HANDOFF.md` 최상단 — 지금 커밋 상태. / `docs/design/spec-index/MIGRATION-LEDGER.md` — 마이그 번호 정본.
4. 착수 직전에만: `docs/superpowers/plans/2026-08-15-staff-web.md`의 해당 `## Task N` + `docs/design/screen-behaviors.md` 규칙 줄범위.

## 🧠 컨텍스트 40/50 상한·지휘권 바통 (사용자 하드 규칙)
- **모든 Task 시작 직전과 종료 직후 `/status`를 실행**해 컨텍스트 사용률을 확인하고, 실행 시트 §11 로그에 `ctx 시작 N% → 종료 N%`를 남긴다. 다른 Task를 읽거나 배정하기 전에도 다시 확인한다.
- **0~39%만 새 Task 착수 가능. 40%가 되면 인계 준비선**: 새 Task·큰 문서 읽기·새 워커 dispatch를 금지하고, 현재 Task를 안전한 GREEN/커밋 지점까지 마감한 뒤 체크포인트와 바통 인계를 수행한다.
- **50%는 절대 상한**: 50% 이상에서는 구현·리뷰·새 탐색을 계속하지 않는다. 허용되는 일은 현재 상태 저장, 실행 중 워커 회수, 인계뿐이다. `/compact` 후 반드시 `/status`를 다시 확인하고, 여전히 40% 이상이거나 반복 압축한 창이면 새 Codex 창으로 교체한다.
- **플랜 전체 읽기 금지**: 실행 시트는 진입 때 읽되, 95만 바이트 직원웹 플랜과 105만 바이트 behaviors는 해당 `## Task N` 절·가리킨 규칙 ID만 읽는다.
- 지휘자는 **ACTIVE 1명 + STANDBY 1명**뿐이다. STANDBY는 읽기·검증만 하고 dispatch/커밋하지 않는다. 활성 dispatch가 남은 중간에는 지휘권을 넘기지 않으며, 수신자의 ACK 뒤에만 새 지휘자가 ACTIVE가 된다.
- 상세 명령·인계 캡슐·Orca 장애 시 절차의 **단일 정본** = `docs/superpowers/IMPL-ORCHESTRATION-PLAYBOOK.md` §4-A. 새 코디네이터는 Task 전에 반드시 그 절을 읽는다.

## 🎛 모델 라우팅·5시간 창 (사용자 하드 규칙)
- **Task 배정 전 모델 게이트**: 실행 시트 §5의 해당 행을 읽고 `route: Task N | model | effort | 이유`를 먼저 쓴다. 모델·노력을 생략한 새 Codex 창, “기본값일 것”이라는 추정, 실행 중 임의 상향은 금지한다.
- 새 워커는 `codex --model <정확한 모델> -c model_reasoning_effort="<정확한 노력>"`으로 띄운다. 브리프 전 `/status`를 원격 주입·읽기하여 **모델·노력·컨텍스트 <40%**를 확인한다. 하나라도 다르면 dispatch하지 않는다.
- **역할과 작업 모델을 분리한다**: 평시 ACTIVE 코디네이터=Terra-high, STANDBY/심박 감시=Luna-medium 또는 모델 호출 없는 Orca wait. 코디가 어려운 설계·충돌을 직접 판단할 때만 Sol-high/xhigh 새 창으로 판정 작업을 분리한다. 구현 워커는 좁고 테스트가 명확한 로직=Luna-max, 일반 구조·시각=Sol-high, 고밀도=Sol-xhigh, 보안·동시성·비가역·고위험=Sol-max 주 실행 + 별도 Terra-high 적대리뷰. Task별 정본은 실행 시트 §5, 명령·예외 정본은 플레이북 §2-A다.
- **5시간은 세션 수명이 아니라 ChatGPT 플랜의 공유 사용량 창**이다. 모델에게 주기적으로 말을 거는 keepalive 금지. 생존 확인은 모델 토큰을 쓰지 않는 Orca `terminal show/wait`·`orchestration check --wait`로 한다.
- 사용량 제한에 닿으면 새 세션으로 우회하지 않는다. GREEN/커밋·HANDOFF·task state를 저장하고 reset까지 대기한다. API key 후불 전환은 **사용자가 비용 상한을 명시 승인한 경우만** 가능하며 자동 전환 금지. 상세=플레이북 §4-B.

## 🧩 네이티브 스킬을 쓴다 (이미 설치됨)
- superpowers가 활성이다(`config.toml`). **실제로 호출해서** 쓴다: 구현 = `test-driven-development`, 버그 = `systematic-debugging`, 리뷰 = `.system/review-agent`·`requesting-code-review`, 완료 주장 전 = `verification-before-completion`, 병렬 = `dispatching-parallel-agents`(multi_agent_v2 켜짐), DB = `supabase-postgres-best-practices`.
- **없는 건 `frontend-design` 하나** → 시각 화면은 데모 포팅으로 메운다(실행 시트 §1·§5).

## 🗣 사용자와의 소통 (가장 중요)
- 사용자는 **비개발자**다. 전문용어를 빠뜨리지 말되 **풀어서**(용어 → 쉬운 뜻 → 비유) 설명한다.
- **선택지를 줄 땐 항상**: ① 추천 + 이유 먼저, ② 각 선택지 장단점. **미결은 하나씩**(여러 건 묶어 객관식으로 넘기지 말 것).
- **모든 응답은 한국어.** 기술용어·코드 식별자는 원문 유지.

## 🧭 설계 원칙 (계속 적용)
- **되돌릴 수 없는 동작은 눈에 덜 띄게** — 빨간 버튼은 확인창 안에서만.
- **막다른 길 금지** — 막을 땐 해결 경로를 함께 준다. **끌 수 없는 스위치 금지.**
- **개인정보 열거 방지** — 맞든 틀리든 같은 화면으로 진행.
- **환자 노출 문구**: "취소 요청 접수/등록" 금지 → **"상담(직원 확인)으로 연결"만.**
- 화면 수를 아끼려 여러 결정을 한 화면에 묶지 말 것.
- 아이콘은 **SVG `<symbol>`+`<use>`**. **이모지 금지.**

## 🔍 추측 금지 (기능 갭 37건이 전부 이렇게 나왔다)
- "이 규칙/값이 있나?"는 기억으로 답하지 말고 **grep/read로 원문 확인**. 특히 **"없다"는 단정이 위험**(있는 걸 없다고 하면 다시 만든다).
- 검색 범위 = 요구사항·스펙·플랜·설정 전부. 항목 하나 읽고 멈추지 말고 **주제어로 전역 grep**까지.
- **낡은 `⏳`·「미결」·`NEEDS-USER-DECISION`을 그대로 믿지 말 것** — 그 주제어로 한 번 더 grep(옛 미결이 갱신 안 된 채 남는다). 전수 점검서 `⏳` 18건 중 10건이 낡아 있었다.

## 🗄 마이그레이션 파일 ≠ 실제 적용
- 마이그 파일을 만드는 것과 원격 DB에 **적용**(`supabase db push`)은 별개 단계다. 앱 배포 파이프라인은 보통 적용을 포함하지 않는다.
- **번호 정본 = `MIGRATION-LEDGER.md`.** 플랜 산문의 옛 번호(`00017`류)는 **+16 시프트**로 무시하고 `Create:` 줄만 믿는다. 직원웹 다음 빈 번호 = **`00037`**.
- 배포가 "정상"이어도 테이블이 실제로 존재하는지는 **별도로 확인**(프로세스 기동·커넥션 풀 ≠ 스키마 존재).

## 👷 워커 규율 (병렬 실행)
- **모델 라우팅은 위 하드 게이트대로** — 실행 시트 §5 행 → 명시적 모델/노력으로 창 생성 → `/status` 검증 → dispatch 순서를 생략하지 않는다.
- **병렬 DB 규율**: 워커는 `supabase migration up`만(**`db reset` 절대 금지** — 공유 DB), **focused 테스트만**. 전체 회귀는 코디가 **클린 DB(`db reset`)에서 1회**. 리셋하면 사라지는 실패 = 오염이지 버그 아님.
- **워커는 자기 파일만 `git add`**(`git add -A` 금지). **공용 파일**(`routes.tsx`·`StaffShell`·`_ui`·공용 mockData·`main.py`)은 **코디만** 배선.
- **커밋은 코디**가 worker_done마다. 워커는 끝에 `DONE` + 커밋한 것 1줄.
- **보고 자제**: 긴 실행 중 잦은 진행 보고 금지. 입을 여는 건 ① 결론 ② 문제 ③ 사용자 결정 필요 — 세 경우만.

## 🛠 orca 워커 명령 (스킬 가이드 재독 금지)
- 실검증된 명령은 **`HANDOFF.md` 「세션 재개 일반 레시피」**에 있다. 스킬 전체 가이드는 명령이 실제로 실패할 때만 다시 읽는다.
- 이 repo의 orca id = **`6802ec0a-50bc-46df-ab5d-dc6769a11289`**. 워크트리 생성 시 **`--base-branch merge/design-integration` 명시**(생략하면 로컬 미push 커밋이 빠짐).
- Codex 코디네이터는 같은 워크트리에 Codex 창을 새로 띄울 수 있다. 단 `orca worktree create --agent codex`는 Codex 전용 model/effort 인자를 받지 않으므로 **라우팅된 작업에는 사용하지 않는다**. 플레이북 §2-A의 `orca terminal create --command 'codex --model … -c model_reasoning_effort=…'` 경로를 쓰고 `/status`로 검증한다.

## 📝 기록 규칙
- 결정을 확정하면 **두 곳에**: ① `screen-behaviors.md` 규칙 표(무엇) ② 결정로그(왜 + 기각 사유). **뒤집은 것이 있으면 「뒤집힌 쪽」에도 역참조**(`~~옛 서술~~ ✅ 해소(날짜, 결정 #N)`).
- **핸드오프엔 「지금 상태·다음 할 일」만.** 결정 내용을 여기 또 적지 말 것(3중 보관 방지).
- 실행 시트 §11 진행 로그에 **각 Task: 커밋해시 + 미결로 스스로 판단한 것**을 남긴다(Claude 복귀 리뷰가 이것에 의존).
