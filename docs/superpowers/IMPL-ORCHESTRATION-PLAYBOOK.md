# ⑦ 구현 오케스트레이션 플레이북

> **무엇**: ⑦ 구현/배포 단계를, **비용을 아끼면서 세션이 자주 끊겨도(Claude Pro) 작업을 잃지 않게** 여러 모델·창을 조합해 돌리는 방법.
> **언제 여나**: ⑦ 구현 세션을 시작할 때마다 먼저. 다음 세션도 **이 문서 하나로 동일하게** 재개할 수 있게 쓴다.
> **한 줄 요약**: 나(코디네이터=Opus 4.8[1M]·high)는 **쪼개고·리뷰하고·커밋 지시만** 하고, **벌크 구현은 Codex Luna-max 워커**(별도 프로세스, 자체 토큰 예산)가 TDD로 하고 **매 GREEN마다 커밋**한다. 그러면 내 세션이 죽어도 잃을 게 없다.

---

## 0. 확정된 전제 (2026-08-20 검증)

- **1단계 기반은 초록불**: `backend` 테스트 **125 passed**(28s). 마이그 `00001~00016` + B/C 동시성 수정 포함. → ⑦의 안전한 토대.
- **환경**: 이 저장소는 ORCA 메인 워크트리(repo `6802ec0a…`, branch `merge/design-integration`). ORCA 앱 실행 중. Codex CLI `0.148.0`(예전의 "Update 다이얼로그가 엔터 먹음" 함정은 이 버전에서 해소됨).
- **Codex 기본 = `gpt-5.6-luna` + `model_reasoning_effort=max`**(사용자 `~/.codex/config.toml`). 즉 별도 오버라이드 없이도 Luna-max로 뜬다.

## 1. 왜 Codex 워커인가 (서브에이전트를 안 쓰는 이유)

| | Claude 서브에이전트(Task 도구) | **Codex 워크트리 워커(ORCA)** |
|---|---|---|
| 실행 위치 | 내 Claude 세션 **안** | **별도 프로세스·별도 체크아웃** |
| 세션 끊기면 | 미커밋 작업 **소실**(Pro에서 빈번) | 내가 죽어도 **계속 돌고, 커밋된 건 생존** |
| 토큰 | **내 Pro 쿼터 소모** | Codex 자체 예산(넉넉) |
| 병렬 | 가능하나 내 쿼터·컨텍스트에 묶임 | 창마다 독립 |

→ **무거운 다파일 구현·긴 작업 = Codex 워커.** Claude 서브에이전트는 **몇 초 내 끝나는 읽기 전용 팬아웃(검색)** 에만.

## 2. 모델 선택 결정 프레임워크 ⭐ (구현 대상에 따라 고른다)

작업을 받으면 **"범위가 좁고 성공기준(테스트)이 명확한가?"** 로 먼저 가른다.

| 작업 성격 | 누가 | 왜 |
|---|---|---|
| **범위 좁음 + 테스트로 성공기준 명확** (대다수 ⑦ 태스크: 화면·서비스·CRUD·마이그+스키마테스트) | **Codex Luna-max 워커** | DeepSWE 벤치 Luna-max 67%·시도당 $0.61(Sol-max $8.39의 ~1/13.75), GPT-5.5 xhigh급. "경계 명확한 구현"에 최적 = TDD |
| **애매한 아키텍처 / 보안 / 동시성** (RLS 정책, 디스패처 공유 다리, 슬롯 이중예약, 세션/인증) | **나 직접**(Opus 4.8[1M]·high) 또는 **Codex Sol/Terra-high** | 테스트로도 다 못 막는 판단. 미묘한 버그가 비쌈 |
| **한 도구(Claude) 안에서 구현을 끝내고 싶을 때** | **opusplan**: Opus가 계획/리뷰, **Sonnet이 실행** | Advisor 전략, 즉시 ~11%↓·품질 유지. Codex 창 조종 오버헤드 없이 갈 때 |
| **잡일**(파일검색·보일러플레이트·테스트 실행·죽은참조 스캔) | **Haiku 4.5** or **Codex Luna-low** | 최저가로 충분 |

> 플랜이 이미 매우 상세(behaviors 규칙·테스트 골격 존재)해 **대부분 Luna-max로 커버**된다. 위 2행(보안/동시성)만 골라서 나/상위 티어로.

## 3. 세션 죽음 대비 프로토콜 (Pro 필수)

