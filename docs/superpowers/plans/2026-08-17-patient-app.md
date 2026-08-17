# 3단계: 환자용 앱(Flutter) 구현 플랜 — **재작성본**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 각 태스크는 TDD(실패 테스트 → 구현 → 통과)로 진행한다.
>
> ⚠️ **이 파일은 `plans/2026-07-27-patient-app.md`(7,595줄)를 대체한다.** 옛 파일은 삭제하지 않고 **재작성의 입력**으로 남긴다(태스크 구조·`R*` 정합성 표시의 원본). 충돌하면 **이 파일이 정본**이다.
>
> 📌 **작성 상태**: 이 파일은 현재 **스켈레톤**(헤더 + Global Constraints + File Structure)이다. 태스크 본문(`test('[규칙ID] …')` 문장)은 아직 비어 있고, 세션마다 한 태스크씩 채운다.

**Goal:** 환자가 쓰는 Flutter 앱을 **화면 묶음 0~8** 범위로 구현하고, 그에 필요한 백엔드(서비스·라우터·마이그레이션)를 1단계 FastAPI 위에 추가한다. **화면 규칙 1,224개를 태스크의 실패 테스트 문장으로 옮기는 것**이 이 재작성의 목적이다.

**Architecture:** 백엔드는 1단계의 `acquire_as`/`AppError` 패턴을 그대로 재사용해 환자용 서비스·라우터를 추가한다(직원용 `require_role` 대신 `get_current_patient`/`PatientContext`). 프론트엔드는 Flutter + Riverpod로, Supabase Auth(전화 OTP)로 로그인하고 `ApiClient`로 REST를 호출하며, 홈·나의 예약은 Supabase Realtime을 구독한다. **모든 화면은 Task 0이 만든 시각 토큰(테마)만 소비한다.** 다가오는 예약은 로컬 캐시로 오프라인 읽기 전용을 지원한다.

**Tech Stack:** Flutter(Dart), Riverpod, `supabase_flutter`, `firebase_messaging`(FCM), `flutter_test` + `mocktail`. 백엔드는 1단계와 동일(FastAPI, asyncpg, Supabase Postgres).

**Spec:** `docs/superpowers/specs/2026-07-27-patient-app-design.md`(재작성 순서 2에서 폐기 문장 교체) · 공용 데이터 모델은 `specs/2026-07-27-foundation-auth-data-model-design.md` 섹션 4.

**규칙·결정 원본:**
- 화면 규칙 = `docs/design/screen-behaviors.md` **환자 앱 영역**(`# 환자 앱` ~ `## 상담봇 (chatbot)`, 규칙 1,224개)
- 결정 근거 = `docs/superpowers/specs/2026-07-31-ui-design-decisions.md`
- 요구사항 = `docs/고객요구사항.txt` — 환자 앱 `:233~333`, 상담봇 연계 `:337~430`
- ⭐ **진입점 = `docs/design/spec-index/SPECINDEX-patient-app.md`** — 어느 규칙·결정을 어디에 넣을지의 지도. **단, 색인의 「조치」 칸은 목차이지 내용이 아니다. 태스크를 쓰기 전에 색인이 가리키는 원문 줄을 반드시 펼친다.**

---

## Global Constraints

이 절의 규칙은 **모든 태스크에 암묵적으로 포함**된다.

### ⚠️ 옛 플랜에서 **삭제·교체된** 제약 (재작성의 핵심)

색인 「5. 폐기·교체 결정」이 원본이다.

| 옛 플랜(폐기) | 재작성 |
|---|---|
| 마이그레이션 번호 대역 `00200~00204` | **`00010`부터 순차.** 실제 적용 최신은 `00009`이고 공용 `00010~00016`은 ④에서 적용 완료다 → 환자 앱 신설은 **`00017`부터**(직원웹과 같은 대역을 공유하므로 실제 다음 번호는 구현 시점에 확인). `00204_notification_log.sql`을 새로 만들지 않는다 |
| `cancellation_requested_at` 단일 필드 | `support_requested_at` + `request_type(취소/변경)` 공통 계약. `/cancellation-requests` 부활 금지. 희망 일시는 저장하지 않음 |
| `HOURS-EXC-*`·`hospital_hour_exceptions` | `hospital_closures`와 schedule 단일 계산으로 폐기·교체 |
| 알림 토큰 **삭제** 중심 처리 | 토큰은 **보존**하고 발송 직전에 서버가 선호도 판정. 끈 알림은 푸시·문자·알림함 **모두에서 생성하지 않음** |
| 스펙 `:53` "예약 변경 확인창 생략" | 변경 전→후 **확인창**으로 교체(`APPT-CHG-*`) |
| 스펙 `:62` "도착 이후 읽기 전용" | **진료 시작 이후** 읽기 전용으로 교체. 도착·대기 중 수정 허용(`QNR-LIVE-*`) |
| 스펙 `:36` 탈퇴 "확인 팝업" 단독 | 설정 하위 **전용 화면** · 예약 있으면 차단 · 보관 고지(`SET-QUIT-*`) |
| 플랜 `:577` `auto_confirm_app_bookings default false` | 기본 **`true`**(AD-051). 직원 확인 방식은 명시적으로 선택한 병원만 |
| 아이디(ID) 로그인 도입안 | 도입 안 함. 전화번호 변경은 병원 본인확인·직원 수정 절차 |
| MR2-01 익명 웹 다른 기기 복원 | 만들지 않음(코4 담당) |

### 유지되는 제약

