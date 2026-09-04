# 홈페이지 웹 상담봇 통합 설계 (2026-09-04)

> 병원 데모 홈페이지(`homepage/index.html`)에 **실제 웹 상담봇(webchat)**을 붙인다. 홈페이지에 내장된 가짜(하드코딩) 채팅을 걷어내고, 기능이 완비된 `webchat` React 앱을 **공식 목업(98~103) 디자인으로 리스킨**해 **iframe**으로 얹는다.

## 배경·현재 상태

- **webchat**(`webchat/`, React/Vite, Task 14·15): 웹 위젯 80규칙 + 내비 7을 **기능적으로 전부 구현**. 단 **스타일이 0**(className·CSS 없음) → 배포본이 "민짜". 이미 Vercel 배포(`gaonhospital-webchat.vercel.app`)되어 `/chat/*`을 same-origin 프록시로 Railway 백엔드에 넘긴다.
- **백엔드**(Railway `gaonhospital-api`): 2026-09-04 LLM 키(ANTHROPIC·OPENAI) 설정 후 정상. RAG 하이브리드 검색·bulk KB·임베딩이 원격 DB에 반영됨 → 봇이 실제로 답한다("와이파이" 등 실측 확인).
- **homepage**(`homepage/index.html`, static, 인라인 CSS/JS, 딥틸 브랜드): 우하단 떠있는 채팅 UI가 **디자인은 완성**돼 있으나 **하드코딩된 가짜 봇**이다. 하단에 `"실제 상담봇(웹 위젯)이 이 자리에 연결됩니다"`라고 설계 의도가 명시돼 있다(아직 미배포·미커밋).
- **공식 위젯 시각 목업**: `docs/design/mockups/98-chatbot-web-widget-shell.html`(셸·런처 3상태·셸 9상태), `99`(인증 모달), `100`(익명 인계), `101`(장애), `102`(카드 재사용), `103`(흐름 지도). 딥틸 `#0B6E70` + Pretendard.

## 정본 근거 (읽고 확인함)

- `docs/design/chatbot-source-of-truth.md` §0·§2 — 환자 노출 이름 `AI 상담봇`, 카드가 재현할 규칙, 제한자료·긴급 원칙.
- `docs/design/behaviors/chatbot-web.md` — 웹 위젯 80규칙(`WEBCHAT-LAUNCH/ROOM`, `WEBMOD-AUTH`, `WEBANON-HANDOFF`, `WEBCHAT-OUTAGE`, `WEBCARD-*`, `WEBCHAT-GUIDE/HANDOFF/URGENT`) + `NAV-WEBCHAT` 7. **L11: "딥틸 #0B6E70 + Pretendard 재사용, 테두리·그림자로 홈페이지와 분리된 자기완결 위젯", L9: 픽셀·여백은 목업 단계."**
- 즉 **디자인 원본은 목업 98~103**이며, 기능은 webchat이 이미 구현했다. 홈페이지 내장 채팅창은 참고만.

## 결정 (사용자 확정 2026-09-04)

1. **기능 범위 = 전체(B)** — 웹 위젯 80규칙 전 기능(카드 8종·인증 모달·익명 인계 포함). webchat에 이미 구현돼 있음.
2. **디자인 원본 = 목업 98~103** — 홈페이지 내장 채팅창(가짜)이 아니라 공식 위젯 목업을 시각 정본으로 삼는다.
3. **붙이는 방식 = iframe** — 상용 위젯(Intercom·채널톡·Zendesk) 표준. CSS·보안 격리, 기존 배포·프록시 재사용.

## 아키텍처

```
[homepage/index.html] (static, 딥틸)
  ├─ 우하단 런처 버튼 (딥틸, ● 미읽음)      ← 홈페이지가 소유·표시
  └─ 떠있는 패널 = <iframe src="webchat 배포 URL">
                         └─ [webchat React] (목업 98~103로 리스킨)
                                  └─ /chat/* same-origin 프록시 → Railway 백엔드 (기존)
```

- **iframe 패턴**: 홈페이지는 런처 + iframe 컨테이너만 소유. 위젯 UI 일체(헤더·말풍선·카드·모달·폼)는 iframe 안 webchat이 렌더 → 스펙의 "자기완결 위젯"(`WEBCHAT-ROOM-01`)과 일치.
- **postMessage 채널(작음)**: iframe(webchat) ↔ 호스트(홈페이지) 사이 최소 신호만.
  - webchat → 호스트: `unread`(● 표시/해제), `resize`/`open-state`(패널 크기 조정용, 필요 시).
  - 호스트 → webchat: `open`/`close`(런처 클릭 결과 전달).
  - 위젯이 닫혀 있어도 미읽음 감지를 위해 iframe은 **마운트 유지(숨김)**하고 직원 답변을 폴링한다(`WEBCHAT-LAUNCH-05`).
- **데이터 흐름**: 변경 없음. webchat이 자기 origin의 `/chat/*` 프록시로 백엔드에 닿는다. **홈페이지는 백엔드를 직접 호출하지 않으므로 CORS 설정 불필요.**

## 컴포넌트·작업 단위