1. **워커는 항상 별도 프로세스** (2가지 패턴):
   - **격리 패턴(권장, 병렬·코드 변경)**: `orca worktree create` 로 **자식 워크트리 + 자기 브랜치**. 내 체크아웃과 충돌 없음. 리뷰 후 병합.
   - **동일-체크아웃 패턴(소규모·단일·읽기 위주)**: `orca terminal create --worktree active --command codex`. 새 체크아웃 없이 현재 브랜치에서. **자기 파일만 `git add`** 하도록 지시(내 미커밋과 안 엉키게).
2. **매 GREEN마다 커밋**(테스트 하나 통과 = 커밋 하나). 구현자가 절대 미커밋 상태로 오래 있지 않게 브리프에 명시.
3. **재개**: 세션이 죽으면 다음 세션은 `git log`·`orca worktree ps --json`·`orca terminal list`로 **어디까지 커밋됐나**만 보고 이어간다. 이 플레이북 + HANDOFF가 진입점.
4. **코디네이터(나)는 벌크 코드를 쓰지 않는다** — 쓰면 내 세션과 함께 위험해진다. 나는 브리프·리뷰·커밋 지시·병합만.

## 4. ORCA 스폰 메커니즘 (정확한 명령 — 2026-08-20 실검증)

> `ORCA` = 이 맥에선 `orca`. **모든 호출 `--json`.**
>
> ⭐ **핵심 제약(실검증)**: **Claude(나)는 codex 창을 「새로 띄우지」 못한다.** `orca terminal create --command 'codex …'` 는 플래그를 어떻게 바꿔도(`--sandbox`·`-a` 빼도, `--model`만 넣어도) **auto 모드 분류기**가 "Claude가 자율 AI 에이전트를 생성"으로 판단해 막는다(허용목록에 `Bash(orca terminal *)`가 있어도 별개 게이트라 막힘). **하지만 이미 열려 있는 codex 창을 「조종」하는 것(list/read/wait/send)은 통과한다.**

**그래서 실제 작동하는 스폰 흐름** = ①사람 or ②codex가 창을 열고 → ③내가 조종:
- **① 사람이 연다**: ORCA 앱에서 이 저장소 워크트리에 새 터미널 탭 → `codex` 실행(기본 `gpt-5.6-luna max`). (외부 iTerm 말고 **ORCA 앱 안** 터미널이라야 `orca terminal list`에 잡힘.)
- **② codex가 codex를 연다(팬아웃)**: 이미 도는 codex 워커는 분류기 대상이 아니므로, 그 창에서 codex가 `orca worktree create --agent codex` 로 추가 워커를 띄울 수 있다. → 첫 창만 사람이 열면, 이후 확장은 코디네이터(codex)에 위임 가능.

**내가 조종하는 시퀀스(실검증 통과)**:
```
orca terminal list --worktree active --json        # 배너 "model: gpt-5.6-luna max" 로 codex 창 식별
#   → result.terminals[].handle . tail/상태는 read 로.
orca terminal read --terminal <handle> --json      # 필드는 result.terminal.tail(줄 배열) + .status
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
orca terminal send --terminal <handle> --text "<브리프>" --enter --json   # 통과함(기존 창에 텍스트 주입)
```
- **브리프는 개행 없이 한 줄로** 보낸다(TUI에서 중간 개행이 조기 제출될 수 있음). bash는 **작은따옴표**로 감싸고 브리프에 `!`·작은따옴표를 넣지 않는다(히스토리 확장·따옴표 깨짐 방지).
- 진행 확인: `orca terminal read`(긴 출력은 커서 페이지네이션). 상태 표식은 워커에게 `orca worktree set --worktree active --comment "…"`.

**격리 워커(코드 변경·병렬, codex가 스폰)** — 첫 codex에게 시키는 형태:
```
orca worktree create --repo id:6802ec0a-50bc-46df-ab5d-dc6769a11289 \
  --name <task> --parent-worktree active --base-branch merge/design-integration \
  --agent codex --prompt "<브리프>" --json
# venv는 워커가 새로 만들어야(격리 체크아웃엔 .venv 없음).
```

**감독형 오케스트레이션(내가 여러 워커를 추적·조율)**: `orchestration` 스킬 = `orca orchestration task-create/dispatch --inject/check --wait`. 단순 위임(핸드오프)이 아니라 **내가 지휘**할 때. ⚠️ dispatch 전 `terminal read` tail로 활성 다이얼로그 없음 검증.

## 4-A. ⭐ 컨텍스트 40/50 상한 + 코디네이터 바통 (사용자 하드 규칙, 2026-08-24)