- **[정합성 검토 추적]** 옛 플랜의 `R*` 표시(`R2-01`·`R5-01·02·03·04·05`)는 **해당 태스크에 그대로 옮긴다.** `docs/supabase-postgres-review-2026-07-28.md`의 관련 항목은 해당 기능을 만들 때 함께 반영한다.
- 백엔드 신규 코드는 1단계의 `backend/app/db/pool.py`(`acquire_as`), `core/errors.py`(`AppError`)를 **재사용한다 — 새로 만들지 않는다.** 환자 인증 컨텍스트(`get_current_patient`)만 신설한다(Task 2).
- 프론트엔드는 `patient_app/`(Flutter), 백엔드는 `backend/`.
- 모든 API·화면 오류 메시지는 **한글**로 노출한다. Python 예외 원문(`str(exc)`)을 환자 화면에 노출하지 않는다(갭 #14).
- 홈·나의 예약은 Supabase Realtime으로 동기화한다.
- ⛔ **`supabase db reset` 금지** — 로컬 DB는 다른 세션과 공용이다. 새 마이그레이션은 **`supabase migration up`**으로만 적용한다.

### 신설 제약 (규칙에서 올라온 것)

- **토큰 밖의 색·글자 크기를 화면 코드에 쓰지 않는다.** 색·크기는 Task 0이 만든 테마 토큰만. `DISP-COLOR-01` **색만으로 상태를 구분하지 않는다 — 항상 텍스트를 병기한다.**
- ⭐ **막다른 길을 만들지 않는다.** 막을 때는 해결 경로를 같은 자리에 준다(`BLOCK-*`).
- ⭐ **조회 실패만 `[다시 시도]`.** 저장·변경 실패는 `Busy` 상태 해제 후 원인 옆 한글 오류(`ERR-*`·`BTN-STATE-*`).
- **오프라인은 캐시 읽기 전용.** 온라인 401에서만 로그아웃(오프라인/세션만료 분리, `OFF-*`·`AUTH-SESS-*`).
- **환자 노출 문구**: "취소/변경 요청이 접수·등록됐다" 표현 금지 → **"상담(직원 확인)으로 연결됐다"만**(`CANCEL-LATE-*`).
- **개인정보 열거 방지.** 계정 유무를 화면으로 구분시키지 않는다(OTP·비번찾기·가족 연결).
- **잠금화면 알림 민감정보 경계**(`PUSH-BODY-*`) — 끈 알림은 잠금화면·알림함에 남기지 않음.

### 🚧 [작성용 발판 — 다 쓰면 삭제] 앞 단계에서 이월된 인지사항

> ## ⚠️ 이 절은 **구현 지시가 아니다. 플랜을 쓰는 사람에게 주는 작업 목록**이다.
>
> **구현자는 이 절을 읽을 필요가 없다.** 각 행이 지정된 태스크의 `test()` 문장으로 **풀려 들어가면 그 행을 지운다.** 표가 비면 이 절 전체를 삭제한다.
>
> **진행 표시**: 반영 완료 `~~취소선~~` → 절 전체 삭제. 현재 **0/N 반영**(스켈레톤 단계).

**직원웹 플랜(⑤)이 이 플랜으로 넘긴 이월분** (staff-web 「이 플랜이 받지 않는 이월분」):

| 이월된 것 | 근거 | 받는 태스크 |
|---|---|---|
| `notification_preferences` 환자 정책 (종류별 on/off·SMS 여부, 발송 직전 서버 판정) | `patient-app-design.md:116`, 색인 구조결정 「알림 선호도」 | **Task 1**(칸) · **Task 9**(판정) · **Task 28**(화면) |
| `consent` (가입 필수 3 + 광고 선택, transactional/marketing 구분) | `patient-app-design.md:151`, 갭 #108 | **Task 1**(칸) · **Task 13**(화면) |
| **#122 Twilio 상태 되알림** 공개 엔드포인트 + **서명 검증 필수** | `deployment-design.md` 「만드는 것들 7」 | **Task 9**(발송 함수) + 배포 플랜 |
| **#120 `channel`에 실제 보낸 채널 기록** (상수 `'push'` 박기 금지) | `foundation-…-design.md:195·198` | **Task 9** |

**이 플랜이 소비만 하고 소유하지 않는 계약** — 상담봇 플랜(코4)·직원웹 플랜(코2/코3)이 소유:

| 소비 계약 | 앱 접점 | 소유 |
|---|---|---|
| 3-A 공용 상담 스키마(`chat_threads`·`chat_messages`·`notification_log`) | 앱 상담방·카드·직원 인계·알림이 같은 스키마 소비 | 코4 |
| MR2-02~04 (상담방 이전상담·인증복귀 재확인 카드·예약3단계 카드) | 앱 상담 화면·예약 3단계 UI | 코4 |
| 역대조-1·6 (긴급 분류 실패 안내·연결 중 버튼 잠금) | 앱 late-flow | 코4 |
| 직원 발송 설정표(종류별 body·also_sms) | 앱 알림설정이 같은 표 참조 | 코2/코3 + 앱 계약 |

---

## 화면 묶음 정본 — 9개 (색인 「3. 화면 설계 결정」)

`screen-behaviors.md` 환자 앱 영역이 규칙 진본이다. **규칙 1,224개 전부**가 아래 9묶음으로 빠짐없이 분류된다(0개 미분류 확인).

| 묶음 | 규칙 접두어 | 규칙 수 | 담당 태스크 |
|---|---|---:|---|
| **0 전역** | `OFF-*`·`ERR-*`·`BTN-*`·`EMPTY-*`·`BLOCK-*`·`PUSH-*`·`DISP-*`·`NAV-GLOBAL-*` | 113 | Task 0(DISP)·11·12 |
| **1 앱 시작** | `CONSENT-*`·`AUTH-*`·`NAV-AUTH-*` | 147 | Task 13·14 |
| **2 홈·카드·QR·알림함** | `HOME-*`·`CARD-*`·`QR-*`·`NOTI-*`·`NAV-HOME-*` | 182 | Task 16·17·18 |
| **3 예약 8단계** | `BOOK-*`·`NAV-BOOK-*` | 137 | Task 19·20 |
| **4 상세·변경·취소** | `APPT-*`·`CANCEL-*`·`NAV-APPT-*` | 135 | Task 21·22 |
| **5 사전문진** | `QNR-*`·`NAV-QNR-*` | 113 | Task 23·24 |
| **6 가족** | `FAM-*`·`NAV-FAM-*` | 107 | Task 25·26 |
| **7 이력·설정·탈퇴** | `HIST-*`·`SET-*`·`NAV-HIST-*`·`NAV-SET-*` | 197 | Task 27·28·29 |
| **8 나의 예약** | `LIST-*`·`NAV-LIST-*` | 93 | Task 30·31 |

> **70개 넘는 묶음은 화면/기능 단위로 쪼갠다**(핸드오프 규율 — 직원웹 `/messages` 세로분할이 잘 들었다). 위 9묶음이 전부 90~197개라 **모두 분할** 대상이다. 아래 File Structure가 그 분할이다.

---

## File Structure

**번호 정책**: 옛 플랜 Task 1~26을 그대로 잇지 않는다(옛 구조는 백엔드 13 + Flutter 13). 재작성은 **백엔드 계약(0~10) → 프론트 전역(11~12) → 화면(13~31)** 순으로 재편한다. 규칙을 담는 것은 **프론트 화면 태스크**이고, 백엔드 태스크는 그 화면이 소비할 서비스·마이그레이션을 만든다(규칙 0개, 계약만).

### 백엔드·기반 (규칙 없음 — 계약·마이그레이션·서비스)

| 태스크 | 무엇 | 규칙 접두어 | 상태 |
|---|---|---|---|
| **0** | Flutter 스캐폴딩 + **시각 토큰(테마)** + `ApiClient` + 인증상태(Riverpod) | `DISP-*` | 🆕 신설 |
| **1** | 마이그레이션 `00017+` — **환자 신원·RLS 기반**: `patients.auth_user_id`·`patient_owns()`(R5-02)·환자용 RLS(예약/문진/기록)·`log_appointment_status_change` 환자 인식·가족 `phone` nullable(#3)·`patient_medical_notes` 뷰 | — | 재작성 [R5-02] |
| **2** | 환자 인증 의존성(`PatientContext`·`get_current_patient`) + 프로필 등록/조회/탈퇴 서비스 | — | 재작성 [R5-05] |
| **3** | 가족 CRUD 서비스 — OTP 연결·계정열거 방지·soft delete 재연결·활성 링크·10명 상한 | — | 재작성 [R5-02] |
| **4** | 예약 카탈로그(진료과/의사/슬롯) + **예약 시간 단일 판정 서버 함수**(마감·당일30분·8주·대기분) | — | 재작성 [R5-03] |
| **5** | 예약 생성/변경 서비스 — **요청 UUID 멱등성** · `updated_at` 낙관적 잠금 409 · 변경 시 문진 계보 유지 | — | 재작성 |
| **6** | 예약 취소 서비스 + **마감 후 공통 지원요청**(`support_requested_at`+`request_type`) | — | 재작성 [R2-01] |
| **7** | 사전문진 서비스 — 문항 부분저장·진행률 서버계산·완료시각·문항 스냅샷 | — | 재작성 |
| **8** | 방문 이력 조회 서비스 — 취소·부도·미확정 포함 상태모델·문진 요약·20건 커서·안정정렬 | — | 재작성 |
| **9** | 알림 dispatcher — 선호도·병원 문자정책·채널·안내/광고·야간·죽은토큰·발송로그·재시도·**Twilio 콜백 서명검증**(#122·#120) | — | 재작성 [R5-04] |
| **10** | 환자용 라우터 연결 + 통합 테스트 | — | 재작성 |

### 프론트 전역 위젯 (묶음 0 = 113)

| 태스크 | 무엇 | 규칙 접두어 | 상태 |
|---|---|---|---|
| **11** | 오프라인 캐시·세션만료 분리·잠금알림 경계 (41개) | `OFF-*`·`PUSH-*`·`NAV-GLOBAL-*` | 🆕 신설 |
| **12** | 오류 표시·빈 상태·차단·버튼 상태(Busy/쿨다운) (58개) | `ERR-*`·`EMPTY-*`·`BLOCK-*`·`BTN-*` | 🆕 신설 |

### 화면 (규칙을 담는 태스크)

| 태스크 | 무엇 | 규칙 접두어 | 상태 |
|---|---|---|---|
| **13** | 가입 — 동의→전화→OTP→기본정보→비밀번호 (83개) | `CONSENT-*`·`AUTH-LAND-*`·`AUTH-TEL-*`·`AUTH-PHONE-*`·`AUTH-OTP-*`·`AUTH-SIGNUP-*`·`AUTH-PROFILE-*`·`AUTH-PWNEW-*` | 재작성 |
| **14** | 로그인·비밀번호 찾기·중복/번호재활용·재인증·세션 + 인증 내비 (64개) | `AUTH-LOGIN-*`·`AUTH-PWFIND-*`·`AUTH-DUP-*`·`AUTH-REAUTH-*`·`AUTH-SESS-*`·`NAV-AUTH-*` | 재작성 |
| **16** | 홈 프레임 + 예약 카드 상태 A(대기·미확정·변경·요청) (83개) | `HOME-*`·`NAV-HOME-*`·`CARD-COMMON-*`·`CARD-WAIT-*`·`CARD-UNCONF-*`·`CARD-REQ-*`·`CARD-CHG-*` | 재작성 |
| **17** | 예약 카드 상태 B(지연·취소·완료·오프라인·문진·입장) + QR (70개) | `CARD-LATE-*`·`CARD-CXL-*`·`CARD-DONE-*`·`CARD-OFF-*`·`CARD-QNR-*`·`CARD-IN-*`·`CARD-OK-*`·`CARD-DOC-*`·`CARD-LIFE-*`·`QR-*` | 재작성 |
| **18** | 알림함 — 목록·읽음·비었음 (29개) | `NOTI-*` | 재작성 |
| **19** | 예약 1~4단계(본인/가족·과·의사·날짜) + 값 보존 (71개) | `NAV-BOOK-*`·`BOOK-WHO-*`·`BOOK-DEPT-*`·`BOOK-DOC-*`·`BOOK-DATE-*`·`BOOK-NAV-*`·`BOOK-KEEP-*` | 재작성 [R5-01] |
| **20** | 예약 5~8단계(시간·이유·확인·신청/확정) + 슬롯충돌·멱등 (66개) | `BOOK-TIME-*`·`BOOK-TODAY-*`·`BOOK-WHY-*`·`BOOK-CONF-*`·`BOOK-DONE-*`·`BOOK-HOLD-*`·`BOOK-RACE-*`·`BOOK-BOT-*` | 재작성 |
| **21** | 예약 상세 — 헤더·정보·QR·문진·버튼 (62개) | `APPT-HEAD-*`·`APPT-INFO-*`·`APPT-QR-*`·`APPT-QNR-*`·`APPT-BTN-*`·`NAV-APPT-*` | 재작성 |
| **22** | 예약 변경·취소·마감 후 상담 (73개) | `APPT-CHG-*`·`APPT-RACE-*`·`CANCEL-*` | 재작성 |
| **23** | 사전문진 작성 — 문항·자동저장·진행률·ID (66개) | `NAV-QNR-*`·`QNR-FORM-*`·`QNR-TYPE-*`·`QNR-REQ-*`·`QNR-ID-*`·`QNR-STATE-*` | 재작성 |
| **24** | 문진 표시·이어쓰기·읽기전용·진행률·알림 (47개) | `QNR-SHOW-*`·`QNR-LIVE-*`·`QNR-PROG-*`·`QNR-NOTI-*` | 재작성 |
| **25** | 가족 목록·추가·신규 프로필 (56개) | `NAV-FAM-*`·`FAM-LIST-*`·`FAM-ADD-*`·`FAM-NEW-*` | 재작성 |
| **26** | 가족 기존환자 OTP 연결·수정·해제 (51개) | `FAM-LINK-*`·`FAM-EDIT-*`·`FAM-UNLINK-*` | 재작성 [R5-02] |
| **27** | 방문 이력 — 목록·행·역할·문진/안내 펼침 (84개) | `HIST-*`·`NAV-HIST-*` | 재작성 |
| **28** | 설정 홈 + 알림 설정 + 병원 정보(전화·지도) (57개) | `SET-NOTI-*`·`SET-HOSP-*`·`NAV-SET-*` | 재작성 |
| **29** | 비밀번호 변경 + 회원 탈퇴 + 로그아웃 (56개) | `SET-PW-*`·`SET-QUIT-*`·`SET-OUT-*` | 재작성 |
| **30** | 나의 예약 목록·상태 배지·역할 (64개) | `LIST-LIST-*`·`LIST-ST-*`·`LIST-ROLE-*`·`NAV-LIST-*` | 재작성 |
| **31** | 나의 예약 빈상태·이어받기·문진·CTA (29개) | `LIST-EMPTY-*`·`LIST-REFRESH-*`·`LIST-QNR-*`·`LIST-CTA-*` | 재작성 [R5-01] |

**결번**: `Task 15`(옛 번호 자리 비움 — 가입/로그인이 13·14로 합쳐짐).

**의존 순서**: `Task 0`(스캐폴딩·토큰·ApiClient) → `1`(마이그레이션) → `2~9`(백엔드 서비스) → `10`(라우터·통합) → `11~12`(프론트 전역) → `13~31`(화면). ⭐ **Task 0이 가장 먼저다** — 토큰이 없으면 각 화면이 자기 색을 만든다. ⚠️ 화면 태스크는 자기가 소비하는 백엔드 계약(Consumes)이 먼저 있어야 한다.

**범위 밖**: 공용 데이터 모델 `00010~00016`(④에서 완료) · 직원 웹(2단계) · 상담봇 화면(4단계) · 배포.

---

<!-- 태스크 본문은 여기부터. 세션마다 한 태스크씩 `test('[규칙ID] …')` 문장으로 채운다.
     지킬 조건: ①테스트 한 줄에 규칙 ID 하나 + 값 assert ②Consumes/Produces는 이름으로
     ③규칙에 DB 칸이 나오면 서버 층 짝 확인. 다 쓰면 plan-coverage-check + plan-prefix-check 경고 0 확인 후 커밋.
     ⚠️ 태스크 헤딩은 `## Task N:`(더블 해시) — prefix-check의 `task_spans`가 이 형식만 본다. -->

## Task 0: Flutter 스캐폴딩 + 시각 토큰(테마) + 공통 표시 위젯 + ApiClient·인증상태

> ⭐ **가장 먼저다.** 토큰이 없으면 각 화면이 자기 색·크기·카드 규격을 만들고, 회수 비용이 화면 수만큼 곱해진다(직원웹 Task 0에서 확인된 교훈). 이 태스크가 `DISP-*` 12규칙 전부를 **토큰·공통 위젯**으로 못박고, 이후 모든 화면은 그것만 소비한다.

**담당 규칙(12)**: `DISP-GRAY-01·02·03` · `DISP-CARD-01·02·03` · `DISP-ATT-01` · `DISP-ICON-01·02·03` · `DISP-COLOR-01` · `DISP-WARN-01`

**Files:**
- Create: `patient_app/pubspec.yaml`
- Create: `patient_app/lib/main.dart` · `patient_app/lib/app.dart`
- Create: `patient_app/lib/core/env.dart` · `patient_app/lib/core/router.dart`
- Create: `patient_app/lib/core/tokens.dart` (시각 토큰 — `DISP-GRAY-*`·`DISP-CARD-01`·`DISP-WARN-01` 상수)
- Create: `patient_app/lib/widgets/app_card.dart` (`DISP-CARD-01·02·03`·`DISP-ATT-01`)
- Create: `patient_app/lib/widgets/status_label.dart` (`DISP-COLOR-01`·`DISP-GRAY-*` 상태→회색 매핑)
- Create: `patient_app/lib/widgets/warn_text.dart` (`DISP-WARN-01`)
- Create: `patient_app/lib/widgets/app_icons.dart` (`DISP-ICON-01·02·03`)
- Create: `patient_app/lib/core/api_client.dart` · `patient_app/lib/core/providers.dart` · `patient_app/lib/features/auth/auth_state.dart`
- Test: `patient_app/test/widget_test.dart` · `test/core/tokens_test.dart` · `test/widgets/app_card_test.dart` · `test/widgets/status_label_test.dart` · `test/widgets/warn_text_test.dart` · `test/widgets/app_icons_test.dart` · `test/core/api_client_test.dart`

**Interfaces:**
- Consumes: (없음 — 최초 태스크)
- Produces:
  - `Env.apiBaseUrl`·`Env.supabaseUrl`·`Env.supabaseAnonKey`(`--dart-define` 주입) · `appRouter`(`GoRouter`) · `PatientApp` 위젯
  - `AppTokens.grayPending`(Color `0xFF7E8E99`) · `AppTokens.grayDone`(Color `0xFFA3AFB8`) · `AppTokens.grays`(List<Color>) · `AppTokens.warn`(Color) · `AppTokens.cardBodyHeight`(double `132`) · `AppTokens.warnBarWidth`(double `4`)
  - `AppCard({required Widget body, Widget? announcement})` · `StatusLabel({required String text, required Color color})` · `WarnText(String text)` · `appIcon(AppIconKind)`(`IconData`) · `enum AppIconKind { blocked, readonly }`
  - `ApiException(message)` · `ApiClient({required baseUrl, required tokenProvider, http.Client? httpClient})`(`.get`/`.post`/`.patch`/`.delete`) · `apiClientProvider` · `authStateChangesProvider`(`StreamProvider<AuthState>`) · `AuthState`·`AuthStatus`

---

### A. 스캐폴딩

- [ ] **Step A1: `pubspec.yaml` 작성**

`patient_app/pubspec.yaml`:
```yaml
name: hospital_patient_app
description: 병원 통합 서비스 환자용 모바일 앱
publish_to: 'none'
version: 0.1.0

environment:
  sdk: '>=3.4.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  flutter_riverpod: ^2.5.1
  go_router: ^14.2.0
  supabase_flutter: ^2.5.6
  http: ^1.2.1
  intl: ^0.19.0
  qr_flutter: ^4.1.0
  firebase_core: ^3.3.0
  firebase_messaging: ^15.0.4
  connectivity_plus: ^6.0.3

dev_dependencies:
  flutter_test:
    sdk: flutter
  mocktail: ^1.0.3
  flutter_lints: ^4.0.0

flutter:
  uses-material-design: true
```

- [ ] **Step A2: `env.dart`·`router.dart` 작성**

`patient_app/lib/core/env.dart`:
```dart
class Env {
  static const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:8000');
  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL', defaultValue: 'http://localhost:54321');
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
}
```

`patient_app/lib/core/router.dart` — 라우트 골격만. 각 화면 위젯은 이후 태스크(13~31)가 이 파일의 `builder`를 교체한다:
```dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

final GoRouter appRouter = GoRouter(
  initialLocation: '/login',
  routes: [
    GoRoute(path: '/login', builder: (c, s) => const _Placeholder('로그인')),
    GoRoute(path: '/signup', builder: (c, s) => const _Placeholder('회원가입')),
    GoRoute(path: '/home', builder: (c, s) => const _Placeholder('홈')),
    GoRoute(path: '/booking', builder: (c, s) => const _Placeholder('예약')),
    GoRoute(path: '/family', builder: (c, s) => const _Placeholder('가족관리')),
    GoRoute(path: '/appointments/:id', builder: (c, s) => _Placeholder('예약 상세 ${s.pathParameters['id']}')),
    GoRoute(path: '/history', builder: (c, s) => const _Placeholder('방문이력')),
    GoRoute(path: '/settings', builder: (c, s) => const _Placeholder('설정')),
  ],
);

class _Placeholder extends StatelessWidget {
  const _Placeholder(this.label);
  final String label;
  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: Text(label)));
}
```

- [ ] **Step A3: `main.dart`·`app.dart` 작성**(테마는 Step B4에서 토큰과 연결)

`patient_app/lib/main.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'app.dart';
import 'core/env.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(url: Env.supabaseUrl, anonKey: Env.supabaseAnonKey);
  runApp(const ProviderScope(child: PatientApp()));
}
```

`patient_app/lib/app.dart`:
```dart
import 'package:flutter/material.dart';
import 'core/router.dart';
import 'core/tokens.dart';

class PatientApp extends StatelessWidget {
  const PatientApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: '병원 앱',
      theme: AppTokens.theme, // Step B4
      routerConfig: appRouter,
    );
  }
}
```

- [ ] **Step A4: 스모크 테스트 → `flutter pub get && flutter test test/widget_test.dart`**

`patient_app/test/widget_test.dart`:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/router.dart';

void main() {
  test('appRouter는 /login을 초기 경로로 갖는다', () {
    expect(appRouter.routeInformationProvider.value.uri.toString(), '/login');
  });
}
```
Expected: PASS.

---

### B. 시각 토큰 — `DISP-GRAY-*` · `DISP-CARD-01` · `DISP-WARN-01`

- [ ] **Step B1: 실패 테스트** — `patient_app/test/core/tokens_test.dart`

```dart
import 'dart:ui';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/tokens.dart';

void main() {
  // 규칙이 못박은 값(색 16진수·높이·바 폭)을 그대로 확인한다.
  test('[DISP-GRAY-01] 대기(아직 안 된 일) 회색 = #7E8E99', () {
    expect(AppTokens.grayPending.value, 0xFF7E8E99);
  });
  test('[DISP-GRAY-02] 완료·취소(이미 끝난 일) 회색 = #A3AFB8', () {
    expect(AppTokens.grayDone.value, 0xFFA3AFB8);
  });
  test('[DISP-GRAY-03] 회색은 두 진하기뿐 — 새 색을 만들지 않는다', () {
    // 같은 계열 안에서 진하기만 가른다: 회색 토큰은 정확히 grayPending·grayDone 2개.
    expect(AppTokens.grays, [AppTokens.grayPending, AppTokens.grayDone]);
  });
  test('[DISP-CARD-01] 카드 본문 높이 = 132px 고정', () {
    expect(AppTokens.cardBodyHeight, 132.0);
  });
  test('[DISP-WARN-01] 주의 표시 좌측 바 폭 = 4px', () {
    expect(AppTokens.warnBarWidth, 4.0);
  });
}
```
Run: `flutter test test/core/tokens_test.dart` → Expected: FAIL(`tokens.dart` 없음).

- [ ] **Step B2: `tokens.dart` 구현**

`patient_app/lib/core/tokens.dart`:
```dart
import 'package:flutter/material.dart';

/// 앱 전역 시각 토큰. 화면 코드는 색·크기·카드 규격을 여기서만 가져온다(하드코딩 금지).
class AppTokens {
  AppTokens._();

  // DISP-GRAY-01/02/03 — 회색은 두 진하기뿐. 새 색을 만들지 않는다.
  static const Color grayPending = Color(0xFF7E8E99); // 아직 안 된 일(앞으로 온다)
  static const Color grayDone = Color(0xFFA3AFB8);    // 이미 끝난 일(지나갔다)
  static const List<Color> grays = [grayPending, grayDone];

  // DISP-WARN-01 — 주의색: 배경 없이 글자 + 좌측 4px 바.
  static const Color warn = Color(0xFFB54708);
  static const double warnBarWidth = 4.0;

  // DISP-CARD-01 — 카드 본문 높이 고정.
  static const double cardBodyHeight = 132.0;

  static ThemeData get theme => ThemeData(
        useMaterial3: true,
        textTheme: const TextTheme(
          bodyLarge: TextStyle(fontSize: 18),
          titleLarge: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
        ),
      );
}
```
Run: `flutter test test/core/tokens_test.dart` → Expected: PASS.

---

### C. 공통 표시 위젯 — `DISP-CARD-02·03` · `DISP-ATT-01` · `DISP-COLOR-01` · `DISP-ICON-*`

- [ ] **Step C1: `AppCard` 실패 테스트** — `test/widgets/app_card_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/tokens.dart';
import 'package:hospital_patient_app/widgets/app_card.dart';

Future<double> _bodyHeight(WidgetTester t, Widget body) async {
  await t.pumpWidget(MaterialApp(home: Scaffold(body: AppCard(body: body))));
  return t.getSize(find.byKey(const Key('app_card_body'))).height;
}

void main() {
  testWidgets('[DISP-CARD-02] 본문 내용이 바뀌어도 본문 높이는 132로 유지된다', (t) async {
    final h1 = await _bodyHeight(t, const Text('한 줄'));
    final h3 = await _bodyHeight(t, const Text('세\n줄\n짜리'));
    expect(h1, 132.0);
    expect(h3, 132.0); // 아래 요소가 튀지 않는다
  });
  testWidgets('[DISP-CARD-03] 담을 내용이 1~3줄로 달라도 세로 가운데 정렬·높이 유지', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: AppCard(body: Text('문장만')))));
    final align = t.widget<Align>(find.byKey(const Key('app_card_body_align')));
    expect(align.alignment, Alignment.center);
    expect(t.getSize(find.byKey(const Key('app_card_body'))).height, 132.0);
  });
  testWidgets('[DISP-ATT-01] 병원발 변경 안내문은 카드와 간격 없이 한 덩어리로 붙는다', (t) async {
    await t.pumpWidget(const MaterialApp(
      home: Scaffold(body: AppCard(body: Text('카드'), announcement: Text('변경 안내'))));
    final card = t.getRect(find.byKey(const Key('app_card_main')));
    final att = t.getRect(find.byKey(const Key('app_card_announcement')));
    expect(att.top, card.bottom); // 떨어져 있지 않다 = 별개 알림으로 안 읽힌다
  });
}
```
Run → Expected: FAIL(`app_card.dart` 없음).

- [ ] **Step C2: `AppCard` 구현** — `patient_app/lib/widgets/app_card.dart`

```dart
import 'package:flutter/material.dart';
import '../core/tokens.dart';

