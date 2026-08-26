# ⑦ 구현 오케스트레이션 플레이북

> **무엇**: ⑦ 구현/배포 단계를, **비용을 아끼면서 세션이 자주 끊겨도(Claude Pro) 작업을 잃지 않게** 여러 모델·창을 조합해 돌리는 방법.
> **언제 여나**: ⑦ 구현 세션을 시작할 때마다 먼저. 다음 세션도 **이 문서 하나로 동일하게** 재개할 수 있게 쓴다.
> **한 줄 요약**: 평시 ACTIVE 코디네이터는 **Codex Sol-medium**으로 쪼개기·라우팅·회수·커밋을 맡는다. 일반 구현은 fresh **Luna-max가 TDD(테스트 포함)**로 수행하고, fresh **Sol-high가 독립 전수검증**한다. 고위험은 **Sol-max 주 실행 + Terra-high 적대리뷰**다. 모든 창은 시작 전 모델·노력·컨텍스트를 `/status`로 검증하고 매 GREEN마다 체크포인트를 남긴다.

---

## 0. 확정된 전제 (2026-08-20 검증)

- **1단계 기반은 초록불**: `backend` 테스트 **125 passed**(28s). 마이그 `00001~00016` + B/C 동시성 수정 포함. → ⑦의 안전한 토대.
- **환경**: 이 저장소는 ORCA 메인 워크트리(repo `6802ec0a…`, branch `merge/design-integration`). ORCA 앱 실행 중. Codex CLI `0.148.0`(예전의 "Update 다이얼로그가 엔터 먹음" 함정은 이 버전에서 해소됨).
- **설정층이 다르다**: 사용자 `~/.codex/config.toml`은 Sol-high지만 Orca 격리 runtime config는 Luna-max다(2026-08-24 원문 확인). 따라서 어느 기본값도 믿지 않고 **모든 새 창에 model·effort를 명시**한다.

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
| **평시 지휘**(큐·dispatch·상태 회수·검증 실행·커밋) | **Codex Sol-medium ACTIVE** | 사용자 확정 기본값. 직접 구현하지 않고 범위 분리·회수·충돌 판단·커밋을 맡는다. |
| **STANDBY·심박 감시** | **Luna-medium 또는 모델 호출 없는 Orca wait** | 상태 읽기·이벤트 대기는 깊은 추론이 아니다. 판단이 생기면 ACTIVE/판정 창으로 올린다. |
| **일반 구현**(로직·일반 구조·시각, 성공기준을 테스트로 쪼갤 수 있음) | **Codex Luna-max 구현 워커** | RED→GREEN 테스트까지 구현 범위에 포함한다. 범위가 커지면 파일·규칙 seam으로 더 쪼갠다. |
| **모든 일반 구현의 독립 검증** | **Codex Sol-high review-only 워커** | 구현과 다른 fresh context에서 정본 규칙·코드·테스트 누락·실화면을 대조한다. PASS 전 완료 주장 금지. |
| **고밀도 화면·복잡한 Realtime/상태 조합** | **Codex Sol-xhigh 워커** | 일반 화면보다 탐색·검증을 한 단계 늘린다. 실행 시트 §5에 명시된 경우만 쓴다. |
| **보안·동시성·비가역·고위험** | **Codex Sol-max 주 실행 + Terra-high 독립 적대리뷰** | Sol을 최고 품질 주 실행자로 두고, 별도 컨텍스트의 Terra가 반례를 찾는다. 같은 창의 자기검토로 대체하지 않는다. |
| **잡일**(파일검색·보일러플레이트·테스트 실행·죽은참조 스캔) | **Codex Luna-low/medium** | 판단이 거의 없는 짧은 보조 작업에 한정한다. |

> 공식 현재 분류를 바탕으로 한 프로젝트 정책: Luna=일반 구현+테스트, Sol=독립 검증·복잡 구현, Terra=고위험 적대리뷰. 실행 시트 §5의 고밀도·고위험 상향 행이 일반 기본값보다 우선한다.