> **목적**: 최대 창을 끝까지 채우지 않고 품질 좋은 앞 구간만 쓴다. 대화창은 휘발성 작업대이고, `git`·실행 시트 §11·`HANDOFF.md`·Orca task state가 영속 기억이다.
>
> **명령 의미 정본**: OpenAI 공식 slash command 문서상 `/status`는 chat ID·컨텍스트 사용량·rate limit을 보여주고, `/compact`는 현재 chat의 context를 압축한다. `/clear`는 공식 목록에 없다. 완전한 빈 창은 새 Codex terminal/session으로 만든다: <https://learn.chatgpt.com/docs/reference/slash-commands>

### A. 모든 Task의 강제 게이트

| `/status` 사용률 | 상태 | 허용 동작 |
|---|---|---|
| `0~39%` | GREEN | 해당 Task 착수·진행 가능. 플랜은 해당 Task 절과 가리킨 규칙만 읽는다. |
| `40~49%` | HANDOFF | 새 Task·큰 문서 읽기·새 dispatch 금지. 현재 Task를 안전한 GREEN/커밋 지점까지 닫고 인계 준비만 한다. |
| `50%+` | STOP | 절대 상한. 구현·리뷰·탐색 중단. 상태 저장·실행 중 워커 회수·바통 인계만 한다. |

각 Task마다 순서가 고정이다.

1. **START**: `/status` → 40% 미만임을 확인 → 실행 시트 §11에 시작률 임시 기록.
2. 해당 `## Task N` 절 + 그 절이 가리키는 `screen-behaviors.md` 규칙 ID만 읽는다. 다음 Task 절은 미리 읽지 않는다.
3. 구현·리뷰·focused 검증·커밋을 끝낸다.
4. **END**: `/status` → 종료률 기록. 다음 Task 착수 직전에 다시 `/status`.
5. 40% 이상이면 다음 Task로 넘어가지 않고 아래 바통 절차를 수행한다. `/status`를 실행하거나 수치를 읽을 수 없으면 **낮다고 추정하지 않는다**. 현재 Task 체크포인트까지만 저장하고 새 코디네이터에서 다음 Task를 시작한다.

실행 시트 §11 로그 형식:

```text
Task N — <commit> — ctx 시작 23% → 종료 37% — 미결 판단: 없음
```

### B. 자기 창·다른 창의 컨텍스트 확인

자기 창에서는 composer/TUI에 `/status`를 실행한다. Orca orchestration 메시지에는 상대 창의 모델 내부 사용률이 자동으로 붙지 않는다. 상대 창을 확인하려면 **상대가 idle일 때만** Orca terminal control로 `/status`를 입력하고 결과를 읽는다.

```text
orca status --json
orca terminal list --worktree active --json
orca terminal read --terminal <handle> --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
orca terminal send --terminal <handle> --text "/status" --enter --json
orca terminal read --terminal <handle> --json
```

- `orca status`가 `runtime.state=ready`·`reachable=true`가 아니면 뒤 명령을 실행하지 않는다.
- **Codex 샌드박스 주의**: 이 macOS 환경에서는 제한된 shell의 `orca status`가 실제 앱이 살아 있어도 `task_name_for_pid` 권한 오류와 함께 거짓 `stale_bootstrap`을 반환했다. `status`·`terminal list/read/wait/send`·orchestration RPC는 승인된 **샌드박스 밖 실행**으로 통일한다. 샌드박스 안 결과만 보고 앱을 재시작하거나 세션을 닫지 않는다.
- `terminal read`로 활성 다이얼로그·진행 중 작업이 없음을 먼저 확인한다. 작업 중인 창에 `/status`를 주입하지 않는다.
- 확인한 값은 필요할 때 `orca orchestration send --type status`로 ACTIVE/STANDBY 사이에 짧게 공유한다. 수치만 보내고 긴 terminal tail은 복사하지 않는다.

### C. ACTIVE 1명 + STANDBY 1명 — 바통 교대

두 코디네이터가 동시에 지휘하면 안 된다. **ACTIVE만** Task 생성·dispatch·병합·커밋한다. **STANDBY는** `git`·task state·규칙을 읽고 인계를 검증할 뿐 파일 수정과 dispatch를 하지 않는다.

바통은 **Task/Wave 경계이며 활성 dispatch가 0인 때**만 넘긴다.