/// 예약 카드의 공통 프레임. 본문 높이 132 고정(DISP-CARD-01/02/03),
/// 병원발 안내문은 카드에 간격 없이 붙인다(DISP-ATT-01).
class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.body, this.announcement});
  final Widget body;
  final Widget? announcement;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          key: const Key('app_card_main'),
          decoration: BoxDecoration(
            border: Border.all(color: AppTokens.grayPending),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
          ),
          child: SizedBox(
            key: const Key('app_card_body'),
            height: AppTokens.cardBodyHeight, // 고정 132
            child: Align(
              key: const Key('app_card_body_align'),
              alignment: Alignment.center, // 세로 가운데(DISP-CARD-03)
              child: body,
            ),
          ),
        ),
        if (announcement != null)
          Container(
            key: const Key('app_card_announcement'),
            // 간격 0 = 카드와 모서리를 맞춰 한 덩어리(DISP-ATT-01)
            decoration: BoxDecoration(
              color: AppTokens.grayDone.withOpacity(0.15),
              borderRadius: const BorderRadius.vertical(bottom: Radius.circular(12)),
            ),
            padding: const EdgeInsets.all(12),
            child: announcement,
          ),
      ],
    );
  }
}
```
Run → Expected: PASS.

- [ ] **Step C3: `StatusLabel` 실패 테스트** — `test/widgets/status_label_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/tokens.dart';
import 'package:hospital_patient_app/widgets/status_label.dart';

void main() {
  testWidgets('[DISP-COLOR-01] 상태는 색만이 아니라 텍스트를 반드시 병기한다', (t) async {
    await t.pumpWidget(const MaterialApp(
      home: Scaffold(body: StatusLabel(text: '예약신청', color: AppTokens.grayPending))));
    // 텍스트가 실제로 화면에 있어야 한다(색 스와치만으로는 실패).
    expect(find.text('예약신청'), findsOneWidget);
    final swatch = t.widget<Container>(find.byKey(const Key('status_swatch')));
    expect((swatch.decoration as BoxDecoration).color, AppTokens.grayPending);
  });
  test('[DISP-GRAY-01] 앞으로 올 상태의 회색은 grayPending에 매핑된다', () {
    expect(statusGray(StatusPhase.upcoming), AppTokens.grayPending);
  });
  test('[DISP-GRAY-02] 지나간 상태의 회색은 grayDone에 매핑된다', () {
    expect(statusGray(StatusPhase.past), AppTokens.grayDone);
  });
}
```
Run → Expected: FAIL.

- [ ] **Step C4: `StatusLabel` 구현** — `patient_app/lib/widgets/status_label.dart`

```dart
import 'package:flutter/material.dart';
import '../core/tokens.dart';

enum StatusPhase { upcoming, past }

/// DISP-GRAY-01/02 — 앞으로 올 일=진한 회색, 지나간 일=옅은 회색.
Color statusGray(StatusPhase phase) =>
    phase == StatusPhase.upcoming ? AppTokens.grayPending : AppTokens.grayDone;

/// DISP-COLOR-01 — 색 스와치 + 텍스트를 항상 함께. 색만으로 구분하지 않는다.
class StatusLabel extends StatelessWidget {
  const StatusLabel({super.key, required this.text, required this.color});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          key: const Key('status_swatch'),
          width: 10, height: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(text),
      ],
    );
  }
}
```
Run → Expected: PASS.

- [ ] **Step C5: `WarnText` 실패 테스트** — `test/widgets/warn_text_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/tokens.dart';
import 'package:hospital_patient_app/widgets/warn_text.dart';

void main() {
  testWidgets('[DISP-WARN-01] 주의 표시는 배경 없이 글자 + 좌측 4px 바만', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: WarnText('마감이 지났습니다'))));
    final box = t.widget<Container>(find.byKey(const Key('warn_box')));
    final deco = box.decoration as BoxDecoration;
    expect(deco.color, null); // 배경 없음
    expect(deco.border!.left.width, AppTokens.warnBarWidth); // 좌측 바 4px
    expect(deco.border!.left.color, AppTokens.warn);
    expect(find.text('마감이 지났습니다'), findsOneWidget);
  });
}
```
Run → Expected: FAIL.

- [ ] **Step C6: `WarnText` 구현** — `patient_app/lib/widgets/warn_text.dart`

```dart
import 'package:flutter/material.dart';
import '../core/tokens.dart';

/// DISP-WARN-01 — 오프라인 띠를 제외한 모든 주의 표시. 배경 없이 글자 + 좌측 4px 바.
class WarnText extends StatelessWidget {
  const WarnText(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('warn_box'),
      decoration: const BoxDecoration(
        border: Border(left: BorderSide(color: AppTokens.warn, width: AppTokens.warnBarWidth)),
      ),
      padding: const EdgeInsets.only(left: 8),
      child: Text(text, style: const TextStyle(color: AppTokens.warn)),
    );
  }
}
```
Run → Expected: PASS.

- [ ] **Step C7: `app_icons` 실패 테스트** — `test/widgets/app_icons_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/widgets/app_icons.dart';

void main() {
  test('[DISP-ICON-01] 막힌 기능(진료중 이후 잠김)은 자물쇠 아이콘', () {
    expect(appIcon(AppIconKind.blocked), Icons.lock);
  });
  test('[DISP-ICON-02] 보기 전용(진료완료·이력)은 눈 아이콘', () {
    expect(appIcon(AppIconKind.readonly), Icons.visibility);
  });
  test('[DISP-ICON-03] 아이콘은 채움 벡터 IconData다 — 이모지(String) 금지', () {
    final icon = appIcon(AppIconKind.blocked);
    expect(icon, isA<IconData>());
    expect(icon.fontFamily, 'MaterialIcons'); // 벡터 폰트 아이콘(이모지 아님)
  });
}
```
Run → Expected: FAIL.

- [ ] **Step C8: `app_icons` 구현** — `patient_app/lib/widgets/app_icons.dart`

```dart
import 'package:flutter/material.dart';

/// DISP-ICON-01/02/03 — 상태를 나타내는 공통 아이콘. 채움(Solid) 벡터만, 이모지 금지.
enum AppIconKind {
  blocked,  // 원래 되던 것이 지금 막혔다(자물쇠)
  readonly, // 처음부터 보기만 하는 자리(눈)
}

IconData appIcon(AppIconKind kind) {
  switch (kind) {
    case AppIconKind.blocked:
      return Icons.lock;
    case AppIconKind.readonly:
      return Icons.visibility;
  }
}
```
Run → Expected: PASS.

> 📌 `DISP-ICON-03`의 "하단 탭은 아이콘 아래 글자 라벨 유지"는 하단 탭 셸을 만드는 **Task 16**(`NAV-HOME-*`)이 `BottomNavigationBarItem(label: …)`로 소비한다. 여기서는 아이콘이 벡터임을 못박는다.

- [ ] **Step B4 확인**: `app.dart`의 `theme: AppTokens.theme`가 스모크 테스트에서 깨지지 않는지 `flutter test test/widget_test.dart` 재실행 → PASS.

---

### D. ApiClient + 인증상태(Riverpod)

- [ ] **Step D1: 실패 테스트** — `test/core/api_client_test.dart`

```dart
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('성공 응답을 파싱해서 반환한다', () async {
    final mock = MockClient((r) async => http.Response(jsonEncode({'appointment_id': 'a1'}), 200));
    final client = ApiClient(baseUrl: 'http://localhost:8000', tokenProvider: () async => 'tk', httpClient: mock);
    final result = await client.post('/app/appointments', {'reason': '감기'}, (j) => j['appointment_id'] as String);
    expect(result, 'a1');
  });
  test('실패 응답이면 한글 detail을 담은 ApiException을 던진다(예외 원문 노출 금지)', () async {
    final mock = MockClient((r) async => http.Response(jsonEncode({'detail': '이미 선택된 시간입니다.'}), 409));
    final client = ApiClient(baseUrl: 'http://localhost:8000', tokenProvider: () async => 'tk', httpClient: mock);
    expect(
      () => client.post('/app/appointments', {}, (j) => j),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', '이미 선택된 시간입니다.')),
    );
  });
}
```
Run → Expected: FAIL.

- [ ] **Step D2: `ApiClient` 구현** — `patient_app/lib/core/api_client.dart`

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  ApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({required this.baseUrl, required this.tokenProvider, http.Client? httpClient})
      : _client = httpClient ?? http.Client();
  final String baseUrl;
  final Future<String?> Function() tokenProvider;
  final http.Client _client;

  Future<Map<String, String>> _headers() async {
    final token = await tokenProvider();
    return {'Content-Type': 'application/json', if (token != null) 'Authorization': 'Bearer $token'};
  }

  Future<T> get<T>(String path, T Function(dynamic) parse, {Map<String, String>? query}) async {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);
    return _handle(await _client.get(uri, headers: await _headers()), parse);
  }
  Future<T> post<T>(String path, Map<String, dynamic> body, T Function(dynamic) parse) async =>
      _handle(await _client.post(Uri.parse('$baseUrl$path'), headers: await _headers(), body: jsonEncode(body)), parse);
  Future<T> patch<T>(String path, Map<String, dynamic> body, T Function(dynamic) parse) async =>
      _handle(await _client.patch(Uri.parse('$baseUrl$path'), headers: await _headers(), body: jsonEncode(body)), parse);
  Future<T> delete<T>(String path, T Function(dynamic) parse) async =>
      _handle(await _client.delete(Uri.parse('$baseUrl$path'), headers: await _headers()), parse);

  T _handle<T>(http.Response response, T Function(dynamic) parse) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return parse(response.body.isEmpty ? null : jsonDecode(response.body));
    }
    var message = '요청 처리 중 오류가 발생했습니다.'; // 파이썬 예외 원문 대신 정형 한글(갭 #14)
    try {
      final body = jsonDecode(response.body);
      if (body is Map && body['detail'] is String) message = body['detail'] as String;
    } catch (_) {}
    throw ApiException(message);
  }
}
```
Run → Expected: PASS.

- [ ] **Step D3: providers·auth_state 작성**

`patient_app/lib/features/auth/auth_state.dart`:
```dart
enum AuthStatus { signedOut, signedIn }

class AuthState {
  const AuthState({required this.status, this.userId});
  final AuthStatus status;
  final String? userId;
}
```

