# 홈페이지 웹 상담봇 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈페이지(`homepage/index.html`)의 가짜 채팅을 걷어내고, 기능이 완비된 `webchat` React 위젯을 공식 목업 98~103 디자인으로 리스킨해 iframe으로 붙인다.

**Architecture:** webchat은 로직을 그대로 두고 **스타일(className+CSS)만 추가**한다(기존 vitest가 회귀 게이트). 홈페이지는 런처 버튼 + 숨은 iframe 패널을 얹고 작은 postMessage로 열기/닫기·미읽음(●)만 주고받는다. 데이터는 webchat의 기존 same-origin 프록시로 Railway 백엔드에 닿으므로 CORS 작업이 없다.

**Tech Stack:** React 18 + Vite + TypeScript(webchat), 순수 HTML/CSS/JS(homepage), puppeteer-core(시각 대조), Vercel(배포).

**Spec:** `docs/superpowers/specs/2026-09-04-homepage-webchat-integration-design.md`

## Global Constraints

- **로직·DOM 역할 불변**: 리스킨은 className과 CSS만 추가한다. 요소 순서·역할·`aria-label`·조건 분기·상태 이름을 바꾸지 않는다. 기존 `webchat` vitest(약 110~111)와 빌드가 **매 태스크 끝에 초록**이어야 한다. Run: `npm --prefix webchat run test -- --run` · `npm --prefix webchat run build`.
- **디자인 원본 = 목업 98~103** (`docs/design/mockups/`). 색·간격·상태 시각을 여기에 맞춘다. 발명 금지, 눈대조로 확정.
- **딥틸 토큰(목업 98 :root 그대로)**: `--primary:#0b6e70` · `--primary-dark:#075658` · `--teal-soft:#e8f3f2` · `--teal-line:#b9d5d4` · `--ink:#10243a` · `--ink-muted:#5a6c7b` · `--surface:#ffffff` · `--canvas:#e8eef0` · `--panel:#f4f7f8` · `--line:#d6e0e4` · `--line-strong:#aabac2` · `--danger:#A02F3D` · `--danger-soft:#FFF0F1` · `--warn:#a95313` · `--warn-soft:#fff7ed` · `--info:#2c5f96` · `--info-soft:#eef5fc` · `--shadow-widget:0 24px 58px rgba(16,36,58,.23),0 5px 15px rgba(16,36,58,.12)`.
- **폰트**: `"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. (Pretendard는 CDN `@import` 또는 webfont link로 로드.)
- **환자 노출 이름은 `AI 상담봇`**(정본 §0). 화면 글자에 `챗봇` 금지.
- **커밋은 태스크마다**. 리터럴 경로만 나열해 커밋(공용 인덱스 오염 방지). 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` 와 `Claude-Session:` 줄.
- **시각 대조 도구**: `tools/shot/`에서 puppeteer-core로 렌더(system Chrome `/Applications/Google Chrome.app/...`). 목업 PNG는 `docs/design/mockups/98..103` 파일을 `file://`로 렌더해 비교.

---

### Task 1: 위젯 전역 스타일 + 셸·헤더·말풍선·입력바

webchat 위젯의 "방" 골격을 목업 98의 셸 디자인으로 입힌다. 이 태스크로 위젯을 열면 딥틸 헤더·흰 봇 말풍선·딥틸 사용자 말풍선·둥근 입력바가 보인다.

**Files:**
- Create: `webchat/src/widget/widget.css` — 위젯 전역 스타일시트(토큰·기본 타이포·셸·말풍선·입력바). 단일 파일에 모은다.
- Modify: `webchat/src/main.tsx` — `import './widget/widget.css'` 1줄 추가(전역 로드).
- Modify: `webchat/src/widget/WebchatWidget.tsx` — 최상위 래퍼에 `className="wc-widget"`, 헤더/바디/푸터 영역에 `wc-header`·`wc-body`·`wc-foot` 부여(요소 구조 불변).
- Modify: `webchat/src/widget/ChatRoom.tsx` — 말풍선/입력에 `wc-msg wc-msg--bot`·`wc-msg--user`·`wc-input`·`wc-send` 부여.
- Modify: `webchat/src/widget/WebchatApp.tsx` — 필요 시 최상위 컨테이너에 `wc-root` 부여.
- Test: 기존 `webchat/src/widget/*.test.tsx` 전부(추가·변경 없음, 회귀 확인용).