**지휘 모델과 구현 모델은 별개다.** Sol-medium ACTIVE는 벌크 구현을 하지 않고 Luna 구현과 Sol 검증을 분리해 지휘한다. ACTIVE가 직접 어려운 아키텍처·규칙 충돌·보안 판정을 내려야 하면 그 판정만 `Sol-high/xhigh` fresh terminal에 read-only task로 보낸다.

## 2-A. ⭐ 모델 라우팅 하드 게이트 (사용자 확정, 2026-08-24)

**모델은 브리프를 보낸 뒤 바꾸지 않는다.** Task를 읽기 전에 실행 시트 §5 행에서 모델·노력을 고르고 아래 순서를 통과한다.

1. 실행 로그에 `route: Task N | gpt-5.6-<tier> | <effort> | <표의 이유>`를 먼저 기록한다.
2. **워커 배정마다 클리어가 선행한다**: 기존 워커 창은 재사용하지 않고, 프롬프트 이력 없는 새 Codex terminal/session을 만든다. 현재 `/clear`는 공식 지원이 확인되지 않았으므로 보내거나 존재를 가정하지 않는다. `/compact`는 요약일 뿐 클리어 대체가 아니며, 기존 창의 낮은 context도 재사용 근거가 아니다.
3. 같은 워크트리의 routed worker는 모델을 명시해 생성한다:

```text
orca terminal create --worktree active --title "T<N>-<slug>" --command 'codex --model gpt-5.6-<tier> -c model_reasoning_effort="<effort>"' --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
orca terminal send --terminal <handle> --text "/status" --enter --json
orca terminal read --terminal <handle> --json
```

4. 첫 `/status`에서 model·effort와 새 Session ID·프롬프트 이력 없음을 확인한다. **완전히 새 빈 terminal은 현재 Codex가 context 줄을 생략할 수 있다**(§4-A 실검증). 이 경우 새 Session ID + 프롬프트 이력 없음 + model/effort 일치가 확인된 **첫 제한 범위**를 허용한다. Task 절·필수 규칙·브리프를 읽거나 받은 뒤, `task-create`·`dispatch --inject` 또는 첫 코드 편집의 **직전에 두 번째 `/status`**를 실행해 정확한 model·effort·실제 context **<40%**를 읽은 뒤에만 진행한다. 두 번째 측정도 줄이 없으면 그 사실을 기록하고 새 세션의 첫 제한 범위만 계속한 뒤 첫 응답/결과 직후 다시 확인한다. 프롬프트 이력 또는 새 Session ID를 확인하지 못하면 dispatch하지 않는다.
5. 브리프 첫 줄에도 `ROUTE: Task N | model=<정확한 slug> | effort=<값> | reason=<한 줄>`을 넣는다. 워커는 시작·종료 `/status`에 실제 model/effort를 함께 보고한다.
6. Task 중 난도가 예상보다 높아져도 같은 창에서 임의 상향하지 않는다. 가장 가까운 GREEN에서 멈추고 코디가 `route override` 이유를 로그에 남긴 뒤, 새 상위 모델 창으로 남은 범위를 다시 배정한다.
7. 리뷰는 구현과 독립된 fresh 컨텍스트에서 한다. **일반 구현은 Sol-high 전수검증의 `PASS`가 오기 전 완료 주장 금지**다. findings가 오면 구현 워커가 고치고 새 Sol 리뷰를 다시 받는다. Sol-max 고위험 Task는 Terra-high 적대리뷰의 `PASS/FINDINGS`가 오기 전 완료·병합 금지.
8. **컨텍스트 심박은 작업 경계에서만**: coordinator는 큰 문서·긴 tool 출력 후 다음 판단 전, worker_done/리뷰 결과 수신 직후, 그리고 새 Orca 작업 전 `/status`를 확인한다. worker는 첫 코드 편집 전·각 GREEN 커밋·완료 보고 직전에 확인한다. 시간만 보고 keepalive로 호출하지 않는다. 35%는 출력 축소·인계 준비 알림일 뿐 작업 중단선이 아니다; 40%부터 사용자 상한 규칙, 50%부터 즉시 STOP이다.