`patient_app/lib/core/providers.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../features/auth/auth_state.dart';
import 'api_client.dart';
import 'env.dart';

final supabaseClientProvider = Provider<SupabaseClient>((ref) => Supabase.instance.client);

final apiClientProvider = Provider<ApiClient>((ref) {
  final supabase = ref.watch(supabaseClientProvider);
  return ApiClient(baseUrl: Env.apiBaseUrl, tokenProvider: () async => supabase.auth.currentSession?.accessToken);
});

final authStateChangesProvider = StreamProvider<AuthState>((ref) {
  final supabase = ref.watch(supabaseClientProvider);
  return supabase.auth.onAuthStateChange.map((event) {
    final session = event.session;
    if (session == null) return const AuthState(status: AuthStatus.signedOut);
    return AuthState(status: AuthStatus.signedIn, userId: session.user.id);
  });
});
```

- [ ] **Step D4: 전체 테스트** — `cd patient_app && flutter test` → Expected: 전체 PASS.

- [ ] **Step D5: 커밋**

```bash
git add patient_app
git commit -m "feat: 📝 환자앱 Task 0 — 스캐폴딩 + 시각 토큰(DISP-* 12) + ApiClient·인증상태"
```

> 📌 이 태스크는 **플랜 문서**다(구현 코드 아님). 위 코드 블록은 구현자가 그대로 옮겨 쓰는 견본이다. 실제 `patient_app/`은 ⑦ 구현 단계에서 생성한다.

---

## Task 1: 마이그레이션 — 환자 신원 + `patient_owns()` + 환자용 RLS + 가족 phone nullable

> **담당 규칙**: 없음(마이그레이션·계약). 이후 백엔드·화면 태스크가 이 RLS/함수 위에 선다.
>
> ⚠️ **경계(중복 금지 — grep으로 대조 완료 2026-08-17)**:
> - ④ 공용 마이그레이션 `00010~00016`이 **이미** 만든 것은 **다시 만들지 않는다**: `appointments.support_requested_at`+`request_type`(`00010`) · `notification_log`(`00011`) · `notification_preferences`(`00012`) · `notification_type_settings`(`00013`) · `patients.sms_dead`(`00014`) · `access_audit_log.phone_reveal`(`00015`) · `scheduled_notifications`(`00016`).
> - **직원웹 Task 29(`00035`)가 소유**하는 `hospital_settings.auto_confirm_app_bookings`(기본 `true`·AD-051)·`hospital_address`·`hospital_phone`은 여기서 만들지 않고 **`get_public_hospital_info()`로 소비만** 한다(Task 21·28 홈/병원정보).
> - ⛔ **`cancellation_requested_at` 부활 금지** — ④ `support_requested_at`으로 대체됨(폐기·교체 결정).
> - **기능별 마이그레이션은 각 태스크가 소유**: 예약 멱등 키→Task 5 · 문진 부분저장/문항ID/스냅샷 칸→Task 7 · `device_tokens`→Task 9 · 가입 동의 `consent`→Task 13. 이 Task 1은 **신원·RLS 기반만**.
> - 📌 마이그레이션 번호 `00017`은 논리 번호다 — 직원웹도 `00017+`를 쓰므로 **실제 번호는 구현 시점에 확정**(먼저 적용하는 쪽이 다음 번호). 순서 의존만 지킨다.

**Files:**
- Create: `supabase/migrations/00017_patient_identity_rls.sql`
- Modify: `backend/tests/conftest.py` (`seed_patient` 헬퍼 추가)
- Test: `backend/tests/test_patient_identity_rls.py`

**Interfaces:**
- Consumes:
  - 1단계 DB: `patients`·`patient_family_links`·`appointments`·`appointment_status_history`·`questionnaire_templates`·`questionnaire_responses`·`medical_records`·`hospital_settings`(`00001~00009`) · 트리거 `log_appointment_status_change()`(재정의 대상) · `private.current_staff_id()`
  - ④: `appointments.support_requested_at`·`request_type`(마감 후 지원요청 write는 Task 6가 이 RLS로)
  - 테스트 하니스: `tests.conftest.db_conn`·`set_session_auth`·`seed_staff`(④ 하니스 규칙)
- Produces:
  - `patients.auth_user_id`(uuid, nullable, unique, `auth.users(id)`) · `patients.phone` **NOT NULL 해제**(#3 — 전화 없는 가족)
  - `private.current_patient_id() returns uuid`(security definer, `is_active`만) · `patient_owns(target_patient_id uuid) returns boolean`([R5-02] `patient_family_links.is_active=true`만)
  - 환자용 RLS: `patients_can_register_self`·`patients_can_insert_family_members`·`patients_can_read_self_and_family`(직접 UPDATE 정책 없음 — RPC로만) · `patients_can_read_own_appointments`·`patients_can_create_own_appointments`·`patients_can_update_own_appointments`·`patients_can_read_own_status_history`·`patients_can_insert_note_history` · 문진·기록 select 정책
  - RPC `update_patient_basic_info(target_patient_id, name, birth_date, gender)`·`deactivate_patient_self()`(바꿀 칼럼만 하드코딩 — SDB-18)
  - 재정의된 `log_appointment_status_change()`(환자 행위자 인식) · 뷰 `patient_medical_notes(id, appointment_id, patient_visible_notes, is_completed, updated_at)`(Task 8 이력이 `medical_records` 대신 조회)
  - `tests.conftest.seed_patient(conn, name=..., phone=..., with_auth=True, is_active=True) -> {"auth_user_id": UUID|None, "patient_id": UUID}`

- [ ] **Step 1: 스키마 실패 테스트** — `backend/tests/test_patient_identity_rls.py`

```python
import pytest

@pytest.mark.asyncio
async def test_patients_auth_user_id_and_phone_nullable(db_conn):
    # #3 — 전화 없는 가족을 담기 위해 phone은 nullable이어야 한다.
    cols = await db_conn.fetch(
        "select column_name, is_nullable from information_schema.columns "
        "where table_name = 'patients' and column_name in ('auth_user_id','phone')")
    by = {c["column_name"]: c["is_nullable"] for c in cols}
    assert by.get("auth_user_id") == "YES"
    assert by.get("phone") == "YES"

@pytest.mark.asyncio
async def test_patient_owns_only_counts_active_links(db_conn):
    # [R5-02] is_active=false 링크는 patient_owns가 인정하지 않는다.
    acct = await seed_patient(db_conn, with_auth=True)
    fam = await seed_patient(db_conn, with_auth=False)
    await db_conn.execute(
        "insert into patient_family_links (account_patient_id, family_patient_id, relation, is_active) "
        "values ($1,$2,'자녀',false)", acct["patient_id"], fam["patient_id"])  # 1단계 00003 칼럼명=relation
    await set_session_auth(db_conn, acct["auth_user_id"])
    owns = await db_conn.fetchval("select patient_owns($1)", fam["patient_id"])
    assert owns is False
```
Run: `cd backend && pytest tests/test_patient_identity_rls.py -v`
Expected: FAIL — `column "auth_user_id" does not exist`.

- [ ] **Step 2: 마이그레이션 SQL 작성** — `supabase/migrations/00017_patient_identity_rls.sql`

```sql
-- 환자 신원(auth 연결) + 소유 판정 함수 + 환자용 RLS. 옛 00200~00202를 폐기·재번호.
alter table patients add column auth_user_id uuid unique references auth.users(id);
alter table patients alter column phone drop not null;   -- #3 전화 없는 가족

-- is_active인 환자만 반환. 비활성 환자는 NULL → 이 함수를 쓰는 모든 정책에서 자동 차단(DB가 최종 방어).
create or replace function private.current_patient_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.patients p where p.auth_user_id = auth.uid() and p.is_active;
$$;
revoke execute on function private.current_patient_id() from public;
grant execute on function private.current_patient_id() to authenticated;

create or replace function patient_owns(target_patient_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_patient_id() = target_patient_id
    or exists (
      select 1 from public.patient_family_links l
      where l.account_patient_id = private.current_patient_id()
        and l.family_patient_id = target_patient_id
        and l.is_active   -- [R5-02] 해제된 링크는 인정하지 않는다
    );
$$;
revoke execute on function patient_owns(uuid) from public;
grant execute on function patient_owns(uuid) to authenticated;

-- patients: 본인 등록 / 가족 프로필 추가 / 본인·가족 조회. 직접 UPDATE 정책은 두지 않는다(칼럼 단위
-- 방어가 RLS로 안 되고 환자·직원이 같은 authenticated 역할이라 — SDB-18). 수정은 전용 RPC로만.
create policy "patients_can_register_self" on patients
  for insert with check (auth_user_id = auth.uid());
create policy "patients_can_insert_family_members" on patients
  for insert with check (auth_user_id is null and private.current_patient_id() is not null);
create policy "patients_can_read_self_and_family" on patients
  for select using (patient_owns(id));

create or replace function update_patient_basic_info(
  target_patient_id uuid, p_name text, p_birth_date date, p_gender text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.patient_owns(target_patient_id) then
    raise exception '본인 또는 등록한 가족만 정보를 수정할 수 있습니다.' using errcode = 'P0001';
  end if;
  update public.patients set name = p_name, birth_date = p_birth_date, gender = p_gender
  where id = target_patient_id;   -- auth_user_id·is_active·phone은 못 바꾼다(관리자 절차로만)
end;
$$;
revoke execute on function update_patient_basic_info(uuid, text, date, text) from public;
grant execute on function update_patient_basic_info(uuid, text, date, text) to authenticated;

create or replace function deactivate_patient_self()
returns void language plpgsql security definer set search_path = '' as $$
declare v_patient_id uuid;
begin
  v_patient_id := private.current_patient_id();
  if v_patient_id is null then
    raise exception '활성 상태의 환자만 계정을 비활성화할 수 있습니다.' using errcode = 'P0001';
  end if;
  update public.patients set is_active = false where id = v_patient_id;
end;
$$;
revoke execute on function deactivate_patient_self() from public;
grant execute on function deactivate_patient_self() to authenticated;

-- 예약·상태이력 환자 RLS. (support_requested_at 자체는 ④ 00010이 만들었다 — 여기선 write 경로만 연다.)
create policy "patients_can_read_own_appointments" on appointments
  for select using (patient_owns(for_patient_id) or patient_owns(account_patient_id));
create policy "patients_can_create_own_appointments" on appointments
  for insert with check (source = 'app' and patient_owns(account_patient_id) and patient_owns(for_patient_id));
create policy "patients_can_update_own_appointments" on appointments
  for update using (patient_owns(account_patient_id)) with check (patient_owns(account_patient_id));

alter table appointment_status_history alter column changed_by drop not null;
alter table appointment_status_history add column changed_by_patient_id uuid references patients(id);
alter table appointment_status_history add constraint appointment_status_history_actor_check
  check (changed_by is not null or changed_by_patient_id is not null);
create policy "patients_can_read_own_status_history" on appointment_status_history
  for select using (exists (select 1 from appointments a
    where a.id = appointment_status_history.appointment_id and patient_owns(a.account_patient_id)));
-- 상태변화 없는 관리 메모(마감 후 지원요청 등)만 환자 직접 INSERT 허용. 실제 상태전이는 트리거만.
create policy "patients_can_insert_note_history" on appointment_status_history
  for insert with check (
    from_status = to_status and changed_by_patient_id is not null
    and private.current_patient_id() = appointment_status_history.changed_by_patient_id
    and exists (select 1 from appointments a
      where a.id = appointment_status_history.appointment_id and patient_owns(a.account_patient_id)));

-- 1단계 트리거는 auth.uid()를 staff에서만 찾았다. 환자 행위자도 인식하도록 재정의(SDB-05/22: is_active만).
create or replace function log_appointment_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_staff_id uuid; v_patient_id uuid;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    v_staff_id := private.current_staff_id();
    if v_staff_id is null then v_patient_id := private.current_patient_id(); end if;
    if v_staff_id is not null or v_patient_id is not null then
      insert into public.appointment_status_history
        (appointment_id, from_status, to_status, changed_by, changed_by_patient_id, reason)
      values (new.id, case when tg_op='INSERT' then null else old.status end, new.status,
              v_staff_id, v_patient_id, null);
    end if;   -- 행위자 없는 세션(시드/배치)은 이력 행을 건너뛴다(제약 위반 방지)
  end if;
  return new;
end;
$$;

-- 문진·기록: 본인·가족 것만 조회. 의료진 전용 메모는 뷰로 가린다(Task 8 이력이 이 뷰만 조회).
create policy "patients_can_read_own_questionnaire" on questionnaire_responses
  for select using (exists (select 1 from appointments a
    where a.id = questionnaire_responses.appointment_id and patient_owns(a.for_patient_id)));
create view patient_medical_notes as
  select m.id, m.appointment_id, m.patient_visible_notes, m.is_completed, m.updated_at
  from medical_records m;
```
Run: `pytest tests/test_patient_identity_rls.py -v` → Expected: PASS.

- [ ] **Step 3: `seed_patient` 헬퍼 추가** — `backend/tests/conftest.py`

```python
async def seed_patient(conn, *, name="환자", phone="010-0000-0000", with_auth=True, is_active=True):
    """환자 행(+선택적으로 auth.users)을 만들고 {auth_user_id, patient_id}를 돌려준다."""
    auth_user_id = None
    if with_auth:
        auth_user_id = await conn.fetchval(
            "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
            f"{name}-{id(conn)}@test.local")
    patient_id = await conn.fetchval(
        "insert into patients (name, phone, auth_user_id, is_active) values ($1,$2,$3,$4) returning id",
        name, phone, auth_user_id, is_active)
    return {"auth_user_id": auth_user_id, "patient_id": patient_id}
```

- [ ] **Step 4: RLS 권한 테스트 추가**(같은 파일) — 활성 링크만 소유·비활성 환자 차단

```python
@pytest.mark.asyncio
async def test_deactivated_patient_is_blocked_by_current_patient_id(db_conn):
    p = await seed_patient(db_conn, with_auth=True, is_active=False)
    await set_session_auth(db_conn, p["auth_user_id"])
    # 비활성 환자는 current_patient_id()가 NULL → 본인 예약도 못 만든다.
    assert await db_conn.fetchval("select private.current_patient_id()") is None
```
Run: `pytest tests/test_patient_identity_rls.py -v` → Expected: 전체 PASS.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/00017_patient_identity_rls.sql backend/tests/test_patient_identity_rls.py backend/tests/conftest.py
git commit -m "feat: 환자 신원 + patient_owns + 환자용 RLS + 가족 phone nullable(00017)"
```

> 📌 `changed_by_patient_id`·`patient_medical_notes`·`patient_owns`는 이후 태스크가 이름으로 소비한다(Consumes에 명시). 마감 후 지원요청의 `support_requested_at` write는 **Task 6**이 `patients_can_insert_note_history` 경로로 수행한다.

---

## Task 2: 환자 인증 의존성(`PatientContext`) + 프로필 등록/조회/탈퇴 서비스

> **담당 규칙**: 없음(백엔드 계약). 화면(Task 13·28·29)이 이 서비스를 소비한다.

**Files:**
- Create: `backend/app/core/patient_security.py` · `backend/app/services/patient_profile_service.py`
- Test: `backend/tests/test_patient_security.py` · `backend/tests/test_patient_profile_service.py`

**Interfaces:**
- Consumes: `patient_owns()`·`deactivate_patient_self()`·`private.current_patient_id()`(Task 1) · `app.db.pool.acquire_as`·`get_pool`(1단계) · `app.db.admin_client.get_admin_client`(1단계) · `app.core.errors.AppError`(1단계) · `settings.supabase_jwt_secret` · `tests.conftest.seed_patient`(Task 1)
- Produces:
  - `PatientContext`(dataclass `id: UUID`, `auth_user_id: UUID`) · `get_current_auth_user_id(request) -> UUID`(가입 직후 — patients 행 없어도 통과) · `get_current_patient(request) -> PatientContext`(등록된 활성 환자만; 아니면 403) · `list_accessible_patient_ids(patient) -> list[UUID]`([R5-02] 활성 링크만)
  - `register_profile(auth_user_id, name, birth_date, gender) -> UUID`([R5-05] phone은 요청 아닌 Supabase Auth 검증번호; 일치 미연결 1건이면 연결·아니면 신규) · `get_my_profile(patient) -> dict` · `deactivate_self(patient) -> None`(RPC + auth 계정 ban)

### A. 인증 의존성 — `patient_security.py`

- [ ] **Step A1: 실패 테스트** — `backend/tests/test_patient_security.py`

```python
import time, uuid
import pytest
from fastapi import HTTPException
from jose import jwt
from starlette.requests import Request
from app.core.config import settings
from tests.conftest import seed_patient, seed_staff, set_session_auth

def make_patient_token(auth_user_id: str) -> str:
    return jwt.encode(
        {"sub": auth_user_id, "aud": "authenticated", "role": "authenticated", "exp": int(time.time()) + 3600},
        settings.supabase_jwt_secret, algorithm="HS256")

def _req(token: str) -> Request:
    return Request({"type": "http", "headers": [(b"authorization", f"Bearer {token}".encode())]})

@pytest.mark.asyncio
async def test_get_current_patient_returns_context(db_conn):
    from app.core.patient_security import get_current_patient
    p = await seed_patient(db_conn)
    ctx = await get_current_patient(_req(make_patient_token(str(p["auth_user_id"]))))
    assert ctx.id == p["patient_id"]

@pytest.mark.asyncio
async def test_get_current_patient_rejects_unregistered_403(db_conn):
    from app.core.patient_security import get_current_patient
    uid = uuid.uuid4()
    await db_conn.execute(
        "insert into auth.users (id, email, aud, role, created_at, updated_at) "
        "values ($1,$2,'authenticated','authenticated',now(),now())", uid, f"{uid}@test.local")
    with pytest.raises(HTTPException) as e:
        await get_current_patient(_req(make_patient_token(str(uid))))
    assert e.value.status_code == 403  # 등록 안 됨/사용중지를 한 문장으로(개인정보 열거 방지)

@pytest.mark.asyncio
async def test_list_accessible_excludes_inactive_links(db_conn):
    from app.core.patient_security import PatientContext, list_accessible_patient_ids
    me = await seed_patient(db_conn)
    child = await seed_patient(db_conn, with_auth=False)
    gone = await seed_patient(db_conn, with_auth=False)
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    await db_conn.execute("insert into patient_family_links (account_patient_id, family_patient_id, relation, is_active) values ($1,$2,'자녀',true)", me["patient_id"], child["patient_id"])
    await db_conn.execute("insert into patient_family_links (account_patient_id, family_patient_id, relation, is_active) values ($1,$2,'자녀',false)", me["patient_id"], gone["patient_id"])
    ids = await list_accessible_patient_ids(PatientContext(id=me["patient_id"], auth_user_id=me["auth_user_id"]))
    assert set(ids) == {me["patient_id"], child["patient_id"]}  # [R5-02] 해제 링크(gone) 제외
```
Run: `cd backend && pytest tests/test_patient_security.py -v` → Expected: FAIL(모듈 없음).

- [ ] **Step A2: `patient_security.py` 구현**

```python
from dataclasses import dataclass
from uuid import UUID
from fastapi import HTTPException, Request
from jose import JWTError, jwt
from app.core.config import settings
from app.db.pool import acquire_as

def _decode_sub(request: Request) -> str:
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    try:
        payload = jwt.decode(header.removeprefix("Bearer "), settings.supabase_jwt_secret,
                             algorithms=["HS256"], audience="authenticated")
    except JWTError:
        raise HTTPException(status_code=401, detail="로그인 정보가 올바르지 않습니다.")
    return payload["sub"]

async def get_current_auth_user_id(request: Request) -> UUID:
    return UUID(_decode_sub(request))

@dataclass
class PatientContext:
    id: UUID
    auth_user_id: UUID

async def get_current_patient(request: Request) -> PatientContext:
    auth_user_id = _decode_sub(request)
    async with acquire_as(auth_user_id) as conn:
        row = await conn.fetchrow("select id, is_active from patients where auth_user_id = $1", UUID(auth_user_id))
    if row is None or not row["is_active"]:
        # 등록 안 됨/사용중지를 구분하지 않는다(개인정보 열거 방지).
        raise HTTPException(status_code=403, detail="등록되지 않았거나 사용 중지된 계정입니다.")
    return PatientContext(id=row["id"], auth_user_id=UUID(auth_user_id))

async def list_accessible_patient_ids(patient: PatientContext) -> list[UUID]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            "select family_patient_id from patient_family_links "
            "where account_patient_id = $1 and is_active", patient.id)  # [R5-02] 활성 링크만
    return [patient.id] + [r["family_patient_id"] for r in rows]