**Interfaces:**
- Consumes: 없음(첫 태스크).
- Produces: CSS 클래스 네임스페이스 `wc-*`와 토큰 `:root{--primary…}`. 이후 태스크가 같은 토큰·클래스 규약을 쓴다. `widget.css`가 전역 로드된다는 사실.

- [ ] **Step 1: 목업 98 셸을 눈으로 확정**

Run: `S=docs/design/mockups && open "$S/98-chatbot-web-widget-shell.html"` (또는 `tools/shot`로 렌더한 `mock-shell.png` 참조). "열린 위젯 앵커"의 헤더(딥틸 그라데이션·`AI 상담봇·익명 상담`·X)·봇 말풍선(흰 카드+옅은 테두리)·사용자 말풍선(딥틸·오른쪽)·입력바(둥근·딥틸 전송)를 기준으로 삼는다.

- [ ] **Step 2: 현재 DOM 확인**

Run: `sed -n '1,120p' webchat/src/widget/WebchatWidget.tsx webchat/src/widget/ChatRoom.tsx`
목적: 헤더·메시지 목록·말풍선·입력 폼의 실제 JSX 요소와 조건 분기를 파악해, **구조를 안 바꾸고** className만 붙일 지점을 정한다.

- [ ] **Step 3: `widget.css` 작성**

`webchat/src/widget/widget.css`에 토큰(Global Constraints의 딥틸 토큰 전체)과 기본 클래스를 작성한다. 최소 골격:

```css
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css");
:root{
  --primary:#0b6e70; --primary-dark:#075658; --teal-soft:#e8f3f2; --teal-line:#b9d5d4;
  --ink:#10243a; --ink-muted:#5a6c7b; --surface:#fff; --canvas:#e8eef0; --panel:#f4f7f8;
  --line:#d6e0e4; --line-strong:#aabac2; --danger:#A02F3D; --danger-soft:#FFF0F1;
  --warn:#a95313; --warn-soft:#fff7ed; --info:#2c5f96; --info-soft:#eef5fc;
  --shadow-widget:0 24px 58px rgba(16,36,58,.23),0 5px 15px rgba(16,36,58,.12);
}
.wc-root,.wc-widget{font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
.wc-widget{display:flex;flex-direction:column;height:100%;background:var(--panel);border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:var(--shadow-widget)}
.wc-header{background:linear-gradient(120deg,var(--primary-dark),var(--primary));color:#fff;padding:16px 18px;display:flex;align-items:center;justify-content:space-between}
.wc-body{flex:1;overflow-y:auto;padding:18px;background:var(--panel);display:flex;flex-direction:column;gap:12px}
.wc-msg{max-width:82%;padding:11px 14px;border-radius:16px;font-size:14.5px;line-height:1.6;white-space:pre-line}
.wc-msg--bot{align-self:flex-start;background:var(--surface);border:1px solid var(--line);border-bottom-left-radius:5px}
.wc-msg--user{align-self:flex-end;background:var(--primary);color:#fff;border-bottom-right-radius:5px}
.wc-foot{border-top:1px solid var(--line);padding:12px;background:#fff}
.wc-input{flex:1;border:0;background:transparent;font:inherit;outline:none}
.wc-send{width:44px;height:44px;border-radius:50%;background:var(--primary);color:#fff;border:0;display:grid;place-items:center;cursor:pointer}
```

값(패딩·라운드)은 목업 98과 눈대조로 미세 조정한다. 위는 출발점이며 목업이 이긴다.

- [ ] **Step 4: 클래스 부여**