`orca worktree create --agent codex`는 Codex 전용 model/effort 인자를 받지 않으므로 routed worker에는 단독 사용하지 않는다. 격리 worktree가 꼭 필요하면 worktree를 먼저 만든 뒤 그 worktree를 대상으로 위 `terminal create --command 'codex --model …'`를 실행한다.

## 3. 세션 죽음 대비 프로토콜 (Pro 필수)

1. **워커는 항상 별도 프로세스** (2가지 패턴):
   - **격리 패턴(권장, 병렬·코드 변경)**: `orca worktree create` 로 **자식 워크트리 + 자기 브랜치**. 내 체크아웃과 충돌 없음. 리뷰 후 병합.
   - **동일-체크아웃 패턴(소규모·단일·읽기 위주)**: `orca terminal create --worktree active --command codex`. 새 체크아웃 없이 현재 브랜치에서. **자기 파일만 `git add`** 하도록 지시(내 미커밋과 안 엉키게).
2. **매 GREEN마다 커밋**(테스트 하나 통과 = 커밋 하나). 구현자가 절대 미커밋 상태로 오래 있지 않게 브리프에 명시.
3. **재개**: 세션이 죽으면 다음 세션은 `git log`·`orca worktree ps --json`·`orca terminal list`로 **어디까지 커밋됐나**만 보고 이어간다. 이 플레이북 + HANDOFF가 진입점.
4. **코디네이터(나)는 벌크 코드를 쓰지 않는다** — 쓰면 내 세션과 함께 위험해진다. 나는 브리프·리뷰·커밋 지시·병합만.

## 4. ORCA 스폰 메커니즘 (정확한 명령 — 2026-08-24 재검증)

> `ORCA` = 이 맥에선 `orca`. **모든 호출 `--json`.**
>
> ⭐ **현재 제약**: Codex 코디네이터는 `orca terminal create`로 다른 Codex terminal을 만들고 `list/read/wait/send`로 조종할 수 있다. 그러나 `orca worktree create --agent codex` 경로는 Codex 전용 model/effort를 받지 않으므로 **모델 라우팅 작업에는 쓰지 않는다.** §2-A처럼 명시적 `codex --model … -c model_reasoning_effort=…` 명령으로 만들고 `/status`를 검증한다.

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