```
Run → Expected: 3개 PASS.

### B. 프로필 서비스 — `patient_profile_service.py`

- [ ] **Step B1: 실패 테스트** — `backend/tests/test_patient_profile_service.py`

핵심 4계약을 확인한다(전체 테스트는 견본 코드 그대로 옮긴다):
```python
from datetime import date
from unittest.mock import patch, MagicMock
import uuid, pytest
from app.core.patient_security import PatientContext
from app.services import patient_profile_service
from tests.conftest import seed_patient, seed_staff, set_session_auth

def _mock_verified_phone(phone):
    m = MagicMock(); m.auth.admin.get_user_by_id.return_value.user.phone = phone; return m

@pytest.mark.asyncio
async def test_register_links_single_unlinked_match(db_conn):
    # [R5-05] 검증번호+생년월일+이름이 일치하는 미연결 1건이면 새 행을 만들지 않고 연결(과거 이력 승계).
    admin = await seed_staff(db_conn, role="admin"); await set_session_auth(db_conn, admin["auth_user_id"])
    legacy = await db_conn.fetchval("insert into patients (name, birth_date, gender, phone) values ('홍길동','1985-03-01','M','01012345678') returning id")
    uid = uuid.uuid4()
    await db_conn.execute("insert into auth.users (id,email,aud,role,created_at,updated_at) values ($1,$2,'authenticated','authenticated',now(),now())", uid, f"{uid}@t.local")
    with patch("app.services.patient_profile_service.get_admin_client", return_value=_mock_verified_phone("01012345678")):
        pid = await patient_profile_service.register_profile(auth_user_id=uid, name="홍길동", birth_date=date(1985,3,1), gender="M")
    assert pid == legacy
    assert await db_conn.fetchval("select count(*) from patients where phone='01012345678'") == 1

@pytest.mark.asyncio
async def test_register_new_row_when_ambiguous(db_conn):
    # [R5-05] 후보 0건 또는 2건 이상이면 자동 연결하지 않고 새 행(관리자 수동 병합 대상).
    admin = await seed_staff(db_conn, role="admin"); await set_session_auth(db_conn, admin["auth_user_id"])
    for _ in range(2):
        await db_conn.execute("insert into patients (name,birth_date,gender,phone) values ('홍길동','1985-03-01','M','01012345678')")
    uid = uuid.uuid4()
    await db_conn.execute("insert into auth.users (id,email,aud,role,created_at,updated_at) values ($1,$2,'authenticated','authenticated',now(),now())", uid, f"{uid}@t.local")
    with patch("app.services.patient_profile_service.get_admin_client", return_value=_mock_verified_phone("01012345678")):
        await patient_profile_service.register_profile(auth_user_id=uid, name="홍길동", birth_date=date(1985,3,1), gender="M")
    assert await db_conn.fetchval("select count(*) from patients where phone='01012345678'") == 3

@pytest.mark.asyncio
async def test_deactivate_self_bans_and_inactivates(db_conn):
    p = await seed_patient(db_conn)
    fake = MagicMock()
    with patch("app.services.patient_profile_service.get_admin_client", return_value=fake):
        await patient_profile_service.deactivate_self(PatientContext(id=p["patient_id"], auth_user_id=p["auth_user_id"]))
    fake.auth.admin.update_user_by_id.assert_called_once()
    assert await db_conn.fetchval("select is_active from patients where id=$1", p["patient_id"]) is False

@pytest.mark.asyncio
async def test_patient_cannot_directly_update_sensitive_columns(db_conn):
    # [SDB-18] 직접 UPDATE 정책 없음 — auth_user_id·is_active 자가변경/자가재활성 불가.
    p = await seed_patient(db_conn); await set_session_auth(db_conn, p["auth_user_id"])
    with pytest.raises(Exception):
        await db_conn.execute("update patients set is_active = false where id=$1", p["patient_id"])
```
Run → Expected: FAIL(모듈 없음).

- [ ] **Step B2: `patient_profile_service.py` 구현** — 옛 플랜 구현 그대로 재사용

```python
from datetime import date
from uuid import UUID
from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.admin_client import get_admin_client
from app.db.pool import acquire_as, get_pool

async def register_profile(auth_user_id: UUID, name: str, birth_date: date, gender: str) -> UUID:
    # [R5-05] phone은 요청 본문을 신뢰하지 않고 Supabase Auth(admin API)의 검증번호를 직접 조회한다.
    # 검증 phone+birth_date+name 일치 미연결 1건이면 연결(과거 예약·이력 승계), 0·2+건이면 신규 가입.
    # get_pool() 서비스 역할 커넥션 — 아직 auth 연결 전이라 patient_owns RLS로는 조회 불가.
    admin = get_admin_client()
    phone = admin.auth.admin.get_user_by_id(str(auth_user_id)).user.phone
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            if await conn.fetchval("select id from patients where auth_user_id = $1", auth_user_id) is not None:
                raise AppError("이미 등록된 계정입니다.", status_code=409)
            candidates = await conn.fetch(
                "select id from patients where auth_user_id is null and phone=$1 and birth_date=$2 and name=$3",
                phone, birth_date, name)
            if len(candidates) == 1:
                patient_id = candidates[0]["id"]
                await conn.execute("update patients set auth_user_id=$1 where id=$2", auth_user_id, patient_id)
            else:
                patient_id = await conn.fetchval(
                    "insert into patients (auth_user_id, name, birth_date, gender, phone) "
                    "values ($1,$2,$3,$4,$5) returning id", auth_user_id, name, birth_date, gender, phone)
    return patient_id

async def get_my_profile(patient: PatientContext) -> dict:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow("select id, name, birth_date, gender, phone from patients where id=$1", patient.id)
    return {"id": row["id"], "name": row["name"], "birth_date": str(row["birth_date"]),
            "gender": row["gender"], "phone": row["phone"]}

async def deactivate_self(patient: PatientContext) -> None:
    # [SDB-18] 직접 UPDATE 정책이 없으므로 RPC로만 비활성화 + Supabase Auth 계정 ban.
    async with acquire_as(str(patient.auth_user_id)) as conn:
        await conn.execute("select deactivate_patient_self()")
    get_admin_client().auth.admin.update_user_by_id(str(patient.auth_user_id), {"ban_duration": "87600h"})
```
Run → Expected: 전체 PASS.

- [ ] **Step B3: 커밋**

```bash
git add backend/app/core/patient_security.py backend/app/services/patient_profile_service.py backend/tests/test_patient_security.py backend/tests/test_patient_profile_service.py
git commit -m "feat: 환자 인증 의존성(PatientContext) + 프로필 등록/조회/탈퇴 서비스(R5-05·R5-02·SDB-18)"
```

> 📌 `get_current_patient`·`register_profile`·`get_my_profile`·`deactivate_self`는 Task 10 라우터가 엔드포인트로, Task 13(가입)·29(탈퇴)가 화면에서 소비한다.

---

## Task 3: 가족 CRUD 서비스 + 가족 링크 RPC 마이그레이션(`00018`)

> **담당 규칙**: 없음(백엔드 계약). 가족 화면(Task 25·26)이 소비한다.
>
> ⚠️ **기존 환자 OTP 연결은 이 단계에서 `501`로 막는다**([R5-01]) — 통과시키면 본인확인 없이 남의 계정에 연결된다. 번호 없는 환자는 대면·서류 예외 경로가 있어 막다른 길이 아니다. **4단계에서 본인확인 창구가 생기면 푼다.**

**Files:**
- Create: `supabase/migrations/00018_patient_family_link_rpcs.sql` · `backend/app/services/patient_family_service.py`
- Test: `backend/tests/test_patient_family_link_rpcs.py` · `backend/tests/test_patient_family_service.py`

**Interfaces:**
- Consumes: `patient_owns()`·`update_patient_basic_info()`(Task 1) · `PatientContext`(Task 2) · `acquire_as`·`get_pool`·`AppError` · `patient_family_links(relation, is_active, unlinked_at, unique(account_patient_id, family_patient_id))`(1단계 `00003`)
- Produces:
  - RPC `update_family_link_relation_self(link_id, relation)`·`unlink_family_link_self(link_id)`·`relink_family_link_self(link_id)`([SDB-19] 소유 재확인 후 지정 칼럼만; `patient_family_links` 직접 UPDATE/DELETE 정책 없음) + 가족링크 select RLS
  - `add_family_member(patient, name, birth_date, gender, relation, phone=None) -> UUID`(#3 phone nullable; [#59] 활성 링크 10명 상한; 같은 사람 재추가는 soft-delete된 기존 unique 링크를 **재활성화**) · `list_family_members(patient) -> list[dict]`([R5-02] 활성 링크만; 가족 phone이 null이면 보호자 번호 join) · `update_family_member(...)` · `unlink_family_member(...)`([R5-02] 링크만 비활성·환자 행 유지) · `link_existing_patient_by_otp(patient, ...) -> NoReturn`([R5-01] `AppError(status_code=501)`)

- [ ] **Step 1: 마이그레이션 실패 테스트** — `backend/tests/test_patient_family_link_rpcs.py`

```python
import pytest
from tests.conftest import seed_patient, seed_staff, set_session_auth