`main.tsx`에 `import './widget/widget.css'`. `WebchatWidget.tsx`·`ChatRoom.tsx`·`WebchatApp.tsx`의 해당 요소에 위 클래스를 붙인다. **조건 분기·요소 순서·aria-label·텍스트는 건드리지 않는다.**

- [ ] **Step 5: 회귀 테스트 초록 확인**

Run: `npm --prefix webchat run test -- --run`
Expected: PASS(약 110~111, 변동 없음). 실패 시 DOM 구조를 바꾼 것 → 되돌린다.

Run: `npm --prefix webchat run build`
Expected: 빌드 초록(tsc가 test 파일까지 검사).

- [ ] **Step 6: 시각 대조**

Run: `VITE_PROXY_TARGET=https://gaonhospital-api-production.up.railway.app npm --prefix webchat run dev` (포트 표시됨). 브라우저로 열어 위젯을 띄우고 "와이파이 되나요?"를 보내 봇/사용자 말풍선·헤더·입력바가 목업 98과 같은지 눈대조. 필요 시 `tools/shot` puppeteer로 스샷 저장.
Expected: 딥틸 헤더·흰 봇 말풍선·딥틸 사용자 말풍선·둥근 입력바가 목업 98과 일치.

- [ ] **Step 7: 커밋**

```bash
git add webchat/src/widget/widget.css webchat/src/main.tsx webchat/src/widget/WebchatWidget.tsx webchat/src/widget/ChatRoom.tsx webchat/src/widget/WebchatApp.tsx
git commit -m "style(⑦ 웹위젯): 위젯 셸·말풍선·입력바 딥틸 리스킨(목업 98)"
```

---

### Task 2: 런처 3상태 + 홈페이지 iframe 배선 (첫 동작 통합)

런처(`WEBCHAT-LAUNCH` 3상태)를 목업 98로 입히고, 홈페이지에서 런처→iframe 열기·미읽음 ●까지 실제로 동작시킨다. 이 태스크가 끝나면 홈페이지에서 진짜 위젯이 뜬다.

**Files:**
- Modify: `webchat/src/widget/Launcher.tsx` — `wc-launcher`·`wc-launcher__dot`(미읽음 ●) 클래스. 목업 98 "런처 3상태"(닫힘 단일 진입점·열림 중복 없음·미읽음 작은 점) 반영.
- Modify: `webchat/src/widget/widget.css` — `.wc-launcher{…딥틸 원형 버튼…}` `.wc-launcher__dot{…}` 추가.
- Modify: `webchat/src/widget/WebchatApp.tsx` — 호스트로 postMessage 송신(open-state 변경·unread) + 호스트의 `host:setOpen` 수신 처리. 계약은 Interfaces 참조.
- Modify: `homepage/index.html` — (a) 가짜 채팅 스크립트 블록(`/* ---- chat ---- */` L1115~1187)과 `.chat`/`#chat` 패널 innards 제거, (b) 딥틸 런처 버튼 + 숨은 iframe 패널 추가, (c) 5개 `data-chat-open` 버튼과 런처가 iframe 열기를 호출, (d) postMessage로 열기/닫기·미읽음 ● 연결.
- Test: `webchat/src/widget/Launcher.test.tsx`(회귀), `webchat/src/widget/WebchatApp.test.tsx`(회귀).

**Interfaces:**
- Consumes: Task 1의 `widget.css`·`wc-*` 규약.
- Produces: **postMessage 계약**(양쪽 origin 검증 필수):
  - webchat→host: `{type:'webchat:ready'}` · `{type:'webchat:unread', value:boolean}` · `{type:'webchat:setOpen', value:boolean}`
  - host→webchat: `{type:'host:setOpen', value:boolean}`
  - iframe은 닫혀도 마운트 유지(숨김)해 직원 답변을 폴링하고 `webchat:unread`를 보낸다(`WEBCHAT-LAUNCH-05`).

- [ ] **Step 1: 목업 98 런처 3상태 확정**