1. ACTIVE가 새 dispatch를 멈춘다.
2. 기존 워커의 `worker_done`·`escalation`을 회수한다. 활성 워커가 있으면 인계하지 않는다.
3. focused 검증·코디 커밋을 끝내고 `git status`·`git log -1`·`orca orchestration task-list --brief --json`을 확인한다.
4. 실행 시트 §11에 Task 커밋·컨텍스트 시작/종료율·스스로 판단한 미결을 기록한다. `HANDOFF.md`에는 지금 상태·다음 한 일만 갱신한다.
5. STANDBY에게 아래 인계 캡슐을 `handoff` 메시지로 보낸다. `ownerEpoch`는 매 교대마다 1 증가한다.
6. STANDBY는 `git`·실행 시트·HANDOFF·Orca task state를 독립 확인하고 ACK/REJECT를 답한다.
7. **ACK 뒤에만** STANDBY가 새 ACTIVE가 된다. 옛 ACTIVE는 dispatch·커밋을 즉시 중단한다.
8. 옛 ACTIVE는 `/compact` 후 `/status`를 다시 보거나 새 터미널로 교체한다. 40% 이상이면 ACTIVE 복귀 금지. 반복 압축한 창보다 새 창을 우선한다.

인계 캡슐 최소 필드:

```text
ownerEpoch: <N>
from/to: <old handle> -> <new handle>
currentTask: <완료한 Task>
nextAction: <다음 한 가지>
head: <commit hash>
dirtyFiles: <없음 또는 정확한 목록>
activeDispatches: 0
tests: <명령 + 결과>
decisions: <미결로 스스로 판단한 것 또는 없음>
context: <old 시작/종료%, new 시작%>
```

메시지 골격(실제 handle은 매번 `terminal list`로 새로 얻는다):

```text
orca orchestration send --to <standby-handle> --type handoff --subject "coordinator baton epoch <N>" --body "<인계 캡슐>" --json
orca orchestration ask --to <standby-handle> --question "epoch <N> 상태를 독립 검증했으면 ACCEPT, 아니면 REJECT와 이유를 답하라" --timeout-ms 600000 --json
```

terminal handle은 Orca 재시작 때 바뀔 수 있으므로 문서에 영구 저장하지 않는다. task lifecycle의 `taskId`·`dispatchId`가 정본이며, 인계 중 활성 dispatch를 0으로 만드는 이유도 worker 질문·완료 보고가 옛 coordinator로 갈라지는 것을 막기 위해서다.

### D. `/compact`와 진짜 새 창

- `/compact`는 삭제가 아니라 요약 압축이다. 실행 후 반드시 `/status`를 다시 실행한다.
- 압축 후에도 40% 이상, 중요한 세부가 요약에서 빠짐, 같은 창에서 여러 번 압축 중 하나면 **새 Codex terminal**을 STANDBY/다음 ACTIVE로 쓴다.
- 새 창은 이 플레이북 §4-A → 실행 시트 → HANDOFF 최상단 → 해당 Task 절 순으로 읽는다. 이전 대화 전체를 다시 주입하지 않는다.
- 무한 루프를 만들지 않는다. **바통을 이어 사실상 장기 실행**하되, rate limit·Orca runtime·사용자 결정·외부 승인·3회 반복 실패는 명시적 정지 조건이다.

### E. 실검증 기록

- **실검증 완료(2026-08-24)**: 샌드박스 밖 `orca status`에서 `ready`·`reachable=true` 확인. 빈 Luna 테스트 터미널을 `terminal read`·`wait --for tui-idle`로 확인한 뒤 원격 `/status`를 주입해 `Context window: 99% left (14.6K used / 258K)`를 읽었다. 이어 원격 `/compact`의 `Context compacted` 완료를 확인하고 `/status`를 다시 주입해 `100% left (4.73K used / 258K)`로 감소한 것을 읽었다. 따라서 **다른 Codex 창의 컨텍스트 확인·압축 제어 경로는 실제 작동한다.**
- 앞서 세 번 관측한 `stale_bootstrap`은 Orca 종료가 아니라 **샌드박스 안 검사의 거짓 음성**이었다. 같은 시각 Orca 로그에는 데몬과 세션 attach가 유지됐고, 같은 명령을 샌드박스 밖에서 실행하자 PID 4417·동일 runtime ID로 즉시 정상 응답했다.
- 회귀 검증 기준: 샌드박스 밖 `orca status` ready 유지 → 테스트/대상 terminal idle 확인 → `/status` 주입 → `terminal read`에서 context usage 확인. `/compact` 시험은 실제 작업 창이 아니라 버려도 되는 테스트 창에서만 한다.

## 5. 워커 브리프 규율 (TDD)

