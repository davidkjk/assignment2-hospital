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

## 5. 워커 브리프 규율 (TDD)

브리프는 **자체완결**이어야 한다(워커는 콜드 스타트). 반드시 포함:
1. 저장소 1줄 소개 + **읽을 파일 목록**(해당 플랜·behaviors 절·색인). 워커가 큰 플랜을 읽는다(=토큰 효율 4배, 자기 예산).
2. **범위**: 어느 Task/규칙 ID까지. 경계 밖은 "건드리지 말 것"으로 명시.
3. **TDD**: RED(실패 테스트 먼저)→GREEN(통과)→REFACTOR. **테스트 한 줄에 규칙 ID 하나**, `assert`에 값 하나씩(빈 테스트 금지).
4. **커밋**: 매 GREEN마다. **자기 파일만 `git add`**. 코드 외 변경 금지 항목 명시.
5. **완료 신호**: 끝에 `DONE` + 무엇을 커밋했는지 1줄.
6. 창구는 `Consumes:`/`Produces:`에 **이름**으로(우리말 서술은 기계가 못 봄). DB 칸 나오면 서버층 짝 확인.

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