`98-chatbot-web-widget-shell.html`의 "런처 3상태": 닫힘(딥틸 원형·`AI 상담봇` 라벨)·열림(런처와 위젯이 중복 진입점으로 안 보이게)·미읽음(숫자 배지 없이 작은 점 ● 하나). 이 셋을 기준으로 삼는다.

- [ ] **Step 2: Launcher 리스킨 + 회귀 확인**

`Launcher.tsx`에 `wc-launcher`·`wc-launcher__dot` 부여, `widget.css`에 스타일 추가.
Run: `npm --prefix webchat run test -- --run` → PASS 유지.

- [ ] **Step 3: webchat 측 postMessage 실패 테스트 작성**

`webchat/src/widget/WebchatApp.postmessage.test.tsx` 신설:

```tsx
import { render } from '@testing-library/react'
// 위젯이 열림 상태가 바뀌면 window.parent.postMessage로 webchat:setOpen을 보낸다.
test('열림 상태 변경 시 부모로 setOpen 통지', () => {
  const spy = vi.spyOn(window.parent, 'postMessage')
  // WebchatApp을 열림 상태로 렌더/토글 (기존 open 토글 경로 사용)
  // ...열기 트리거...
  expect(spy).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'webchat:setOpen', value: true }),
    expect.any(String),
  )
})
```

(실제 열기 트리거는 Step 2에서 확인한 컴포넌트 API에 맞춰 채운다.)

- [ ] **Step 4: 테스트 실패 확인**

Run: `npm --prefix webchat run test -- --run WebchatApp.postmessage`
Expected: FAIL(아직 postMessage 미구현).

- [ ] **Step 5: webchat 측 postMessage 구현**

`WebchatApp.tsx`에 열림 상태 effect로 `window.parent.postMessage({type:'webchat:setOpen',value:open}, TARGET_ORIGIN)` 송신, 미읽음 감지 시 `webchat:unread` 송신, 마운트 시 `webchat:ready` 송신. `message` 수신 리스너로 `host:setOpen`을 받아 열림 상태에 반영(origin 검증). `TARGET_ORIGIN`은 `env`로 주입(기본 `'*'`은 개발용, 배포는 홈페이지 origin).

- [ ] **Step 6: 테스트 초록 + 회귀 확인**

Run: `npm --prefix webchat run test -- --run` → PASS(신규 포함).
Run: `npm --prefix webchat run build` → 초록.

- [ ] **Step 7: 홈페이지 배선**

`homepage/index.html`:
- 가짜 채팅 스크립트(`var WELCOME`·`ANSWERS`·`SYMPTOMS`·`freeText`·`chatForm` 리스너 등, L1115~1187)와 `.chat-body` 내부 목업 마크업 제거.
- 우하단에 딥틸 런처 버튼(기존 `.fab-chat` 스타일 재사용) + `<iframe id="wcFrame" src="<webchat 배포 URL>" title="AI 상담봇">`를 감싼 `.chat` 컨테이너(닫힘 시 `display:none` 또는 오프스크린, 열림 시 표시).
- 5개 `data-chat-open` 버튼(L680·703·796·909·990)과 런처 클릭 → `openWidget()` 호출. `openWidget/closeWidget`은 iframe에 `host:setOpen` postMessage 전송 + 컨테이너 표시/숨김.
- `window.addEventListener('message', …)`로 iframe의 `webchat:unread`→런처 ● 토글, `webchat:setOpen(false)`→컨테이너 숨김, `webchat:ready`→활성화. **origin이 webchat 배포 origin인지 검증.**

- [ ] **Step 8: 로컬 통합 확인**

`homepage/index.html`의 iframe `src`를 로컬 dev(Step 6에서 뜬 포트)로 임시 지정하고, `homepage/`를 정적 서버로 띄워(예: `python3 -m http.server 5500 -d homepage`) 브라우저에서 런처→열림→"와이파이" 질문→봇 답변→닫기→미읽음 ● 흐름 확인.
Expected: 홈페이지 우하단 런처가 딥틸, 클릭 시 딥틸 위젯이 뜨고 실제로 답한다.