@pytest.mark.asyncio
async def test_link_rpcs_exist_and_block_direct_write(db_conn):
    # [SDB-19] 직접 UPDATE/DELETE는 막히고, 세 RPC만 링크를 바꾼다.
    exists = await db_conn.fetch(
        "select proname from pg_proc where proname in "
        "('update_family_link_relation_self','unlink_family_link_self','relink_family_link_self')")
    assert {r["proname"] for r in exists} == {
        "update_family_link_relation_self", "unlink_family_link_self", "relink_family_link_self"}
```
Run → Expected: FAIL(함수 없음).

- [ ] **Step 2: 마이그레이션 SQL** — `supabase/migrations/00018_patient_family_link_rpcs.sql`

```sql
-- [SDB-19] patient_family_links는 select만 authenticated에 열고, 변경은 RPC로만.
create policy "patients_can_read_own_family_links" on patient_family_links
  for select using (patient_owns(account_patient_id));

create or replace function update_family_link_relation_self(p_link_id uuid, p_relation text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_acct uuid;
begin
  select account_patient_id into v_acct from public.patient_family_links where id = p_link_id;
  if v_acct is null or not public.patient_owns(v_acct) then
    raise exception '본인이 등록한 가족만 수정할 수 있습니다.' using errcode = 'P0001';
  end if;
  update public.patient_family_links set relation = p_relation where id = p_link_id;
end; $$;

create or replace function unlink_family_link_self(p_link_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_acct uuid;
begin
  select account_patient_id into v_acct from public.patient_family_links where id = p_link_id;
  if v_acct is null or not public.patient_owns(v_acct) then
    raise exception '본인이 등록한 가족만 연결 해제할 수 있습니다.' using errcode = 'P0001';
  end if;
  update public.patient_family_links set is_active = false, unlinked_at = now() where id = p_link_id;
end; $$;

create or replace function relink_family_link_self(p_link_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_acct uuid;
begin
  select account_patient_id into v_acct from public.patient_family_links where id = p_link_id;
  if v_acct is null or not public.patient_owns(v_acct) then
    raise exception '본인이 등록한 가족만 재연결할 수 있습니다.' using errcode = 'P0001';
  end if;
  update public.patient_family_links set is_active = true, unlinked_at = null where id = p_link_id;
end; $$;

revoke execute on function update_family_link_relation_self(uuid, text) from public;
revoke execute on function unlink_family_link_self(uuid) from public;
revoke execute on function relink_family_link_self(uuid) from public;
grant execute on function update_family_link_relation_self(uuid, text) to authenticated;
grant execute on function unlink_family_link_self(uuid) to authenticated;
grant execute on function relink_family_link_self(uuid) to authenticated;
```
Run → Expected: PASS.

- [ ] **Step 3: 서비스 실패 테스트** — `backend/tests/test_patient_family_service.py`

```python
from datetime import date
import pytest
from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.services import patient_family_service
from tests.conftest import seed_patient, set_session_auth

def _ctx(seed): return PatientContext(id=seed["patient_id"], auth_user_id=seed["auth_user_id"])

@pytest.mark.asyncio
async def test_add_list_update_unlink(db_conn):
    me = _ctx(await seed_patient(db_conn))
    fid = await patient_family_service.add_family_member(me, name="김자녀", birth_date=date(2015,5,5), gender="F", relation="자녀")
    assert (await patient_family_service.list_family_members(me))[0]["name"] == "김자녀"
    await patient_family_service.update_family_member(me, fid, name="김자녀2", birth_date=date(2015,5,5), gender="F", relation="자녀")
    assert (await patient_family_service.list_family_members(me))[0]["name"] == "김자녀2"
    await patient_family_service.unlink_family_member(me, fid)
    assert await patient_family_service.list_family_members(me) == []
    # [R5-02] 링크만 비활성 — 환자 행은 그대로 살아 있다(과거 이력 표시).
    assert await db_conn.fetchval("select is_active from patients where id=$1", fid) is True

@pytest.mark.asyncio
async def test_add_family_member_allows_null_phone(db_conn):
    # #3 — 전화 없는 가족도 등록된다.
    me = _ctx(await seed_patient(db_conn))
    fid = await patient_family_service.add_family_member(me, name="무전화", birth_date=date(2010,1,1), gender="M", relation="자녀", phone=None)
    assert await db_conn.fetchval("select phone from patients where id=$1", fid) is None

@pytest.mark.asyncio
async def test_ten_active_links_max(db_conn):
    # [#59] 활성 가족 링크는 10명까지.
    me = _ctx(await seed_patient(db_conn))
    for i in range(10):
        await patient_family_service.add_family_member(me, name=f"가족{i}", birth_date=date(2010,1,1), gender="M", relation="자녀")
    with pytest.raises(AppError) as e:
        await patient_family_service.add_family_member(me, name="열한번째", birth_date=date(2010,1,1), gender="M", relation="자녀")
    assert e.value.status_code == 409

@pytest.mark.asyncio
async def test_readd_reactivates_soft_deleted_link(db_conn):
    # 재연결 = 기존 unique 링크 재활성화(새 행/새 링크 안 만듦).
    me = _ctx(await seed_patient(db_conn))
    fid = await patient_family_service.add_family_member(me, name="자녀", birth_date=date(2010,1,1), gender="F", relation="자녀")
    await patient_family_service.unlink_family_member(me, fid)
    fid2 = await patient_family_service.add_family_member(me, name="자녀", birth_date=date(2010,1,1), gender="F", relation="자녀")
    assert fid2 == fid
    assert await db_conn.fetchval("select count(*) from patient_family_links where account_patient_id=$1", me.id) == 1

@pytest.mark.asyncio
async def test_link_existing_patient_is_blocked_501(db_conn):
    # [R5-01] 본인확인 창구(4단계) 전까지 기존 환자 OTP 연결은 501로 막는다.
    me = _ctx(await seed_patient(db_conn))
    with pytest.raises(AppError) as e:
        await patient_family_service.link_existing_patient_by_otp(me, phone="010-1111-2222", otp="000000")
    assert e.value.status_code == 501
```
Run → Expected: FAIL(모듈 없음).

- [ ] **Step 4: `patient_family_service.py` 구현**

```python
from datetime import date
from uuid import UUID
from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as, get_pool

MAX_ACTIVE_FAMILY = 10  # [#59]

async def add_family_member(patient, name: str, birth_date: date, gender: str, relation: str, phone: str | None = None) -> UUID:
    # [R5-01] family_patient_id는 항상 새로 만드는 행(또는 기존 soft-delete 링크 재활성화)이라
    #         클라이언트가 남의 환자를 지목할 수 없다. get_pool() 서비스 역할로 쓴다(RLS는 select만 연다).
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            active = await conn.fetchval(
                "select count(*) from patient_family_links where account_patient_id=$1 and is_active", patient.id)
            if active >= MAX_ACTIVE_FAMILY:
                raise AppError(f"가족은 최대 {MAX_ACTIVE_FAMILY}명까지 등록할 수 있습니다.", status_code=409)
            # 같은 사람(이름·생년월일·성별 동일)에 soft-delete된 링크가 있으면 재활성화(새 행 안 만듦).
            existing = await conn.fetchrow(
                "select l.id link_id, l.family_patient_id from patient_family_links l "
                "join patients p on p.id = l.family_patient_id "
                "where l.account_patient_id=$1 and not l.is_active "
                "and p.name=$2 and p.birth_date=$3 and p.gender=$4",
                patient.id, name, birth_date, gender)
            if existing is not None:
                await conn.execute("update patient_family_links set is_active=true, unlinked_at=null where id=$1", existing["link_id"])
                return existing["family_patient_id"]
            family_id = await conn.fetchval(
                "insert into patients (name, birth_date, gender, phone) values ($1,$2,$3,$4) returning id",
                name, birth_date, gender, phone)  # #3 phone nullable
            await conn.execute(
                "insert into patient_family_links (account_patient_id, family_patient_id, relation) values ($1,$2,$3)",
                patient.id, family_id, relation)
    return family_id

async def list_family_members(patient) -> list[dict]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            "select p.id, p.name, p.birth_date, p.gender, l.relation, "
            "       coalesce(p.phone, acct.phone) as phone, (p.phone is null) as phone_borrowed "
            "from patient_family_links l "
            "join patients p on p.id = l.family_patient_id "
            "join patients acct on acct.id = l.account_patient_id "
            "where l.account_patient_id=$1 and l.is_active order by p.name", patient.id)  # [R5-02]
    return [{"id": r["id"], "name": r["name"], "birth_date": str(r["birth_date"]), "gender": r["gender"],
             "relation": r["relation"], "phone": r["phone"], "phone_borrowed": r["phone_borrowed"]} for r in rows]

async def update_family_member(patient, family_patient_id: UUID, name, birth_date, gender, relation) -> None:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        link = await conn.fetchrow(
            "select id from patient_family_links where account_patient_id=$1 and family_patient_id=$2",
            patient.id, family_patient_id)
        if link is None:
            raise AppError("본인이 등록한 가족만 수정할 수 있습니다.", status_code=403)
        await conn.execute("select update_patient_basic_info($1,$2,$3,$4)", family_patient_id, name, birth_date, gender)
        await conn.execute("select update_family_link_relation_self($1,$2)", link["id"], relation)  # [SDB-19]

async def unlink_family_member(patient, family_patient_id: UUID) -> None:
    # [R5-02] 링크만 비활성 — patients.is_active는 그대로(과거 이력 표시 유지).
    async with acquire_as(str(patient.auth_user_id)) as conn:
        link = await conn.fetchrow(
            "select id from patient_family_links where account_patient_id=$1 and family_patient_id=$2 and is_active",
            patient.id, family_patient_id)
        if link is None:
            raise AppError("본인이 등록한 가족만 연결 해제할 수 있습니다.", status_code=403)
        await conn.execute("select unlink_family_link_self($1)", link["id"])  # [SDB-19]

async def link_existing_patient_by_otp(patient, phone: str, otp: str):
    # [R5-01] 본인확인 창구(4단계) 전까지 막는다 — 통과시키면 본인확인 없이 연결된다.
    raise AppError("기존 환자 연결은 준비 중입니다. 병원 접수처에서 도와드립니다.", status_code=501)
```
Run → Expected: 전체 PASS.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/00018_patient_family_link_rpcs.sql backend/app/services/patient_family_service.py backend/tests/test_patient_family_link_rpcs.py backend/tests/test_patient_family_service.py
git commit -m "feat: 가족 CRUD 서비스 + 링크 RPC(00018) — 10명 상한·재연결·phone nullable·OTP연결 501차단(R5-01·R5-02·SDB-19)"
```

> 📌 `add_family_member`의 `phone` 인자는 #3(전화 없는 가족)이다 — 신규 가족은 번호 없이 등록되고 `list_family_members`가 보호자 번호를 빌려 `phone_borrowed=true`로 돌려준다(화면에서 마스킹 표시는 Task 25). `link_existing_patient_by_otp`의 501은 **4단계에서 해제**한다(원장 `HANDOVERS.md`에 남긴다).

---

## Task 4: 예약 카탈로그 + 예약 시간 단일 판정 서버 함수(`00019`) + `release_slot`

> **담당 규칙**: 없음(백엔드 계약). 예약 화면(Task 19·20)·홈(Task 16)이 소비한다.
>
> ⭐ **핵심**: `booking_deadline`·당일 30분 최소 여유·8주 한도를 **앱이 하드코딩하지 않는다** — DB 함수 `list_bookable_slots`가 한 곳에서 판정하고 앱·직원·챗봇이 같은 결과를 쓴다(#21·#45~#47, 색인 「예약 시간 판정 단일 서버 함수」).

**Files:**
- Create: `supabase/migrations/00019_bookable_slots.sql` · `backend/app/services/patient_catalog_service.py`
- Modify: `backend/app/services/slot_service.py`(`release_slot` 추가)
- Test: `backend/tests/test_bookable_slots.py` · `backend/tests/test_patient_catalog_service.py` · `backend/tests/test_slot_service.py`

**Interfaces:**
- Consumes: `PatientContext`(Task 2) · `acquire_as` · `appointment_slots(doctor_id, slot_date, start_time, status)`·`doctor_schedule_rules(booking_deadline, weekday)`(1단계 `00002`·`00005`) · `departments`·`staff` · **직원웹 T29 `get_public_hospital_info()`**(병원 주소·전화 — 여기서 만들지 않음)
- Produces:
  - SQL 함수 `list_bookable_slots(p_doctor_id uuid, p_date date) returns table(id uuid, start_time time)` — `status='빈시간'` + 당일은 `now()+30분` 이후 + `slot_date <= current_date+56` + `booking_deadline` 이전만
  - `list_departments(patient)`·`list_doctors(department_id, patient)`·`list_available_dates(doctor_id, patient)`(8주 이내 빈 날짜) · `list_available_slots(doctor_id, target_date, patient)`(→ `list_bookable_slots` 호출) · `get_hospital_info(patient) -> {hospital_address, hospital_phone}`(→ `get_public_hospital_info()`)
  - `slot_service.release_slot(slot_id, actor, conn=None)`(actor는 `.auth_user_id`)

- [ ] **Step 1: 단일 판정 함수 실패 테스트** — `backend/tests/test_bookable_slots.py`

```python
import pytest
from datetime import date, timedelta
from tests.conftest import seed_staff, set_session_auth

@pytest.mark.asyncio
async def test_bookable_slots_excludes_booked_past30min_and_beyond8weeks(db_conn):
    admin = await seed_staff(db_conn, role="admin"); await set_session_auth(db_conn, admin["auth_user_id"])
    doc = await seed_staff(db_conn, role="doctor")
    today = date.today()
    # 빈시간(미래) 1건, 예약됨 1건, 8주 초과 1건 → bookable은 미래 빈시간 1건만.
    await db_conn.execute("insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1,$2,'23:59','빈시간')", doc["staff_id"], today)
    await db_conn.execute("insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1,$2,'23:59','예약됨')", doc["staff_id"], today)
    await db_conn.execute("insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1,$2,'09:00','빈시간')", doc["staff_id"], today + timedelta(days=60))
    rows = await db_conn.fetch("select * from list_bookable_slots($1, $2)", doc["staff_id"], today)
    assert len(rows) == 1 and str(rows[0]["start_time"]) == "23:59:00"

@pytest.mark.asyncio
async def test_bookable_slots_today_requires_30min_buffer(db_conn):
    admin = await seed_staff(db_conn, role="admin"); await set_session_auth(db_conn, admin["auth_user_id"])
    doc = await seed_staff(db_conn, role="doctor")
    # 이미 지난(00:00) 당일 슬롯은 30분 여유 미달 → 제외.
    await db_conn.execute("insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1, current_date, '00:00', '빈시간')", doc["staff_id"])
    rows = await db_conn.fetch("select * from list_bookable_slots($1, current_date)", doc["staff_id"])
    assert rows == []
```
Run → Expected: FAIL(함수 없음).

- [ ] **Step 2: 마이그레이션 SQL** — `supabase/migrations/00019_bookable_slots.sql`

```sql
-- 예약 가능 슬롯 단일 판정. 앱·직원·챗봇이 같은 규칙(당일 30분 여유·8주·마감·빈시간)을 쓴다.
create or replace function list_bookable_slots(p_doctor_id uuid, p_date date)
returns table(id uuid, start_time time)
language sql stable security definer set search_path = '' as $$
  select s.id, s.start_time
  from public.appointment_slots s
  where s.doctor_id = p_doctor_id
    and s.slot_date = p_date
    and s.status = '빈시간'
    and p_date <= current_date + 56                -- 8주(56일) 이내
    and (p_date > current_date                     -- 미래 날짜는 시간 제한 없음
         or (now() + interval '30 minutes')::time < s.start_time)  -- 당일은 30분 최소 여유
    and not exists (                               -- doctor_schedule_rules.booking_deadline 이후면 제외
      select 1 from public.doctor_schedule_rules d
      where d.doctor_id = p_doctor_id
        -- weekday는 파이썬 date.weekday() 컨벤션(월0~일6, 00002 check 0~6). isodow는 월1~일7이라 -1로 맞춘다.
        and d.weekday = extract(isodow from p_date)::int - 1
        and d.booking_deadline is not null
        and s.start_time > d.booking_deadline)
  order by s.start_time;
$$;
revoke execute on function list_bookable_slots(uuid, date) from public;
grant execute on function list_bookable_slots(uuid, date) to authenticated;
```
Run → Expected: PASS.

- [ ] **Step 3: 카탈로그 서비스 실패 테스트** — `backend/tests/test_patient_catalog_service.py`

```python
from datetime import date
from unittest.mock import patch
import pytest
from app.core.patient_security import PatientContext
from app.services import patient_catalog_service
from tests.conftest import seed_patient, seed_staff, set_session_auth

def _ctx(s): return PatientContext(id=s["patient_id"], auth_user_id=s["auth_user_id"])

@pytest.mark.asyncio
async def test_list_departments_active_only(db_conn):
    admin = await seed_staff(db_conn, role="admin"); await set_session_auth(db_conn, admin["auth_user_id"])
    await db_conn.execute("insert into departments (name, is_active) values ('내과', true)")
    await db_conn.execute("insert into departments (name, is_active) values ('폐과', false)")
    depts = await patient_catalog_service.list_departments(_ctx(await seed_patient(db_conn)))
    assert [d["name"] for d in depts] == ["내과"]

@pytest.mark.asyncio
async def test_available_slots_uses_bookable_function(db_conn):
    admin = await seed_staff(db_conn, role="admin"); await set_session_auth(db_conn, admin["auth_user_id"])
    doc = await seed_staff(db_conn, role="doctor")
    await db_conn.execute("insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1,'2999-01-01','09:00','빈시간')", doc["staff_id"])
    await db_conn.execute("insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1,'2999-01-01','09:20','예약됨')", doc["staff_id"])
    slots = await patient_catalog_service.list_available_slots(doc["staff_id"], date(2999,1,1), _ctx(await seed_patient(db_conn)))
    assert [str(s["start_time"]) for s in slots] == ["09:00:00"]

@pytest.mark.asyncio
async def test_hospital_info_uses_public_rpc(db_conn):
    # 병원 주소·전화는 직원웹 T29의 좁은 창구 get_public_hospital_info()로만 가져온다(HSETX-SEC-01).
    ctx = _ctx(await seed_patient(db_conn))
    with patch("app.services.patient_catalog_service.get_public_hospital_info",
               return_value={"hospital_address": "서울 강남", "hospital_phone": "02-1234-5678"}):
        info = await patient_catalog_service.get_hospital_info(ctx)
    assert info["hospital_address"] == "서울 강남"
```
Run → Expected: FAIL(모듈 없음).

- [ ] **Step 4: `patient_catalog_service.py` 구현**

```python
from datetime import date
from uuid import UUID
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as
from app.services.settings_service import get_public_hospital_info  # 직원웹 T29 소유

async def list_departments(patient: PatientContext) -> list[dict]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch("select id, name from departments where is_active order by name")
    return [dict(r) for r in rows]

async def list_doctors(department_id: UUID, patient: PatientContext) -> list[dict]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            "select id, name from staff where role='doctor' and department_id=$1 and is_active order by name",
            department_id)
    return [dict(r) for r in rows]

async def list_available_dates(doctor_id: UUID, patient: PatientContext) -> list[str]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            "select distinct slot_date from appointment_slots "
            "where doctor_id=$1 and status='빈시간' and slot_date between current_date and current_date+56 "
            "order by slot_date", doctor_id)  # 8주 이내
    return [str(r["slot_date"]) for r in rows]

async def list_available_slots(doctor_id: UUID, target_date: date, patient: PatientContext) -> list[dict]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch("select id, start_time from list_bookable_slots($1, $2)", doctor_id, target_date)
    return [{"id": r["id"], "start_time": r["start_time"]} for r in rows]

async def get_hospital_info(patient: PatientContext) -> dict:
    return await get_public_hospital_info()  # HSETX-SEC-01 — 주소·전화만
```

- [ ] **Step 5: `release_slot` 추가 + 테스트** — `backend/app/services/slot_service.py`

```python
async def release_slot(slot_id: UUID, actor, conn=None) -> None:
    async def _run(c):
        await c.execute("update appointment_slots set status='빈시간' where id=$1", slot_id)
    if conn is not None:
        await _run(conn); return
    async with acquire_as(str(actor.auth_user_id)) as c:
        await _run(c)
```
`test_slot_service.py`에 예약됨→빈시간 복귀 테스트 추가. Run → Expected: 전체 PASS.

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/00019_bookable_slots.sql backend/app/services/patient_catalog_service.py backend/app/services/slot_service.py backend/tests/test_bookable_slots.py backend/tests/test_patient_catalog_service.py backend/tests/test_slot_service.py
git commit -m "feat: 예약 카탈로그 + list_bookable_slots 단일 판정 함수(00019) + release_slot (#21·#45~47)"
```

> 📌 `list_bookable_slots`는 **직원·챗봇도 같은 함수를 호출**해 슬롯 표시를 일치시킨다(색인 「단일 서버 함수」). 대기시간 `estimated_wait_minutes`(#21 당일 앞사람)는 예약 카탈로그가 아니라 **당일 대기 조회**의 몫이라 Task 8(이력·대기)·홈이 소비한다.

---

## Task 5: 예약 생성/변경 서비스 — 요청 UUID 멱등성(`00020`) · `updated_at` 낙관적 잠금 · 변경 시 문진 계보 유지

> **담당 규칙**: 없음(백엔드 계약). 예약 신청 화면(Task 20)·변경 화면(Task 22)이 이 서비스를 소비한다.
>
> ⭐ **세 가지 새 계약을 옛 플랜 Task 8(`plans/2026-07-27-patient-app.md:1994~2301`) 위에 얹는다**:
> 1. **요청 UUID 멱등성(갭 #15)** — 앱이 예약 요청마다 고유 `request_id`를 만들어 보내고, 서버가 같은 `(account_patient_id, request_id)`를 이미 처리했으면 **새로 만들지 않고 기존 예약을 그대로 돌려준다.** 통신 유실 후 재신청·연타로 **예약이 두 건 생기는 것**을 DB `unique` 제약으로 막는다(§8 원자성 #4와 같은 패턴).
> 2. **낙관적 잠금(`APPT-RACE-01`, 갭 #12)** — 변경은 화면이 열 때 받은 `updated_at`을 함께 보낸다. 서버 값이 다르면 **409**(그 사이 병원·가족이 먼저 바꿨다는 뜻). 화면(Task 22)은 409를 받아 카드를 새로 그린다(`APPT-RACE-02`).
> 3. **문진 계보 유지(`APPT-CHG-10·11`, 결정 C-6·갭 #18)** — 변경은 실제로 **취소 + 새 예약**이라 `appointment_id`에 매인 문진이 사라진다. 변경 트랜잭션 안에서 기존 `questionnaire_responses`를 **새 예약으로 옮긴다**(같은 과라 `template_id` 유효). **작성 시각(`submitted_at`)은 그대로 둔다** — 옮겼다고 새로 찍으면 사실이 아닌 값이 된다.
>
> ⚠️ **옛 플랜의 `raise AppError(str(exc))`(예외 원문 노출)를 답습하지 않는다** — DB 예외 원문을 환자에게 그대로 보이면 안 된다(직원웹 결정 #20과 같은 원칙). 일반 실패는 안전 문구로 감싼다.
>
> ⚠️ **`auto_confirm_app_bookings` 칸은 1단계에 없다**(00004는 `cancellation_deadline_hours`만). #29(AD-051)로 신설되며, **기본값이 `true`**라 앱 예약의 기본 결과는 **`예약확정`**이다(옛 플랜의 「기본은 예약신청」을 뒤집는다). 이 칸의 **설정 화면은 직원웹 T29(`00035`) 소유**지만, 예약 생성이 반드시 읽어야 하고 의존 순서상 화면보다 앞서므로 **칸의 물리적 생성은 `00020`이 `add column if not exists`로** 한다(직원웹 `00035`도 같은 문장 — 「먼저 적용하는 쪽 우선」, 충돌 없음).

**Files:**
- Create: `supabase/migrations/00020_booking_idempotency.sql` · `backend/app/services/patient_booking_service.py`
- Test: `backend/tests/test_patient_booking_service.py`

**Interfaces:**
- Consumes: `PatientContext`(Task 2) · `acquire_as`(1단계 `app.db.pool`) · `AppError`(1단계 `app.core.errors`) · `slot_service.book_slot(slot_id, actor, conn=None) -> bool`(1단계) · `slot_service.release_slot(slot_id, actor, conn=None)`(Task 4) · `appointments`·`appointment_slots`·`hospital_settings`·`doctor_schedule_rules`·`questionnaire_responses`(1단계) · 트리거 `assign_booking_code()`(booking_code 자동 발급 — 여기서 안 건드림) · `set_config('app.status_change_reason', …)` → `log_appointment_status_change()`(Task 1 재정의)
- Produces:
  - SQL: `appointments.request_id uuid`(멱등 키) + `unique index (account_patient_id, request_id)`(NULL은 여러 개 허용 → 직원·챗봇 예약은 무제한) · `hospital_settings.auto_confirm_app_bookings boolean default true`(if not exists) · SECURITY DEFINER 함수 `move_questionnaire_response(p_old_appointment_id uuid, p_new_appointment_id uuid)`
  - `patient_booking_service.create_booking(patient: PatientContext, for_patient_id: UUID, department_id: UUID, doctor_id: UUID, slot_id: UUID, reason: str, request_id: UUID, source: str = 'app') -> UUID`
  - `patient_booking_service.change_booking(patient: PatientContext, appointment_id: UUID, new_slot_id: UUID, reason: str, expected_updated_at: datetime) -> UUID`

- [ ] **Step 1: 마이그레이션 실패 테스트** — `backend/tests/test_patient_booking_service.py`(상단)

```python
import pytest
from datetime import datetime
from uuid import uuid4, UUID

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.services import patient_booking_service
from tests.conftest import seed_patient, seed_staff, set_session_auth


def _ctx(seed: dict) -> PatientContext:
    return PatientContext(id=seed["patient_id"], auth_user_id=seed["auth_user_id"])


async def _seed_base(db_conn):
    """예약 한 건을 만들 수 있는 최소 데이터. 담당의 소속 과 = 예약 과(1단계 정합성 트리거)."""
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await db_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2999-08-01', '09:00') returning id",
        doctor["staff_id"])
    return {"dept_id": dept_id, "doctor_id": doctor["staff_id"], "slot_id": slot_id,
            "patient": _ctx(await seed_patient(db_conn))}


@pytest.mark.asyncio
async def test_migration_adds_request_id_and_qnr_mover(db_conn):
    # 멱등 키 칸 + 계정별 유니크 + 문진 이동 함수가 실재해야 한다.
    assert await db_conn.fetchval(
        "select 1 from information_schema.columns "
        "where table_name='appointments' and column_name='request_id'") == 1
    assert await db_conn.fetchval(
        "select 1 from information_schema.columns "
        "where table_name='hospital_settings' and column_name='auto_confirm_app_bookings'") == 1
    assert await db_conn.fetchval(
        "select 1 from pg_proc where proname='move_questionnaire_response'") == 1
```
Run → Expected: FAIL(칸·함수 없음).

- [ ] **Step 2: 마이그레이션 SQL** — `supabase/migrations/00020_booking_idempotency.sql`

```sql
-- 갭 #15: 예약 생성 멱등 키. 같은 (계정, 요청 UUID)는 예약 한 건만 만든다.
-- request_id가 NULL이면 유니크 검사에 걸리지 않으므로 직원·챗봇 예약(요청 UUID 없음)은 무제한.
alter table appointments add column request_id uuid;
create unique index idx_appointments_account_request
  on appointments (account_patient_id, request_id);

-- #29(AD-051): 앱 예약 자동확정 기본값 true. 설정 화면은 직원웹 T29(00035) 소유이나
-- 예약 생성이 반드시 읽어야 하고 의존 순서상 앞서므로 칸의 물리적 생성은 여기서 한다.
-- 직원웹 00035도 같은 문장을 써도 무해하다(먼저 적용하는 쪽 우선).
alter table hospital_settings
  add column if not exists auto_confirm_app_bookings boolean not null default true;

-- 갭 #18 / 결정 C-6: 예약 변경(취소+새 예약) 시 사전문진을 새 예약으로 옮긴다.
-- 환자 세션 RLS를 우회하되(security definer) 두 예약이 같은 계정·같은 대상 환자 소유인지
-- 함수가 직접 검증한다. submitted_at은 건드리지 않아 실제 작성 시각이 유지된다(APPT-CHG-11).
create or replace function move_questionnaire_response(
  p_old_appointment_id uuid, p_new_appointment_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_old_owner uuid; v_old_for uuid; v_new_owner uuid; v_new_for uuid;
begin
  select account_patient_id, for_patient_id into v_old_owner, v_old_for
    from public.appointments where id = p_old_appointment_id;
  select account_patient_id, for_patient_id into v_new_owner, v_new_for
    from public.appointments where id = p_new_appointment_id;
  if v_old_owner is null or v_new_owner is null
     or v_old_owner <> v_new_owner or v_old_for <> v_new_for then
    raise exception 'questionnaire move: appointment ownership mismatch';
  end if;
  update public.questionnaire_responses
    set appointment_id = p_new_appointment_id
    where appointment_id = p_old_appointment_id;  -- submitted_at 유지
end;
$$;
revoke execute on function move_questionnaire_response(uuid, uuid) from public;
grant execute on function move_questionnaire_response(uuid, uuid) to authenticated;
```
Run → Expected: PASS(Step 1 테스트).

- [ ] **Step 3: 생성 서비스 실패 테스트** — 같은 파일에 이어서

```python
@pytest.mark.asyncio
async def test_create_booking_auto_confirms_by_default(db_conn):
    # #29(AD-051): auto_confirm 기본값 true → 앱 예약의 기본 결과는 예약확정.
    ctx = await _seed_base(db_conn)
    aid = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=ctx["slot_id"], reason="감기", request_id=uuid4())
    row = await db_conn.fetchrow("select status, source from appointments where id=$1", aid)
    assert row["status"] == "예약확정" and row["source"] == "app"
    assert await db_conn.fetchval("select status from appointment_slots where id=$1", ctx["slot_id"]) == "예약됨"


@pytest.mark.asyncio
async def test_create_booking_requests_when_auto_confirm_off(db_conn):
    ctx = await _seed_base(db_conn)
    await db_conn.execute("update hospital_settings set auto_confirm_app_bookings=false")
    aid = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=ctx["slot_id"], reason="감기", request_id=uuid4())
    assert await db_conn.fetchval("select status from appointments where id=$1", aid) == "예약신청"


@pytest.mark.asyncio
async def test_create_booking_is_idempotent_on_same_request_id(db_conn):
    # 갭 #15: 같은 request_id로 두 번 → 같은 예약 하나만. 두 번째는 book_slot 없이 기존 걸 돌려준다.
    ctx = await _seed_base(db_conn)
    rid = uuid4()
    first = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=ctx["slot_id"], reason="감기", request_id=rid)
    second = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=ctx["slot_id"], reason="감기", request_id=rid)
    assert first == second
    assert await db_conn.fetchval("select count(*) from appointments where account_patient_id=$1", ctx["patient"].id) == 1