### 1. webchat 리스킨 (주 작업 — 로직 불변)
목업 98~103의 딥틸 디자인을 컴포넌트에 이식한다. **DOM 역할·상태·로직은 바꾸지 않는다**(기존 vitest 유지가 안전장치). 스타일 추가 방법: 컴포넌트에 `className` 부여 + 위젯 전용 스타일시트(딥틸 토큰·Pretendard) 신설. 대상:
- 런처(`Launcher`) — 닫힘/열림/미읽음 ● 3상태 (`WEBCHAT-LAUNCH`, 목업 98).
- 위젯 셸(`WebchatApp`/`ChatRoom`) — 헤더(`AI 상담봇·익명 상담`)·말풍선(봇 흰/사용자 딥틸)·입력바·9상태(첫 상담·복원·로딩·오류·전송중·전송실패·다른기기·인증복귀 등, 목업 98).
- 진료과 배너(`GuideBanner`)·인계 배지(`HandoffBadge`)·긴급(`UrgentNotice`)·장애(`OutageNotice`, 목업 101).
- 카드 8종(`cards/*`) — 시간선택·예약확인·예약완료·취소확인/결과/반려·문진안내·빠른답변 (목업 102).
- 인증 모달(`AuthGateModal`, 목업 99)·익명 인계 폼(`HandoffForm`, 목업 100).

### 2. 홈페이지 배선 (부 작업)
`homepage/index.html`에서:
- 가짜 채팅 JS(`ANSWERS`/`SYMPTOMS`/`freeText` 등)와 목업 패널 innards 제거.
- 딥틸 런처 버튼(● 미읽음) + 숨겨진 iframe 패널 컨테이너 추가. 기존 `#fabChat`/`.fab-chat` 스타일 재사용 가능.
- 5개 CTA 버튼(`data-chat-open`: 헤더·히어로·중간·"지금 상담"·푸터)이 런처와 같은 열기 동작을 호출하도록 유지.
- 열기/닫기·미읽음 postMessage 연결.

### 3. postMessage 프로토콜 (계약)
- `{type:'webchat:ready'}` — webchat 로드 완료.
- `{type:'webchat:unread', value:boolean}` — 미읽음 점 표시/해제.
- `{type:'host:setOpen', value:boolean}` — 호스트가 열기/닫기 지시.
- `{type:'webchat:setOpen', value:boolean}` — webchat 내부에서 상태 변경(닫기 버튼 등) 시 호스트에 통지.
- origin 검증: 양쪽 모두 상대 origin을 확인해 임의 메시지를 거른다.

## 배포

- **webchat**: 리스킨 후 기존 Vercel 프로젝트 재배포(`gaonhospital-webchat`). iframe 대상 URL.
- **homepage**: static으로 Vercel 신규 배포. iframe `src` = webchat 배포 URL.
- **iframe 허용**: webchat 응답에 `X-Frame-Options`/`frame-ancestors` 제한이 없어야 한다(현재 `vercel.json`은 rewrites만 → 기본 허용). 필요 시 `frame-ancestors`에 홈페이지 origin만 명시(강화).

## 오류 처리

- 위젯 내부 오류(전송 실패·조회 오류·인증 실패·인계 실패·장애)는 **webchat이 이미 규칙대로 처리**(`WEBCHAT-ROOM-07/09`, `WEBMOD-AUTH-05`, `WEBANON-HANDOFF-07`, `WEBCHAT-OUTAGE-*`). 리스킨은 이 상태들의 **시각만** 목업에 맞춘다.
- iframe 로드 실패(webchat 배포 다운 등): 홈페이지 런처는 남되 패널이 안 뜨는 상황 → 호스트가 `webchat:ready` 미수신 시 간단한 한글 안내를 패널에 표시(과설계 금지, 최소).

## 검증

- **webchat 자동 테스트**: 리스킨은 로직·DOM 역할 불변 → 기존 `vitest`(≈110~111)·빌드 초록 유지가 회귀 게이트.
- **시각 대조**: 리스킨한 각 상태를 헤드리스로 렌더해 **목업 98~103과 눈대조**(`tools/shot` puppeteer-core). 딥틸·말풍선·카드·모달 일치 확인.
- **홈페이지 통합**: 배포 후 실제 브라우저에서 런처→열기→질문→답변(RAG)→직원 연결(익명 인계)·미읽음 ● 클릭 흐름 확인.

## 범위 밖 (이번 아님)

- 백엔드 로직·규칙 변경(이미 완결). 마이그레이션 신규 없음.
- 웹 위젯에 문진 화면 신설(`WEBCARD-QNR`: 웹은 앱 경로 안내만).
- 홈페이지 콘텐츠(히어로·섹션) 재디자인. 이번은 상담봇 자리만.
- 다른 기기 이어보기 본인확인 화면(`확인 필요`로 정본에 남아 있음).

## 구현 순서 (계획 단계에서 태스크로 전개)

"천천히" 진행 — 큰 리스킨을 순서로 나눈다(대략): ① 위젯 전역 스타일 토큰·셸·헤더·말풍선·입력바 → ② 런처 3상태 + 홈페이지 배선 + postMessage(첫 동작하는 통합) → ③ 진료과 배너·인계 배지·긴급·장애 → ④ 카드 8종 → ⑤ 인증 모달·익명 인계 폼 → ⑥ 배포·시각 대조. 세부 태스크·의존은 writing-plans로 확정.