- [ ] **Step 9: 커밋**

```bash
git add webchat/src/widget/Launcher.tsx webchat/src/widget/widget.css webchat/src/widget/WebchatApp.tsx webchat/src/widget/WebchatApp.postmessage.test.tsx homepage/index.html
git commit -m "feat(⑦ 웹위젯): 런처 3상태 리스킨 + 홈페이지 iframe 배선(postMessage 열기/미읽음)"
```

---

### Task 3: 진료과 배너·인계 배지·긴급·장애 상태 리스킨

봇의 안내/인계/응급/장애 상태 UI를 목업 98·101에 맞춘다.

**Files:**
- Modify: `webchat/src/widget/GuideBanner.tsx` — `wc-guide`(딥틸 좌측선 info 배너, "진단이 아닌 안내" 문구). 목업 98 앵커의 진료과 배너.
- Modify: `webchat/src/widget/HandoffBadge.tsx` — `wc-handoff`(대기중/직원 확인중/답변완료 상태 배지). 목업 98.
- Modify: `webchat/src/widget/UrgentNotice.tsx` — `wc-urgent`(119/응급실 안내, 예약 CTA 미노출). 목업 98.
- Modify: `webchat/src/widget/OutageNotice.tsx` — `wc-outage`(장애 안내 + 전화·[문의 남기기] 주경로). 목업 101.
- Modify: `webchat/src/widget/widget.css` — 위 클래스들 추가(`--info`/`--warn`/`--danger` 소프트 배경 활용).
- Test: 각 컴포넌트의 기존 `*.test.tsx`(회귀).

**Interfaces:**
- Consumes: Task 1 토큰·클래스 규약.
- Produces: `wc-guide`·`wc-handoff`·`wc-urgent`·`wc-outage` 시각.

- [ ] **Step 1: 목업 확정** — `98`(배너·인계·긴급) + `101-chatbot-web-outage.html`(장애)을 렌더/열어 기준 색·레이아웃 확인.
- [ ] **Step 2: 클래스 부여 + CSS 추가** — 네 컴포넌트에 `wc-*` 부여, `widget.css`에 스타일 추가. 문구·조건 불변.
- [ ] **Step 3: 회귀 초록** — Run: `npm --prefix webchat run test -- --run` → PASS. `npm --prefix webchat run build` → 초록.
- [ ] **Step 4: 시각 대조** — dev 서버에서 진료과 추천 유도(예: "무릎이 아파요")로 배너, 응급 표현("가슴이 아파요")으로 긴급 안내를 띄워 목업과 눈대조. 장애·인계는 도달 어려우면 컴포넌트 단위 렌더로 확인.
- [ ] **Step 5: 커밋**

```bash
git add webchat/src/widget/GuideBanner.tsx webchat/src/widget/HandoffBadge.tsx webchat/src/widget/UrgentNotice.tsx webchat/src/widget/OutageNotice.tsx webchat/src/widget/widget.css
git commit -m "style(⑦ 웹위젯): 진료과배너·인계배지·긴급·장애 리스킨(목업 98·101)"
```

---

### Task 4: 카드 8종 리스킨

예약·취소·문진·빠른답변 카드를 목업 102(카드 재사용 보드)에 맞춘다.

**Files:**
- Modify: `webchat/src/widget/cards/WebCard.tsx` — 공통 카드 프레임 `wc-card`(흰 카드·테두리·상단 꼬리표). 목업 102의 카드 프레임.
- Modify: `webchat/src/widget/cards/BookingCards.tsx` — 시간선택·예약확인·예약완료 카드에 `wc-card__*`(버튼 그리드·확인 항목 목록·주 버튼 딥틸).
- Modify: `webchat/src/widget/cards/CancelCards.tsx` — 취소확인·취소결과·취소반려 카드.
- Modify: `webchat/src/widget/cards/QnrCard.tsx` — 문진 앱 안내 카드(문항 복제 없음, 앱 경로 안내).
- Modify: `webchat/src/widget/cards/QuickReplies.tsx` — 빠른답변 칩(`wc-chip`, 딥틸 외곽선 알약, 호버 채움). 홈페이지 목업 칩과 동일 톤.
- Modify: `webchat/src/widget/widget.css` — `.wc-card*`·`.wc-chip` 추가.
- Test: `cards/*.test.tsx`(회귀).