@pytest.mark.asyncio
async def test_create_booking_rejects_source_staff(db_conn):
    # source는 4단계 챗봇과 공유하는 계약이지만 환자 경로는 'app'/'chatbot'만. 'staff'는 거부.
    ctx = await _seed_base(db_conn)
    with pytest.raises(AppError) as e:
        await patient_booking_service.create_booking(
            ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
            doctor_id=ctx["doctor_id"], slot_id=ctx["slot_id"], reason="감기", request_id=uuid4(), source="staff")
    assert e.value.status_code == 400


@pytest.mark.asyncio
async def test_create_booking_fails_when_slot_taken(db_conn):
    ctx = await _seed_base(db_conn)
    await db_conn.execute("update appointment_slots set status='예약됨' where id=$1", ctx["slot_id"])
    with pytest.raises(AppError) as e:
        await patient_booking_service.create_booking(
            ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
            doctor_id=ctx["doctor_id"], slot_id=ctx["slot_id"], reason="감기", request_id=uuid4())
    assert e.value.status_code == 409
```
Run → Expected: FAIL(모듈 없음).

- [ ] **Step 4: 변경 서비스 실패 테스트(낙관적 잠금 + 문진 계보)** — 같은 파일에 이어서

```python
async def _make_appointment(db_conn, ctx, slot_id):
    return await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=slot_id, reason="감기", request_id=uuid4())