**격리 워커(코드 변경·병렬)** — 워크트리만 먼저 만든 뒤, 반환된 worktree에 routed terminal을 만든다:
```
orca worktree create --repo id:6802ec0a-50bc-46df-ab5d-dc6769a11289 \
  --name <task> --parent-worktree active --base-branch merge/design-integration \
  --json
orca terminal create --worktree <반환된-worktree-handle> --title "T<N>-<slug>" \
  --command 'codex --model gpt-5.6-<tier> -c model_reasoning_effort="<effort>"' --json
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
8. 옛 ACTIVE는 새 터미널로 교체한다. **사용자 확정(2026-08-25): 실제 작업 창에 `/compact`를 쓰지 않는다.** 40% 이상인 창은 ACTIVE 복귀 금지다.

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

### D. `/compact` 금지 + 진짜 새 창

- **사용자 확정(2026-08-25): 실제 coordinator·worker·review 작업 창에 `/compact`를 쓰지 않는다.** 컨텍스트가 경계에 닿으면 상태를 저장하고 fresh Codex terminal/session으로 교체한다.
- `/clear`도 공식 지원이 확인되지 않았으므로 사용·추정하지 않는다. 매 배정은 프롬프트 이력 없는 새 Codex terminal/session으로 시작한다.
- 이전 `/compact` 실검증 기록은 기능 확인의 과거 증거일 뿐 현재 운영 허용이 아니다.
- 새 창은 이 플레이북 §4-A → 실행 시트 → HANDOFF 최상단 → 해당 Task 절 순으로 읽는다. 이전 대화 전체를 다시 주입하지 않는다.
- 무한 루프를 만들지 않는다. **바통을 이어 사실상 장기 실행**하되, rate limit·Orca runtime·사용자 결정·외부 승인·3회 반복 실패는 명시적 정지 조건이다.

### E. 실검증 기록

- **실검증 완료(2026-08-24)**: 샌드박스 밖 `orca status`에서 `ready`·`reachable=true` 확인. 빈 Luna 테스트 터미널을 `terminal read`·`wait --for tui-idle`로 확인한 뒤 원격 `/status`를 주입해 `Context window: 99% left (14.6K used / 258K)`를 읽었다. 이어 원격 `/compact`의 `Context compacted` 완료를 확인하고 `/status`를 다시 주입해 `100% left (4.73K used / 258K)`로 감소한 것을 읽었다. 따라서 **다른 Codex 창의 컨텍스트 확인·압축 제어 경로는 실제 작동한다.**
- **모델 라우팅 재검증(2026-08-24, Codex 0.149.1)**: 빈 terminal을 `codex --model gpt-5.6-terra -c model_reasoning_effort="high"`로 만들고 원격 `/status`에서 `gpt-5.6-terra (reasoning high)`를 확인했다. 새 빈 세션이라 context 줄은 생략됐고 `Weekly limit 87% left`만 표시됐다. 구현 프롬프트 없이 확인 후 terminal을 닫았다.
- 앞서 세 번 관측한 `stale_bootstrap`은 Orca 종료가 아니라 **샌드박스 안 검사의 거짓 음성**이었다. 같은 시각 Orca 로그에는 데몬과 세션 attach가 유지됐고, 같은 명령을 샌드박스 밖에서 실행하자 PID 4417·동일 runtime ID로 즉시 정상 응답했다.
- 회귀 검증 기준: 샌드박스 밖 `orca status` ready 유지 → 테스트/대상 terminal idle 확인 → `/status` 주입 → `terminal read`에서 context usage 확인. `/compact` 시험은 실제 작업 창이 아니라 버려도 되는 테스트 창에서만 한다.

## 4-B. ⭐ 5시간 사용량 창 + 무토큰 심박 감시 (사용자 하드 규칙, 2026-08-24)

> **정정**: 5시간은 terminal/session의 수명이 아니라 ChatGPT 플랜의 **공유 사용량 창**이다. 같은 로그인으로 새 창·새 coordinator를 열어도 우회되지 않는다. 모델 선택·추론 노력·작업 크기·도구 사용에 따라 소모량이 달라진다. 공식 기준: <https://learn.chatgpt.com/docs/pricing#what-are-the-usage-limits-for-my-plan>

예전 `~/.claude/skills/autonomous-loop/`의 검증된 원리인 **“파일이 기억, 창은 소모품”**, **ACTIVE 1명**, **HANDOFF 심박**, **40% 전 교대**를 유지한다. 옛 방식의 “대기 모델을 60분마다 깨우기”는 버린다. 생존 확인 때문에 모델에게 말을 걸면 사용량을 더 태우므로, 현재 Orca의 로컬 상태·이벤트 대기를 쓴다.

### A. Task/Wave마다 남기는 심박

ACTIVE는 Task 시작·GREEN 커밋·종료 때 `HANDOFF.md` 최상단의 한 줄만 갱신한다.

```text
운영 심박: 2026-08-24 17:20 PDT · epoch 3 · ACTIVE T4-coordinator · Task 4 GREEN · ctx 31% · head abc1234
```

- 심박은 “작업 결과”가 아니라 **지금 누가 지휘하고 마지막 안전 체크포인트가 어디인지**다. 결정 상세를 HANDOFF에 복사하지 않는다.
- 워커의 완료는 신호 하나만 믿지 않는다. `worker_done` + 지정 산출물/테스트 + terminal idle + git diff를 함께 확인한다.
- terminal handle은 재시작 때 바뀌므로 심박에 영구 정본으로 저장하지 않는다. title·taskId·dispatchId로 다시 찾는다.

### B. 모델을 깨우지 않는 생존 감시

워커 실행 중 코디네이터는 아래 이벤트 대기를 15분 단위로 건다. 이 명령의 대기 자체는 모델 프롬프트가 아니다.

```text
orca orchestration check --wait --types worker_done,escalation,decision_gate --timeout-ms 900000 --json
```

- 이벤트 도착 → 즉시 처리한다.
- timeout → 실패가 아니다. `orca status --json` → `terminal list/show/read`로 프로세스·terminal 상태를 읽고 HANDOFF 심박 시각만 확인한 뒤 다시 대기한다.
- ACTIVE가 60분 넘게 심박을 못 남겼고 terminal도 죽었거나 응답 불가일 때만 STANDBY가 §4-A 복구·ACK 절차로 이어받는다. 조용히 작업 중인 terminal은 빼앗지 않는다.
- keepalive용 `/status`, “살아 있니?” 프롬프트, 의미 없는 주기 메시지는 금지한다. `/status`는 Task 시작·종료·바통 직전에만 실행한다.

### C. 5시간 창 소진 대응

`/status`에서 context와 **표시되는 rate limit 잔여량·reset 시각**을 함께 읽는다. Codex 버전·계정에 따라 5시간 줄 없이 weekly만 나올 수 있으므로, 보이지 않는 값을 추정해 적지 않는다. 5시간 줄이 실제로 표시될 때 아래 표를 적용하고, 없으면 새 Wave를 한꺼번에 열지 않고 Task 하나씩 진행한다.

| 5시간 잔여량 | 동작 |
|---|---|
| `30% 초과` | 계획된 Task 진행 가능 |
| `15~30%` | 새 Wave·고위험 Task 시작 금지. 현재 Task를 가장 가까운 GREEN/커밋까지 닫고 HANDOFF 준비 |
| `15% 미만` 또는 limit 오류 | 새 모델 작업 중단. 실행 중 결과 회수 → focused 검증 가능한 범위만 정리 → 커밋·실행 시트·HANDOFF·Orca task state 저장 → reset까지 대기 |

- 새 ChatGPT 로그인 창은 같은 사용량 창을 공유하므로 대안이 아니다. **두 coordinator는 컨텍스트·창 죽음 대비책이지 쿼터 증폭 장치가 아니다.**
- reset 후 fresh Terra-high coordinator가 §복구 순서로 시작하고, 이전 ACTIVE는 STANDBY로 물러난다.
- CLI가 `/usage`로 일회성 usage reset을 제안하더라도 자동 사용 금지다. 남은 Task·주간 잔여량·다음 reset 시각을 보고 사용자에게 먼저 추천안을 설명해 승인받는다.
- 유료 API key는 사용량 기반 후불 대안이지만 자동 fallback하지 않는다. 사용자가 **①API 사용 승인 ②달러 상한 ③중단 기준**을 명시한 경우에만 별도 인증/profile로 전환한다. 비용 상한이 없으면 기다리는 것이 기본이다.
- 무한 실행이 아니라 **중단 가능한 장기 루프**다. rate limit reset, Orca 장애, 사용자 결정, 외부 승인, 같은 실패 3회는 반드시 멈추거나 대기하는 조건이다.

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

- 전역 기본값은 안전망일 뿐 Task 라우팅의 근거가 아니다. 실제 실행은 §2-A 명시 명령 + `/status` 검증이 정본이다.
- Codex 설정 키는 `model`, `model_reasoning_effort`, `model_context_window`, `model_auto_compact_token_limit`이다. context window를 임의로 “백만”으로 적는 것은 모델이 지원하지 않으면 늘려 주지 않는다. 공식 설정 정본: <https://learn.chatgpt.com/docs/config-file/config-reference#configtoml>
- 모델 역할의 공식 정본: <https://developers.openai.com/api/docs/guides/latest-model>. 이 프로젝트의 Task별 선택은 실행 시트 §5가 이긴다.

## 8. 함정 (계속 적용)

- routed terminal은 반드시 명시적 model/effort로 만든다. Orca 격리 runtime 기본 Luna-max와 사용자 기본 Sol-high가 다르므로 배너나 기억을 믿지 않는다.
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