**Interfaces:**
- Consumes: Task 1 토큰·클래스. WebCard의 공통 프레임을 개별 카드가 감싼다.
- Produces: `wc-card`·`wc-card__row`·`wc-card__btn`·`wc-chip` 시각 규약.

- [ ] **Step 1: 목업 확정** — `102-chatbot-web-card-reuse.html` 렌더로 카드 프레임·버튼·확인 항목 레이아웃 확인.
- [ ] **Step 2: 공통 프레임(WebCard) 먼저** — `wc-card` 프레임 적용 후 개별 카드가 이를 쓰도록. 문구·필드·상태 불변.
- [ ] **Step 3: 개별 카드 리스킨** — BookingCards·CancelCards·QnrCard·QuickReplies에 클래스 부여, `widget.css`에 스타일.
- [ ] **Step 4: 회귀 초록** — Run: `npm --prefix webchat run test -- --run` → PASS. build 초록.
- [ ] **Step 5: 시각 대조** — dev에서 예약 흐름(로그인 후 시간선택→예약확인→완료)·빠른답변 칩을 띄워 목업 102와 눈대조. 도달 어려운 카드(취소반려 등)는 컴포넌트 렌더로 확인.
- [ ] **Step 6: 커밋**

```bash
git add webchat/src/widget/cards/WebCard.tsx webchat/src/widget/cards/BookingCards.tsx webchat/src/widget/cards/CancelCards.tsx webchat/src/widget/cards/QnrCard.tsx webchat/src/widget/cards/QuickReplies.tsx webchat/src/widget/widget.css
git commit -m "style(⑦ 웹위젯): 카드 8종 리스킨(목업 102)"
```

---

### Task 5: 인증 모달 + 익명 인계 폼 + 로그인 페이지 리스킨

로그인/가입 분기 모달, 익명 인계 폼, 팝업 로그인 화면을 목업 99·100에 맞춘다.

**Files:**
- Modify: `webchat/src/widget/AuthGateModal.tsx` — `wc-modal`(위젯 위 오버레이 + 로그인/가입 분기). 목업 99.
- Modify: `webchat/src/widget/HandoffForm.tsx` — `wc-form`(이름·연락처 최소 폼, 목적 안내, 유효성 오류). 목업 100.
- Modify: `webchat/src/auth/WebAuthPage.tsx` — 팝업 로그인 화면(`?authmode=login`) 딥틸 리스킨.
- Modify: `webchat/src/widget/widget.css` — `.wc-modal*`·`.wc-form*` 추가.
- Test: `AuthGateModal.test.tsx`·`HandoffForm.test.tsx`·`WebAuthPage` 관련(회귀).

**Interfaces:**
- Consumes: Task 1 토큰·클래스.
- Produces: `wc-modal`·`wc-form` 시각.

- [ ] **Step 1: 목업 확정** — `99-chatbot-web-auth-modal.html`·`100-chatbot-web-anonymous-handoff.html` 렌더로 모달·폼 레이아웃 확인.
- [ ] **Step 2: 클래스 부여 + CSS** — 세 파일에 `wc-*` 부여, `widget.css` 스타일. 폼 필드·문구·검증 로직 불변("상담(직원 확인)으로 연결됐습니다" 문구 유지).
- [ ] **Step 3: 회귀 초록** — Run: `npm --prefix webchat run test -- --run` → PASS. build 초록.
- [ ] **Step 4: 시각 대조** — dev에서 "내 예약 조회"로 인증 모달, 익명 상태 "직원에게 문의"로 인계 폼을 띄워 목업 99·100과 눈대조.
- [ ] **Step 5: 커밋**