@pytest.mark.asyncio
async def test_change_booking_moves_questionnaire_keeping_submitted_at(db_conn):
    # APPT-CHG-10·11 / C-6: 문진이 새 예약으로 옮겨지고 작성 시각은 그대로.
    ctx = await _seed_base(db_conn)
    new_slot = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,'2999-08-03','10:00') returning id",
        ctx["doctor_id"])
    old_id = await _make_appointment(db_conn, ctx, ctx["slot_id"])
    tid = await db_conn.fetchval("insert into questionnaire_templates (department_id, questions) values ($1, '[]'::jsonb) returning id", ctx["dept_id"])
    orig_at = await db_conn.fetchval(
        "insert into questionnaire_responses (appointment_id, template_id, answers, submitted_at) "
        "values ($1,$2,'{}'::jsonb, '2999-07-30 08:00+00') returning submitted_at", old_id, tid)
    updated_at = await db_conn.fetchval("select updated_at from appointments where id=$1", old_id)

    new_id = await patient_booking_service.change_booking(
        ctx["patient"], old_id, new_slot, reason="시간 변경", expected_updated_at=updated_at)

    assert await db_conn.fetchval("select status from appointments where id=$1", old_id) == "환자취소"
    assert await db_conn.fetchval("select status from appointment_slots where id=$1", ctx["slot_id"]) == "빈시간"
    moved = await db_conn.fetchrow("select appointment_id, submitted_at from questionnaire_responses where template_id=$1", tid)
    assert moved["appointment_id"] == new_id and moved["submitted_at"] == orig_at  # 시각 유지


@pytest.mark.asyncio
async def test_change_booking_rejects_stale_updated_at(db_conn):
    # APPT-RACE-01 (갭 #12): 화면이 보낸 updated_at이 서버와 다르면 409, 슬롯은 그대로.
    ctx = await _seed_base(db_conn)
    new_slot = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,'2999-08-03','10:00') returning id",
        ctx["doctor_id"])
    old_id = await _make_appointment(db_conn, ctx, ctx["slot_id"])
    stale = datetime.fromisoformat("2000-01-01T00:00:00+00:00")
    with pytest.raises(AppError) as e:
        await patient_booking_service.change_booking(
            ctx["patient"], old_id, new_slot, reason="시간 변경", expected_updated_at=stale)
    assert e.value.status_code == 409
    assert await db_conn.fetchval("select status from appointment_slots where id=$1", new_slot) == "빈시간"  # 점유 안 함
```
Run → Expected: FAIL(모듈 없음).

- [ ] **Step 5: `patient_booking_service.py` 구현**

```python
from datetime import datetime
from uuid import UUID

import asyncpg

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as
from app.services.slot_service import book_slot, release_slot

CHANGEABLE_STATUSES = ("예약신청", "예약확정")
PATIENT_SOURCES = ("app", "chatbot")  # 'staff'는 직원 경로 전용 — 환자 서비스는 거부(4단계 챗봇 공유 계약)


async def _initial_status(conn) -> str:
    auto = await conn.fetchval("select auto_confirm_app_bookings from hospital_settings")
    return "예약확정" if auto else "예약신청"  # #29(AD-051) 기본 true


async def _is_after_booking_deadline(conn, slot_id: UUID) -> bool:
    """오늘 진료분 슬롯에 한해 그 요일 booking_deadline을 지났는지. 미래 슬롯은 항상 False."""
    from zoneinfo import ZoneInfo
    slot = await conn.fetchrow("select doctor_id, slot_date from appointment_slots where id=$1", slot_id)
    if slot is None:
        return False
    now_kst = datetime.now(ZoneInfo("Asia/Seoul"))
    if slot["slot_date"] != now_kst.date():
        return False
    rule = await conn.fetchrow(
        "select booking_deadline from doctor_schedule_rules where doctor_id=$1 and weekday=$2",
        slot["doctor_id"], slot["slot_date"].weekday())
    if rule is None or rule["booking_deadline"] is None:
        return False
    return now_kst.time() > rule["booking_deadline"]


async def create_booking(patient: PatientContext, for_patient_id: UUID, department_id: UUID,
                         doctor_id: UUID, slot_id: UUID, reason: str, request_id: UUID,
                         source: str = "app") -> UUID:
    """갭 #15: request_id로 멱등. 같은 (계정, request_id)는 예약 한 건만. source는 챗봇 공유 계약.
    상태 이력은 log_appointment_status_change() 트리거가 INSERT 시 자동으로 남긴다."""
    if source not in PATIENT_SOURCES:
        raise AppError("허용되지 않은 예약 경로입니다.", status_code=400)
    async with acquire_as(str(patient.auth_user_id)) as conn:
        # 멱등 1차: 같은 요청을 이미 처리했으면 슬롯을 잡지 않고 그대로 돌려준다.
        existing = await conn.fetchval(
            "select id from appointments where account_patient_id=$1 and request_id=$2",
            patient.id, request_id)
        if existing is not None:
            return existing

        if await _is_after_booking_deadline(conn, slot_id):
            raise AppError("오늘 진료분 예약은 마감되었습니다. 상담을 통해 문의해주세요.", status_code=409)
        if not await book_slot(slot_id, patient, conn=conn):
            raise AppError("이미 선택된 시간입니다. 다른 시간을 선택해주세요.", status_code=409)

        status = await _initial_status(conn)
        try:
            return await conn.fetchval(
                "insert into appointments "
                "(slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason, status, source, request_id) "
                "values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
                slot_id, patient.id, for_patient_id, department_id, doctor_id, reason, status, source, request_id)
        except asyncpg.UniqueViolationError:
            # 멱등 2차(경쟁): 거의 동시에 온 같은 request_id가 유니크에 걸렸다 →
            # 슬롯을 되돌리고 먼저 만들어진 예약을 돌려준다(예약은 여전히 한 건).
            await release_slot(slot_id, patient, conn=conn)
            winner = await conn.fetchval(
                "select id from appointments where account_patient_id=$1 and request_id=$2",
                patient.id, request_id)
            if winner is not None:
                return winner
            raise AppError("예약 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.", status_code=409)
        except asyncpg.PostgresError as exc:  # 원문 노출 금지 — 서버 로그로만
            raise AppError("예약을 만들 수 없습니다. 입력을 확인해주세요.", status_code=400) from exc


async def change_booking(patient: PatientContext, appointment_id: UUID, new_slot_id: UUID,
                         reason: str, expected_updated_at: datetime) -> UUID:
    """변경 = 옛 예약 취소 + 새 예약. APPT-RACE-01 낙관적 잠금, APPT-CHG-10·11 문진 이동."""
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select slot_id, status, for_patient_id, department_id, updated_at from appointments where id=$1",
            appointment_id)
        if row is None:
            raise AppError("예약을 찾을 수 없습니다.", status_code=404)
        # APPT-RACE-01: 화면이 열 때 본 버전과 다르면, 그 사이 병원·가족이 먼저 바꿨다는 뜻.
        if row["updated_at"] != expected_updated_at:
            raise AppError("예약이 이미 변경되었습니다.", status_code=409)
        if row["status"] not in CHANGEABLE_STATUSES:
            raise AppError("이미 취소되었거나 완료된 예약은 변경할 수 없습니다.", status_code=400)

        new_slot = await conn.fetchrow("select doctor_id from appointment_slots where id=$1", new_slot_id)
        if new_slot is None:
            raise AppError("선택한 시간을 찾을 수 없습니다.", status_code=404)
        if not await book_slot(new_slot_id, patient, conn=conn):
            raise AppError("이미 선택된 시간입니다. 다른 시간을 선택해주세요.", status_code=409)

        try:
            await conn.execute("select set_config('app.status_change_reason', '예약 변경으로 인한 자동 취소', true)")
            await conn.execute("update appointments set status='환자취소', updated_at=now() where id=$1", appointment_id)
            if row["slot_id"] is not None:
                await release_slot(row["slot_id"], patient, conn=conn)
            new_status = await _initial_status(conn)
            new_id = await conn.fetchval(
                "insert into appointments "
                "(slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason, status, source) "
                "values ($1,$2,$3,$4,$5,$6,$7,'app') returning id",
                new_slot_id, patient.id, row["for_patient_id"], row["department_id"],
                new_slot["doctor_id"], reason, new_status)
            # APPT-CHG-10·11 / C-6: 문진을 새 예약으로 옮긴다(작성 시각 유지). 새 예약([새로 예약하기])엔 적용 안 함.
            await conn.execute("select move_questionnaire_response($1, $2)", appointment_id, new_id)
        except asyncpg.PostgresError as exc:
            raise AppError("예약을 변경할 수 없습니다. 잠시 후 다시 시도해주세요.", status_code=400) from exc
    return new_id
```

- [ ] **Step 6: 전체 테스트 실행**

Run: `cd backend && pytest tests/test_patient_booking_service.py -v`
Expected: 8개 PASS(마이그레이션 1 + 생성 4 + 변경 2 + source 1).

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/00020_booking_idempotency.sql backend/app/services/patient_booking_service.py backend/tests/test_patient_booking_service.py
git commit -m "feat: 📝 환자앱 Task 5 본문 — 예약 생성/변경 서비스(멱등 00020·낙관적 잠금·문진 계보 C-6)"
```

> 📌 **`source` 계약**: 4단계 AI 상담봇이 이 서비스를 `source='chatbot'`으로 재사용한다(색인 「예약 서비스 공유」). 앱 라우터(Task 10)는 `source`를 클라이언트로부터 받지 않고 기본값 `'app'`을 쓴다 — 앱 API로는 source 조작 불가. 이 시그니처를 바꾸면 4단계 문서도 갱신한다.
> 📌 **`request_id`는 화면(Task 20)이 만든다** — 마법사 진입 때 한 번 만들어 8단계 신청까지 유지하고, `BusyButton` 연타·통신 유실 재신청 모두 같은 `request_id`를 보낸다(그래야 멱등이 실효). 취소/재진입으로 새로 예약하면 새 `request_id`.
> 📌 **낙관적 잠금 문구는 화면(Task 22)이 만든다** — 서버는 409만 돌려주고, 화면이 `APPT-RACE-03·04`(누가·무엇으로 바뀌었는지)를 재조회해 그린다. 취소 경로의 낙관적 잠금은 **Task 6**이 같은 `expected_updated_at` 방식으로 받는다.