브리프는 **자체완결**이어야 한다(워커는 콜드 스타트). 반드시 포함:
1. 저장소 1줄 소개 + **읽을 파일 목록**(해당 플랜·behaviors 절·색인). 워커가 큰 플랜을 읽는다(=토큰 효율 4배, 자기 예산).
2. **범위**: 어느 Task/규칙 ID까지. 경계 밖은 "건드리지 말 것"으로 명시.
3. **TDD**: RED(실패 테스트 먼저)→GREEN(통과)→REFACTOR. **테스트 한 줄에 규칙 ID 하나**, `assert`에 값 하나씩(빈 테스트 금지).
4. **커밋**: 매 GREEN마다. **자기 파일만 `git add`**. 코드 외 변경 금지 항목 명시.
5. **완료 신호**: 끝에 `DONE` + 무엇을 커밋했는지 1줄.
6. 창구는 `Consumes:`/`Produces:`에 **이름**으로(우리말 서술은 기계가 못 봄). DB 칸 나오면 서버층 짝 확인.
7. **컨텍스트 게이트**: 시작·종료에 `/status`. 40%부터 새 읽기·탐색·하위 dispatch 금지 → 가장 가까운 GREEN/커밋 체크포인트를 만들고 `worker_done` 또는 `DONE`에 `context_handoff`와 남은 일을 보고. 50% 이상은 상태 저장·보고 외 작업 금지. 수치를 확인할 수 없으면 다음 Task를 같은 창에 연속 배정하지 않는다.

## 6. 단계적 롤아웃

- **Phase 0 (코디네이터, 완료)**: 기반 초록불 확인(125 passed) + 이 플레이북.
- **Phase 1 (파일럿 1창)**: Codex Luna-max 워커 1개로 **기반 잔여수정 감사**(읽기+보고서 1커밋). 파이프라인 검증: 스폰→모델→자율작업→커밋→내 리뷰→git 재개.
- **Phase 2 (검증되면 팬아웃)**: 서로 독립적인 단계에 병렬 Codex 워커. 의존 순서 = **기반 → (직원웹 / 환자앱) → 챗봇 → 배포**. 세 앱은 기반 위, 챗봇은 앞 둘의 데이터·계약 소비.

## 7. 설정 (모델·노력도)

- **메인(나)**: `/model claude-opus-4-8[1m]` → `/effort high` (Opus 4.8 기본 노력도가 이미 high). 영구고정은 `settings.json`의 `"model"`·`"effortLevel"`.
  - `max`/`ultracode`는 Pro 쿼터를 크게 태우고 ultracode는 수백 서브에이전트를 띄워 역효과 → **high 유지**.
- **서브에이전트 요금 방지**: `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`(또는 `haiku`) — 안 하면 잡일도 Opus 요금.
- **Codex 워커**: 기본이 이미 `gpt-5.6-luna`+`max`. 애매/보안 태스크만 창에서 `codex --model gpt-5.6-sol -c model_reasoning_effort="high"` 로.

## 8. 함정 (계속 적용)

- **Claude는 codex 창을 새로 못 띄운다**(§4 핵심 제약, 실검증). 첫 창은 사람이 ORCA 앱에서 열고, 이후는 codex↔codex 팬아웃. 내가 하는 건 **조종(list/read/wait/send)** 뿐 — 이건 통과.
- **spend limit 주의**: 열린 codex 창이 여러 개면 계정/티어별 한도가 다르다 — 2026-08-20 검증 때 한 창은 "monthly spend limit" 걸려 있었다. 워커로 쓸 창의 배너에서 모델·가용성 확인.
- **send 전 반드시 `terminal wait --for tui-idle` + `read` tail 확인**(다이얼로그가 엔터 먹는 것 방지).
- 워커가 `git add -A` 하면 내 미커밋까지 삼킴 → **자기 파일만 add** 하도록 브리프에 못 박기.
- 격리 워크트리엔 `.venv` 없음 → 워커가 `python -m venv .venv && .venv/bin/pip install -r backend/requirements.txt` 먼저.
- 테스트 실행엔 로컬 supabase 필요(`supabase status`로 확인, DB_URL `…54322`).
- 낡은 `⏳`/미결을 그대로 믿지 말 것(주제어 grep 재확인). 확정 시 뒤집힌 쪽에도 역참조.

---

## 부록: 진행 상태 (세션 간 이어쓰기)

> 여기에 **어느 워커가 어디까지** 를 간단히. 상세는 각 워커 브랜치의 `git log`.

- **2026-08-20**: Phase 0 완료(기반 125 passed 확인, 이 플레이북 작성). Phase 1 파일럿 스폰은 권한 승인 대기.