```bash
git add webchat/src/widget/AuthGateModal.tsx webchat/src/widget/HandoffForm.tsx webchat/src/auth/WebAuthPage.tsx webchat/src/widget/widget.css
git commit -m "style(⑦ 웹위젯): 인증 모달·익명 인계 폼·로그인 화면 리스킨(목업 99·100)"
```

---

### Task 6: 배포 + 전체 시각 대조 + 홈페이지 iframe 실주소 고정

리스킨한 webchat을 배포하고, 홈페이지 iframe을 실배포 주소로 고정한 뒤, 전체 상태를 목업 98~103과 대조한다.

**Files:**
- Modify: `homepage/index.html` — iframe `src`를 webchat 실배포 URL(`https://gaonhospital-webchat.vercel.app`)로 고정, postMessage origin 검증을 그 origin으로 고정.
- Modify: `webchat/src/lib/env.ts`(필요 시) — `TARGET_ORIGIN`을 홈페이지 배포 origin으로 설정.
- (배포는 파일 변경 아님 — 명령으로 수행.)

**Interfaces:**
- Consumes: Task 1~5 전체.
- Produces: 배포된 통합(홈페이지 URL에서 실제 위젯 동작).

- [ ] **Step 1: webchat 재배포** — `cd webchat && npx vercel --prod --yes`(계정=iansoft, 프로젝트 `gaonhospital-webchat`). 배포 URL 확인.
- [ ] **Step 2: 배포 위젯 단독 확인** — 배포 URL을 열어 리스킨이 실렸는지(딥틸 셸) 확인. `tools/shot`로 스샷.
- [ ] **Step 3: 홈페이지 iframe 실주소 고정 + origin 검증** — `homepage/index.html`의 iframe `src`·message origin 검증을 실배포 origin으로. 커밋.
- [ ] **Step 4: 홈페이지 배포** — `homepage/`를 static으로 Vercel 배포(`cd homepage && npx vercel --prod --yes` 또는 사용자 지시 계정). URL 확인.
- [ ] **Step 5: 전체 시각 대조** — 배포된 홈페이지에서 런처→열림→질문(RAG 답변)→진료과 배너→예약(로그인·카드)→익명 인계→미읽음 ● 흐름을 밟으며 목업 98~103과 눈대조. `tools/shot`로 상태별 스샷 저장.
- [ ] **Step 6: 회귀·빌드 최종 확인 + 커밋**

```bash
npm --prefix webchat run test -- --run && npm --prefix webchat run build
git add homepage/index.html webchat/src/lib/env.ts
git commit -m "chore(⑦ 웹위젯): 홈페이지 iframe 실주소 고정·배포 통합"
```

---

## Self-Review 결과

- **Spec 커버리지**: 리스킨(webchat 전 컴포넌트)=Task 1·3·4·5, 홈페이지 iframe 배선+postMessage=Task 2, 배포·시각 대조=Task 6. 스펙의 "구현 순서 ①~⑥"과 태스크 1:1 대응. CORS 불필요(설계대로 홈페이지가 백엔드 직접 호출 없음)—별도 태스크 불요.
- **범위 밖 준수**: 백엔드·마이그레이션 변경 없음, 웹 문진 화면 신설 없음, 홈페이지 콘텐츠 재디자인 없음 — 어느 태스크도 이를 건드리지 않음.
- **회귀 게이트**: 모든 태스크가 `npm --prefix webchat run test -- --run` 초록 + build 초록으로 로직 불변을 강제(Global Constraints).
- **미결(스펙에 남은 `확인 필요`)**: 다른 기기 이어보기 본인확인 화면은 정본에서 미결이라 이 계획도 만들지 않음(범위 밖 명시).
- **주의**: 시각 리스킨은 순수 TDD가 아니라 "회귀 테스트 초록 + 목업 눈대조"가 게이트다. 각 태스크 Step에 눈대조를 명시했다.
