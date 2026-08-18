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
| **2 홈·카드·QR·알림함** | `HOME-*`·`CARD-*`·`QR-*`·`NOTI-*`·`NAV-HOME-*` | 182 | Task 15·16·17·18 |
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
| **15** | 예약 카드 위젯 + 상태 A(공통·요청·대기·미확정·변경) (38개) | `CARD-COMMON-*`·`CARD-REQ-*`·`CARD-WAIT-*`·`CARD-UNCONF-*`·`CARD-CHG-*` | 재작성 |
| **16** | 홈 프레임 + 하단 탭 셸 (43개) | `HOME-*`·`NAV-HOME-*` | 재작성 |
| **17** | 예약 카드 상태 B(지연·취소·완료·오프라인·문진·입장) + QR (70개) | `CARD-LATE-*`·`CARD-CXL-*`·`CARD-DONE-*`·`CARD-OFF-*`·`CARD-QNR-*`·`CARD-IN-*`·`CARD-OK-*`·`CARD-DOC-*`·`CARD-LIFE-*`·`QR-*` | 재작성 |
| **18** | 알림함 — 목록·읽음·비었음·목적지·갈곳없음 (30개) | `NOTI-*` | 재작성 |
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

**결번 없음**: 옛 `Task 15` 자리를 「예약 카드 위젯 + 상태 A」로 **되살렸다**(2026-08-18 — 옛 배정의 Task 16이 `HOME-*` 22개를 포함해 실측 **81규칙**, 70 초과라 2분할. 카드 위젯이 먼저(T15) → 홈이 소비(T16)라 실행 순서·번호 체계 모두 무손상).

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
async def seed_patient(conn, *, name="환자", phone="010-0000-0000", gender="F", with_auth=True, is_active=True):
    """환자 행(+선택적으로 auth.users)을 만들고 {auth_user_id, patient_id}를 돌려준다.
    gender는 patients.gender가 not null(00003, default 없음)이라 필수다 — 값은 'M'/'F'(Task 1·2가 쓰는 형식)."""
    auth_user_id = None
    if with_auth:
        auth_user_id = await conn.fetchval(
            "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
            f"{name}-{id(conn)}@test.local")
    patient_id = await conn.fetchval(
        "insert into patients (name, phone, gender, auth_user_id, is_active) values ($1,$2,$3,$4,$5) returning id",
        name, phone, gender, auth_user_id, is_active)
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
    # ⚠️ 핀(갭 #7, 경계 갭 대조표): 지금은 id·name만. 「예약 3단계 의사 소개」 화면(환자앱 T19)을 쓸 때
    #    전공·소개·사진을 함께 반환하도록 확장한다 — 칸은 직원웹 T19 STAFF-PROFILE 마이그레이션이 staff에 얹는다
    #    (그 스키마 확정 뒤 select에 추가). 사진은 버킷 경로/서명 URL.
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

---

## Task 6: 예약 취소 서비스 + 30분 유예(C-5) + 마감 후 공통 지원요청(`support_requested_at`)

> **담당 규칙**: 없음(백엔드 계약). 취소·마감후상담 화면(Task 22)이 `CANCEL-PRE-*`·`CANCEL-NEW-*`·`CANCEL-LATE-*`로 이 서비스를 소비한다.
>
> ⭐ **취소는 세 갈래다**(옛 플랜 Task 9 `plans/2026-07-27-patient-app.md:2302~2429`를 규칙에 맞게 재편):
> 1. **마감 전(`CANCEL-PRE-*`)** — 즉시 `환자취소` + 슬롯 반납. **사유 입력란 없음**(`CANCEL-PRE-05` — 즉시 처리라 받아도 쓸 곳이 없다 → `reason` 인자 없앰).
> 2. **갓 만든 예약 30분 유예(`CANCEL-NEW-*`, 결정 C-5)** — 만든 지 **30분 이내면 마감과 무관하게 즉시 취소.** 당일 예약 허용이 만든 구멍(취소 마감 기본 24h 전이라 오늘·내일 예약은 만든 순간 이미 마감 후)을 막는다. 기준값 `appointments.created_at + 30분`(`CANCEL-NEW-04` — 재료는 이미 있다).
> 3. **마감 후(`CANCEL-LATE-*`)** — ⭐ **`cancel_appointment`는 취소하지 않고 「마감 후」만 알린다.** `support_requested_at`을 **여기서 자동으로 채우지 않는다** — 화면이 안내 팝업을 띄우고(`CANCEL-LATE-01`), 환자가 **`[상담 채팅 연결]`을 눌러야** 별도 `request_support()`가 `support_requested_at`+`request_type='취소'`를 기록한다(`CANCEL-LATE-11` — 관문0의 `[닫기]`로 안 들어간 사람은 기록되지 않는다).
>
> ⚠️ **`cancellation_requested_at` 부활 금지** — ④ `00010`이 `support_requested_at`+`request_type('취소'/'변경')`으로 대체했다(옛 플랜 Task 9의 그 필드를 교체). 두 칸은 **상호 NULL 제약**(둘 다 있거나 둘 다 없거나, `00010`).
> ⚠️ **환자 노출 문구 금지(`CANCEL-LATE-13`)**: `취소 요청이 접수되었습니다`·`취소를 요청해 두었습니다`. **서버는 문구를 만들지 않는다** — 상태 dict만 돌려주고, 화면이 `상담 연결됨 · 직원 확인 중`을 그린다.
> ⚠️ **낙관적 잠금(`APPT-RACE-01`)은 취소에도** — `cancel_appointment`가 `expected_updated_at`을 받아 서버와 다르면 409(T5 `change_booking` 견본과 같은 방식).
> ⚠️ **마이그레이션 없음** — 필요한 칸은 전부 있다(`support_requested_at`·`request_type` = ④ `00010` · `cancellation_deadline_hours` = `00004` · `created_at` = `00005`).

**Files:**
- Modify: `backend/app/services/patient_booking_service.py`(`cancel_appointment`·`request_support` 추가)
- Test: `backend/tests/test_patient_booking_service.py`(취소·지원요청 테스트 추가)

**Interfaces:**
- Consumes: `PatientContext`(Task 2) · `acquire_as` · `AppError` · `release_slot(slot_id, actor, conn=None)`(Task 4) · `CHANGEABLE_STATUSES`(Task 5, 같은 모듈) · `appointments`·`appointment_slots`·`hospital_settings.cancellation_deadline_hours`(`00004`) · `appointment_status_history`(정책 `patients_can_insert_note_history` — Task 1) · `support_requested_at`·`request_type`(`00010`)
- Produces:
  - `patient_booking_service.cancel_appointment(patient: PatientContext, appointment_id: UUID, expected_updated_at: datetime) -> dict` — `{"cancelled": bool, "after_deadline": bool}`. `cancelled=True`면 즉시 취소됨(마감 전 또는 30분 유예). `cancelled=False, after_deadline=True`면 화면이 `CANCEL-LATE` 팝업을 띄운다.
  - `patient_booking_service.request_support(patient: PatientContext, appointment_id: UUID, request_type: str) -> dict` — `{"support_requested": bool, "already_requested": bool}`. `request_type`은 `'취소'`/`'변경'`.

- [ ] **Step 1: 취소 실패 테스트(마감 전·30분 유예·마감 후·낙관적 잠금)** — `test_patient_booking_service.py`에 추가

```python
from datetime import timedelta
from zoneinfo import ZoneInfo


async def _make_future_appt(db_conn, ctx, *, days=10):
    """마감(기본 24h 전)에 여유 있는 미래 슬롯 예약 하나."""
    d = (datetime.now(ZoneInfo("Asia/Seoul")) + timedelta(days=days)).date()
    slot = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,$2,'09:00') returning id",
        ctx["doctor_id"], d)
    aid = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=slot, reason="감기", request_id=uuid4())
    return aid, slot


@pytest.mark.asyncio
async def test_cancel_before_deadline_cancels_immediately(db_conn):
    # CANCEL-PRE: 마감 전이면 즉시 환자취소 + 슬롯 반납.
    ctx = await _seed_base(db_conn)
    aid, slot = await _make_future_appt(db_conn, ctx)
    uat = await db_conn.fetchval("select updated_at from appointments where id=$1", aid)
    result = await patient_booking_service.cancel_appointment(ctx["patient"], aid, expected_updated_at=uat)
    assert result == {"cancelled": True, "after_deadline": False}
    assert await db_conn.fetchval("select status from appointments where id=$1", aid) == "환자취소"
    assert await db_conn.fetchval("select status from appointment_slots where id=$1", slot) == "빈시간"


@pytest.mark.asyncio
async def test_cancel_within_30min_grace_ignores_deadline(db_conn):
    # CANCEL-NEW(C-5): 마감이 지난 오늘 슬롯이라도 만든 지 30분 이내면 즉시 취소된다.
    ctx = await _seed_base(db_conn)
    soon = (datetime.now(ZoneInfo("Asia/Seoul")) + timedelta(hours=1))
    slot = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,$2,$3) returning id",
        ctx["doctor_id"], soon.date(), soon.time().replace(microsecond=0))
    aid = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=slot, reason="감기", request_id=uuid4())  # 방금 생성 → 30분 이내
    uat = await db_conn.fetchval("select updated_at from appointments where id=$1", aid)
    result = await patient_booking_service.cancel_appointment(ctx["patient"], aid, expected_updated_at=uat)
    assert result == {"cancelled": True, "after_deadline": False}
    assert await db_conn.fetchval("select status from appointments where id=$1", aid) == "환자취소"


@pytest.mark.asyncio
async def test_cancel_after_deadline_does_not_cancel(db_conn):
    # CANCEL-LATE: 마감 후 + 30분 유예도 지났으면 취소하지 않고 after_deadline만 알린다(예약·슬롯 유지).
    ctx = await _seed_base(db_conn)
    soon = (datetime.now(ZoneInfo("Asia/Seoul")) + timedelta(hours=1))
    slot = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,$2,$3) returning id",
        ctx["doctor_id"], soon.date(), soon.time().replace(microsecond=0))
    aid = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=slot, reason="감기", request_id=uuid4())
    await db_conn.execute("update appointments set created_at = now() - interval '1 hour' where id=$1", aid)  # 30분 유예 소진
    uat = await db_conn.fetchval("select updated_at from appointments where id=$1", aid)
    result = await patient_booking_service.cancel_appointment(ctx["patient"], aid, expected_updated_at=uat)
    assert result == {"cancelled": False, "after_deadline": True}
    assert await db_conn.fetchval("select status from appointments where id=$1", aid) in ("예약신청", "예약확정")
    assert await db_conn.fetchval("select status from appointment_slots where id=$1", slot) == "예약됨"


@pytest.mark.asyncio
async def test_cancel_rejects_stale_updated_at(db_conn):
    # APPT-RACE-01: 취소도 낙관적 잠금. 화면이 본 버전과 다르면 409, 예약 그대로.
    ctx = await _seed_base(db_conn)
    aid, slot = await _make_future_appt(db_conn, ctx)
    stale = datetime.fromisoformat("2000-01-01T00:00:00+00:00")
    with pytest.raises(AppError) as e:
        await patient_booking_service.cancel_appointment(ctx["patient"], aid, expected_updated_at=stale)
    assert e.value.status_code == 409
    assert await db_conn.fetchval("select status from appointments where id=$1", aid) in ("예약신청", "예약확정")
```
Run → Expected: FAIL(`cancel_appointment` 없음).

- [ ] **Step 2: 지원요청 실패 테스트(기록·멱등)** — 같은 파일에 이어서

```python
@pytest.mark.asyncio
async def test_request_support_records_and_is_idempotent(db_conn):
    # CANCEL-LATE-11: [상담 채팅 연결]을 눌러야 support_requested_at+request_type 기록. 감사 note 1행.
    ctx = await _seed_base(db_conn)
    aid, _ = await _make_future_appt(db_conn, ctx)
    first = await patient_booking_service.request_support(ctx["patient"], aid, request_type="취소")
    assert first == {"support_requested": True, "already_requested": False}
    row = await db_conn.fetchrow("select support_requested_at, request_type from appointments where id=$1", aid)
    assert row["support_requested_at"] is not None and row["request_type"] == "취소"
    # 상태는 안 바뀐다(예약 유지). 감사 note는 from=to로 1행.
    notes = await db_conn.fetch(
        "select from_status, to_status from appointment_status_history "
        "where appointment_id=$1 and changed_by_patient_id is not null", aid)
    assert len(notes) == 1 and notes[0]["from_status"] == notes[0]["to_status"]
    # CANCEL-LATE-14: 이미 요청했으면 멱등(두 번째는 already_requested).
    second = await patient_booking_service.request_support(ctx["patient"], aid, request_type="취소")
    assert second == {"support_requested": True, "already_requested": True}


@pytest.mark.asyncio
async def test_request_support_rejects_bad_type(db_conn):
    ctx = await _seed_base(db_conn)
    aid, _ = await _make_future_appt(db_conn, ctx)
    with pytest.raises(AppError) as e:
        await patient_booking_service.request_support(ctx["patient"], aid, request_type="기타")
    assert e.value.status_code == 400
```
Run → Expected: FAIL(`request_support` 없음).

- [ ] **Step 3: `cancel_appointment`·`request_support` 구현** — `patient_booking_service.py`에 추가

```python
from datetime import timedelta
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
SUPPORT_TYPES = ("취소", "변경")


async def cancel_appointment(patient: PatientContext, appointment_id: UUID,
                             expected_updated_at: datetime) -> dict:
    """마감 전/30분 유예(C-5)면 즉시 취소, 마감 후면 after_deadline만 알린다(취소 안 함).
    CANCEL-PRE-05: 사유를 받지 않는다. 상태 이력은 트리거가 자동으로 남긴다."""
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select a.status, a.slot_id, a.created_at, a.updated_at, s.slot_date, s.start_time "
            "from appointments a left join appointment_slots s on s.id = a.slot_id where a.id=$1",
            appointment_id)
        if row is None:
            raise AppError("예약을 찾을 수 없습니다.", status_code=404)
        if row["updated_at"] != expected_updated_at:  # APPT-RACE-01
            raise AppError("예약이 이미 변경되었습니다.", status_code=409)
        if row["status"] not in CHANGEABLE_STATUSES:
            raise AppError("이미 취소되었거나 완료된 예약입니다.", status_code=400)

        now_kst = datetime.now(KST)
        # CANCEL-NEW-04(C-5): 만든 지 30분 이내면 마감과 무관하게 즉시 취소.
        within_grace = row["created_at"].astimezone(KST) + timedelta(minutes=30) > now_kst
        before_deadline = True
        if row["slot_date"] is not None:
            hours = await conn.fetchval("select cancellation_deadline_hours from hospital_settings")
            appt_dt = datetime.combine(row["slot_date"], row["start_time"], tzinfo=KST)
            before_deadline = now_kst <= appt_dt - timedelta(hours=hours)

        if within_grace or before_deadline:
            try:
                await conn.execute(
                    "update appointments set status='환자취소', updated_at=now() where id=$1", appointment_id)
            except asyncpg.PostgresError as exc:  # 원문 노출 금지
                raise AppError("예약을 취소할 수 없습니다. 잠시 후 다시 시도해주세요.", status_code=400) from exc
            if row["slot_id"] is not None:
                await release_slot(row["slot_id"], patient, conn=conn)
            return {"cancelled": True, "after_deadline": False}
        # 마감 후: 취소하지 않는다. 화면이 CANCEL-LATE 팝업 → [상담 채팅 연결] → request_support().
        return {"cancelled": False, "after_deadline": True}


async def request_support(patient: PatientContext, appointment_id: UUID, request_type: str) -> dict:
    """CANCEL-LATE-11: [상담 채팅 연결]을 눌렀을 때만 support_requested_at+request_type를 기록한다.
    이미 요청했으면 멱등(CANCEL-LATE-14). 상태는 바꾸지 않고, 감사 note만 from=to로 남긴다."""
    if request_type not in SUPPORT_TYPES:
        raise AppError("허용되지 않은 요청 종류입니다.", status_code=400)
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select status, support_requested_at from appointments where id=$1", appointment_id)
        if row is None:
            raise AppError("예약을 찾을 수 없습니다.", status_code=404)
        if row["status"] not in CHANGEABLE_STATUSES:
            raise AppError("이미 취소되었거나 완료된 예약입니다.", status_code=400)
        if row["support_requested_at"] is not None:  # CANCEL-LATE-14 멱등
            return {"support_requested": True, "already_requested": True}
        await conn.execute(
            "update appointments set support_requested_at=now(), request_type=$2, updated_at=now() where id=$1",
            appointment_id, request_type)
        # 상태변화 없는 감사 note(patients_can_insert_note_history) — from=to. 내부 기록이라 환자 노출 문구 아님.
        await conn.execute(
            "insert into appointment_status_history "
            "(appointment_id, from_status, to_status, changed_by_patient_id, reason) values ($1,$2,$2,$3,$4)",
            appointment_id, row["status"], patient.id, f"마감 후 {request_type} 상담 연결")
        return {"support_requested": True, "already_requested": False}
```

- [ ] **Step 4: 전체 테스트 실행**

Run: `cd backend && pytest tests/test_patient_booking_service.py -v`
Expected: 이전 8개 + 취소 4 + 지원요청 2 = **14개 PASS**.

- [ ] **Step 5: 커밋**

```bash
git add backend/app/services/patient_booking_service.py backend/tests/test_patient_booking_service.py
git commit -m "feat: 📝 환자앱 Task 6 본문 — 예약 취소(30분 유예 C-5·낙관적 잠금) + 마감 후 공통 지원요청(00010 support_requested_at)"
```

> 📌 **`request_support`는 취소와 변경 모두 쓴다**(`request_type='취소'`/`'변경'`) — 마감 후 **변경**도 취소와 같은 상담 연결이다(#26 결정). 변경 화면(Task 22)이 마감 후면 `change_booking` 대신 `request_support('변경')`를 부른다.
> 📌 **직원은 대기열이 아니라 `/today` 카드·예약 캘린더 ⚠에서 확인**한다(`CANCEL-LATE-11` — 취소요청 대기열 폐지). 이 요청을 직원웹이 읽는 창구(`support_requested_at is not null` 조회)는 직원웹 플랜이 소유한다.
> 📌 **화면(Task 22)이 그리는 것**: 마감 전 확인 팝업(`CANCEL-PRE-01~07`) · 마감 후 안내 팝업(`CANCEL-LATE-01~10`) · 연결 후 `상담 연결됨 · 직원 확인 중`+`아직 예약은 유지되고 있습니다`(`CANCEL-LATE-12`) · 중복 시 `상담 이어가기 ›`(`CANCEL-LATE-14`). 서버는 상태 dict만.

---

## Task 7: 사전문진 서비스 — 부분저장·완료 판정(`completed_at`, `00021`)·진행률 서버계산·성별 노출

> **담당 규칙**: 없음(백엔드 계약). 문진 작성 화면(Task 23)·표시 화면(Task 24)이 이 서비스를 소비한다.
>
> ⭐ **옛 플랜 Task 10(`plans/2026-07-27-patient-app.md:2651~2830`)에 다섯 계약을 얹는다**:
> 1. **완료 판정 별도 칸(`QNR-STATE-08`, 갭 #50)** — `submitted_at`은 저장할 때마다 갱신되어 완료 판정에 쓸 수 없다. `completed_at`을 새로 두고, **`[제출하기]`를 눌렀을 때만 찍는다**(`QNR-STATE-04` — 자동 저장으로는 안 찍힘). 상태 3종: 행 없음=`미작성` / `completed_at` NULL=`작성 중` / `completed_at` 있음=`작성완료`.
> 2. **부분저장(자동 저장)** — 문항을 넘길 때마다 `answers`를 UPDATE. `completed_at`은 건드리지 않는다.
> 3. **진행률 서버계산(`QNR-PROG-04`, 갭 #17)** — 분자=답 항목 수(빈 답도 지나갔으면 셈, `QNR-PROG-05`), 분모=**그 환자에게 보이는** 문항 수(「보일 대상」 적용 후). ⭐ **서버 한 곳에서 센다** — 앱·알림 배치가 각자 세지 않는다(예상 대기시간과 같은 처리).
> 4. **성별 노출(`QNR-SHOW-01`, 갭 #17)** — 문항의 `visible_to`(`모든 환자`/`여성 환자만`/`남성 환자만`)를 **진료받는 사람(`for_patient_id`)의 성별**과 대조. ⛔ 로그인한 사람이 아니다(딸이 아버지 문진을 써도 아버지 성별). 안 보이는 문항은 진행률 분모에서도 빠진다(`QNR-SHOW-05`).
> 5. **문항 스냅샷(`QNR-ID-02`)** — 답을 `{question_id, question_text, value}`로 저장한다(직원웹 T22 견본 `staff-web.md:4870`과 통일 — 의사 화면이 `question_id`로 매칭, 글자로 안 맞춤). `question_text`가 **그때 본 질문 글자**를 보존한다(관리자가 나중에 글자를 고쳐도 제출 기록은 옛 글자 그대로, `QNR-ID-06`).
>
> ⚠️ **수정 시점(#21)**: `EDITABLE_STATUSES = ("예약신청","예약확정","도착","진료대기")` — 요구사항 4.4 "진료 전까지 수정"을 스펙이 "도착 전까지"로 좁혔던 것을 되돌린다. **`진료중`부터 읽기 전용**. 서비스와 RLS 정책 **둘 다**에 건다(심층 방어).
> ⚠️ **template_id를 클라이언트에서 받지 않는다** — 서버가 예약의 `department_id`로 양식을 정한다(옛 플랜의 "다른 진료과 template_id 위조" 문제를 원천 차단).
> ⚠️ **문항 구조(`{id, text, type, required, visible_to}`)와 `question_id` 생산은 직원웹 T22**(`QADM-FORM-*`) — Task 7은 **소비만**. gender 값 형식은 `'M'`/`'F'`(재작성본 Task 1·2가 쓰는 형식).
> ⚠️ **RLS**: 재작성본 Task 1은 문진 **SELECT 정책만** 열었다 — INSERT/UPDATE 정책과 `grant update`는 **여기서** 연다.

**Files:**
- Create: `supabase/migrations/00021_questionnaire_completion.sql` · `backend/app/services/patient_questionnaire_service.py`
- Test: `backend/tests/test_patient_questionnaire_service.py`

**Interfaces:**
- Consumes: `PatientContext`(Task 2) · `acquire_as` · `AppError` · `questionnaire_templates(questions: [{id,text,type,required,visible_to}])`(직원웹 T22 생산) · `questionnaire_responses(appointment_id unique, template_id, answers, submitted_at)`(`00007`) · `appointments.department_id`·`status`·`for_patient_id` · `patients.gender` · `patient_owns()`(Task 1) · 정책 `patients_can_read_own_questionnaire`(Task 1)
- Produces:
  - SQL: `questionnaire_responses.completed_at timestamptz`(nullable) · 정책 `patients_can_insert_own_questionnaire`·`patients_can_update_own_questionnaire`(status ∈ EDITABLE) · `grant update on questionnaire_responses to authenticated`
  - `patient_questionnaire_service.get_template(patient, appointment_id) -> dict | None`(`{"id", "questions": [보이는 문항], "total"}`)
  - `patient_questionnaire_service.save_response(patient, appointment_id, answers: list[dict], complete: bool = False) -> dict`(`{"id", "state", "answered", "total"}`)
  - `patient_questionnaire_service.get_response(patient, appointment_id) -> dict | None`(`{"id", "answers", "state", "answered", "total", "completed_at"}`; 행 없으면 None=미작성)
  - 순수 함수 `compute_progress(questions, gender, answers) -> {"answered", "total"}`(알림 배치가 재사용 — `QNR-PROG-04`)

- [ ] **Step 1: 마이그레이션 실패 테스트** — `backend/tests/test_patient_questionnaire_service.py`(상단)

```python
import json
import pytest
from uuid import uuid4

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.services import patient_booking_service, patient_questionnaire_service
from tests.conftest import seed_patient, seed_staff, set_session_auth

_Q = json.dumps([
    {"id": "q1", "text": "증상은?", "type": "text", "required": True, "visible_to": "모든 환자"},
    {"id": "q2", "text": "임신 가능성?", "type": "yesno", "required": True, "visible_to": "여성 환자만"},
], ensure_ascii=False)


async def _seed_appt(db_conn, *, gender="F"):
    admin = await seed_staff(db_conn, role="admin"); await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    dept = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await db_conn.execute("update staff set department_id=$1 where id=$2", dept, doctor["staff_id"])
    await db_conn.execute("insert into questionnaire_templates (department_id, questions) values ($1,$2)", dept, _Q)
    slot = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,'2999-08-01','09:00') returning id",
        doctor["staff_id"])
    ps = await seed_patient(db_conn, gender=gender)
    me = PatientContext(id=ps["patient_id"], auth_user_id=ps["auth_user_id"])
    aid = await patient_booking_service.create_booking(
        me, for_patient_id=me.id, department_id=dept, doctor_id=doctor["staff_id"],
        slot_id=slot, reason="감기", request_id=uuid4())
    return {"me": me, "dept": dept, "appointment_id": aid}


@pytest.mark.asyncio
async def test_migration_adds_completed_at(db_conn):
    assert await db_conn.fetchval(
        "select 1 from information_schema.columns where table_name='questionnaire_responses' "
        "and column_name='completed_at'") == 1
```
Run → Expected: FAIL(칸 없음).

- [ ] **Step 2: 마이그레이션 SQL** — `supabase/migrations/00021_questionnaire_completion.sql`

```sql
-- QNR-STATE-08(갭 #50): submitted_at은 저장마다 갱신되어 완료 판정 불가 → 완료 전용 칸.
alter table questionnaire_responses add column completed_at timestamptz;

-- 환자 문진 INSERT/UPDATE. #21: 수정 가능 = 진료중 전(예약신청·확정·도착·진료대기). 서비스 EDITABLE_STATUSES와 이중 방어.
-- (재작성본 Task 1은 SELECT 정책만 열었다. 00007의 grant에는 update가 없어 여기서 연다.)
grant update on questionnaire_responses to authenticated;
create policy "patients_can_insert_own_questionnaire" on questionnaire_responses
  for insert with check (exists (
    select 1 from public.appointments a
    where a.id = questionnaire_responses.appointment_id
      and patient_owns(a.for_patient_id)
      and a.status in ('예약신청','예약확정','도착','진료대기')));
create policy "patients_can_update_own_questionnaire" on questionnaire_responses
  for update using (exists (
    select 1 from public.appointments a
    where a.id = questionnaire_responses.appointment_id
      and patient_owns(a.for_patient_id)
      and a.status in ('예약신청','예약확정','도착','진료대기')))
  with check (exists (
    select 1 from public.appointments a
    where a.id = questionnaire_responses.appointment_id
      and patient_owns(a.for_patient_id)
      and a.status in ('예약신청','예약확정','도착','진료대기')));
```
Run → Expected: PASS(Step 1).

- [ ] **Step 3: 서비스 실패 테스트(성별 필터·부분저장·완료·수정시점)** — 같은 파일에 이어서

```python
@pytest.mark.asyncio
async def test_get_template_filters_by_for_patient_gender(db_conn):
    # QNR-SHOW-01: 남성은 '여성 환자만' 문항이 빠지고 total도 준다.
    ctx = await _seed_appt(db_conn, gender="M")
    tpl = await patient_questionnaire_service.get_template(ctx["me"], ctx["appointment_id"])
    assert [q["id"] for q in tpl["questions"]] == ["q1"] and tpl["total"] == 1


@pytest.mark.asyncio
async def test_get_template_shows_female_only_for_female(db_conn):
    ctx = await _seed_appt(db_conn, gender="F")
    tpl = await patient_questionnaire_service.get_template(ctx["me"], ctx["appointment_id"])
    assert [q["id"] for q in tpl["questions"]] == ["q1", "q2"] and tpl["total"] == 2


@pytest.mark.asyncio
async def test_autosave_is_writing_not_complete(db_conn):
    # QNR-STATE-02·04: 자동 저장은 '작성 중'이고 completed_at을 찍지 않는다. 진행률은 답 수/보이는 수.
    ctx = await _seed_appt(db_conn, gender="F")
    ans = [{"question_id": "q1", "question_text": "증상은?", "value": "기침"}]
    r = await patient_questionnaire_service.save_response(ctx["me"], ctx["appointment_id"], ans, complete=False)
    assert r["state"] == "작성 중" and r["answered"] == 1 and r["total"] == 2
    assert await db_conn.fetchval(
        "select completed_at from questionnaire_responses where appointment_id=$1", ctx["appointment_id"]) is None


@pytest.mark.asyncio
async def test_submit_marks_complete_and_snapshots_text(db_conn):
    # QNR-STATE-03·04 + QNR-ID-02: [제출하기]는 completed_at을 찍고, 답에 그때 질문 글자가 남는다.
    ctx = await _seed_appt(db_conn, gender="F")
    ans = [{"question_id": "q1", "question_text": "증상은?", "value": "기침"},
           {"question_id": "q2", "question_text": "임신 가능성?", "value": "아니오"}]
    r = await patient_questionnaire_service.save_response(ctx["me"], ctx["appointment_id"], ans, complete=True)
    assert r["state"] == "작성완료" and r["answered"] == 2
    saved = await patient_questionnaire_service.get_response(ctx["me"], ctx["appointment_id"])
    assert saved["state"] == "작성완료" and saved["completed_at"] is not None
    assert saved["answers"][0]["question_text"] == "증상은?"  # 스냅샷 보존


@pytest.mark.asyncio
async def test_autosave_keeps_completed_at_once_submitted(db_conn):
    ctx = await _seed_appt(db_conn, gender="F")
    ans = [{"question_id": "q1", "question_text": "증상은?", "value": "기침"}]
    await patient_questionnaire_service.save_response(ctx["me"], ctx["appointment_id"], ans, complete=True)
    r = await patient_questionnaire_service.save_response(ctx["me"], ctx["appointment_id"], ans, complete=False)
    assert r["state"] == "작성완료"  # 이미 완료된 것을 자동저장이 되돌리지 않는다


@pytest.mark.asyncio
async def test_save_rejected_from_treatment_start(db_conn):
    # #21: 진료중부터 읽기 전용. 도착/진료대기까지는 허용.
    ctx = await _seed_appt(db_conn, gender="F")
    admin = await seed_staff(db_conn, role="admin"); await set_session_auth(db_conn, admin["auth_user_id"])
    await db_conn.execute("update appointments set status='도착' where id=$1", ctx["appointment_id"])
    ans = [{"question_id": "q1", "question_text": "증상은?", "value": "기침"}]
    r = await patient_questionnaire_service.save_response(ctx["me"], ctx["appointment_id"], ans, complete=False)
    assert r["answered"] == 1  # 도착 상태는 허용
    await db_conn.execute("update appointments set status='진료중' where id=$1", ctx["appointment_id"])
    with pytest.raises(AppError) as e:
        await patient_questionnaire_service.save_response(ctx["me"], ctx["appointment_id"], ans, complete=False)
    assert e.value.status_code == 400


@pytest.mark.asyncio
async def test_get_response_none_when_unwritten(db_conn):
    ctx = await _seed_appt(db_conn, gender="F")
    assert await patient_questionnaire_service.get_response(ctx["me"], ctx["appointment_id"]) is None
```
Run → Expected: FAIL(모듈 없음).

- [ ] **Step 4: `patient_questionnaire_service.py` 구현**

```python
import json
from uuid import UUID

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as

EDITABLE_STATUSES = ("예약신청", "예약확정", "도착", "진료대기")  # #21: 진료중부터 읽기 전용
_GENDER_ONLY = {"여성 환자만": "F", "남성 환자만": "M"}  # 나머지('모든 환자')는 항상 보인다


def _visible(question: dict, gender: str) -> bool:
    required = _GENDER_ONLY.get(question.get("visible_to", "모든 환자"))
    return required is None or required == gender  # QNR-SHOW-01


def compute_progress(questions: list[dict], gender: str, answers: list) -> dict:
    """QNR-PROG-04: 서버 한 곳에서 센다(앱·알림 배치가 재사용). 분자=지나간 답 수, 분모=보이는 문항 수."""
    total = sum(1 for q in questions if _visible(q, gender))       # QNR-PROG-02·03·SHOW-05
    return {"answered": len(answers), "total": total}             # QNR-PROG-01·05(빈 답도 셈)


def _load(questions) -> list:
    return json.loads(questions) if isinstance(questions, str) else questions


async def _appt_and_template(conn, appointment_id: UUID):
    appt = await conn.fetchrow(
        "select status, department_id, for_patient_id from appointments where id=$1", appointment_id)
    if appt is None:
        raise AppError("예약을 찾을 수 없습니다.", status_code=404)
    tpl = await conn.fetchrow(
        "select id, questions from questionnaire_templates where department_id=$1 limit 1", appt["department_id"])
    gender = await conn.fetchval("select gender from patients where id=$1", appt["for_patient_id"])
    return appt, tpl, gender


async def get_template(patient: PatientContext, appointment_id: UUID) -> dict | None:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        _appt, tpl, gender = await _appt_and_template(conn, appointment_id)
    if tpl is None:
        return None
    visible = [q for q in _load(tpl["questions"]) if _visible(q, gender)]  # QNR-SHOW
    return {"id": tpl["id"], "questions": visible, "total": len(visible)}


async def save_response(patient: PatientContext, appointment_id: UUID,
                        answers: list[dict], complete: bool = False) -> dict:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        appt, tpl, gender = await _appt_and_template(conn, appointment_id)
        if appt["status"] not in EDITABLE_STATUSES:
            raise AppError("진료가 시작되기 전까지만 사전문진을 작성할 수 있습니다.", status_code=400)  # #21
        if tpl is None:
            raise AppError("해당 진료과의 문진 양식이 없습니다.", status_code=404)
        # 자동저장(complete=False)은 completed_at을 건드리지 않는다(QNR-STATE-04). 이미 완료면 유지.
        row = await conn.fetchrow(
            "insert into questionnaire_responses (appointment_id, template_id, answers, completed_at) "
            "values ($1,$2,$3, case when $4 then now() else null end) "
            "on conflict (appointment_id) do update set "
            "  template_id = excluded.template_id, answers = excluded.answers, submitted_at = now(), "
            "  completed_at = case when $4 then now() else questionnaire_responses.completed_at end "
            "returning id, completed_at",
            appointment_id, tpl["id"], json.dumps(answers, ensure_ascii=False), complete)
        prog = compute_progress(_load(tpl["questions"]), gender, answers)
    state = "작성완료" if row["completed_at"] is not None else "작성 중"  # QNR-STATE-02·03
    return {"id": row["id"], "state": state, **prog}


async def get_response(patient: PatientContext, appointment_id: UUID) -> dict | None:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select id, answers, submitted_at, completed_at from questionnaire_responses where appointment_id=$1",
            appointment_id)
        if row is None:
            return None  # QNR-STATE-01: 행 없음 = 미작성(호출자가 판정)
        _appt, tpl, gender = await _appt_and_template(conn, appointment_id)
    answers = _load(row["answers"])
    prog = compute_progress(_load(tpl["questions"]) if tpl else [], gender, answers)
    state = "작성완료" if row["completed_at"] is not None else "작성 중"
    return {"id": row["id"], "answers": answers, "state": state,
            "completed_at": row["completed_at"], **prog}
```

- [ ] **Step 5: 전체 테스트 실행**

Run: `cd backend && pytest tests/test_patient_questionnaire_service.py -v`
Expected: **8개 PASS**(마이그레이션 1 + 성별 2 + 부분저장/완료 3 + 수정시점 1 + 미작성 1).

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/00021_questionnaire_completion.sql backend/app/services/patient_questionnaire_service.py backend/tests/test_patient_questionnaire_service.py backend/tests/conftest.py
git commit -m "feat: 📝 환자앱 Task 7 본문 — 사전문진 서비스(완료칸 00021·진행률 서버계산·성별 노출 #17·수정시점 #21)"
```

> 📌 **알림 배치가 `compute_progress`를 재사용**한다(`QNR-PROG-04·QNR-NOTI-06`) — 「남은 수 = total − answered」(`QNR-PROG-10`)로 문구를 만든다. 배치는 진행률을 따로 세지 않는다.
> 📌 **미작성/작성 중 판정은 서버 값으로**(`QNR-STATE`) — 화면(Task 24)·홈 카드(Task 17 `CARD-QNR-*`)·알림 배치가 같은 `state`·`answered`·`total`을 쓴다. 옛 구현의 "행 존재 여부로만 판정"(갭 #50·#53)을 `completed_at`이 대체한다.
> 📌 **미완성 문진 이관은 Task 5가 이미 한다**(`move_questionnaire_response`) — `QNR-LIVE-09`("완료 표시 없는 상태 그대로 옮겨 작성 중 유지")는 `completed_at`을 그대로 옮겨 성립한다(별도 처리 불필요).
> 📌 **옛 플랜 `submit_response`는 폐기하고 `save_response(complete=bool)`로 대체**했다 — 부분저장(자동, `complete=False`)과 제출(완료, `complete=True`)을 한 함수로 합쳐 `completed_at`으로 가른다(옛 upsert는 완료 개념이 없어 1문항만 써도 작성완료로 보였다, 갭 #50).

---

## Task 8: 예약 조회 + 방문 이력(4상태·20건 커서) + 당일 대기·예상 시간(`00022`, #21)

> **담당 규칙**: 없음(백엔드 계약). 홈·카드(Task 16·17)·예약 상세(Task 21)·이력(Task 27)·나의 예약(Task 30)이 소비한다.
>
> ⭐ **옛 플랜 Task 9 후반(조회, `plans/2026-07-27-patient-app.md:2503~2634`) + Task 11(이력, `:2856~2958`)을 합쳐 재편하고 세 계약을 얹는다**:
> 1. **예상 대기시간(`CARD-WAIT-08`, 갭 #21, 확정 2026-08-01)** — `estimated = patients_ahead × 1인당 진료시간`. 1인당 진료시간 **3단 대체**: ① 그 의사 최근 20건 실측 평균(`진료중→진료완료` 시각차, `appointment_status_history`) → ② 없으면 슬롯 간격(`doctor_schedule_rules.slot_duration_minutes`) → ③ 그것도 없으면 **null**(화면은 인원만, `CARD-WAIT-04`). ⭐ **서버 한 곳**에서 계산(앱·챗봇·직원이 다른 숫자를 말하면 안 됨). 5분 반올림·`약`·`곧`·`약 1시간 이상`은 **화면 표시 규칙**(`CARD-WAIT-05~07`) — 서버는 raw 분만.
> 2. **방문 이력 4상태(`HIST-ROW-01·02·06·09`, 갭 #29)** — 옛 이력은 `진료완료`만 봐서 취소·부도가 한 줄도 안 왔다. `HIST-ROLE-01`("지나간 예약 전체")대로 **네 갈래를 서버가 파생**: `진료완료` / `취소됨`(환자취소·병원취소) / `방문하지않음`(예약부도) / `확정되지않음`(`예약신청`인 채 시각 지나 자정 넘김, `HIST-ROW-09`·B-39).
> 3. **20건 커서·안정정렬(`HIST-LIST-15·16·21`, 갭 #71)** — 옛 조회는 건수 제한도 이어받기 기준점도 없었다. 최신 날짜순 20건 + `(slot_date, id)` 커서로 이어받기. 기간 제한 없음(`HIST-LIST-20`).
>
> ⚠️ **`cancellation_requested_at` → `support_requested_at`** — 옛 조회 쿼리의 폐기 필드를 ④ `00010` 칸으로 교체.
> ⚠️ **조회는 RLS에 맡긴다** — `patients_can_read_own_appointments`(Task 1, `patient_owns(for_patient_id) or account`)가 본인+가족만 거르므로 서비스가 소유 목록을 따로 안 만든다. 이력은 `for_patient_id` 파라미터로 한 사람만 좁힌다(못 보는 가족이면 RLS가 빈 결과).
> ⚠️ **안내문은 `patient_medical_notes` 뷰(Task 1)** — `medical_records` 직접 조회 금지(의료진 전용 메모가 새지 않게). 완료 줄만 안내문, 취소·부도·미확정 줄은 안내문 자리 없음(`HIST-NOTE-04`).
> ⚠️ **미정의 엣지(규칙에 없음)**: `예약확정`인 채 시각이 지난 예약(직원이 완료 처리를 깜빡)은 `HIST-ROW-09`가 `예약신청`만 「확정되지않음」으로 정해 **규칙이 다루지 않는다.** 여기서는 이력에 넣지 않는다(추측 금지). auto_confirm 기본 true라 드물지만, 발견 시 규칙 결정 필요 → 완료 보고에 짚음.
> ⚠️ **CARD-CHG 두 칸 소급(2026-08-18, T15 착수 중 발견 — 경계 갭 #17)**: 조회 select에 `a.hospital_change_prev_time, a.hospital_change_kind`를 얹었다(위 두 함수). **스키마 칸은 직원웹 T2 마이그레이션**이 만들고 `reschedule_appointment`·병원발 취소가 채운다 — 여기선 **읽기만**. 환자 `[확인]`으로 비우는 창구(`acknowledge_hospital_change`)는 **T15**가 백엔드째 만든다. 결정·기각안은 결정 문서 「③ 병원발 변경 안내문 → 데이터 저장 방식」.

**Files:**
- Create: `supabase/migrations/00022_wait_estimate.sql` · `backend/app/services/patient_appointment_query_service.py` · `backend/app/services/patient_history_service.py`
- Test: `backend/tests/test_patient_appointment_query_service.py` · `backend/tests/test_patient_history_service.py`

**Interfaces:**
- Consumes: `PatientContext`(Task 2) · `acquire_as` · `AppError` · `appointments`·`appointment_slots`·`appointment_status_history`·`doctor_schedule_rules.slot_duration_minutes`·`patients`·`departments`·`staff`·`questionnaire_responses` · `patient_medical_notes` 뷰(Task 1) · `patient_owns()`(Task 1) · RLS `patients_can_read_own_appointments`(Task 1)
- Produces:
  - SQL: `patient_wait_estimate(p_appointment_id uuid) returns table(patients_ahead int, estimated_wait_minutes int)`(SECURITY DEFINER — 소유 확인 후 전체 대기열·전체 완료이력 집계)
  - `patient_appointment_query_service.list_my_appointments(patient) -> list[dict]`(진행 중, 취소·부도 제외, 미래·미배정만)
  - `patient_appointment_query_service.get_appointment_detail(patient, appointment_id) -> dict`
  - `patient_appointment_query_service.get_queue_status(patient, appointment_id) -> dict`(`{"patients_ahead", "estimated_wait_minutes"}`; 대기 아님/근거 없음이면 `estimated_wait_minutes=None`)
  - `patient_history_service.list_visit_history(patient, for_patient_id, cursor=None, limit=20) -> dict`(`{"items": [...], "next_cursor": str | None}`; 각 item에 `visit_status`·`patient_visible_notes`·`has_questionnaire`)

- [ ] **Step 1: 대기 RPC 실패 테스트** — `backend/tests/test_patient_appointment_query_service.py`(상단)

```python
import pytest
from uuid import uuid4

from app.core.patient_security import PatientContext
from app.services import patient_appointment_query_service as q
from tests.conftest import seed_patient, seed_staff, set_session_auth


def _ctx(s): return PatientContext(id=s["patient_id"], auth_user_id=s["auth_user_id"])


async def _seed_doctor_dept(db_conn):
    admin = await seed_staff(db_conn, role="admin"); await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    dept = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await db_conn.execute("update staff set department_id=$1 where id=$2", dept, doctor["staff_id"])
    return admin, doctor["staff_id"], dept


async def _waiting(db_conn, dept, doctor_id, pid, pos):
    return await db_conn.fetchval(
        "insert into appointments (account_patient_id, for_patient_id, department_id, doctor_id, status, source, queue_position) "
        "values ($1,$1,$2,$3,'진료대기','staff',$4) returning id", pid, dept, doctor_id, pos)


@pytest.mark.asyncio
async def test_wait_estimate_uses_slot_duration_when_no_history(db_conn):
    # 3단 대체 ②: 실측 이력이 없으면 슬롯 간격(30분)으로 1인당 시간을 잡는다. 앞 2명 → 60분.
    admin, doctor_id, dept = await _seed_doctor_dept(db_conn)
    await db_conn.execute(
        "insert into doctor_schedule_rules (doctor_id, weekday, start_time, end_time, slot_duration_minutes, max_daily_appointments) "
        "values ($1,0,'09:00','18:00',30,50),($1,1,'09:00','18:00',30,50),($1,2,'09:00','18:00',30,50),"
        "($1,3,'09:00','18:00',30,50),($1,4,'09:00','18:00',30,50),($1,5,'09:00','18:00',30,50),($1,6,'09:00','18:00',30,50)",
        doctor_id)
    me = _ctx(await seed_patient(db_conn))
    await _waiting(db_conn, dept, doctor_id, (await seed_patient(db_conn, phone="010-1"))["patient_id"], 1)
    await _waiting(db_conn, dept, doctor_id, (await seed_patient(db_conn, phone="010-2"))["patient_id"], 2)
    mine = await _waiting(db_conn, dept, doctor_id, me.id, 3)
    st = await q.get_queue_status(me, mine)
    assert st["patients_ahead"] == 2 and st["estimated_wait_minutes"] == 60


@pytest.mark.asyncio
async def test_wait_estimate_null_when_no_basis(db_conn):
    # 3단 대체 ③: 실측도 슬롯 간격도 없으면 숫자를 만들지 않는다(CARD-WAIT-04).
    admin, doctor_id, dept = await _seed_doctor_dept(db_conn)
    me = _ctx(await seed_patient(db_conn))
    await _waiting(db_conn, dept, doctor_id, (await seed_patient(db_conn, phone="010-3"))["patient_id"], 1)
    mine = await _waiting(db_conn, dept, doctor_id, me.id, 2)
    st = await q.get_queue_status(me, mine)
    assert st["patients_ahead"] == 1 and st["estimated_wait_minutes"] is None
```
Run → Expected: FAIL(RPC·모듈 없음).

- [ ] **Step 2: 마이그레이션 SQL** — `supabase/migrations/00022_wait_estimate.sql`

```sql
-- #21(확정 2026-08-01): 예상 대기시간 = 앞 인원 × 1인당 진료시간. 1인당은 3단 대체.
-- 전체 대기열·전체 완료이력을 봐야 하므로 security definer로 소유 확인 뒤 집계한다.
create or replace function patient_wait_estimate(p_appointment_id uuid)
returns table(patients_ahead int, estimated_wait_minutes int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_doctor uuid; v_pos int; v_ahead int; v_per numeric;
begin
  select a.doctor_id, a.queue_position into v_doctor, v_pos
    from public.appointments a
    where a.id = p_appointment_id and a.status = '진료대기'
      and public.patient_owns(a.account_patient_id);
  if v_pos is null then                       -- 내 예약이 아니거나 대기 상태 아님
    return query select 0, null::int; return;
  end if;

  select count(*) into v_ahead                -- 같은 의사·오늘·진료대기·내 앞 순번
    from public.appointments a2
    left join public.appointment_slots s2 on s2.id = a2.slot_id
    where a2.doctor_id = v_doctor and a2.status = '진료대기'
      and coalesce(s2.slot_date, current_date) = current_date
      and a2.queue_position < v_pos;

  -- ① 그 의사 최근 20건 실측 평균(진료중→진료완료 분).
  select avg(mins) into v_per from (
    select extract(epoch from (
      (select max(h2.changed_at) from public.appointment_status_history h2
         where h2.appointment_id = a3.id and h2.to_status = '진료완료')
      - (select max(h1.changed_at) from public.appointment_status_history h1
         where h1.appointment_id = a3.id and h1.to_status = '진료중')))/60 as mins
    from public.appointments a3
    where a3.doctor_id = v_doctor and a3.status = '진료완료'
    order by a3.updated_at desc limit 20
  ) recent where mins is not null and mins > 0;

  if v_per is null then                        -- ② 슬롯 간격으로 대체
    select slot_duration_minutes into v_per from public.doctor_schedule_rules
      where doctor_id = v_doctor and slot_duration_minutes is not null limit 1;
  end if;

  -- ③ 근거 없으면 estimated는 null(화면이 인원만 표시).
  return query select v_ahead, case when v_per is null then null else round(v_ahead * v_per)::int end;
end;
$$;
revoke execute on function patient_wait_estimate(uuid) from public;
grant execute on function patient_wait_estimate(uuid) to authenticated;
```
Run → Expected: PASS(Step 1 — query_service 구현 후).

- [ ] **Step 3: 조회 서비스 실패 테스트(진행중·상세)** — 같은 파일에 이어서

```python
async def _future_appt(db_conn, me, dept, doctor_id):
    from app.services import patient_booking_service
    slot = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,'2999-09-01','09:00') returning id",
        doctor_id)
    return await patient_booking_service.create_booking(
        me, for_patient_id=me.id, department_id=dept, doctor_id=doctor_id,
        slot_id=slot, reason="감기", request_id=uuid4())


@pytest.mark.asyncio
async def test_list_my_appointments_excludes_cancelled_and_past(db_conn):
    admin, doctor_id, dept = await _seed_doctor_dept(db_conn)
    me = _ctx(await seed_patient(db_conn))
    live = await _future_appt(db_conn, me, dept, doctor_id)
    # 과거 예약확정(직원 상태전이 누락) 1건은 나의 예약(진행 중)에서 빠진다.
    past_slot = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1,'2020-01-01','09:00','예약됨') returning id",
        doctor_id)
    await db_conn.execute(
        "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, status, source) "
        "values ($1,$2,$2,$3,$4,'예약확정','app')", past_slot, me.id, dept, doctor_id)
    rows = await q.list_my_appointments(me)
    assert [r["id"] for r in rows] == [live]
    assert rows[0]["slot_date"] is not None  # SDB-21: 예약됨 슬롯 날짜가 NULL로 새지 않는다


@pytest.mark.asyncio
async def test_get_appointment_detail_has_names(db_conn):
    admin, doctor_id, dept = await _seed_doctor_dept(db_conn)
    me = _ctx(await seed_patient(db_conn))
    aid = await _future_appt(db_conn, me, dept, doctor_id)
    d = await q.get_appointment_detail(me, aid)
    assert d["department_name"] == "내과" and d["status"] in ("예약신청", "예약확정")
```
Run → Expected: FAIL(모듈 없음).

- [ ] **Step 4: `patient_appointment_query_service.py` 구현**

```python
from uuid import UUID

from app.core.patient_security import PatientContext
from app.db.pool import acquire_as

# support_requested_at·request_type(④ 00010)로 폐기된 cancellation_requested_at을 대체한다.
_LIVE = "('환자취소','병원취소','예약부도')"


async def list_my_appointments(patient: PatientContext) -> list[dict]:
    async with acquire_as(str(patient.auth_user_id)) as conn:  # RLS가 본인+가족만 거른다
        rows = await conn.fetch(
            "select a.id, a.status, a.support_requested_at, a.request_type, a.updated_at, "
            "  a.booking_code, a.booking_code_expires_at, "
            "  a.hospital_change_prev_time, a.hospital_change_kind, "  # CARD-CHG(직원웹 T2가 채움·환자 [확인]이 비움)
            "  p.name as for_patient_name, d.name as department_name, st.name as doctor_name, "
            "  s.slot_date, s.start_time, "
            "  exists (select 1 from questionnaire_responses q where q.appointment_id=a.id) as has_questionnaire "
            "from appointments a "
            "join patients p on p.id=a.for_patient_id "
            "join departments d on d.id=a.department_id "
            "join staff st on st.id=a.doctor_id "
            "left join appointment_slots s on s.id=a.slot_id "
            f"where a.status not in {_LIVE} and (s.slot_date is null or s.slot_date >= current_date) "
            "order by s.slot_date nulls last, s.start_time nulls last")
    return [dict(r) for r in rows]


async def get_appointment_detail(patient: PatientContext, appointment_id: UUID) -> dict:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select a.id, a.status, a.support_requested_at, a.request_type, a.updated_at, a.queue_position, "
            "  a.doctor_id, a.booking_code, a.booking_code_expires_at, "
            "  a.hospital_change_prev_time, a.hospital_change_kind, "  # CARD-CHG(직원웹 T2가 채움·환자 [확인]이 비움)
            "  p.name as for_patient_name, d.name as department_name, st.name as doctor_name, "
            "  s.slot_date, s.start_time "
            "from appointments a "
            "join patients p on p.id=a.for_patient_id "
            "join departments d on d.id=a.department_id "
            "join staff st on st.id=a.doctor_id "
            "left join appointment_slots s on s.id=a.slot_id where a.id=$1", appointment_id)
    return dict(row) if row else {}


async def get_queue_status(patient: PatientContext, appointment_id: UUID) -> dict:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow("select * from patient_wait_estimate($1)", appointment_id)
    return {"patients_ahead": row["patients_ahead"] or 0,
            "estimated_wait_minutes": row["estimated_wait_minutes"]}  # None이면 화면은 인원만
```

- [ ] **Step 5: 이력 서비스 실패 테스트(4상태·커서)** — `backend/tests/test_patient_history_service.py`

```python
import pytest
from uuid import uuid4

from app.core.patient_security import PatientContext
from app.services import patient_history_service as h
from tests.conftest import seed_patient, seed_staff, set_session_auth


def _ctx(s): return PatientContext(id=s["patient_id"], auth_user_id=s["auth_user_id"])


async def _past(db_conn, me, dept, doctor_id, status, date, *, note=None):
    slot = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1,$2,'09:00','예약됨') returning id",
        doctor_id, date)
    aid = await db_conn.fetchval(
        "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, status, source) "
        "values ($1,$2,$2,$3,$4,$5,'app') returning id", slot, me.id, dept, doctor_id, status)
    if note is not None:
        await db_conn.execute(
            "insert into medical_records (appointment_id, doctor_id, symptoms, diagnosis, patient_visible_notes, is_completed) "
            "values ($1,$2,'내부','내부',$3,true)", aid, doctor_id, note)
    return aid


@pytest.mark.asyncio
async def test_history_covers_four_statuses_newest_first(db_conn):
    admin = await seed_staff(db_conn, role="admin"); await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    dept = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await db_conn.execute("update staff set department_id=$1 where id=$2", dept, doctor["staff_id"])
    me = _ctx(await seed_patient(db_conn)); did = doctor["staff_id"]
    await _past(db_conn, me, dept, did, "진료완료", "2026-01-10", note="휴식하세요")
    await _past(db_conn, me, dept, did, "환자취소", "2026-02-10")
    await _past(db_conn, me, dept, did, "예약부도", "2026-03-10")
    await _past(db_conn, me, dept, did, "예약신청", "2020-01-01")  # 지난 예약신청 = 확정되지않음
    res = await h.list_visit_history(me, me.id)
    statuses = {i["visit_status"] for i in res["items"]}
    assert statuses == {"진료완료", "취소됨", "방문하지않음", "확정되지않음"}
    # 날짜 내림차순: 2026-03-10(부도) > 02-10(취소) > 01-10(완료) > 2020(미확정).
    assert [i["visit_status"] for i in res["items"]] == ["방문하지않음", "취소됨", "진료완료", "확정되지않음"]
    done = next(i for i in res["items"] if i["visit_status"] == "진료완료")
    assert done["patient_visible_notes"] == "휴식하세요"


@pytest.mark.asyncio
async def test_history_paginates_20_with_cursor(db_conn):
    admin = await seed_staff(db_conn, role="admin"); await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    dept = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await db_conn.execute("update staff set department_id=$1 where id=$2", dept, doctor["staff_id"])
    me = _ctx(await seed_patient(db_conn)); did = doctor["staff_id"]
    for i in range(25):
        await _past(db_conn, me, dept, did, "진료완료", f"2026-{(i%12)+1:02d}-{(i%27)+1:02d}")
    first = await h.list_visit_history(me, me.id, limit=20)
    assert len(first["items"]) == 20 and first["next_cursor"] is not None
    second = await h.list_visit_history(me, me.id, cursor=first["next_cursor"], limit=20)
    assert len(second["items"]) == 5 and second["next_cursor"] is None
```
Run → Expected: FAIL(모듈 없음).

- [ ] **Step 6: `patient_history_service.py` 구현**

```python
from uuid import UUID

from app.core.patient_security import PatientContext
from app.db.pool import acquire_as

# 종료 상태 + '예약신청'인 채 지난 예약(확정되지않음, HIST-ROW-09). 예약확정+지남은 규칙 미정의라 제외.
_HISTORY_WHERE = (
    "(a.status in ('진료완료','환자취소','병원취소','예약부도') "
    " or (a.status = '예약신청' and s.slot_date < current_date))")


def _encode(slot_date, aid) -> str:
    return f"{slot_date.isoformat() if slot_date else ''}|{aid}"


def _decode(cursor: str):
    d, aid = cursor.split("|", 1)
    return (d or None), aid


async def list_visit_history(patient: PatientContext, for_patient_id: UUID,
                             cursor: str | None = None, limit: int = 20) -> dict:
    params = [for_patient_id]
    keyset = ""
    if cursor:
        cdate, cid = _decode(cursor)
        params += [cdate, cid]
        # (slot_date, id) 내림차순 keyset. 안정 동점키 = id(HIST-LIST 안정정렬).
        keyset = "and (s.slot_date, a.id) < ($2::date, $3::uuid) "
    params.append(limit + 1)  # 다음 페이지 존재 여부 판정용 +1
    async with acquire_as(str(patient.auth_user_id)) as conn:  # RLS가 소유 필터
        rows = await conn.fetch(
            "select a.id, a.status, s.slot_date, d.name as department_name, st.name as doctor_name, "
            "  n.patient_visible_notes, "
            "  case a.status when '진료완료' then '진료완료' "
            "       when '환자취소' then '취소됨' when '병원취소' then '취소됨' "
            "       when '예약부도' then '방문하지않음' else '확정되지않음' end as visit_status, "
            "  exists (select 1 from questionnaire_responses q where q.appointment_id=a.id) as has_questionnaire "
            "from appointments a "
            "join departments d on d.id=a.department_id "
            "join staff st on st.id=a.doctor_id "
            "left join appointment_slots s on s.id=a.slot_id "
            "left join patient_medical_notes n on n.appointment_id=a.id "
            f"where a.for_patient_id = $1 and {_HISTORY_WHERE} {keyset}"
            "order by s.slot_date desc nulls last, a.id desc "
            f"limit ${len(params)}", *params)
    items = [dict(r) for r in rows]
    next_cursor = None
    if len(items) > limit:                       # +1이 잡혔으면 다음 페이지가 있다
        items = items[:limit]
        last = items[-1]
        next_cursor = _encode(last["slot_date"], str(last["id"]))
    return {"items": items, "next_cursor": next_cursor}
```

- [ ] **Step 7: 전체 테스트 실행**

Run: `cd backend && pytest tests/test_patient_appointment_query_service.py tests/test_patient_history_service.py -v`
Expected: 조회 4(대기 2 + 진행중/상세 2) + 이력 2 = **6개 PASS**.

- [ ] **Step 8: 커밋**

```bash
git add supabase/migrations/00022_wait_estimate.sql backend/app/services/patient_appointment_query_service.py backend/app/services/patient_history_service.py backend/tests/test_patient_appointment_query_service.py backend/tests/test_patient_history_service.py
git commit -m "feat: 📝 환자앱 Task 8 본문 — 예약 조회 + 이력 4상태·20건 커서(#71) + 예상 대기 3단 대체(00022·#21 CARD-WAIT)"
```

> 📌 **`estimated_wait_minutes`는 raw 분**이다 — 5분 반올림·`약`·`곧 들어가십니다`(0명)·`약 1시간 이상`(60분 초과)은 화면(Task 16·17 `CARD-WAIT-05~07`)이 입힌다. 챗봇(4단계)·직원 웹도 같은 RPC를 호출해 숫자를 일치시킨다(`CARD-WAIT-08`).
> 📌 **취소 주체(누가 취소)는 화면이 상세로 판단**한다 — `HIST-ROW-02`("병원에서/본인/배우자 김○○")는 `CARD-CXL-*` 3갈래(Task 17)를 재사용하고, 목록 줄은 `status`(환자취소/병원취소)만 준다. 이력 목록에 취소자 이름 조인을 넣지 않는다(얇은 줄 유지).
> 📌 **`list_my_appointments`의 `slot_date >= current_date`** — 직원이 상태전이를 깜빡한 지난 예약이 홈에 「다음 예약」으로 계속 뜨는 것을 막는다(미배정 슬롯은 날짜 없어 항상 포함). 그 지난 예약은 이력 쪽 `확정되지않음`(예약신청) 또는 미정의 엣지(예약확정)로 간다.

---

## Task 9: 알림 dispatcher — `notify_patient()` 판정 계층 + `device_tokens`(`00023`, #5·#111·#120·#125·#126)

> **담당 규칙**: 없음(백엔드 계약). 예약 서비스(Task 5)·리마인더 cron(배포)·직원 상태전이(직원웹 코2)가 `notify_patient`를 호출하고, 알림함(Task 18)·알림 설정(Task 28)이 `notification_log`·`notification_preferences`를 소비한다.
>
> ⭐ **이 태스크는 「판정 계층」이다 — 실제 배달은 짓지 않는다.** 옛 플랜 Task 12(`plans/2026-07-27-patient-app.md:2975~3399`)의 단순 dispatcher(토큰 있으면 push·없으면 sms)를 **결정 #109·#111·#125·#126에 맞춰 재편**하고, **배달·콜백·재시도·죽은토큰은 직원웹 T30이 소유한 `dispatch_service`에 넘긴다**(색인 119 「같은 dispatcher」·중복 금지).
>
> **소유 경계(⭐ 중복 방지 — 원문 대조 완료 2026-08-17)**
> - **이 태스크가 만드는 것**: `notify_patient()`(진입점 — 선호도→문구→채널→dedup→발송로그 판정) · `device_token_service`(register/unregister) · `00023 device_tokens` · 예약 서비스 알림 배관.
> - **이 태스크가 소비만 하는 것**(직원웹 T30 소유, `staff-web.md:12923~`): `dispatch_service.send_now(notification_ids, conn)`(푸시 즉시·문자 접수) · `dispatch_service._sms_eligible(patient, conn)`(**공용 채널 판정 — 아래 「3) 채널」이 이 헬퍼를 쓴다**) · `apply_status_callback` · `run_retry_worker`(일시실패 1·5분 2회) · `mark_sms_dead` · `is_transient` · `notify_clients.PushClient/SmsClient` · `POST /provider/status-callback`(**#122 Twilio 서명검증** — 배포 플랜과 T30이 소유, 여기서 **안 만든다**). ⚠️ 직원웹은 2단계라 이 태스크 구현 전 이미 존재한다(구현 순서 1→2→3 확정).
> - ⭐ **죽은 푸시 토큰(#100·㉮)은 T30 `send_now`가 처리한다** — 발송 순간 `UNREGISTERED`면 **이 태스크가 만든 `device_tokens` 줄을 T30이 삭제**하고(서비스 역할이라 RLS 우회, 새 정책 불필요) **그 자리에서 문자로 폴백**한다(`SEND-RESULT-03b·03c`). 그래서 `notify_patient`의 초기 채널 판정과 `send_now`의 폴백 판정이 **같은 `_sms_eligible`**를 써야 갈라지지 않는다(`HSET-SMS-05`).
> - **범위 밖**: marketing 대량발송·광고 동의(`consent`) 필터·**야간 차단**은 직원 `enqueue_send`(직원웹 T28)와 Task 13(consent 칸) 몫이다. **야간 차단은 marketing 전용이라 트랜잭션 `notify_patient`엔 적용하지 않는다**(예약확정 문자는 밤에도 나가야 한다 — 결정 「⑤ 야간 발송」은 광고·예약발송 cron의 특수 경우).
>
> ⚠️ **④ 공용표는 재생성 금지**(`00011~00016` 이미 적용): `notification_log`(`00011` — `channel` NOT NULL·`delivery_status` 기본 `발송중`·부분 dedup 인덱스) · `notification_preferences`(`00012` — 줄 없으면 켜짐) · `notification_type_settings`(`00013` — `body`·`also_sms`, 줄 없으면 코드 기본) · `patients.sms_dead`(`00014`) · `scheduled_notifications`(`00016`). 이 태스크는 **`device_tokens`만 신설**한다.
>
> ⚠️ **`hospital_settings.sms_enabled`(병원 문자 전체 on/off, #111)의 원소유는 직원웹 T29(`00035`)**지만 발송이 반드시 읽어야 하고 의존 순서상 화면보다 앞서므로 `00023`이 **`add column if not exists`로 물리적 생성만** 한다(Task 5의 `auto_confirm_app_bookings` 선례 — 「먼저 적용하는 쪽 우선」, 충돌 없음). `sms_recipients`·`sms_opt_out_number`(대량발송·광고 전용)는 만들지 않는다.
>
> ⚠️ **채널은 한 이벤트당 한 줄·한 채널**이다 — `00011`의 dedup 부분 인덱스가 `(appointment_id, notification_type)` 단위라 push·sms 두 줄을 쓰면 유니크 위반이 난다. 트랜잭션 알림은 **push 우선, 토큰 없으면 sms 폴백**(`SEND-CH-01` 기본값)의 단일 채널로 처리한다. `channel`엔 **실제 보낸 값**을 넣는다(#120 — 상수 `'push'` 박기 금지).
>
> ⚠️ **서비스 역할로 read/write** — `notify_patient`는 여러 환자의 선호도·토큰·병원설정을 읽고 `notification_log`에 쓰므로 RLS 정책이 없는 서비스 역할 커넥션(`get_pool().acquire()`)을 쓴다(`00011`·`00012` 주석의 계약). `device_token_service`만 환자 본인 커넥션(`acquire_as`)을 쓴다.

**Files:**
- Create: `supabase/migrations/00023_device_tokens.sql`
- Create: `backend/app/services/device_token_service.py` · `backend/app/services/notification_service.py`
- Modify: `backend/app/services/patient_booking_service.py`(Task 5 — `create_booking`·`change_booking` 트랜잭션 종료 직후 알림 호출 한 줄)
- Test: `backend/tests/test_device_token_service.py` · `backend/tests/test_notification_service.py` · `backend/tests/test_patient_booking_service.py`(알림 배관 2건 추가)

**Interfaces:**
- Consumes:
  - `PatientContext`(Task 2) · `acquire_as`·`get_pool`(1단계 `app.db.pool`) · `AppError`·`log_error`(1단계 `app.core.errors`)
  - `dispatch_service.send_now(notification_ids: list[UUID], conn) -> None`(직원웹 T30 — 실제 배달)
  - `notification_log`·`notification_preferences`·`notification_type_settings`·`patients.sms_dead`(④ `00011~00014`) · `hospital_settings.sms_enabled`(직원웹 T29 `00035`, `00023`이 `if not exists`로 선생성) · `appointments`·`appointment_slots`(1단계 — 날짜·시각 치환)
  - `private.current_patient_id()`·`patient_owns()`(Task 1) · `private.is_active_staff()`(1단계)
  - `patient_booking_service.create_booking(...)`·`change_booking(...)`(Task 5 — 여기서 Modify)
- Produces:
  - `device_token_service.register_token(patient: PatientContext, fcm_token: str) -> None` · `unregister_token(patient: PatientContext, fcm_token: str) -> None`
  - `notification_service.notify_patient(account_patient_id: UUID, notification_type: str, *, kind: str = "transactional", target_name: str | None = None, appointment_id: UUID | None = None) -> None`(선호도 off·보낼 수단 없음·중복이면 조용히 무발송)
  - `notification_service.MESSAGES: dict[str, str]`(코드 기본 문구 표 — DB에 줄 없으면 이 값이 원본, #126)
  - DB 테이블 `device_tokens(id, patient_id, fcm_token, created_at)`

- [ ] **Step 1: `00023` 마이그레이션 작성**

`supabase/migrations/00023_device_tokens.sql`:
```sql
-- 3단계 알림: FCM 기기 토큰. 발송 직전 dispatcher가 조회해 채널(푸시/문자폴백)을 정한다.
-- ⛔ 토큰은 '삭제 중심'이 아니라 보존한다 — 끈 알림은 발송 직전 선호도로 거른다
--    (옛 플랜의 '토큰 삭제' 방식 폐기, 색인 47행·구조결정 「알림 선호도」).
-- ⚠️ 번호는 Task 8(00022) 다음 = 00023. 직원웹도 00017+ 대역을 쓰므로 실제 번호는 구현 시점 확정(먼저 적용하는 쪽 우선).
create table device_tokens (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  fcm_token text not null,
  created_at timestamptz not null default now(),
  unique (patient_id, fcm_token)   -- 같은 기기 재등록은 on conflict do nothing으로 무해
);

alter table device_tokens enable row level security;

-- 로그인 본인만 자기 토큰을 관리한다(가족은 로그인하지 않으므로 토큰이 없다 — current_patient_id로 못박아 가족 id 등록 방지).
create policy "patients_can_manage_own_device_tokens" on device_tokens
  for all
  using (private.current_patient_id() = device_tokens.patient_id)
  with check (private.current_patient_id() = device_tokens.patient_id);

-- 직원 발송(2단계)이 문자/푸시 대상 판정을 위해 읽는다.
create policy "staff_can_read_device_tokens" on device_tokens
  for select
  using (private.is_active_staff());

create index idx_device_tokens_patient on device_tokens (patient_id);

-- #111: notify_patient가 병원 문자정책(문자 전체 on/off)을 판정에 넣는다(HSET-SMS-01 ①).
-- 칸의 원소유는 직원웹 T29(00035)지만 발송이 반드시 읽어야 하고 순서상 화면보다 앞서므로 물리적 생성만 한다.
-- 직원웹 00035도 같은 칸을 default true로 만든다 — 먼저 적용하는 쪽이 만들고 뒤는 no-op(if not exists).
alter table hospital_settings
  add column if not exists sms_enabled boolean not null default true;
```

- [ ] **Step 2: 적용 + 실패 테스트 — device_token_service**

Run: `supabase migration up`
Expected: `00023` 적용, 오류 없음.

`backend/tests/test_device_token_service.py`:
```python
import pytest

from app.core.patient_security import PatientContext
from app.services import device_token_service
from tests.conftest import seed_patient


def _ctx(s): return PatientContext(id=s["patient_id"], auth_user_id=s["auth_user_id"])


@pytest.mark.asyncio
async def test_register_is_idempotent_and_unregister_removes(db_conn):
    me = _ctx(await seed_patient(db_conn))
    await device_token_service.register_token(me, "fcm-1")
    await device_token_service.register_token(me, "fcm-1")            # 같은 기기 재등록은 무해
    assert await db_conn.fetchval(
        "select count(*) from device_tokens where patient_id=$1", me.id) == 1

    await device_token_service.unregister_token(me, "fcm-1")
    assert await db_conn.fetchval(
        "select count(*) from device_tokens where patient_id=$1", me.id) == 0
```

Run: `cd backend && pytest tests/test_device_token_service.py -v`
Expected: FAIL(모듈 없음)

- [ ] **Step 3: 구현 — device_token_service**

`backend/app/services/device_token_service.py`:
```python
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as


async def register_token(patient: PatientContext, fcm_token: str) -> None:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        await conn.execute(
            "insert into device_tokens (patient_id, fcm_token) values ($1, $2) on conflict do nothing",
            patient.id, fcm_token,
        )


async def unregister_token(patient: PatientContext, fcm_token: str) -> None:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        await conn.execute(
            "delete from device_tokens where patient_id = $1 and fcm_token = $2",
            patient.id, fcm_token,
        )
```

Run: `cd backend && pytest tests/test_device_token_service.py -v`
Expected: 1 PASS

- [ ] **Step 4: 실패 테스트 — notification_service (판정)**

`backend/tests/test_notification_service.py`:
```python
import pytest

from app.services import dispatch_service, notification_service
from tests.conftest import seed_patient, seed_staff, set_session_auth


@pytest.fixture
def sent(monkeypatch):
    """직원웹 T30의 배달 계층을 스텁한다 — 이 태스크는 '판정'만 검증한다."""
    calls = []
    async def fake_send_now(notification_ids, conn):
        calls.append(list(notification_ids))
    monkeypatch.setattr(dispatch_service, "send_now", fake_send_now)
    return calls


async def _appt(db_conn, patient_id, *, slot=None):
    admin = await seed_staff(db_conn, role="admin"); await set_session_auth(db_conn, admin["auth_user_id"])
    dept = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    doctor = await seed_staff(db_conn, role="doctor")
    slot_id = None
    if slot is not None:
        slot_date, start_time = slot
        slot_id = await db_conn.fetchval(
            "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,$2,$3) returning id",
            doctor["staff_id"], slot_date, start_time)
    return await db_conn.fetchval(
        "insert into appointments (account_patient_id, for_patient_id, department_id, doctor_id, slot_id, status, source) "
        "values ($1,$1,$2,$3,$4,'예약확정','app') returning id",
        patient_id, dept, doctor["staff_id"], slot_id)


@pytest.mark.asyncio
async def test_preference_off_sends_nothing(db_conn, sent):
    # #5: enabled=false면 푸시·문자·알림함(로그) 어디에도 생성하지 않는다.
    p = await seed_patient(db_conn)
    await db_conn.execute(
        "insert into notification_preferences (patient_id, notification_type, enabled) values ($1,'confirmed',false)",
        p["patient_id"])
    await notification_service.notify_patient(p["patient_id"], "confirmed")
    assert sent == []
    assert await db_conn.fetchval(
        "select count(*) from notification_log where patient_id=$1", p["patient_id"]) == 0


@pytest.mark.asyncio
async def test_push_when_token_exists(db_conn, sent):
    p = await seed_patient(db_conn)
    await db_conn.execute("insert into device_tokens (patient_id, fcm_token) values ($1,'t')", p["patient_id"])
    await notification_service.notify_patient(p["patient_id"], "confirmed")
    row = await db_conn.fetchrow(
        "select channel, delivery_status, body from notification_log where patient_id=$1", p["patient_id"])
    assert row["channel"] == "push"                 # #120: 실제 채널
    assert row["delivery_status"] == "발송중"        # #119: 기록이 발송보다 먼저
    assert row["body"] == "예약이 확정되었습니다."
    assert len(sent) == 1                            # 배달 계층으로 넘어갔다


@pytest.mark.asyncio
async def test_sms_fallback_when_no_token(db_conn, sent):
    # SEND-CH-01 기본값: 토큰 없으면 문자 폴백. #120: 'push' 상수로 안 박힌다.
    p = await seed_patient(db_conn)
    await notification_service.notify_patient(p["patient_id"], "confirmed")
    assert await db_conn.fetchval(
        "select channel from notification_log where patient_id=$1", p["patient_id"]) == "sms"
    assert len(sent) == 1


@pytest.mark.asyncio
async def test_hospital_sms_off_blocks_fallback(db_conn, sent):
    # #111: 병원이 문자를 끄면 토큰 없는 사람에게도 아무것도 나가지 않는다(발송 시도 자체를 막는다).
    await db_conn.execute("update hospital_settings set sms_enabled=false")
    p = await seed_patient(db_conn)
    await notification_service.notify_patient(p["patient_id"], "confirmed")
    assert sent == []
    assert await db_conn.fetchval(
        "select count(*) from notification_log where patient_id=$1", p["patient_id"]) == 0


@pytest.mark.asyncio
async def test_sms_dead_blocks_sms(db_conn, sent):
    # 00014: 번호가 죽은(sms_dead) 사람에게 문자 폴백을 시도하지 않는다.
    p = await seed_patient(db_conn)
    await db_conn.execute("update patients set sms_dead=true where id=$1", p["patient_id"])
    await notification_service.notify_patient(p["patient_id"], "confirmed")
    assert sent == []


@pytest.mark.asyncio
async def test_dedup_same_appointment_and_type(db_conn, sent):
    # 00011 부분 유니크 인덱스: 같은 예약·같은 종류는 한 번만.
    p = await seed_patient(db_conn)
    appt = await _appt(db_conn, p["patient_id"])
    await db_conn.execute("insert into device_tokens (patient_id, fcm_token) values ($1,'t')", p["patient_id"])
    await notification_service.notify_patient(p["patient_id"], "confirmed", appointment_id=appt)
    await notification_service.notify_patient(p["patient_id"], "confirmed", appointment_id=appt)
    assert await db_conn.fetchval("select count(*) from notification_log where appointment_id=$1", appt) == 1
    assert len(sent) == 1


@pytest.mark.asyncio
async def test_failed_row_bypasses_dedup(db_conn, sent):
    # #121: delivery_status='실패' 줄은 부분 인덱스 조건(delivery_status<>'실패')이 비켜가 재발송이 가능하다.
    p = await seed_patient(db_conn)
    appt = await _appt(db_conn, p["patient_id"])
    await db_conn.execute(
        "insert into notification_log (appointment_id, patient_id, notification_type, kind, channel, delivery_status) "
        "values ($1,$2,'confirmed','transactional','sms','실패')", appt, p["patient_id"])
    await db_conn.execute("insert into device_tokens (patient_id, fcm_token) values ($1,'t')", p["patient_id"])
    await notification_service.notify_patient(p["patient_id"], "confirmed", appointment_id=appt)
    assert await db_conn.fetchval("select count(*) from notification_log where appointment_id=$1", appt) == 2


@pytest.mark.asyncio
async def test_target_name_prefixes_body(db_conn, sent):
    # R2-05: 가족 예약이면 대상자 이름을 본문 앞에 붙인다.
    p = await seed_patient(db_conn)
    await db_conn.execute("insert into device_tokens (patient_id, fcm_token) values ($1,'t')", p["patient_id"])
    await notification_service.notify_patient(p["patient_id"], "confirmed", target_name="민준")
    body = await db_conn.fetchval("select body from notification_log where patient_id=$1", p["patient_id"])
    assert body.startswith("민준님")


@pytest.mark.asyncio
async def test_reminder_includes_date_and_time(db_conn, sent):
    # #125: 리마인더 본문에 날짜·시각이 채워진다(중장년층이 앱을 안 열어도 몇 시인지 안다).
    from datetime import date, time
    p = await seed_patient(db_conn)
    appt = await _appt(db_conn, p["patient_id"], slot=(date(2026, 8, 20), time(14, 0)))
    await db_conn.execute("insert into device_tokens (patient_id, fcm_token) values ($1,'t')", p["patient_id"])
    await notification_service.notify_patient(p["patient_id"], "reminder_day_before", appointment_id=appt)
    body = await db_conn.fetchval("select body from notification_log where patient_id=$1", p["patient_id"])
    assert "8월 20일" in body and "오후 2시" in body


@pytest.mark.asyncio
async def test_reminder_without_slot_emits_no_null(db_conn, sent):
    # #125: slot이 없으면(당일 워크인) 시각 자리만 조용히 빠지고 빈칸·null·'{when}'이 나가지 않는다.
    p = await seed_patient(db_conn)
    appt = await _appt(db_conn, p["patient_id"], slot=None)
    await db_conn.execute("insert into device_tokens (patient_id, fcm_token) values ($1,'t')", p["patient_id"])
    await notification_service.notify_patient(p["patient_id"], "reminder_today", appointment_id=appt)
    body = await db_conn.fetchval("select body from notification_log where patient_id=$1", p["patient_id"])
    assert body == "오늘 예약이 있습니다." and "{when}" not in body and "None" not in body


@pytest.mark.asyncio
async def test_body_override_from_settings(db_conn, sent):
    # #126: notification_type_settings.body가 있으면 코드 기본 문구를 덮어쓴다(줄 없으면 코드값 = 되돌리기는 그 줄 삭제).
    await db_conn.execute(
        "insert into notification_type_settings (notification_type, body) values ('confirmed','예약 확정! 방문 잊지 마세요.')")
    p = await seed_patient(db_conn)
    await db_conn.execute("insert into device_tokens (patient_id, fcm_token) values ($1,'t')", p["patient_id"])
    await notification_service.notify_patient(p["patient_id"], "confirmed")
    assert await db_conn.fetchval(
        "select body from notification_log where patient_id=$1", p["patient_id"]) == "예약 확정! 방문 잊지 마세요."
```

Run: `cd backend && pytest tests/test_notification_service.py -v`
Expected: FAIL(모듈 없음)

- [ ] **Step 5: 구현 — notification_service**

`backend/app/services/notification_service.py`:
```python
from datetime import date, time
from uuid import UUID

from app.db.pool import get_pool
from app.services import dispatch_service   # 직원웹 T30 소유(2단계 먼저 구현). 실제 배달을 넘긴다.

# 코드 기본 문구 표 — DB(notification_type_settings)에 줄이 없으면 이 값이 원본이다(#126).
# {when}은 날짜·시각 치환 자리(리마인더). 슬롯이 없으면 빈 문자열로 채워 그 자리만 조용히 빠진다(#125).
# ⚠️ 11번째 '직원 상담 답변 도착'은 4단계(챗봇) 몫이라 여기 없다 — 그때 한 줄 추가된다.
MESSAGES = {
    "requested": "예약이 신청되었습니다.",
    "confirmed": "예약이 확정되었습니다.",
    "changed": "예약이 변경되었습니다.",
    "reminder_day_before": "내일{when} 예약이 있습니다. 잊지 말고 방문해 주세요.",
    "reminder_today": "오늘{when} 예약이 있습니다.",
    "hospital_cancelled": "병원 사정으로 예약이 취소되었습니다.",
    "cancellation_approved": "취소 요청이 처리되어 예약이 취소되었습니다.",
    "cancellation_rejected": "취소가 어렵다는 답변을 받았습니다. 병원에 문의해 주세요.",
    "questionnaire_missing": "사전문진 작성을 부탁드립니다.",
    "visit_completed": "진료가 완료되었습니다. 안내를 확인해 주세요.",
}


def _format_when(slot_date: date, start_time: time) -> str:
    """'8월 20일 오후 2시' 형태. 분이 있으면 '2시 30분'. (#125 중장년층 가독)"""
    hour = start_time.hour
    ampm = "오전" if hour < 12 else "오후"
    h12 = hour % 12 or 12
    minute = f" {start_time.minute}분" if start_time.minute else ""
    return f"{slot_date.month}월 {slot_date.day}일 {ampm} {h12}시{minute}"


async def notify_patient(
    account_patient_id: UUID,
    notification_type: str,
    *,
    kind: str = "transactional",
    target_name: str | None = None,
    appointment_id: UUID | None = None,
) -> None:
    """알림 발송의 '하나뿐인 판단 지점'(결정 #109). 선호도·문구·채널을 여기서 정하고,
    실제 배달은 직원웹 T30의 dispatch_service.send_now에 넘긴다.
    ⚠️ 항상 계정 소유자(account_patient_id)에게 보낸다. 가족 예약이면 target_name으로 대상자 이름을 본문에 명시한다.
    ⚠️ 야간 차단은 marketing 전용이라 여기(트랜잭션)엔 적용하지 않는다."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 1) 선호도 — 줄 없으면 켜짐. 끈 알림은 푸시·문자·알림함 어디에도 만들지 않는다(#5).
        pref = await conn.fetchrow(
            "select enabled from notification_preferences where patient_id=$1 and notification_type=$2",
            account_patient_id, notification_type,
        )
        if pref is not None and not pref["enabled"]:
            return

        # 2) 문구 — DB(설정)가 있으면 그것, 없으면 코드 기본(#126). 날짜·시각·이름 치환(#125).
        setting = await conn.fetchrow(
            "select body from notification_type_settings where notification_type=$1", notification_type,
        )
        base = (setting["body"] if setting and setting["body"] else None) \
            or MESSAGES.get(notification_type, "새 소식이 있습니다.")
        when = ""
        if appointment_id is not None:
            slot = await conn.fetchrow(
                "select s.slot_date, s.start_time from appointments a "
                "join appointment_slots s on s.id = a.slot_id where a.id=$1",
                appointment_id,
            )
            if slot and slot["slot_date"] is not None:
                when = " " + _format_when(slot["slot_date"], slot["start_time"])
        body = base.replace("{when}", when)
        if target_name:
            body = f"{target_name}님 {body}"

        # 3) 채널 — push 우선, 토큰 없으면 문자 폴백(단일 채널; 00011 dedup이 채널 단위가 아님).
        #    「문자 써도 되나」 판정은 배달 계층의 공용 헬퍼를 쓴다 — send_now의 죽은 토큰 폴백(SEND-RESULT-03c)과
        #    같은 코드라 채널 판정이 갈라지지 않는다(HSET-SMS-05·#111).
        tokens = await conn.fetch(
            "select fcm_token from device_tokens where patient_id=$1", account_patient_id,
        )
        if tokens:
            channel = "push"
        elif await dispatch_service._sms_eligible(account_patient_id, conn):
            channel = "sms"           # #111·SEND-CH-01 폴백. #120: 실제 채널을 기록한다.
        else:
            return                    # 보낼 수단 없음(병원 문자 off + 토큰 없음, 또는 죽은 번호)

        # 4) 발송로그 먼저(기록이 발송보다 먼저 — #121). dedup은 00011 부분 인덱스, 실패 줄은 비켜간다.
        nid = await conn.fetchval(
            "insert into notification_log "
            "(appointment_id, patient_id, notification_type, kind, body, channel, delivery_status) "
            "values ($1,$2,$3,$4,$5,$6,'발송중') on conflict do nothing returning id",
            appointment_id, account_patient_id, notification_type, kind, body, channel,
        )
        if nid is None:
            return                    # 이미 같은 예약·종류로 닿은 이력이 있다(중복 발송 방지)

        # 5) 실제 배달은 배달 계층(직원웹 T30)에 넘긴다 — 푸시 즉시/문자 접수 후 콜백으로 도달·실패 갱신.
        await dispatch_service.send_now([nid], conn)
```

Run: `cd backend && pytest tests/test_notification_service.py -v`
Expected: 12 PASS

- [ ] **Step 6: 예약 서비스에 알림 배관 (Modify Task 5)**

`backend/app/services/patient_booking_service.py`에서 `create_booking`의 `acquire_as` 트랜잭션 블록을 벗어난 직후에 best-effort 알림을 더한다. 알림은 **계정 소유자**(`patient.id`)에게 보내고, 가족 예약(`for_patient_id != patient.id`)이면 대상자 이름을 `target_name`으로 넘긴다:
```python
from app.services import notification_service


async def create_booking(patient, for_patient_id, department_id, doctor_id, slot_id, reason,
                         request_id, source="app"):
    async with acquire_as(str(patient.auth_user_id)) as conn:
        ...  # 기존 로직(Task 5). 트랜잭션 끝에서 appointment_id·status 확보.
        target_name = None
        if for_patient_id != patient.id:
            target_name = await conn.fetchval("select name from patients where id=$1", for_patient_id)
    try:
        await notification_service.notify_patient(
            patient.id,
            "confirmed" if status == "예약확정" else "requested",
            target_name=target_name,
            appointment_id=appointment_id,
        )
    except Exception:
        pass   # 알림 실패가 예약을 되돌리지 않는다(1단계 best-effort 원칙).
    return appointment_id
```

`change_booking`도 트랜잭션 블록 직후에 `"changed"` 알림을 더한다(`new_appointment_id`·`for_patient_id`는 기존 로직이 확보한 값):
```python
    try:
        await notification_service.notify_patient(
            patient.id, "changed", target_name=target_name, appointment_id=new_appointment_id,
        )
    except Exception:
        pass
    return new_appointment_id
```
(`cancel_appointment`는 즉시취소 성공 시 화면 안내로 충분하므로 알림을 생략한다. 마감 후 취소·변경 요청에 대한 직원의 승인/반려 알림(`cancellation_approved`/`cancellation_rejected`)은 직원웹(2단계)의 요청 처리 시점에 `notify_patient`를 호출한다 — 이 태스크 범위 밖.)

`backend/tests/test_patient_booking_service.py`에 알림 배관 검증 2건 추가:
```python
@pytest.mark.asyncio
async def test_create_booking_notifies_confirmed(db_conn, monkeypatch):
    # 갭 #1 계보: 예약이 확정되면 알림을 부른다. (auto_confirm 기본 true → confirmed)
    from app.services import patient_booking_service, notification_service
    calls = []
    async def fake(pid, ntype, **kw): calls.append(ntype)
    monkeypatch.setattr(notification_service, "notify_patient", fake)
    # ... 기존 _seed_base로 dept·doctor·slot·request_id 확보 후 create_booking 호출 ...
    assert calls == ["confirmed"]


@pytest.mark.asyncio
async def test_change_booking_notifies_changed(db_conn, monkeypatch):
    from app.services import patient_booking_service, notification_service
    calls = []
    async def fake(pid, ntype, **kw): calls.append(ntype)
    monkeypatch.setattr(notification_service, "notify_patient", fake)
    # ... 기존 예약 하나 만든 뒤 change_booking 호출 ...
    assert calls == ["changed"]
```

- [ ] **Step 7: 전체 테스트**

Run: `cd backend && pytest tests/test_device_token_service.py tests/test_notification_service.py tests/test_patient_booking_service.py -v`
Expected: device 1 + notification 12 + booking(기존 + 알림 배관 2) 전부 PASS

- [ ] **Step 8: 커밋**

```bash
git add supabase/migrations/00023_device_tokens.sql \
  backend/app/services/device_token_service.py backend/app/services/notification_service.py \
  backend/app/services/patient_booking_service.py \
  backend/tests/test_device_token_service.py backend/tests/test_notification_service.py \
  backend/tests/test_patient_booking_service.py
git commit -m "feat: 📝 환자앱 Task 9 본문 — 알림 dispatcher 판정 계층(notify_patient·00023 device_tokens) + 예약 알림 배관(#5·#111·#120·#125·#126, 배달은 T30 소비)"
```

> 📌 **`dispatch_service`는 직원웹 T30 소유**(`staff-web.md:12923`). 구현 순서 1→2→3이라 이 태스크를 구현할 시점엔 `backend/app/services/dispatch_service.py`가 이미 존재한다. 테스트는 `send_now`를 monkeypatch로 스텁해 판정만 검증한다 — 실제 푸시/문자·콜백·재시도·죽은토큰은 T30이 담당한다.
> 📌 **`channel`은 한 이벤트당 한 줄·한 채널**이다(00011 dedup이 채널 단위가 아니라서). marketing의 「앱+문자 동시」는 직원 `enqueue_send`(직원웹 T28)의 별도 경로다.
> ⚠️ **발견(보고 대상)**: 직원웹 T29 `00035`가 만드는 `notification_settings`(`send_sms` 칸)는 ④ `00013 notification_type_settings`(`also_sms` 칸)와 **같은 목적·다른 이름의 중복**이다. 이 태스크는 실제 적용된 정본 `00013`을 소비한다. 직원웹 쪽 정합화는 별건(설계 병합/구현 단계에서 하나로 통일).
> ⚠️ **낡은 단방향 표기 교정**: Global Constraints 표의 「`consent`→Task 1(칸)」은 낡았다 — Task 1 본문이 「`consent`→Task 13」으로 정정했다(CLAUDE.md 함정 ①). `consent`(광고 동의)는 Task 13 소유라 트랜잭션만 다루는 이 태스크와 무관하다.

---

## Task 10: 환자용 라우터 연결 + 통합 테스트

> **담당 규칙**: 없음(백엔드 계약의 마지막 조각). Tasks 2~9가 만든 서비스 함수를 **HTTP 엔드포인트로 노출**하고, 프론트 화면 태스크(13~31)가 `ApiClient`로 부를 REST 표면을 완성한다. 규칙은 화면 태스크가 담는다.
>
> ⭐ **이 태스크는 「연결」이다 — 새 로직을 짓지 않는다.** 라우터는 **① 인증 의존성으로 `PatientContext`를 얻고 ② 요청 본문을 서비스 시그니처로 옮기고 ③ 서비스가 던진 `AppError`는 전역 핸들러가 HTTP로 바꾼다**(1단계 `app.core.errors`의 `app_error_handler` — 라우터에 `try/except` 금지). 직원용 `require_role` 대신 **`get_current_patient`**(Task 2)를 쓴다.
>
> ⚠️ **경계 갭 방지 — 노출 커버리지 표**(자기 점검, 「경계 갭 대조표」 정신): Tasks 2~9가 Produces한 서비스가 **하나도 안 빠지고** 엔드포인트를 갖는지 아래로 대조한다. 라우터 연결은 조용히 한 함수를 빠뜨리기 쉬운 자리다(화면이 그제서야 "부를 게 없다"고 발견).
>
> | 서비스(모듈) | 함수 | 엔드포인트 |
> |---|---|---|
> | `patient_profile_service` | `register_profile` | `POST /patients` |
> | 〃 | `get_my_profile` | `GET /patients/me` |
> | 〃 | `deactivate_self` | `DELETE /patients/me` |
> | `patient_family_service` | `list/add/update/unlink_family_member` | `GET/POST/PATCH/DELETE /family[/{id}]` |
> | `patient_catalog_service` | `list_departments`·`list_doctors`·`list_available_dates`·`list_available_slots`·`get_hospital_info` | `GET /catalog/*` |
> | `patient_booking_service` | `create_booking`·`change_booking` | `POST /bookings` · `PATCH /bookings/{id}` |
> | 〃 | `cancel_appointment`·`request_support` | `POST /bookings/{id}/cancel` · `/support` |
> | `patient_questionnaire_service` | `get_template`·`get_response`·`save_response` | `GET/PUT /my/appointments/{id}/questionnaire[/template]` |
> | `patient_appointment_query_service` | `list_my_appointments`·`get_appointment_detail`·`get_queue_status` | `GET /my/appointments[/{id}[/queue]]` |
> | `patient_history_service` | `list_visit_history` | `GET /my/history` |
> | `device_token_service` | `register_token`·`unregister_token` | `POST/DELETE /device-tokens` |
>
> ⚠️ **`source`는 클라이언트에서 안 받는다** — `POST /bookings`는 본문에 `source` 칸을 두지 않고 `create_booking(..., source='app')` 기본값을 쓴다(앱 API로 `source` 조작 불가 — 색인 「예약 서비스 공유」, staff 라우터의 `source="staff"` 고정과 같은 태도). `request_id`(멱등 키)는 **클라이언트가 만든 UUID**를 본문으로 받는다.
> ⚠️ **가입 직후 엔드포인트만 `get_current_auth_user_id`** — `POST /patients`(프로필 등록)는 아직 `patients` 행이 없어 `get_current_patient`가 403을 낸다. 이 하나만 **`get_current_auth_user_id`**(Task 2 — patients 행 없어도 통과)를 쓰고, 나머지 전부 `get_current_patient`.

**Files:**
- Create: `backend/app/routers/patient_profile.py` · `patient_family.py` · `patient_catalog.py` · `patient_bookings.py` · `patient_appointments.py` · `patient_device_tokens.py`
- Modify: `backend/app/main.py`(6개 라우터 `include_router` 등록)
- Test: `backend/tests/test_patient_routers_integration.py`

**Interfaces:**
- Consumes:
  - `get_current_patient`·`get_current_auth_user_id`·`PatientContext`(Task 2 `app.core.patient_security`) · `AppError`·`app_error_handler`(1단계 `app.core.errors` — 이미 등록됨)
  - 서비스 8종(위 커버리지 표) · 테스트 헬퍼 `seed_patient`·`seed_staff`·`client`·`committed_conn`(conftest — `seed_patient`은 Task 1이 추가)
- Produces:
  - REST 엔드포인트 표면(위 표). 프론트 화면 태스크(13~31)가 `ApiClient`로 소비한다.

- [ ] **Step 1: 통합 테스트 작성(실패)** — `backend/tests/test_patient_routers_integration.py`

```python
import time
import uuid
from datetime import date

import pytest
from jose import jwt

from app.core.config import settings
from tests.conftest import seed_patient, seed_staff


def make_token(auth_user_id: str) -> str:
    payload = {"sub": auth_user_id, "aud": "authenticated",
               "role": "authenticated", "exp": int(time.time()) + 3600}
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


async def _seed_auth_user(conn) -> str:
    """가입 전(patients 행 없는 auth 유저) — POST /patients 검증용. seed_staff의 auth.users 삽입과 같은 꼴."""
    uid = uuid.uuid4()
    await conn.execute(
        "insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role) "
        "values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')",
        uid, f"{uid}@test.local")
    return str(uid)


def _hdr(token): return {"Authorization": f"Bearer {token}"}


# ── 인증 경계 ───────────────────────────────────────────────
def test_patient_endpoints_require_auth(client):
    # 토큰이 없으면 401 — 대표 3경로.
    assert client.get("/patients/me").status_code == 401
    assert client.get("/my/appointments").status_code == 401
    assert client.post("/bookings", json={}).status_code == 401


@pytest.mark.asyncio
async def test_unregistered_auth_user_gets_403_on_patient_only_routes(client, committed_conn):
    # 토큰은 유효하나 patients 행이 없다 → get_current_patient가 403(등록/중지 구분 안 함).
    uid = await _seed_auth_user(committed_conn)
    assert client.get("/patients/me", headers=_hdr(make_token(uid))).status_code == 403


# ── 프로필: 가입 직후 엔드포인트는 get_current_auth_user_id ──
@pytest.mark.asyncio
async def test_register_then_get_me(client, committed_conn):
    uid = await _seed_auth_user(committed_conn)
    reg = client.post("/patients", headers=_hdr(make_token(uid)),
                      json={"name": "김환자", "birth_date": "1980-05-05", "gender": "F"})
    assert reg.status_code == 200 and "patient_id" in reg.json()
    me = client.get("/patients/me", headers=_hdr(make_token(uid)))     # 이제 patients 행이 있다
    assert me.status_code == 200 and me.json()["name"] == "김환자"


# ── 예약 생성: source는 서버가 'app'으로 고정, 멱등 ──────────
async def _seed_bookable(conn):
    """진료과·의사·빈 슬롯 하나. (department_id, doctor_id, slot_id) 반환."""
    admin = await seed_staff(conn, role="admin")
    dept = await conn.fetchval("insert into departments (name) values ('내과') returning id")
    doctor = await seed_staff(conn, role="doctor")
    await conn.execute("update staff set department_id=$1 where id=$2", dept, doctor["staff_id"])
    slot = await conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) "
        "values ($1, current_date + 7, '10:00', '빈시간') returning id", doctor["staff_id"])
    return dept, doctor["staff_id"], slot


@pytest.mark.asyncio
async def test_create_booking_via_api_fixes_source_app_and_is_idempotent(client, committed_conn):
    me = await seed_patient(committed_conn)
    dept, doctor, slot = await _seed_bookable(committed_conn)
    req = str(uuid.uuid4())
    body = {"for_patient_id": str(me["patient_id"]), "department_id": str(dept),
            "doctor_id": str(doctor), "slot_id": str(slot), "reason": "감기", "request_id": req}
    r1 = client.post("/bookings", headers=_hdr(make_token(str(me["auth_user_id"]))), json=body)
    r2 = client.post("/bookings", headers=_hdr(make_token(str(me["auth_user_id"]))), json=body)  # 같은 request_id
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["appointment_id"] == r2.json()["appointment_id"]                 # 멱등(00020)
    row = await committed_conn.fetchrow(
        "select source from appointments where id=$1", uuid.UUID(r1.json()["appointment_id"]))
    assert row["source"] == "app"                                                     # 클라이언트가 못 바꾼다


@pytest.mark.asyncio
async def test_change_booking_stale_lock_surfaces_409(client, committed_conn):
    # 낙관적 잠금 위반(APPT-RACE-01)이 AppError(409)로 HTTP에 그대로 뜬다.
    me = await seed_patient(committed_conn)
    dept, doctor, slot = await _seed_bookable(committed_conn)
    body = {"for_patient_id": str(me["patient_id"]), "department_id": str(dept),
            "doctor_id": str(doctor), "slot_id": str(slot), "reason": "감기", "request_id": str(uuid.uuid4())}
    appt = client.post("/bookings", headers=_hdr(make_token(str(me["auth_user_id"]))), json=body).json()["appointment_id"]
    slot2 = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) "
        "values ($1, current_date + 8, '11:00', '빈시간') returning id", doctor)
    r = client.patch(f"/bookings/{appt}", headers=_hdr(make_token(str(me["auth_user_id"]))),
                     json={"new_slot_id": str(slot2), "reason": "변경",
                           "expected_updated_at": "2000-01-01T00:00:00+00:00"})   # 낡은 시각
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_cancel_returns_flag_shape_not_error(client, committed_conn):
    # Task 10 배선 검증: 취소는 오류가 아니라 200 + {cancelled, after_deadline} 모양을 준다(막다른 길 금지).
    # 마감 전/후 값 자체는 Task 6 단위테스트 몫 — 여기선 미래 슬롯이라 마감 전이라 cancelled:true가 안정적.
    me = await seed_patient(committed_conn)
    dept, doctor, slot = await _seed_bookable(committed_conn)                     # current_date+7 슬롯 = 마감 전
    body = {"for_patient_id": str(me["patient_id"]), "department_id": str(dept),
            "doctor_id": str(doctor), "slot_id": str(slot), "reason": "감기", "request_id": str(uuid.uuid4())}
    appt = client.post("/bookings", headers=_hdr(make_token(str(me["auth_user_id"]))), json=body).json()["appointment_id"]
    updated = await committed_conn.fetchval("select updated_at from appointments where id=$1", uuid.UUID(appt))
    r = client.post(f"/bookings/{appt}/cancel", headers=_hdr(make_token(str(me["auth_user_id"]))),
                    json={"expected_updated_at": updated.isoformat()})
    assert r.status_code == 200
    assert r.json()["cancelled"] is True and r.json()["after_deadline"] is False   # 두 칸 모두 온다


# ── 나머지 라우터 배선 스모크(각 1건) ───────────────────────
@pytest.mark.asyncio
async def test_family_add_and_list(client, committed_conn):
    me = await seed_patient(committed_conn)
    add = client.post("/family", headers=_hdr(make_token(str(me["auth_user_id"]))),
                      json={"name": "김가족", "birth_date": "2015-01-01", "gender": "M", "relation": "자녀"})
    assert add.status_code == 200
    lst = client.get("/family", headers=_hdr(make_token(str(me["auth_user_id"]))))
    assert lst.status_code == 200 and any(f["name"] == "김가족" for f in lst.json())


@pytest.mark.asyncio
async def test_catalog_departments(client, committed_conn):
    me = await seed_patient(committed_conn)
    await committed_conn.execute("insert into departments (name) values ('정형외과')")
    r = client.get("/catalog/departments", headers=_hdr(make_token(str(me["auth_user_id"]))))
    assert r.status_code == 200 and any(d["name"] == "정형외과" for d in r.json())


@pytest.mark.asyncio
async def test_my_appointments_and_device_token(client, committed_conn):
    me = await seed_patient(committed_conn)
    tok = make_token(str(me["auth_user_id"]))
    assert client.get("/my/appointments", headers=_hdr(tok)).status_code == 200          # 빈 목록도 200
    assert client.post("/device-tokens", headers=_hdr(tok), json={"fcm_token": "fcm-x"}).status_code == 200
    assert client.request("DELETE", "/device-tokens", headers=_hdr(tok), json={"fcm_token": "fcm-x"}).status_code == 200
```

Run: `cd backend && pytest tests/test_patient_routers_integration.py -v`
Expected: FAIL(라우터 없음 → 404/모듈 없음)

- [ ] **Step 2: 라우터 구현 + 등록**

`backend/app/routers/patient_profile.py`:
```python
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_auth_user_id, get_current_patient
from app.services import patient_profile_service

router = APIRouter(tags=["patient-profile"])


class RegisterProfileRequest(BaseModel):
    name: str
    birth_date: date
    gender: str


@router.post("/patients")
async def register_profile(body: RegisterProfileRequest,
                           auth_user_id: UUID = Depends(get_current_auth_user_id)) -> dict:
    # 가입 직후 — patients 행이 아직 없으므로 get_current_patient가 아니라 auth_user_id 의존성.
    patient_id = await patient_profile_service.register_profile(
        auth_user_id, body.name, body.birth_date, body.gender)
    return {"patient_id": patient_id}


@router.get("/patients/me")
async def get_my_profile(patient: PatientContext = Depends(get_current_patient)) -> dict:
    return await patient_profile_service.get_my_profile(patient)


@router.delete("/patients/me")
async def deactivate_self(patient: PatientContext = Depends(get_current_patient)) -> dict:
    await patient_profile_service.deactivate_self(patient)
    return {"status": "deactivated"}
```

`backend/app/routers/patient_family.py`:
```python
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_patient
from app.services import patient_family_service

router = APIRouter(prefix="/family", tags=["patient-family"])


class AddFamilyRequest(BaseModel):
    name: str
    birth_date: date
    gender: str
    relation: str
    phone: str | None = None


class UpdateFamilyRequest(BaseModel):
    name: str
    birth_date: date
    gender: str
    relation: str


@router.get("")
async def list_family(patient: PatientContext = Depends(get_current_patient)) -> list[dict]:
    return await patient_family_service.list_family_members(patient)


@router.post("")
async def add_family(body: AddFamilyRequest,
                     patient: PatientContext = Depends(get_current_patient)) -> dict:
    fid = await patient_family_service.add_family_member(
        patient, body.name, body.birth_date, body.gender, body.relation, body.phone)
    return {"family_patient_id": fid}


@router.patch("/{family_patient_id}")
async def update_family(family_patient_id: UUID, body: UpdateFamilyRequest,
                        patient: PatientContext = Depends(get_current_patient)) -> dict:
    await patient_family_service.update_family_member(
        patient, family_patient_id, body.name, body.birth_date, body.gender, body.relation)
    return {"status": "updated"}


@router.delete("/{family_patient_id}")
async def unlink_family(family_patient_id: UUID,
                        patient: PatientContext = Depends(get_current_patient)) -> dict:
    await patient_family_service.unlink_family_member(patient, family_patient_id)
    return {"status": "unlinked"}
```

`backend/app/routers/patient_catalog.py`:
```python
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends
from app.core.patient_security import PatientContext, get_current_patient
from app.services import patient_catalog_service

router = APIRouter(prefix="/catalog", tags=["patient-catalog"])


@router.get("/departments")
async def departments(patient: PatientContext = Depends(get_current_patient)) -> list[dict]:
    return await patient_catalog_service.list_departments(patient)


@router.get("/departments/{department_id}/doctors")
async def doctors(department_id: UUID, patient: PatientContext = Depends(get_current_patient)) -> list[dict]:
    return await patient_catalog_service.list_doctors(department_id, patient)


@router.get("/doctors/{doctor_id}/dates")
async def dates(doctor_id: UUID, patient: PatientContext = Depends(get_current_patient)) -> list[str]:
    return await patient_catalog_service.list_available_dates(doctor_id, patient)


@router.get("/doctors/{doctor_id}/slots")
async def slots(doctor_id: UUID, target_date: date,   # 쿼리 ?target_date=YYYY-MM-DD (파라미터명이 date 타입을 가리지 않게)
                patient: PatientContext = Depends(get_current_patient)) -> list[dict]:
    return await patient_catalog_service.list_available_slots(doctor_id, target_date, patient)


@router.get("/hospital")
async def hospital(patient: PatientContext = Depends(get_current_patient)) -> dict:
    return await patient_catalog_service.get_hospital_info(patient)
```

`backend/app/routers/patient_bookings.py`:
```python
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_patient
from app.services import patient_booking_service

router = APIRouter(prefix="/bookings", tags=["patient-bookings"])


class CreateBookingRequest(BaseModel):
    for_patient_id: UUID
    department_id: UUID
    doctor_id: UUID
    slot_id: UUID
    reason: str
    request_id: UUID                     # 클라이언트가 만든 멱등 키(00020)


class ChangeBookingRequest(BaseModel):
    new_slot_id: UUID
    reason: str
    expected_updated_at: datetime        # 낙관적 잠금(APPT-RACE-01)


class CancelRequest(BaseModel):
    expected_updated_at: datetime


class SupportRequest(BaseModel):
    request_type: str                    # '취소' | '변경'


@router.post("")
async def create_booking(body: CreateBookingRequest,
                         patient: PatientContext = Depends(get_current_patient)) -> dict:
    # source는 본문에서 안 받는다 — 앱 라우터는 항상 'app'(기본값). 클라이언트가 조작 못 함.
    appointment_id = await patient_booking_service.create_booking(
        patient, body.for_patient_id, body.department_id, body.doctor_id,
        body.slot_id, body.reason, body.request_id)
    return {"appointment_id": appointment_id}


@router.patch("/{appointment_id}")
async def change_booking(appointment_id: UUID, body: ChangeBookingRequest,
                         patient: PatientContext = Depends(get_current_patient)) -> dict:
    new_id = await patient_booking_service.change_booking(
        patient, appointment_id, body.new_slot_id, body.reason, body.expected_updated_at)
    return {"appointment_id": new_id}


@router.post("/{appointment_id}/cancel")
async def cancel_booking(appointment_id: UUID, body: CancelRequest,
                         patient: PatientContext = Depends(get_current_patient)) -> dict:
    # 마감 후는 오류가 아니라 {cancelled:false, after_deadline:true} — 화면이 CANCEL-LATE 팝업.
    return await patient_booking_service.cancel_appointment(patient, appointment_id, body.expected_updated_at)


@router.post("/{appointment_id}/support")
async def request_support(appointment_id: UUID, body: SupportRequest,
                          patient: PatientContext = Depends(get_current_patient)) -> dict:
    return await patient_booking_service.request_support(patient, appointment_id, body.request_type)
```

`backend/app/routers/patient_appointments.py`:
```python
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_patient
from app.services import (patient_appointment_query_service as query_service,
                          patient_history_service, patient_questionnaire_service)

router = APIRouter(prefix="/my", tags=["patient-my"])


class SaveQuestionnaireRequest(BaseModel):
    answers: list[dict]
    complete: bool = False


@router.get("/appointments")
async def my_appointments(patient: PatientContext = Depends(get_current_patient)) -> list[dict]:
    return await query_service.list_my_appointments(patient)


@router.get("/appointments/{appointment_id}")
async def appointment_detail(appointment_id: UUID,
                             patient: PatientContext = Depends(get_current_patient)) -> dict:
    return await query_service.get_appointment_detail(patient, appointment_id)


@router.get("/appointments/{appointment_id}/queue")
async def queue_status(appointment_id: UUID,
                       patient: PatientContext = Depends(get_current_patient)) -> dict:
    return await query_service.get_queue_status(patient, appointment_id)


@router.get("/appointments/{appointment_id}/questionnaire/template")
async def questionnaire_template(appointment_id: UUID,
                                 patient: PatientContext = Depends(get_current_patient)) -> dict | None:
    return await patient_questionnaire_service.get_template(patient, appointment_id)


@router.get("/appointments/{appointment_id}/questionnaire")
async def get_questionnaire(appointment_id: UUID,
                            patient: PatientContext = Depends(get_current_patient)) -> dict | None:
    return await patient_questionnaire_service.get_response(patient, appointment_id)


@router.put("/appointments/{appointment_id}/questionnaire")
async def save_questionnaire(appointment_id: UUID, body: SaveQuestionnaireRequest,
                             patient: PatientContext = Depends(get_current_patient)) -> dict:
    return await patient_questionnaire_service.save_response(
        patient, appointment_id, body.answers, body.complete)


@router.get("/history")
async def visit_history(for_patient_id: UUID, cursor: str | None = None, limit: int = 20,
                        patient: PatientContext = Depends(get_current_patient)) -> dict:
    return await patient_history_service.list_visit_history(patient, for_patient_id, cursor, limit)
```

`backend/app/routers/patient_device_tokens.py`:
```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_patient
from app.services import device_token_service

router = APIRouter(prefix="/device-tokens", tags=["patient-device-tokens"])


class DeviceTokenRequest(BaseModel):
    fcm_token: str


@router.post("")
async def register_device_token(body: DeviceTokenRequest,
                                patient: PatientContext = Depends(get_current_patient)) -> dict:
    await device_token_service.register_token(patient, body.fcm_token)
    return {"status": "registered"}


@router.delete("")
async def unregister_device_token(body: DeviceTokenRequest,
                                  patient: PatientContext = Depends(get_current_patient)) -> dict:
    await device_token_service.unregister_token(patient, body.fcm_token)
    return {"status": "unregistered"}
```

`backend/app/main.py`에 6개 라우터를 등록(기존 import·등록 줄 옆에 추가):
```python
from app.routers import (patient_appointments, patient_bookings, patient_catalog,
                         patient_device_tokens, patient_family, patient_profile)
# ... 기존 staff/appointments/medical_records 등록 아래 ...
app.include_router(patient_profile.router)
app.include_router(patient_family.router)
app.include_router(patient_catalog.router)
app.include_router(patient_bookings.router)
app.include_router(patient_appointments.router)
app.include_router(patient_device_tokens.router)
```

Run: `cd backend && pytest tests/test_patient_routers_integration.py -v`
Expected: 통합 테스트 전부 PASS

- [ ] **Step 3: 백엔드 전체 회귀**

Run: `cd backend && pytest -q`
Expected: 1단계 + Tasks 1~10 전부 PASS(라우터 추가로 인한 회귀 0 — 새 경로는 기존 `/appointments`·`/staff`·`/medical-records`와 겹치지 않는다)

- [ ] **Step 4: 커밋**

```bash
git add backend/app/routers/patient_profile.py backend/app/routers/patient_family.py \
  backend/app/routers/patient_catalog.py backend/app/routers/patient_bookings.py \
  backend/app/routers/patient_appointments.py backend/app/routers/patient_device_tokens.py \
  backend/app/main.py backend/tests/test_patient_routers_integration.py
git commit -m "feat: 환자앱 Task 10 — 환자용 라우터 6종 연결 + 통합 테스트(source='app' 고정·멱등·409 배선)"
```

> 📌 **백엔드 계약(0~10) 완료 지점**이다. 다음(11~12)은 프론트 전역(오프라인·세션만료·오류/빈상태/버튼상태), 그다음 화면(13~31)이 이 REST 표면을 `ApiClient`로 소비한다.
> ⚠️ **경로 충돌 없음 확인**: 환자 라우터는 `/patients`·`/family`·`/catalog`·`/bookings`·`/my`·`/device-tokens`로, 직원 `/staff`·`/appointments`·`/medical-records`와 겹치지 않는다(같은 `/appointments`를 환자·직원이 나눠 쓰지 않는다 — 환자 예약은 `/bookings`·`/my/appointments`).
> ⚠️ **`get_current_auth_user_id`는 `POST /patients` 단 하나** — 나머지 전부 `get_current_patient`(등록·활성 환자만 403 게이트). 이 경계가 흐려지면 미등록 유저가 다른 엔드포인트에 닿는다.

---

## Task 11: 프론트 전역 — 오프라인 캐시 · 세션 만료 분리 · 잠금화면 알림 경계 · 전역 이동 규칙

> **담당 규칙(43)**: `OFF-*`(26 — CACHE·BAN·DO·STALE·AUTH·BACK) · `PUSH-BODY-*`(9 — **클라이언트 몫만**, 본문 내용은 서버 소유·교차참조) · `NAV-GLOBAL-*`(8). ⭐ **백엔드 0~10과 달리 규칙을 처음 담는 태스크** — 화면 태스크(13~31)가 소비할 전역 계층(providers·widgets·router guard)을 짓는다.
>
> ⭐⭐ **이 태스크의 심장 = 세션 만료 「분리」(갭 #38)**: Task 0의 `AuthStatus{signedOut, signedIn}`은 `session==null` 하나로 로그아웃을 판정해 **오프라인과 만료를 구분하지 못한다**(`OFF-AUTH-05`). 여기서 **`expiredOffline`(읽기전용)**을 더해 — **온라인에서 받은 401만 진짜 로그아웃**(→ 로그인 화면), **오프라인 중 실패는 만료로 안 본다**(보관본을 읽기전용으로 계속 보여줌). 근거: 결정 B-2(2026-08-04) · `OFF-AUTH-01·04` · `NAV-GLOBAL-03`. *"30분 만료는 공용 PC용 장치다. 개인 폰엔 위협 모형이 안 맞고 폰 잠금이 1차 방어선"*(결정 문서 1032).
>
> ⚠️ **PUSH 경계(⭐ 재소유 금지 — 경계 갭 교훈 적용)**: `PUSH-BODY-*`의 **본문 내용 규칙은 서버 소유**다 — `PUSH-BODY-01`(진료과·의사명·증상 금지)·`02`(가족 대상자 이름 = Task 9 `target_name`, 이미 구현)·`03`(새는 범위)·`05`(제목 「병원 안내」)·`06·08`(자유텍스트 두 겹)은 **Task 9 `notification_service.MESSAGES`/직원웹 T28**이 정한다. **Task 11은 클라이언트 몫만**: FCM 수신·표시·토큰 등록(Task 10 `/device-tokens`)·**`PUSH-BODY-04`(잠금화면 내용 감추기 안 씀 → 채널 가시성 기본 유지)**. `PUSH-BODY-09`(문자 미리보기)는 문자라 앱과 무관(직원웹). 아래 Step 4에 서버/클라 대조표.
>
> ⚠️ **NAV-GLOBAL 중 06·07·08은 Task 12 위젯에 의존**(양방향 악수): `06`(처리 중 이탈 확인)=`BTN-EXIT-*`, `07`(조회 실패 머묾)=`EMPTY-ERR-*`, `08`(미완료 신청 홈 카드)=`BTN-KILL-*` — **전부 Task 12 소유.** Task 11은 **라우터 정책(어디로 가나/안 가나)**을 정하고 위젯은 Task 12가 채운다. Task 12 본문에 이 셋의 위젯이 실제로 있어야 닫힌다.
>
> ⚠️ **캐시 범위(`OFF-CACHE-03`)**: **앞으로 갈 예약 목록만**(본인+가족 혼합, `OFF-CACHE-01`). 문진·이력·상담은 **담지 않는다**(지하 대기실 문제와 무관하고 폰에 남는 개인정보만 는다). 서버가 필요한 그 화면들은 오프라인 시 `EMPTY-OFF-01`(Task 12)의 빈 화면.

**Files:**
- Create: `patient_app/lib/core/connectivity.dart`(`connectivityProvider`) · `patient_app/lib/core/offline_cache.dart`(`UpcomingCache`) · `patient_app/lib/core/session_guard.dart`(`expiredOfflineProvider`·`effectiveAuthProvider`·`handleUnauthorized`) · `patient_app/lib/core/push.dart`(`PushService`)
- Create: `patient_app/lib/widgets/offline_banner.dart`(`OfflineBanner`) · `patient_app/lib/widgets/app_shell.dart`(배너+하단탭 래퍼)
- Modify: `patient_app/lib/features/auth/auth_state.dart`(`AuthStatus`에 `expiredOffline` 추가) · `patient_app/lib/core/router.dart`(전역 redirect 가드 — `NAV-GLOBAL-03·04·05`) · `patient_app/lib/core/api_client.dart`(401 콜백 훅) · `pubspec.yaml`(`connectivity_plus`·`flutter_secure_storage`·`firebase_messaging`)
- Test: `patient_app/test/session_guard_test.dart` · `offline_cache_test.dart` · `offline_banner_test.dart` · `router_guard_test.dart`

**Interfaces:**
- Consumes:
  - Task 0: `apiClientProvider`·`ApiClient`·`supabaseClientProvider`·`authStateChangesProvider`·`AuthState`·`AuthStatus`·시각 토큰(`tokens.dart`)·`appRouter`
  - Task 10: `POST/DELETE /device-tokens`(FCM 토큰 등록/해제) · `GET /my/appointments`(캐시 갱신 원본)
- Produces:
  - `connectivityProvider`(`StreamProvider<bool>` 온라인 여부) · `UpcomingCache`(save/read/clear·`isStale`) · `expiredOfflineProvider`·`effectiveAuthProvider`(`Provider<AuthStatus>`)·`handleUnauthorized(ref)` · `OfflineBanner`·`AppShell` · `PushService`(register/unregister/onMessage) · 라우터 전역 가드
  - 화면 태스크(13~31)가 소비: `effectiveAuthProvider`로 읽기전용 판정, `AppShell`로 배너·탭, `UpcomingCache`로 오프라인 홈.

- [ ] **Step 1: 연결성 + 오프라인 배너 (`OFF-BAN-*`·`NAV-GLOBAL-01·02`)**

`patient_app/lib/core/connectivity.dart`:
```dart
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// NAV-GLOBAL-01: 오프라인이 돼도 화면을 옮기지 않는다 — 이 provider는 배너·버튼상태만 바꾼다(하던 일을 안 빼앗는다).
// 초기값은 '온라인 가정'(첫 프레임에 배너가 깜빡이지 않게); 실제 상태가 오면 갱신.
final connectivityProvider = StreamProvider<bool>((ref) async* {
  yield (await Connectivity().checkConnectivity()) != ConnectivityResult.none;
  yield* Connectivity().onConnectivityChanged.map((r) => r != ConnectivityResult.none);
});
```

`patient_app/lib/widgets/offline_banner.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/connectivity.dart';
import '../core/offline_cache.dart';
import '../core/session_guard.dart';
import '../core/tokens.dart';
import '../features/auth/auth_state.dart';

// OFF-BAN-01: 한 줄 고정 띠. OFF-BAN-02: 옅은 주황 배경(주의색 배경 금지의 예외 1건 — 전면 상태 배너 한정).
// OFF-BAN-03: 절대 시각('오후 3:12 기준'). OFF-BAN-04: 날짜 넘어가면 날짜를 앞에. OFF-BAN-06: 카드마다 꼬리표 안 단다(띠 하나뿐).
// OFF-AUTH-02: 만료가 겹치면 둘째 줄에 '연결되면 다시 로그인해 주세요'(팝업 안 띄운다).
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(connectivityProvider).valueOrNull ?? true;
    final auth = ref.watch(effectiveAuthProvider);
    final expired = auth == AuthStatus.expiredOffline;
    if (online && !expired) return const SizedBox.shrink();            // OFF-BACK-01: 복구되면 조용히 사라진다

    final cachedAt = ref.watch(upcomingCacheProvider).valueOrNull?.savedAt;
    return Material(
      color: AppTokens.offlineBannerBg,                                // OFF-BAN-02: 옅은 주황(tokens.dart에 추가)
      child: SafeArea(bottom: false, child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text('인터넷 연결 없음 · ${_asOf(cachedAt)} 기준 정보',       // OFF-BAN-01·03·04
              style: const TextStyle(fontWeight: FontWeight.w600)),
          if (expired) const Text('연결되면 다시 로그인해 주세요'),      // OFF-AUTH-02
        ]),
      )),
    );
  }

  static String _asOf(DateTime? t) {
    if (t == null) return '방금';
    final now = DateTime.now();
    final hh = t.hour < 12 ? '오전 ${t.hour == 0 ? 12 : t.hour}' : '오후 ${t.hour == 12 ? 12 : t.hour - 12}';
    final time = '$hh:${t.minute.toString().padLeft(2, '0')}';
    if (t.year == now.year && t.month == now.month && t.day == now.day) return time;   // OFF-BAN-03
    final y = now.subtract(const Duration(days: 1));
    if (t.year == y.year && t.month == y.month && t.day == y.day) return '어제 $time'; // OFF-BAN-04
    return '${t.month}월 ${t.day}일';                                                    // OFF-BAN-04
  }
}
```

`patient_app/lib/widgets/app_shell.dart` — 모든 탭 화면을 감싸 배너를 맨 위에 얹는다(`NAV-GLOBAL-01`: 화면은 그대로, 띠만 얹음):
```dart
import 'package:flutter/material.dart';
import 'offline_banner.dart';

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.body, required this.bottomTabs});
  final Widget body;
  final Widget bottomTabs;                    // EMPTY-TAB-01·NAV-GLOBAL-02: 오프라인에도 탭은 눌린다(막지 않는다)

  @override
  Widget build(BuildContext context) => Column(children: [
        const OfflineBanner(),                // OFF-BAN-05(QR 전체화면은 그 화면이 같은 줄을 따로 넣는다 — 셸 밖이라 cross-ref)
        Expanded(child: body),
        bottomTabs,
      ]);
}
```

- [ ] **Step 2: 오프라인 캐시 (`OFF-CACHE-*`·`OFF-DO-*`·`OFF-STALE-*`)**

`patient_app/lib/core/offline_cache.dart`:
```dart
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

// OFF-CACHE-02: 앱 샌드박스(Keychain/EncryptedSharedPrefs) — 로그아웃·탈퇴 시 clear.
// OFF-CACHE-04: iOS 보호등급을 first_unlock로 '명시' 지정(기본값에 안 맡긴다). OFF-CACHE-05: 앱 자체 암호화 안 함(OS에 맡김).
// OFF-CACHE-06: iCloud·구글 백업에서 제외(백업할 가치 0인데 병원 밖 클라우드에 예약정보가 복제된다).
// OFF-CACHE-07: Keychain 항목은 synchronizable=false라 백업에서 제외된다 — '대개 포함되는 쪽'으로 안 만들도록 명시.
const _storage = FlutterSecureStorage(
  iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),   // OFF-CACHE-04
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
);

class CachedUpcoming {
  const CachedUpcoming({required this.items, required this.savedAt});
  final List<Map<String, dynamic>> items;
  final DateTime savedAt;
  // OFF-STALE-01: 저장 후 24시간 초과면 '오래된 보관본'. OFF-STALE-04: 전날·당일 알림을 못 받았다는 뜻이라 24h.
  bool get isStale => DateTime.now().difference(savedAt) > const Duration(hours: 24);
}

class UpcomingCache {
  static const _key = 'upcoming_appointments_v1';

  // OFF-CACHE-01: 서버에서 '앞으로 갈 예약 목록'을 받을 때 통째로 저장(본인+가족 혼합, 골라내지 않음).
  // OFF-CACHE-03: 예약 목록만 — 문진·이력·상담은 담지 않는다.
  Future<void> save(List<Map<String, dynamic>> upcoming) async {
    await _storage.write(key: _key,
        value: jsonEncode({'savedAt': DateTime.now().toIso8601String(), 'items': upcoming}));
  }

  Future<CachedUpcoming?> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null) return null;
    final m = jsonDecode(raw) as Map<String, dynamic>;
    return CachedUpcoming(
      items: (m['items'] as List).cast<Map<String, dynamic>>(),
      savedAt: DateTime.parse(m['savedAt'] as String));
  }

  Future<void> clear() => _storage.delete(key: _key);       // OFF-CACHE-02: 로그아웃·탈퇴 시 호출
}

final upcomingCacheProvider = FutureProvider<CachedUpcoming?>((ref) => UpcomingCache().read());
```

> 📌 **`OFF-DO-01·02`는 화면 태스크가 소비하는 계약**: 오프라인에서 되는 것 = 예약 카드·예약번호·QR 전체화면(`OFF-DO-01`, 홈/예약 화면 태스크가 `UpcomingCache`를 읽어 그린다). 안 되는 것 = 변경·취소·문진 저장 → **버튼 비활성 + 이유 문구**(`OFF-DO-02` → `BTN-STATE-03`, Task 12). `OFF-STALE-02`(QR·번호는 24h 넘어도 살려둠 — 접수 판단은 직원 몫)·`OFF-STALE-03`(카드 안 주의 한 줄 = `DISP-WARN-01` 좌측 4px 바, 배경 없음)도 카드 위젯(예약 화면 태스크)이 `isStale`을 읽어 얹는다. **Task 11은 `isStale` 판정과 캐시를 제공**하고 그림은 화면이 그린다.

- [ ] **Step 3: 세션 만료 분리 (`OFF-AUTH-*`·`NAV-GLOBAL-03`·갭 #38) — ⭐ 심장**

`patient_app/lib/features/auth/auth_state.dart` (Modify — Task 0의 enum에 한 값 추가):
```dart
// expiredOffline 신설(갭 #38): 세션이 없는데 '오프라인 중'이라 진짜 로그아웃인지 알 수 없는 상태.
// 이 동안 보관본을 읽기전용으로 계속 보여준다(OFF-AUTH-01) — 로그인 화면으로 튕기지 않는다.
enum AuthStatus { signedOut, signedIn, expiredOffline }
```

`patient_app/lib/core/session_guard.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'connectivity.dart';
import 'providers.dart';
import '../features/auth/auth_state.dart';

// 오프라인 중 401(만료 추정)을 받은 적이 있음 — 온라인 복구 시 초기화되고 진짜 재로그인으로 넘어간다.
final expiredOfflineProvider = StateProvider<bool>((_) => false);

// ⭐ 세 신호를 합쳐 '실효 인증 상태'를 낸다. 화면·라우터는 authStateChangesProvider가 아니라 이걸 본다.
final effectiveAuthProvider = Provider<AuthStatus>((ref) {
  final base = ref.watch(authStateChangesProvider).valueOrNull?.status ?? AuthStatus.signedOut;
  final online = ref.watch(connectivityProvider).valueOrNull ?? true;
  final offlineExpired = ref.watch(expiredOfflineProvider);
  if (base == AuthStatus.signedIn) return AuthStatus.signedIn;
  if (!online && offlineExpired) return AuthStatus.expiredOffline;   // OFF-AUTH-01: 읽기전용 유지, 로그인 안 보냄
  return AuthStatus.signedOut;                                       // OFF-AUTH-04·NAV-GLOBAL-03: 온라인 401만 여기
});

// ApiClient가 401을 받으면 부른다(Step 5 배관). OFF-AUTH-04: 네트워크 실패와 인증 실패를 구분한다.
Future<void> handleUnauthorized(Ref ref) async {
  final online = ref.read(connectivityProvider).valueOrNull ?? true;
  if (online) {
    ref.read(expiredOfflineProvider.notifier).state = false;
    await ref.read(supabaseClientProvider).auth.signOut();          // → session null → 라우터가 /login (NAV-GLOBAL-03)
  } else {
    ref.read(expiredOfflineProvider.notifier).state = true;         // 지하 대기실 튕김 방지(갭 #38 · OFF-AUTH-01)
  }
}
```

> 📌 `OFF-AUTH-03`(가족·이력·상담은 만료+오프라인에도 `EMPTY-OFF-01`, 변경·취소는 `BTN-STATE-03` — **오프라인일 때와 동작이 같아 규칙을 새로 안 만든다**)·`OFF-AUTH-05`(플랜의 `session==null` 단일 판정이 갭 #38의 출발점)는 이 분리로 해소된다. `OFF-BACK-01`(복구되고 내용 같으면 배너만 조용히 사라짐)·`OFF-BACK-02`(내용 바뀌면 문장으로 알리고 다시 그림 = 갭 #17·#18 「내가 보던 것이 바뀜」 규칙 발동, 화면 태스크)도 여기 연결.

- [ ] **Step 4: 잠금화면 알림 — 클라이언트 몫 (`PUSH-BODY-*`)**

⭐ **서버/클라 대조표**(재소유 금지 — 경계 갭 교훈):

| 규칙 | 무엇 | 소유 |
|---|---|---|
| `PUSH-BODY-01` 진료과·의사명·증상 금지 | 본문 내용 | **서버**(Task 9 `MESSAGES` — 이미 안전) |
| `PUSH-BODY-02` 가족 대상자 이름 유지 | 본문 내용 | **서버**(Task 9 `target_name` — 구현됨) |
| `PUSH-BODY-03` 새는 범위 = 「예약 있다」까지 | 본문 내용 | **서버**(Task 9) |
| `PUSH-BODY-05` 제목 「병원 안내」 | 알림 제목 | **서버**(발송 페이로드) |
| `PUSH-BODY-06` 자유텍스트 두 겹(푸시는 「도착했습니다」만) | 본문 내용 | **직원웹 T28** |
| `PUSH-BODY-07` ⚠️ `BODY-04`와 혼동 금지 — 기각된 건 「OS에 감춰달라 부탁」, 두 겹은 「안 보내기」 | 개념 경계 | **직원웹 T28**(두 겹 발송 시 적용) |
| `PUSH-BODY-08` 정해진 11종은 그대로 본문 발송(두 겹은 자유텍스트만) | 본문 내용 | **서버**(Task 9 `MESSAGES`) |
| `PUSH-BODY-09` 문자 미리보기 | 문자(앱 무관) | **직원웹 T30** |
| **`PUSH-BODY-04`** 잠금화면 감추기 **안 씀** | **채널 가시성** | **⭐ Task 11(여기)** |
| FCM 수신·표시·토큰 등록·탭 라우팅 | 클라이언트 전달 | **⭐ Task 11(여기)** |

`patient_app/lib/core/push.dart`:
```dart
import 'package:firebase_messaging/firebase_messaging.dart';
import 'api_client.dart';

class PushService {
  PushService(this._api);
  final ApiClient _api;

  // PUSH-BODY-04: 잠금화면 내용을 앱이 감추지 않는다 — Android 채널 가시성을 기본(PUBLIC)으로 두고
  //   VISIBILITY_PRIVATE를 '설정하지 않는다'. iOS는 기본 표시. 한쪽만 되는 감추기를 안 써 두 기기가 갈리지 않는다.
  //   (본문 내용은 서버가 이미 안전하게 만든다 — PUSH-BODY-01~03. 여기서 본문을 다시 만들지 않는다.)
  Future<void> init() async {
    await FirebaseMessaging.instance.requestPermission();
    // 채널은 기본 중요도 + 기본 가시성. lockscreenVisibility를 secret/private으로 낮추지 않는다.
  }

  // 로그인 직후: FCM 토큰을 Task 10 엔드포인트로 등록(같은 기기 재등록은 서버가 on conflict로 무해).
  Future<void> registerToken() async {
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) await _api.post('/device-tokens', {'fcm_token': token});
  }

  // 로그아웃·탈퇴: 등록 해제(죽은 토큰의 남은 절반은 서버 T30가 발송 시 정리 — #100).
  Future<void> unregisterToken() async {
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) await _api.delete('/device-tokens', body: {'fcm_token': token});
  }
}
```

> 📌 **알림 탭 → 목적지**는 `NOTI-*`(알림함, Task 18)가 정한다 — 여기선 앱을 열어 홈으로 보내는 기본 배관만. 종류별 딥링크는 Task 18에서 이 `PushService`에 붙인다(양방향 악수: Task 18이 목적지 표를 채운다).

- [ ] **Step 5: 라우터 전역 가드 (`NAV-GLOBAL-03·04·05`) + ApiClient 401 훅**

`patient_app/lib/core/router.dart` (Modify — Task 0 골격에 `redirect` 추가):
```dart
// 전역 redirect: effectiveAuthProvider(세 신호 합성)를 읽어 어디로 갈지/안 갈지 정한다.
redirect: (context, state) {
  final container = ProviderScope.containerOf(context);
  final auth = container.read(effectiveAuthProvider);
  final loc = state.matchedLocation;
  final protected = !loc.startsWith('/login') && !loc.startsWith('/signup');

  // NAV-GLOBAL-03: 진짜 로그아웃(온라인 401)만 로그인으로. expiredOffline은 여기서 걸리지 않는다.
  if (auth == AuthStatus.signedOut && protected) return '/login';
  // OFF-AUTH-01: expiredOffline이면 캐시 읽기전용 화면 유지 — 로그인으로 보내지 않는다(리다이렉트 없음).
  if (auth == AuthStatus.expiredOffline) return null;
  // NAV-GLOBAL-04(갭 #43): 인증됐지만 프로필 미완료면 가입 ③으로. `profileMissingProvider`는 GET /patients/me
  // 403으로 판정(get_current_patient가 patients 행이 없을 때 403 — Task 13에서 정의). ⚠️ 옛 주석의 "404"는 낡음.
  if (auth == AuthStatus.signedIn && container.read(profileMissingProvider) && !loc.startsWith('/signup')) {
    return '/signup/step3';
  }
  // NAV-GLOBAL-05: 민감 경로(설정·가족·탈퇴)이고 떠난 지 5분 지났으면 재인증 먼저(AUTH-REAUTH-*, 가입 태스크 13).
  if (_isSensitive(loc) && container.read(sensitiveReauthGuardProvider).needsReauth) return '/reauth?next=$loc';
  return null;
},
```

`patient_app/lib/core/api_client.dart` (Modify — 401 시 콜백 훅 한 줄):
```dart
// 응답이 401이면 주입된 onUnauthorized를 부른다. 오프라인/온라인 판정은 session_guard.handleUnauthorized가 한다.
// (Task 0 ApiClient에 `void Function()? onUnauthorized` 선택 인자를 더하고, providers.dart에서 handleUnauthorized로 배선.)
if (response.statusCode == 401) { onUnauthorized?.call(); throw ApiException('세션이 만료되었습니다.'); }
```

> 📌 **NAV-GLOBAL 나머지는 정책만 여기, 위젯은 Task 12**(양방향 악수): `NAV-GLOBAL-06`(처리 중 이탈)→`BTN-EXIT-*` 확인 팝업 · `NAV-GLOBAL-07`(조회 실패)→`EMPTY-ERR-01` 빈 상태·머묾 · `NAV-GLOBAL-08`(미완료 신청 재실행)→홈 카드 `BTN-KILL-03`·⛔자동 재신청 안 함 `BTN-KILL-07`. **Task 12가 이 셋의 위젯을 실제로 만들어야 닫힌다** — Task 12 커버리지에 포함. `NAV-GLOBAL-01·NAV-GLOBAL-02`는 Step 1(배너·셸)에서 이미 닫혔다.

- [ ] **Step 6: 테스트**

- `session_guard_test.dart`: ①온라인+401 → `signOut` 호출됨·`signedOut`(NAV-GLOBAL-03) ②오프라인+401 → `expiredOffline`·`signOut` 안 부름(갭 #38) ③오프라인 복구 → 플래그 초기화.
- `offline_cache_test.dart`: save→read 왕복·`isStale`(25h 경과 true·23h false, OFF-STALE-01)·`clear`(OFF-CACHE-02)·문진/이력 키 없음(OFF-CACHE-03).
- `offline_banner_test.dart`: 온라인이면 `SizedBox.shrink`·오프라인이면 절대시각 문구(OFF-BAN-03)·만료 겹치면 둘째 줄(OFF-AUTH-02)·어제 날짜 접두(OFF-BAN-04).
- `router_guard_test.dart`: signedOut+보호경로→`/login`·expiredOffline→리다이렉트 없음(OFF-AUTH-01)·signedIn+프로필없음→`/signup/step3`(NAV-GLOBAL-04).

Run: `cd patient_app && flutter test`
Expected: 전체 PASS

- [ ] **Step 7: 커밋**

```bash
git add patient_app/lib/core/connectivity.dart patient_app/lib/core/offline_cache.dart \
  patient_app/lib/core/session_guard.dart patient_app/lib/core/push.dart \
  patient_app/lib/widgets/offline_banner.dart patient_app/lib/widgets/app_shell.dart \
  patient_app/lib/features/auth/auth_state.dart patient_app/lib/core/router.dart \
  patient_app/lib/core/api_client.dart patient_app/pubspec.yaml patient_app/test/
git commit -m "feat: 환자앱 Task 11 — 전역 오프라인 캐시·세션만료 분리(갭 #38)·잠금알림 클라경계·NAV-GLOBAL 가드"
```

> 📌 **규칙 커버리지**: `OFF-CACHE-01~07`·`OFF-BAN-01~06`·`OFF-DO-01~02`·`OFF-STALE-01~04`·`OFF-AUTH-01~05`·`OFF-BACK-01~02`(26) + `PUSH-BODY-04`+클라 배관(나머지 PUSH-BODY는 서버 소유·대조표) + `NAV-GLOBAL-01~08`(8, 단 06·07·08 위젯은 Task 12). ⚠️ **화면이 소비할 계약**(`OFF-DO`·`OFF-STALE-02·03`의 그림)은 카드 위젯 태스크가 `UpcomingCache`·`isStale`을 읽어 그린다 — Task 11은 판정·저장·전역 배관을 제공.
> ⚠️ **갭 #43(NAV-GLOBAL-04 프로필 미완료 라우팅)**은 여기서 라우터 정책으로 처음 구현된다 — `profileMissingProvider`(GET /patients/me 404 판정)는 가입 태스크(13)와 짝. Task 13 본문에 `profileMissingProvider` 정의가 있어야 닫힌다(양방향 악수).

---

## Task 12: 프론트 전역 — 오류 표시 · 버튼 상태(Busy/쿨다운/유언) · 빈 상태 · 확인·막힘 팝업 (58규칙)

> **담당 규칙(58)**: `ERR-*`(18 — MSG·KIND·FLD·POS·GONE·RETRY) · `BTN-*`(28 — SCOPE·BUSY·STATE·TIME·EXIT·KILL·COOL) · `EMPTY-*`(8 — LAY·OFF·ERR·ZERO·TAB) · `BLOCK-*`(4 — EXIT·TIME·CONF·CHG). ⭐ **화면 태스크(13~31)가 소비할 「공용 위젯 상자」** — 오류 문구·버튼·빈 화면·확인 팝업을 한 벌로 짓고, 각 화면은 그리기만 한다.
>
> ⭐⭐ **이 태스크의 심장 = 「누를 것이 이미 있으면 [다시 시도]를 만들지 않는다」(`ERR-RETRY-03`)**: 버튼을 눌러 실패한 것(동작 실패)은 **그 버튼을 다시 누르면 되므로** 오류 문구만 버튼 위에 붙인다(`InlineError`). 화면 진입과 함께 저절로 일어나는 조회가 실패한 것은 **다시 할 수단이 화면에 없으므로** `[다시 시도]`가 달린 빈 화면을 준다(`EmptyState`). 이 한 줄이 `ERR-*`와 `EMPTY-*`를 가른다.
>
> ⚠️ **양방향 악수(Task 11이 정책만 정하고 위젯은 여기서 실체화)**: `NAV-GLOBAL-06`(처리 중 이탈)=`showExitConfirm`(`BTN-EXIT-*`) · `NAV-GLOBAL-07`(조회 실패 머묾)=`EmptyState.error`(`EMPTY-ERR-01`) · `NAV-GLOBAL-08`(미완료 신청 재실행)=`PendingRequestCard`(`BTN-KILL-03·07`). **Task 11 라우터 가드가 이 세 위젯을 호출**하므로, 여기서 실제 위젯이 있어야 닫힌다.
>
> ⚠️ **경계(재소유 금지)**: ① 실제 **서버 호출·Busy 해제 타이밍**은 각 화면 태스크가 자기 화면의 `Notifier`에서 한다 — Task 12는 **상태를 받아 그리는 위젯**만 만든다(`busy` 플래그·`errorText`를 파라미터로 받음). ② **딥틸 색(`#0B6E70`)이 Task 0 `tokens.dart`에 없다**(T0 누락 — `gray`·`warn`만 있음). `BTN-STATE-01·02`가 「진한/흐린 딥틸」을 못박으므로 **Step 1에서 `tokens.dart`에 `primary`·`primaryBusy`를 보강**한다(값 근거: 목업 `--primary:#0B6E70` 66회, 처리 중 흐림 = opacity .72 계열). ③ `ERR-POS-01`의 「좌측 4px 바·배경 없음」은 Task 0 `WarnText`가 이미 그 모양이라 **재사용**한다.

**Files:**
- Modify: `patient_app/lib/core/tokens.dart`(`primary`·`primaryBusy` 딥틸 2색 추가 — T0 누락 보강)
- Create: `patient_app/lib/widgets/action_button.dart`(`ActionButton` — `BTN-SCOPE`·`BUSY`·`STATE`·`TIME`)
- Create: `patient_app/lib/widgets/inline_error.dart`(`InlineError` — 동작 실패 오류 `ERR-MSG`·`KIND`·`POS`·`GONE`·`RETRY`)
- Create: `patient_app/lib/widgets/field_error.dart`(`FieldTextInput`·`FormErrorController` — 입력 검증 `ERR-FLD`)
- Create: `patient_app/lib/core/pending_request.dart`(`PendingRequestStore`·`pendingRequestProvider` — `BTN-KILL` 유언장)
- Create: `patient_app/lib/widgets/pending_request_card.dart`(`PendingRequestCard` — 죽었다 켠 뒤 홈 안내 `BTN-KILL-03·04·05`)
- Create: `patient_app/lib/core/phone_cooldown.dart`(`PhoneCooldownStore`·`phoneCooldownProvider` — `BTN-COOL` 번호 기준)
- Create: `patient_app/lib/widgets/cooldown_button.dart`(`CooldownButton` — `BTN-COOL` 카운트다운)
- Create: `patient_app/lib/widgets/empty_state.dart`(`EmptyState` — `EMPTY-*`)
- Create: `patient_app/lib/widgets/block_dialog.dart`(`showBlockDialog`·`showExitConfirm` — `BLOCK-*`·`BTN-EXIT-*`)
- Test: `patient_app/test/widgets/action_button_test.dart` · `inline_error_test.dart` · `field_error_test.dart` · `pending_request_test.dart` · `cooldown_button_test.dart` · `empty_state_test.dart` · `block_dialog_test.dart`

**Interfaces:**
- Consumes:
  - Task 0: `AppTokens`(`primary`·`primaryBusy`·`grayPending`·`grayDone`·`warn`) · `WarnText`(좌측 4px 바 위젯) · `apiClientProvider`·`ApiClient`
  - Task 11: `connectivityProvider`(`StreamProvider<bool>`) — 오프라인 판정(`EMPTY-OFF-01`·`EMPTY-TAB-*`) · `handleUnauthorized` 흐름과 무관(만료는 T11 소유)
- Produces:
  - `ActionButton({label, busyLabel, onPressed, busy, disabledReason})` · `InlineError({message})`(+ `ErrorKind` 배치 규칙) · `FieldTextInput`·`FormErrorController`(칸별 오류·검사 시점·자동 스크롤) · `PendingRequestStore`(begin/complete/dismiss·`pendingRequestProvider`) · `PendingRequestCard` · `PhoneCooldownStore`(startedAt·remainingSeconds·`phoneCooldownProvider`) · `CooldownButton` · `EmptyState.offline/error/zero/named` · `showBlockDialog`·`showExitConfirm`
  - 화면 태스크(13~31)가 소비: 저장·변경 버튼=`ActionButton`, 조회 실패 화면=`EmptyState.error`, 0건=`EmptyState.zero`, 예약 변경 확인=`showBlockDialog(before/after)`, 인증번호 재발송=`CooldownButton`.

- [ ] **Step 1: `ActionButton` — 서버 변경 버튼의 4가지 상태 (`BTN-SCOPE-01·02` · `BTN-BUSY-01·02` · `BTN-STATE-01·02·03` · `BTN-TIME-01`)**

먼저 T0 `tokens.dart`에 딥틸 2색을 보강한다(없으면 `BTN-STATE` 색을 못 그린다).

`patient_app/lib/core/tokens.dart` (Modify — `AppTokens` 클래스 안, `warn` 아래에 추가):
```dart
  // BTN-STATE-01/02 — 딥틸(primary). 평소=진한 딥틸, 처리 중=흐린 딥틸(회색 아님).
  // 값 근거: 목업 `--primary:#0B6E70`(66회). 처리 중 흐림은 primary를 opacity로 낮춘 계열(목업 처리 중 버튼 .72).
  static const Color primary = Color(0xFF0B6E70);
  static const Color primaryBusy = Color(0xBF0B6E70); // 알파 0xBF ≈ .75 — 흐린 딥틸(회색으로 칠하지 않는다)
```

- [ ] **Step 1a: 실패 테스트** — `test/widgets/action_button_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/tokens.dart';
import 'package:hospital_patient_app/widgets/action_button.dart';

FilledButton _btn(WidgetTester t) =>
    t.widget<FilledButton>(find.byType(FilledButton));

Color _bg(WidgetTester t) =>
    _btn(t).style!.backgroundColor!.resolve({}) as Color;

void main() {
  // BTN-STATE-02는 "회색으로 칠하지 않는다"가 핵심 — 처리 중 색이 회색 계열이 아님을 못박는다.
  test('[BTN-STATE-02] 처리 중 색은 회색 두 토큰 어느 것도 아니다(흐린 딥틸)', () {
    expect(AppTokens.primaryBusy == AppTokens.grayPending, isFalse);
    expect(AppTokens.primaryBusy == AppTokens.grayDone, isFalse);
  });

  testWidgets('[BTN-SCOPE-01] 서버를 바꾸는 버튼을 누르면 onPressed가 실행된다', (t) async {
    var tapped = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ActionButton(
      label: '예약 신청하기', busyLabel: '예약 신청 중…',
      onPressed: () => tapped = true))));
    await t.tap(find.byType(FilledButton));
    expect(tapped, isTrue);
  });

  testWidgets('[BTN-SCOPE-02] 읽기 전용 버튼이 아님 — 상태(busyLabel)를 반드시 요구한다', (t) async {
    // ActionButton은 busyLabel이 required다. 조회·이동 버튼(상태 없음)은 이 위젯을 쓰지 않는다.
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ActionButton(
      label: '예약 신청하기', busyLabel: '예약 신청 중…', onPressed: () {}))));
    expect(find.text('예약 신청하기'), findsOneWidget); // 평소 라벨
  });

  testWidgets('[BTN-BUSY-01] 처리 중에도 글자를 지우지 않고 진행형으로 바꾼다', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ActionButton(
      label: '예약 신청하기', busyLabel: '예약 신청 중…', busy: true, onPressed: () {}))));
    expect(find.text('예약 신청 중…'), findsOneWidget);
    expect(find.text('예약 신청하기'), findsNothing);
  });

  testWidgets('[BTN-BUSY-02] 처리 중 다시 누르면 무시한다', (t) async {
    var count = 0;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ActionButton(
      label: '신청', busyLabel: '신청 중…', busy: true, onPressed: () => count++))));
    await t.tap(find.byType(FilledButton));
    expect(count, 0);
  });

  testWidgets('[BTN-STATE-01] 평소 배경은 진한 딥틸(primary)', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ActionButton(
      label: '신청', busyLabel: '신청 중…', onPressed: () {}))));
    expect(_bg(t), AppTokens.primary);
  });

  testWidgets('[BTN-STATE-02] 처리 중 배경은 흐린 딥틸(primaryBusy)', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ActionButton(
      label: '신청', busyLabel: '신청 중…', busy: true, onPressed: () {}))));
    expect(_bg(t), AppTokens.primaryBusy);
  });

  testWidgets('[BTN-STATE-03] 비활성이면 회색 + 이유 문구를 함께 보여준다', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ActionButton(
      label: '변경하기', busyLabel: '변경 중…', onPressed: () {},
      disabledReason: '오프라인 상태에서는 변경할 수 없습니다'))));
    expect(_bg(t), AppTokens.grayDone);                       // 회색
    expect(find.text('오프라인 상태에서는 변경할 수 없습니다'), findsOneWidget); // 이유 문구
  });

  testWidgets('[BTN-TIME-01] 앱은 스스로 타임아웃을 걸지 않는다 — busy는 외부가 풀 때까지 유지', (t) async {
    var count = 0;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ActionButton(
      label: '신청', busyLabel: '신청 중…', busy: true, onPressed: () => count++))));
    await t.pump(const Duration(minutes: 5)); // 5분 지나도
    await t.tap(find.byType(FilledButton));
    expect(count, 0);                          // 여전히 무시(자동 해제 없음)
    expect(find.text('신청 중…'), findsOneWidget);
  });
}
```
Run: `flutter test test/widgets/action_button_test.dart` → Expected: FAIL(`action_button.dart` 없음).

- [ ] **Step 1b: `ActionButton` 구현** — `patient_app/lib/widgets/action_button.dart`

```dart
import 'package:flutter/material.dart';
import '../core/tokens.dart';

/// 서버에 무언가를 남기거나 바꾸는 버튼(BTN-SCOPE-01). 조회·화면 이동·펼치기 등 읽기만 하는
/// 동작(BTN-SCOPE-02)은 이 위젯을 쓰지 않는다 — 상태(busy)가 필요 없는 일반 버튼을 쓴다.
///
/// 상태별 모양:
/// - 평소: 진한 딥틸 + 흰 글자(BTN-STATE-01)
/// - 처리 중: 흐린 딥틸 + 흰 글자, 라벨은 진행형으로 유지(BTN-BUSY-01·BTN-STATE-02) — 회색으로 칠하지 않는다
/// - 비활성: 회색 + 회색 글자 + 이유 문구(BTN-STATE-03)
///
/// BTN-TIME-01: 앱은 스스로 시간제한을 걸지 않는다. busy는 오직 호출자(화면 Notifier)가
/// 서버 응답을 받아 false로 되돌릴 때만 풀린다. 처리 중 다시 눌러도 무시한다(BTN-BUSY-02).
class ActionButton extends StatelessWidget {
  final String label;           // 평소 라벨
  final String busyLabel;       // 처리 중 진행형 라벨(required — 상태 있는 버튼임을 타입으로 강제)
  final bool busy;              // 서버 응답 대기 중
  final String? disabledReason; // null이 아니면 비활성 + 이 이유 문구 노출(BTN-STATE-03)
  final VoidCallback onPressed;

  const ActionButton({
    super.key,
    required this.label,
    required this.busyLabel,
    required this.onPressed,
    this.busy = false,
    this.disabledReason,
  });

  bool get _disabled => disabledReason != null;

  @override
  Widget build(BuildContext context) {
    final Color bg = _disabled
        ? AppTokens.grayDone
        : (busy ? AppTokens.primaryBusy : AppTokens.primary);
    final Color fg = _disabled ? AppTokens.grayPending : Colors.white;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: bg,
            foregroundColor: fg,
          ),
          // 버튼은 enabled로 두어 위 배경색을 유지하고(회색·흐린 딥틸을 Material 기본 disabled 스타일에
          // 뺏기지 않게), busy/비활성일 때 콜백만 내부에서 무시한다(BTN-BUSY-02·BTN-STATE-03·BTN-TIME-01).
          onPressed: () {
            if (busy || _disabled) return;
            onPressed();
          },
          child: Text(busy ? busyLabel : label),
        ),
        if (_disabled)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              disabledReason!,
              style: const TextStyle(color: AppTokens.grayPending, fontSize: 13),
            ),
          ),
      ],
    );
  }
}
```
Run: `flutter test test/widgets/action_button_test.dart` → Expected: PASS(9 tests).

- [ ] **Step 2: `InlineError` — 버튼 동작이 실패했을 때의 오류 문구 (`ERR-MSG-01·02` · `ERR-KIND-01` · `ERR-POS-01·02·03` · `ERR-GONE-01·02·03` · `ERR-RETRY-01·03·04`)**

> **범위**: 화면은 떠 있고 **내가 누른 버튼만 실패**한 경우. 조회 자체가 실패해 화면을 못 연 경우는 `EmptyState`(Step 6). 이 경계가 `ERR-RETRY-03`(누를 것이 있으면 만들지 않는다)이다.

- [ ] **Step 2a: 실패 테스트** — `test/widgets/inline_error_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/tokens.dart';
import 'package:hospital_patient_app/widgets/warn_text.dart';
import 'package:hospital_patient_app/widgets/inline_error.dart';

Widget _host(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  testWidgets('[ERR-MSG-01] 서버가 준 문장을 그대로 쓴다 — 앱이 다시 쓰지 않는다', (t) async {
    await t.pumpWidget(_host(const InlineError('이미 예약된 시간입니다. 다른 시간을 선택해주세요.')));
    expect(find.text('이미 예약된 시간입니다. 다른 시간을 선택해주세요.'), findsOneWidget);
  });

  testWidgets('[ERR-MSG-02] 위젯은 메시지를 가공하지 않는다(자르기·접두어 금지) — 서버 한글 문장을 신뢰', (t) async {
    const long = '요청을 처리할 수 없습니다. 잠시 후 다시 시도하시거나 병원으로 문의해주세요.';
    await t.pumpWidget(_host(const InlineError(long)));
    expect(find.text(long), findsOneWidget); // 통째로. "오류: " 같은 접두어를 붙이지 않는다.
  });

  testWidgets('[ERR-KIND-01] 동작 실패 오류는 특정 칸이 아니라 버튼에 귀속 — 필드명을 받지 않는다', (t) async {
    // InlineError 생성자에는 fieldName이 없다. 입력 검증(칸 아래)은 FieldTextInput(Step 3)이 담는다.
    await t.pumpWidget(_host(const InlineError('마감된 진료입니다')));
    expect(find.byType(InlineError), findsOneWidget);
  });

  testWidgets('[ERR-POS-01] 좌측 4px 바 + 주의색 + 배경 없음(WarnText 재사용)', (t) async {
    await t.pumpWidget(_host(const InlineError('실패했습니다')));
    expect(find.byType(WarnText), findsOneWidget); // WarnText가 좌측 4px 바·warn색·배경없음을 보장
    final deco = t.widget<Container>(find.descendant(
        of: find.byType(WarnText), matching: find.byType(Container))).decoration as BoxDecoration;
    expect(deco.border!.left.width, AppTokens.warnBarWidth); // 4px
    expect(deco.color, isNull);                              // 배경 없음
  });

  testWidgets('[ERR-POS-02] 오류가 시야 밖이면 그 위치로 자동 스크롤한다', (t) async {
    final controller = ScrollController();
    await t.pumpWidget(_host(_Toggler(controller)));
    // 처음엔 리스트 아래쪽 오류 자리가 화면 밖.
    expect(find.text('버튼 동작이 실패했습니다'), findsNothing);
    await t.tap(find.text('오류 켜기'));
    await t.pumpAndSettle();
    // 자동 스크롤로 오류가 화면에 들어온다.
    expect(find.text('버튼 동작이 실패했습니다'), findsOneWidget);
    expect(controller.offset, greaterThan(0));
  });

  testWidgets('[ERR-POS-03] 스낵바를 쓰지 않는다 — 인라인 위젯이라 사라지지 않는다', (t) async {
    await t.pumpWidget(_host(const InlineError('실패')));
    await t.pump(const Duration(seconds: 5));
    expect(find.byType(SnackBar), findsNothing); // 스낵바 아님
    expect(find.text('실패'), findsOneWidget);     // 5초 뒤에도 그대로(자동 소멸 없음)
  });

  testWidgets('[ERR-GONE-01] 입력을 고쳐 풀리는 오류는 message=null이 되면 즉시 사라진다', (t) async {
    await t.pumpWidget(_host(const InlineError('형식이 올바르지 않습니다')));
    expect(find.text('형식이 올바르지 않습니다'), findsOneWidget);
    await t.pumpWidget(_host(const InlineError(null))); // 화면이 오류를 지움
    expect(find.text('형식이 올바르지 않습니다'), findsNothing);
    expect(find.byType(SizedBox), findsWidgets); // null이면 빈 자리(SizedBox.shrink)
  });

  testWidgets('[ERR-GONE-02] 다시 눌러 푸는 오류도 message=null 전환으로 사라진다', (t) async {
    await t.pumpWidget(_host(const InlineError('저장에 실패했습니다')));
    await t.pumpWidget(_host(const InlineError(null))); // 다시 누르는 순간 화면이 null로(◌ 저장 중…)
    expect(find.text('저장에 실패했습니다'), findsNothing);
  });

  testWidgets('[ERR-GONE-03] 스크롤 등 무관한 조작에는 사라지지 않는다', (t) async {
    await t.pumpWidget(_host(const InlineError('마감된 진료입니다')));
    await t.drag(find.byType(InlineError), const Offset(0, -50)); // 무관한 조작
    await t.pump();
    expect(find.text('마감된 진료입니다'), findsOneWidget); // 그대로
  });

  testWidgets('[ERR-RETRY-01] 버튼을 눌러 실패한 오류에는 [다시 시도]를 만들지 않는다', (t) async {
    await t.pumpWidget(_host(const InlineError('신청에 실패했습니다')));
    expect(find.text('다시 시도'), findsNothing);
    expect(find.textContaining('다시 시도'), findsNothing);
  });

  testWidgets('[ERR-RETRY-03] 누를 것이 이미 있으면 재시도 버튼을 만들지 않는다(InlineError엔 없음)', (t) async {
    // 원래 버튼을 다시 누르면 되므로 InlineError는 어떤 버튼도 갖지 않는다.
    await t.pumpWidget(_host(const InlineError('실패')));
    expect(find.byType(ElevatedButton), findsNothing);
    expect(find.byType(TextButton), findsNothing);
    expect(find.byType(FilledButton), findsNothing);
  });

  testWidgets('[ERR-RETRY-04] InlineError는 원래 버튼의 글자를 건드리지 않는다 — 오류만 위에 얹는다', (t) async {
    // InlineError는 버튼과 독립된 위젯이라, 실패해도 아래 버튼 라벨을 "다시 시도"로 바꾸지 않는다.
    await t.pumpWidget(_host(Column(children: const [
      InlineError('신청에 실패했습니다'),
      Text('예약 신청하기'), // 아래 버튼 라벨(그대로)
    ])));
    expect(find.text('예약 신청하기'), findsOneWidget);
    expect(find.text('다시 시도'), findsNothing);
  });
}

/// ERR-POS-02 검증용 — 오류가 리스트 맨 아래(화면 밖)에 있고, 버튼으로 켜면 자동 스크롤되는지 본다.
class _Toggler extends StatefulWidget {
  final ScrollController controller;
  const _Toggler(this.controller);
  @override
  State<_Toggler> createState() => _TogglerState();
}

class _TogglerState extends State<_Toggler> {
  bool on = false;
  @override
  Widget build(BuildContext context) {
    return ListView(
      controller: widget.controller,
      children: [
        ElevatedButton(onPressed: () => setState(() => on = true), child: const Text('오류 켜기')),
        const SizedBox(height: 2000), // 오류 자리를 화면 밖으로 밀어냄
        InlineError(on ? '버튼 동작이 실패했습니다' : null),
      ],
    );
  }
}
```
Run: `flutter test test/widgets/inline_error_test.dart` → Expected: FAIL(`inline_error.dart` 없음).

- [ ] **Step 2b: `InlineError` 구현** — `patient_app/lib/widgets/inline_error.dart`

```dart
import 'package:flutter/material.dart';
import 'warn_text.dart';

/// 버튼 동작이 실패했을 때의 오류 문구. **화면은 떠 있고 내가 누른 버튼만 실패**한 경우에 쓴다
/// (조회 실패로 화면을 못 연 경우는 EmptyState). 실패한 버튼 바로 위에 붙인다(ERR-KIND-01·ERR-POS-01).
///
/// - `message`는 **서버가 준 한글 문장 그대로**(ERR-MSG-01·02) — 위젯이 다시 쓰거나 접두어를 붙이지 않는다.
/// - 모양은 Task 0 `WarnText`(좌측 4px 바·주의색·배경 없음, ERR-POS-01)를 그대로 쓴다.
/// - **스낵바·상단 띠가 아니라 인라인**이라 스스로 사라지지 않는다(ERR-POS-03). 오류가 사라지는 것은
///   오직 화면이 `message=null`로 바꿀 때다 — 입력을 고쳐(ERR-GONE-01)·버튼을 다시 눌러(ERR-GONE-02)
///   막힘이 풀렸을 때. 스크롤 등 무관한 조작에는 그대로 남는다(ERR-GONE-03).
/// - **재시도 버튼을 만들지 않는다**(ERR-RETRY-01·03) — 원래 버튼을 다시 누르면 되고, 원래 버튼의
///   글자도 바꾸지 않는다(ERR-RETRY-04, InlineError는 버튼과 독립된 위젯).
class InlineError extends StatefulWidget {
  final String? message; // null이면 아무것도 그리지 않는다(막힘이 풀림).
  const InlineError(this.message, {super.key});

  @override
  State<InlineError> createState() => _InlineErrorState();
}

class _InlineErrorState extends State<InlineError> {
  @override
  void didUpdateWidget(covariant InlineError old) {
    super.didUpdateWidget(old);
    // ERR-POS-02: 없던 오류가 생기면, 그 위치가 시야 밖일 수 있으니 화면을 그 자리로 자동 스크롤한다.
    if (old.message == null && widget.message != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          Scrollable.ensureVisible(context,
              duration: const Duration(milliseconds: 200), alignment: 0.5);
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.message == null) return const SizedBox.shrink();
    return WarnText(widget.message!); // ERR-POS-01: 좌측 4px 바·주의색·배경 없음
  }
}
```
Run: `flutter test test/widgets/inline_error_test.dart` → Expected: PASS(12 tests).

- [ ] **Step 3: `FieldTextInput` + `FieldErrorController` — 입력 검증 오류 (`ERR-FLD-01·02·03·04·05`)**

> **`ERR-KIND-01`의 다른 쪽**: 입력 검증 오류(앱이 보고 바로 아는 것 — 형식·필수·길이)는 **틀린 칸 바로 아래**에 붙인다. 동작 실패(서버에 물어야 아는 것)의 `InlineError`(버튼 위)와 자리가 다르다.

- [ ] **Step 3a: 실패 테스트** — `test/widgets/field_error_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/widgets/field_error.dart';

Widget _host(Widget child) => MaterialApp(home: Scaffold(body: child));
String? _min8(String v) => v.length < 8 ? '8자 이상 입력해주세요' : null;
String? _required(String v) => v.isEmpty ? '필수 항목입니다' : null;

void main() {
  testWidgets('[ERR-FLD-02] 타이핑 도중에는 검사하지 않는다', (t) async {
    final form = FieldErrorController();
    final c = TextEditingController();
    await t.pumpWidget(_host(FieldTextInput(
        label: '비밀번호', controller: c, form: form, validate: _min8)));
    await t.enterText(find.byType(TextField), '123'); // 3자까지만 침
    await t.pump();
    expect(find.text('8자 이상 입력해주세요'), findsNothing); // 아직 나무라지 않는다
  });

  testWidgets('[ERR-FLD-03] 그 칸을 떠날 때 검사한다', (t) async {
    final form = FieldErrorController();
    final c = TextEditingController();
    await t.pumpWidget(_host(FieldTextInput(
        label: '비밀번호', controller: c, form: form, validate: _min8)));
    await t.enterText(find.byType(TextField), '123');
    FocusManager.instance.primaryFocus?.unfocus(); // 칸을 떠남(blur)
    await t.pump();
    expect(find.text('8자 이상 입력해주세요'), findsOneWidget);
  });

  testWidgets('[ERR-FLD-01] 여러 칸이 동시에 틀리면 각 칸마다 문구가 붙는다', (t) async {
    final form = FieldErrorController();
    final name = TextEditingController();   // 비어 있음
    final phone = TextEditingController();  // 비어 있음
    await t.pumpWidget(_host(Column(children: [
      FieldTextInput(label: '이름', controller: name, form: form, validate: _required),
      FieldTextInput(label: '전화', controller: phone, form: form, validate: _required),
    ])));
    form.validateAll();
    await t.pump();
    expect(find.text('필수 항목입니다'), findsNWidgets(2)); // 각 칸 아래 하나씩
  });

  testWidgets('[ERR-FLD-04] 버튼을 누를 때 건드리지 않은 칸도 전체 재검사된다', (t) async {
    final form = FieldErrorController();
    final birth = TextEditingController(); // 아예 건드리지 않음(포커스도 준 적 없음)
    await t.pumpWidget(_host(FieldTextInput(
        label: '생년월일', controller: birth, form: form, validate: _required)));
    expect(find.text('필수 항목입니다'), findsNothing);
    final ok = form.validateAll();     // 버튼 누를 때
    await t.pump();
    expect(ok, isFalse);
    expect(find.text('필수 항목입니다'), findsOneWidget); // 이때 걸린다
  });

  testWidgets('[ERR-FLD-05] 오류가 여럿이면 첫 오류 칸으로 자동 스크롤한다', (t) async {
    final scroll = ScrollController();
    final form = FieldErrorController();
    final a = TextEditingController();
    final b = TextEditingController();
    await t.pumpWidget(_host(ListView(controller: scroll, children: [
      const SizedBox(height: 2000),   // 첫 필드를 화면 아래로 밀어냄
      FieldTextInput(label: '이름', controller: a, form: form, validate: _required),
      const SizedBox(height: 1500),
      FieldTextInput(label: '전화', controller: b, form: form, validate: _required),
    ])));
    expect(find.text('이름'), findsNothing); // 시작 시 첫 오류 칸은 화면 밖
    form.validateAll();
    await t.pumpAndSettle();
    expect(scroll.offset, greaterThan(0));  // 첫 오류 칸으로 스크롤됨
    expect(find.text('필수 항목입니다'), findsWidgets);
  });
}
```
Run: `flutter test test/widgets/field_error_test.dart` → Expected: FAIL(`field_error.dart` 없음).

- [ ] **Step 3b: `FieldTextInput` + `FieldErrorController` 구현** — `patient_app/lib/widgets/field_error.dart`

```dart
import 'package:flutter/material.dart';
import '../core/tokens.dart';

/// 폼 전체의 검사 시점을 조율한다. 각 FieldTextInput이 스스로 등록/해제한다.
class FieldErrorController {
  final List<_FieldHandle> _fields = [];
  void _register(_FieldHandle h) => _fields.add(h);
  void _unregister(_FieldHandle h) => _fields.remove(h);

  /// 버튼을 누를 때 전체를 다시 검사한다(ERR-FLD-04) — 건드리지 않은 칸도 이때 걸린다.
  /// 오류가 여럿이면 화면에 배치된 순서상 첫 오류 칸으로 자동 스크롤한다(ERR-FLD-05).
  /// 모두 통과면 true.
  bool validateAll() {
    _FieldHandle? firstBad;
    for (final f in _fields) {
      if (!f.validate()) firstBad ??= f;
    }
    firstBad?.ensureVisible();
    return firstBad == null;
  }
}

class _FieldHandle {
  final bool Function() validate;      // 오류면 표시하고 false 반환
  final void Function() ensureVisible; // 자기 위치로 스크롤
  _FieldHandle(this.validate, this.ensureVisible);
}

class FieldTextInput extends StatefulWidget {
  final String label;
  final TextEditingController controller;
  final FieldErrorController form;
  final String? Function(String value) validate; // null=통과, 문자열=칸 아래 오류 문구
  const FieldTextInput({
    super.key,
    required this.label,
    required this.controller,
    required this.form,
    required this.validate,
  });

  @override
  State<FieldTextInput> createState() => _FieldTextInputState();
}

class _FieldTextInputState extends State<FieldTextInput> {
  final FocusNode _node = FocusNode();
  late final _FieldHandle _handle;
  String? _error;

  @override
  void initState() {
    super.initState();
    _handle = _FieldHandle(_runValidate, _scrollToSelf);
    widget.form._register(_handle);
    // ERR-FLD-03: 그 칸을 떠날 때(포커스를 잃을 때) 검사한다.
    _node.addListener(() {
      if (!_node.hasFocus) _runValidate();
    });
  }

  @override
  void dispose() {
    widget.form._unregister(_handle);
    _node.dispose();
    super.dispose();
  }

  bool _runValidate() {
    final msg = widget.validate(widget.controller.text);
    if (mounted) setState(() => _error = msg);
    return msg == null;
  }

  void _scrollToSelf() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        Scrollable.ensureVisible(context,
            duration: const Duration(milliseconds: 200), alignment: 0.5);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: widget.controller,
          focusNode: _node,
          decoration: InputDecoration(labelText: widget.label),
          // ERR-FLD-02: 타이핑 도중에는 (처음) 검사하지 않는다. 단 이미 떠 있는 오류는 입력을
          // 건드리는 즉시 지운다(ERR-GONE-01) — 맞게 고치고 있는 사람을 계속 나무라지 않는다.
          onChanged: (_) {
            if (_error != null) setState(() => _error = null);
          },
        ),
        if (_error != null) // ERR-FLD-01: 틀린 칸 바로 아래에, 칸마다 따로 붙는다
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(_error!,
                style: const TextStyle(color: AppTokens.warn, fontSize: 13)),
          ),
      ],
    );
  }
}
```
Run: `flutter test test/widgets/field_error_test.dart` → Expected: PASS(5 tests).

- [ ] **Step 4: `PendingRequestStore` + `PendingRequestCard` — 죽는 앱의 유언장 (`BTN-KILL-01·02·03·04·05·06·07`)**

> ⭐ **죽는 앱은 유언을 남길 수 없다** — 그래서 **요청을 보내기 직전에 미리 적어두고**(BTN-KILL-01), 무사히 응답을 받으면 지운다(BTN-KILL-02). 앱이 그 사이에 죽어 다시 켜지면 적어둔 것이 남아 홈에 안내가 뜬다(BTN-KILL-03). ⚠️ **NAV-GLOBAL-08 위젯 = 이 카드**(Task 11 라우터가 홈에 배치).
>
> ⛔ **자동 재시도 금지(BTN-KILL-07)**: 멱등성이 없어(갭 #15) 스스로 다시 신청하면 예약이 확실히 두 건 생긴다. 카드는 **`[예약 목록에서 확인]` 한 길만** 주고 `[다시 신청]`을 두지 않는다.

- [ ] **Step 4a: 실패 테스트** — `test/widgets/pending_request_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:hospital_patient_app/core/pending_request.dart';
import 'package:hospital_patient_app/widgets/pending_request_card.dart';

class _MockStorage extends Mock implements FlutterSecureStorage {}

/// 실제 secure storage 대신 메모리 맵으로 흉내낸다.
_MockStorage _memStorage() {
  final s = _MockStorage();
  final mem = <String, String?>{};
  when(() => s.write(key: any(named: 'key'), value: any(named: 'value')))
      .thenAnswer((i) async => mem[i.namedArguments[#key] as String] =
          i.namedArguments[#value] as String?);
  when(() => s.read(key: any(named: 'key')))
      .thenAnswer((i) async => mem[i.namedArguments[#key] as String]);
  when(() => s.delete(key: any(named: 'key')))
      .thenAnswer((i) async => mem.remove(i.namedArguments[#key] as String));
  return s;
}

void main() {
  test('[BTN-KILL-01] 요청을 보내기 직전에 유언(종류+신청 시각)을 적는다', () async {
    final store = PendingRequestStore(_memStorage());
    final at = DateTime(2026, 8, 17, 10, 2);
    await store.begin(PendingKind.book, at);
    final read = await store.read();
    expect(read!.kind, PendingKind.book);
    expect(read.startedAt, at);
  });

  test('[BTN-KILL-02] 응답이 도착하면(성공·실패 무관) 즉시 지운다', () async {
    final store = PendingRequestStore(_memStorage());
    await store.begin(PendingKind.book, DateTime(2026, 8, 17, 10, 2));
    await store.complete();
    expect(await store.read(), isNull);
  });

  test('[BTN-KILL-04] 문구에 "방금"을 쓰지 않고 적어둔 절대 시각을 넣는다', () {
    expect(koreanTime(DateTime(2026, 8, 17, 10, 2)), '오전 10:02');
    expect(koreanTime(DateTime(2026, 8, 17, 14, 5)), '오후 2:05');
    final msg = const PendingRequest(PendingKind.book, null).homeMessageAt(
        DateTime(2026, 8, 17, 10, 2));
    expect(msg.contains('방금'), isFalse);
    expect(msg.contains('오전 10:02'), isTrue);
  });

  test('[BTN-KILL-06] 대상은 예약 신청·변경뿐 — 문진 저장·취소·탈퇴는 종류에 없다', () {
    expect(PendingKind.values, [PendingKind.book, PendingKind.change]);
  });

  testWidgets('[BTN-KILL-03] 앱을 다시 켜면 홈에 안내 한 줄 + [예약 목록에서 확인]이 뜬다', (t) async {
    final store = PendingRequestStore(_memStorage());
    await store.begin(PendingKind.book, DateTime(2026, 8, 17, 10, 2));
    await t.pumpWidget(ProviderScope(
      overrides: [pendingRequestStoreProvider.overrideWithValue(store)],
      child: MaterialApp(home: Scaffold(
          body: PendingRequestCard(onConfirm: () {}))),
    ));
    await t.pumpAndSettle();
    expect(find.textContaining('오전 10:02에 신청하신 예약의 결과를 확인하지 못했습니다'), findsOneWidget);
    expect(find.text('예약 목록에서 확인'), findsOneWidget);
  });

  testWidgets('[BTN-KILL-05] 안내를 확인하면(버튼 탭) 유언을 지우고 onConfirm을 부른다', (t) async {
    final store = PendingRequestStore(_memStorage());
    await store.begin(PendingKind.book, DateTime(2026, 8, 17, 10, 2));
    var confirmed = false;
    await t.pumpWidget(ProviderScope(
      overrides: [pendingRequestStoreProvider.overrideWithValue(store)],
      child: MaterialApp(home: Scaffold(
          body: PendingRequestCard(onConfirm: () => confirmed = true))),
    ));
    await t.pumpAndSettle();
    await t.tap(find.text('예약 목록에서 확인'));
    await t.pumpAndSettle();
    expect(confirmed, isTrue);
    expect(await store.read(), isNull); // 지워짐
  });

  testWidgets('[BTN-KILL-07] 자동 재시도·[다시 신청] 버튼을 두지 않는다', (t) async {
    final store = PendingRequestStore(_memStorage());
    await store.begin(PendingKind.book, DateTime(2026, 8, 17, 10, 2));
    await t.pumpWidget(ProviderScope(
      overrides: [pendingRequestStoreProvider.overrideWithValue(store)],
      child: MaterialApp(home: Scaffold(body: PendingRequestCard(onConfirm: () {}))),
    ));
    await t.pumpAndSettle();
    expect(find.textContaining('다시 신청'), findsNothing);
    expect(find.textContaining('재신청'), findsNothing);
  });
}
```
Run: `flutter test test/widgets/pending_request_test.dart` → Expected: FAIL(`pending_request.dart` 없음).

- [ ] **Step 4b: `PendingRequestStore` 구현** — `patient_app/lib/core/pending_request.dart`

```dart
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// BTN-KILL-06 — 유언을 남기는 동작은 **다시 하면 결과가 하나 더 생기는 것**뿐이다:
/// 예약 신청·예약 변경. 문진 저장·취소·연결 해제·탈퇴는 두 번 해도 결과가 같아 대상이 아니다.
enum PendingKind { book, change }

/// 오전/오후 12시간제 한국어 시각. BTN-KILL-04: "방금" 대신 이 절대 시각을 문구에 넣는다
/// (배터리 방전이면 몇 시간 뒤에 켤 수 있어 "방금"은 사실이 아니게 된다).
String koreanTime(DateTime t) {
  final ampm = t.hour < 12 ? '오전' : '오후';
  var h = t.hour % 12;
  if (h == 0) h = 12;
  return '$ampm $h:${t.minute.toString().padLeft(2, '0')}';
}

class PendingRequest {
  final PendingKind kind;
  final DateTime? startedAt; // 저장에서 읽으면 채워진다
  const PendingRequest(this.kind, this.startedAt);

  Map<String, dynamic> toJson() =>
      {'kind': kind.name, 'startedAt': startedAt!.toIso8601String()};
  static PendingRequest fromJson(Map<String, dynamic> j) => PendingRequest(
      PendingKind.values.byName(j['kind'] as String),
      DateTime.parse(j['startedAt'] as String));

  /// BTN-KILL-03·04 — 홈 안내 한 줄. 적어둔 시각을 넣는다.
  String get homeMessage => homeMessageAt(startedAt!);
  String homeMessageAt(DateTime at) {
    final label = kind == PendingKind.book ? '예약' : '예약 변경';
    return '${koreanTime(at)}에 신청하신 $label의 결과를 확인하지 못했습니다';
  }
}

const _kPendingKey = 'pending_request';

class PendingRequestStore {
  final FlutterSecureStorage _storage;
  PendingRequestStore(this._storage);

  /// BTN-KILL-01: 요청을 보내기 직전에 유언을 남긴다.
  Future<void> begin(PendingKind kind, DateTime at) => _storage.write(
      key: _kPendingKey, value: jsonEncode(PendingRequest(kind, at).toJson()));

  /// BTN-KILL-02: 응답이 도착하면 즉시 지운다.
  Future<void> complete() => _storage.delete(key: _kPendingKey);

  /// BTN-KILL-05: 안내를 확인하거나 닫으면 지운다.
  Future<void> dismiss() => _storage.delete(key: _kPendingKey);

  /// 앱을 다시 켰을 때 남아 있는 유언을 읽는다(BTN-KILL-03). 없으면 null.
  Future<PendingRequest?> read() async {
    final raw = await _storage.read(key: _kPendingKey);
    if (raw == null) return null;
    return PendingRequest.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }
}

final pendingRequestStoreProvider = Provider<PendingRequestStore>(
    (ref) => PendingRequestStore(const FlutterSecureStorage()));

/// 홈이 구독한다 — 앱을 다시 켰을 때 남은 유언을 읽어 카드로 그린다.
final pendingRequestProvider =
    FutureProvider<PendingRequest?>((ref) => ref.watch(pendingRequestStoreProvider).read());
```

- [ ] **Step 4c: `PendingRequestCard` 구현** — `patient_app/lib/widgets/pending_request_card.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/pending_request.dart';

/// 앱이 죽은 뒤 다시 켰을 때 홈 맨 위에 뜨는 안내(BTN-KILL-03). 남은 유언이 없으면 아무것도
/// 그리지 않는다. `[예약 목록에서 확인]`을 누르면 유언을 지우고(BTN-KILL-05) `onConfirm`을
/// 부른다 — 이동 경로는 소비하는 화면(홈, Task 13+)이 넣는다.
///
/// ⛔ BTN-KILL-07: `[다시 신청]`을 두지 않는다. 멱등성이 없어 자동·수동 재신청은 예약을 두 건 만든다.
class PendingRequestCard extends ConsumerWidget {
  final VoidCallback onConfirm; // 보통 '/my'(나의 예약)로 이동
  const PendingRequestCard({super.key, required this.onConfirm});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(pendingRequestProvider).valueOrNull;
    if (pending == null) return const SizedBox.shrink();
    return Card(
      child: ListTile(
        title: Text(pending.homeMessage), // BTN-KILL-03·04: 적어둔 시각을 넣은 한 줄
        trailing: TextButton(
          onPressed: () async {
            await ref.read(pendingRequestStoreProvider).dismiss(); // BTN-KILL-05
            ref.invalidate(pendingRequestProvider);
            onConfirm();
          },
          child: const Text('예약 목록에서 확인'),
        ),
      ),
    );
  }
}
```
Run: `flutter test test/widgets/pending_request_test.dart` → Expected: PASS(7 tests).

- [ ] **Step 5: `PhoneCooldownStore` + `CooldownButton` — 「다시 누르는 게 정상」인 버튼의 쿨다운 (`BTN-COOL-01`~`10`)**

> ⭐ **화면이 아니라 「그 전화번호」에 건다(BTN-COOL-04·05)**: 앱을 껐다 켜면 로그인 화면으로 돌아가는데, 화면에 쿨다운을 걸면 껐다 켠 사람(문자가 안 올 때 중장년층이 가장 먼저 하는 대처)에게는 쿨다운이 사라진다. 그래서 **번호 기준**으로 저장하고 재시작에도 유지한다. **횟수 제한은 두지 않는다(BTN-COOL-03)** — 쿨다운은 문을 닫지 않고 천천히 연다.
>
> ⚠️ **서버가 진짜 막는 곳(BTN-COOL-06·10)**: 화면의 카운트다운은 표시용 1초 그리기고, 실제 판정·거절은 서버(번호 기준 30초)가 한다. 두 값이 어긋나면 **서버가 이긴다** — 서버가 거절하며 내려준 남은 초로 로컬을 맞춘다.

- [ ] **Step 5a: 실패 테스트 (Store 로직)** — `test/widgets/cooldown_button_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:hospital_patient_app/core/phone_cooldown.dart';
import 'package:hospital_patient_app/widgets/cooldown_button.dart';

class _MockStorage extends Mock implements FlutterSecureStorage {}

_MockStorage _memStorage([Map<String, String?>? shared]) {
  final s = _MockStorage();
  final mem = shared ?? <String, String?>{};
  when(() => s.write(key: any(named: 'key'), value: any(named: 'value')))
      .thenAnswer((i) async =>
          mem[i.namedArguments[#key] as String] = i.namedArguments[#value] as String?);
  when(() => s.read(key: any(named: 'key')))
      .thenAnswer((i) async => mem[i.namedArguments[#key] as String]);
  when(() => s.delete(key: any(named: 'key')))
      .thenAnswer((i) async => mem.remove(i.namedArguments[#key] as String));
  return s;
}

const _a = '01011112222';
const _b = '01033334444';

void main() {
  test('[BTN-COOL-02] 누른 직후 남은 시간은 30초에서 시작한다', () async {
    final store = PhoneCooldownStore(_memStorage());
    final t0 = DateTime(2026, 8, 17, 10, 0, 0);
    await store.start(_a, t0);
    expect(store.remainingSeconds(_a, t0), 30);
    expect(store.remainingSeconds(_a, t0.add(const Duration(seconds: 1))), 29); // 1초씩 줄어든다
  });

  test('[BTN-COOL-03] 횟수 제한이 없다 — 여러 사이클을 돌려도 시간만 본다', () async {
    final store = PhoneCooldownStore(_memStorage());
    var t = DateTime(2026, 8, 17, 10, 0, 0);
    for (var i = 0; i < 5; i++) {
      await store.start(_a, t);
      expect(store.remainingSeconds(_a, t), 30); // 매번 정상적으로 다시 열린다(막다른 길 없음)
      t = t.add(const Duration(seconds: 31));
    }
  });

  test('[BTN-COOL-04] 화면이 아니라 번호에 건다 — 앱 재시작(새 Store)에도 유지된다', () async {
    final shared = <String, String?>{};
    final t0 = DateTime(2026, 8, 17, 10, 0, 0);
    await PhoneCooldownStore(_memStorage(shared)).start(_a, t0);
    final revived = PhoneCooldownStore(_memStorage(shared)); // 재시작 흉내
    await revived.load();
    expect(revived.remainingSeconds(_a, t0.add(const Duration(seconds: 5))), 25);
  });

  test('[BTN-COOL-05] 껐다 켜도(로그인 화면으로 가도) 같은 번호면 쿨다운이 살아 있다', () async {
    final shared = <String, String?>{};
    final t0 = DateTime(2026, 8, 17, 10, 0, 0);
    await PhoneCooldownStore(_memStorage(shared)).start(_a, t0);
    final afterRestart = PhoneCooldownStore(_memStorage(shared));
    await afterRestart.load();
    expect(afterRestart.remainingSeconds(_a, t0.add(const Duration(seconds: 10))), greaterThan(0));
  });

  test('[BTN-COOL-06] 서버가 거절하며 내려준 남은 초로 로컬을 맞춘다', () async {
    final store = PhoneCooldownStore(_memStorage());
    final now = DateTime(2026, 8, 17, 10, 0, 0);
    await store.syncFromServer(_a, 20, now);
    expect(store.remainingSeconds(_a, now), 20);
  });

  test('[BTN-COOL-07] 재시작 후 같은 번호에 쿨다운이 남았으면 다시 보내지 않는다(remaining>0으로 판단)', () async {
    final shared = <String, String?>{};
    final t0 = DateTime(2026, 8, 17, 10, 0, 0);
    await PhoneCooldownStore(_memStorage(shared)).start(_a, t0);
    final revived = PhoneCooldownStore(_memStorage(shared));
    await revived.load();
    // AUTH 화면은 이 값이 0보다 크면 새로 보내지 않고 인증번호 입력 화면으로 넘어간다.
    expect(revived.remainingSeconds(_a, t0.add(const Duration(seconds: 3))) > 0, isTrue);
  });

  test('[BTN-COOL-09] 다른 번호는 정상 발송 — 쿨다운은 번호마다 따로 센다', () async {
    final store = PhoneCooldownStore(_memStorage());
    final now = DateTime(2026, 8, 17, 10, 0, 0);
    await store.start(_a, now);
    expect(store.remainingSeconds(_a, now), 30);
    expect(store.remainingSeconds(_b, now), 0); // b는 시작한 적 없다
  });

  test('[BTN-COOL-10] 로컬과 서버가 어긋나면 서버가 이긴다', () async {
    final store = PhoneCooldownStore(_memStorage());
    final now = DateTime(2026, 8, 17, 10, 0, 0);
    await store.start(_a, now);                 // 로컬은 30초라고 생각
    await store.syncFromServer(_a, 5, now);      // 서버는 5초 남았다고 함
    expect(store.remainingSeconds(_a, now), 5);  // 서버 승
  });

  testWidgets('[BTN-COOL-01] 대상 버튼(인증번호 다시 받기)을 누르면 발송되고 쿨다운이 시작된다', (t) async {
    final store = PhoneCooldownStore(_memStorage());
    var sent = 0;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CooldownButton(
      phone: _a, label: '인증번호 다시 받기', store: store,
      onSend: () async { sent++; return null; }))));
    expect(find.text('인증번호 다시 받기'), findsOneWidget);
    await t.tap(find.byType(CooldownButton));
    await t.pump();
    expect(sent, 1);
    expect(store.remainingSeconds(_a, DateTime.now()), greaterThan(0)); // 번호에 쿨다운 걸림
    await t.pumpWidget(const SizedBox()); // timer dispose
  });

  testWidgets('[BTN-COOL-08] 쿨다운 중에는 버튼에 남은 시간을 숫자로 보여준다', (t) async {
    final store = PhoneCooldownStore(_memStorage());
    await store.start(_a, DateTime.now()); // 지금 시작 → 약 30초
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CooldownButton(
      phone: _a, label: '인증번호 다시 받기', store: store, onSend: () async => null))));
    await t.pump();
    expect(find.textContaining('초 후 다시 받기'), findsOneWidget); // 남은 시간 표시
    expect(find.text('인증번호 다시 받기'), findsNothing);            // 평소 라벨은 숨김
    await t.pumpWidget(const SizedBox());
  });
}
```
Run: `flutter test test/widgets/cooldown_button_test.dart` → Expected: FAIL(파일 없음).

- [ ] **Step 5b: `PhoneCooldownStore` 구현** — `patient_app/lib/core/phone_cooldown.dart`

```dart
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// 인증번호 재발송·새로고침 등 「다시 누르는 것이 정상 동작」인 버튼의 쿨다운을, 화면이 아니라
/// **전화번호 기준**으로 관리한다(BTN-COOL-04·05). 재시작에도 유지되도록 저장한다.
class PhoneCooldownStore {
  static const int cooldownSeconds = 30;
  static const String _key = 'phone_cooldown';

  final FlutterSecureStorage _storage;
  final Map<String, DateTime> _startedAt = {};

  PhoneCooldownStore(this._storage);

  /// 앱 시작 시 한 번 불러 재시작 전 쿨다운을 되살린다(BTN-COOL-04·05·07).
  Future<void> load() async {
    final raw = await _storage.read(key: _key);
    if (raw == null) return;
    final m = jsonDecode(raw) as Map<String, dynamic>;
    _startedAt
      ..clear()
      ..addAll(m.map((k, v) => MapEntry(k, DateTime.parse(v as String))));
  }

  Future<void> _persist() => _storage.write(
      key: _key,
      value: jsonEncode(_startedAt.map((k, v) => MapEntry(k, v.toIso8601String()))));

  /// BTN-COOL-01·04: 재발송 등을 눌렀을 때 그 번호에 쿨다운을 시작한다.
  Future<void> start(String phone, DateTime at) async {
    _startedAt[phone] = at;
    await _persist();
  }

  /// BTN-COOL-06·10: 서버가 거절하며 내려준 남은 초로 로컬을 맞춘다. 서버가 진실이다.
  Future<void> syncFromServer(String phone, int remaining, DateTime now) async {
    _startedAt[phone] = now.subtract(Duration(seconds: cooldownSeconds - remaining));
    await _persist();
  }

  /// 남은 초(BTN-COOL-02·08). BTN-COOL-03: 횟수가 아니라 시간만 본다.
  /// BTN-COOL-09: 시작한 적 없는 번호는 0(정상 발송).
  int remainingSeconds(String phone, DateTime now) {
    final s = _startedAt[phone];
    if (s == null) return 0;
    final left = cooldownSeconds - now.difference(s).inSeconds;
    return left > 0 ? left : 0;
  }
}

final phoneCooldownStoreProvider = Provider<PhoneCooldownStore>(
    (ref) => PhoneCooldownStore(const FlutterSecureStorage()));
```

- [ ] **Step 5c: `CooldownButton` 구현** — `patient_app/lib/widgets/cooldown_button.dart`

```dart
import 'dart:async';
import 'package:flutter/material.dart';
import '../core/tokens.dart';
import '../core/phone_cooldown.dart';

/// 「다시 누르는 것이 정상 동작」인 버튼(BTN-COOL-01: 인증번호 다시 받기·새로고침·조회 실패의 [다시 시도]).
/// 누른 뒤 `[ N초 후 다시 받기 ]`로 바뀌어 1초씩 줄어들고(BTN-COOL-02·08), 0이 되면 원래대로 돌아온다.
/// 쿨다운은 번호 기준으로 Store가 관리하고, 화면 카운트다운은 그것을 1초마다 그린다(BTN-COOL-10).
class CooldownButton extends StatefulWidget {
  final String phone;
  final String label;
  final PhoneCooldownStore store;

  /// 실제 발송. 서버가 거절하며 남은 초를 주면 그 값을, 정상 발송이면 null을 돌려준다(BTN-COOL-06·10).
  final Future<int?> Function() onSend;

  const CooldownButton({
    super.key,
    required this.phone,
    required this.label,
    required this.store,
    required this.onSend,
  });

  @override
  State<CooldownButton> createState() => _CooldownButtonState();
}

class _CooldownButtonState extends State<CooldownButton> {
  Timer? _timer;
  int _remaining = 0;

  @override
  void initState() {
    super.initState();
    _refresh();
    _ensureTicking();
  }

  void _refresh() => _remaining = widget.store.remainingSeconds(widget.phone, DateTime.now());

  void _ensureTicking() {
    _timer?.cancel();
    if (_remaining > 0) {
      _timer = Timer.periodic(const Duration(seconds: 1), (tm) {
        setState(_refresh);
        if (_remaining <= 0) tm.cancel(); // 시간만 본다(BTN-COOL-03)
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _press() async {
    if (_remaining > 0) return; // 쿨다운 중엔 무시(막다른 길 아님 — 시간이 열어준다)
    final serverRemaining = await widget.onSend();
    if (serverRemaining != null) {
      await widget.store.syncFromServer(widget.phone, serverRemaining, DateTime.now());
    } else {
      await widget.store.start(widget.phone, DateTime.now()); // BTN-COOL-01·04
    }
    if (!mounted) return;
    setState(_refresh);
    _ensureTicking();
  }

  @override
  Widget build(BuildContext context) {
    final onCooldown = _remaining > 0;
    return FilledButton(
      style: FilledButton.styleFrom(
        backgroundColor: onCooldown ? AppTokens.grayDone : AppTokens.primary,
        foregroundColor: onCooldown ? AppTokens.grayPending : Colors.white,
      ),
      onPressed: () {
        if (!onCooldown) _press();
      },
      child: Text(onCooldown ? '$_remaining초 후 다시 받기' : widget.label),
    );
  }
}
```
Run: `flutter test test/widgets/cooldown_button_test.dart` → Expected: PASS(11 tests).

- [ ] **Step 6: `EmptyState` — 오프라인·서버오류·0건을 한 벌의 모양으로 (`EMPTY-LAY-01·02` · `EMPTY-OFF-01` · `EMPTY-ERR-01` · `EMPTY-ZERO-01·02` · `EMPTY-TAB-01·02` · `ERR-RETRY-02`)**

> **한 벌의 문법 = 「아이콘 + 왜 비었는지 + 무엇을 하면 되는지 + 나가는 문 하나」**(EMPTY-LAY-01). 하얀 빈 화면을 두지 않고, 설명에 **화면 이름**을 넣어 "여기가 원래 무엇을 보여주는 곳인지"를 남긴다(EMPTY-LAY-02).
>
> ⭐ **`ERR-RETRY-02·03`의 다른 쪽**: 조회는 화면 진입과 함께 저절로 일어나 다시 할 수단이 화면에 없다 → 그래서 `EmptyState`(조회 실패·오프라인)에는 **`[다시 시도]`를 만들어 준다.** (버튼을 눌러 실패한 것은 `InlineError`라 만들지 않는다 — Step 2.)

- [ ] **Step 6a: 실패 테스트** — `test/widgets/empty_state_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/widgets/app_shell.dart';
import 'package:hospital_patient_app/widgets/empty_state.dart';

Widget _host(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  testWidgets('[EMPTY-LAY-01] 아이콘 + 설명 + 나가는 문 하나 — 하얀 빈 화면이 아니다', (t) async {
    await t.pumpWidget(_host(EmptyState.error(onRetry: () {})));
    expect(find.byType(Icon), findsOneWidget);         // 아이콘
    expect(find.text('정보를 불러오지 못했습니다'), findsOneWidget); // 설명
    expect(find.text('다시 시도'), findsOneWidget);      // 나가는 문
  });

  testWidgets('[EMPTY-LAY-02] 설명 문장에 화면 이름을 넣는다', (t) async {
    await t.pumpWidget(_host(EmptyState.offline(screenName: '가족 목록', onRetry: () {})));
    expect(find.text('연결되면 가족 목록을 볼 수 있습니다'), findsOneWidget);
  });

  testWidgets('[EMPTY-OFF-01] 오프라인 문구 3종', (t) async {
    await t.pumpWidget(_host(EmptyState.offline(screenName: '이력', onRetry: () {})));
    expect(find.text('인터넷이 연결되어 있지 않습니다'), findsOneWidget);
    expect(find.text('연결되면 이력을 볼 수 있습니다'), findsOneWidget);
    expect(find.text('다시 시도'), findsOneWidget);
  });

  testWidgets('[EMPTY-ERR-01] 서버 오류(조회 실패) 문구 3종', (t) async {
    await t.pumpWidget(_host(EmptyState.error(onRetry: () {})));
    expect(find.text('정보를 불러오지 못했습니다'), findsOneWidget);
    expect(find.text('잠시 후 다시 시도해주세요'), findsOneWidget);
    expect(find.text('다시 시도'), findsOneWidget);
  });

  testWidgets('[EMPTY-ZERO-01] 0건은 같은 문법 + 그 화면의 다음 행동', (t) async {
    await t.pumpWidget(_host(EmptyState.zero(
        message: '예약된 진료가 없습니다',
        nextAction: FilledButton(onPressed: () {}, child: const Text('+ 새 예약하기')))));
    expect(find.text('예약된 진료가 없습니다'), findsOneWidget);
    expect(find.text('+ 새 예약하기'), findsOneWidget);
  });

  testWidgets('[EMPTY-ZERO-02] 할 일이 없는 화면(알림함)엔 [다시 시도]를 두지 않는다', (t) async {
    await t.pumpWidget(_host(EmptyState.zero(message: '알림이 없습니다'))); // nextAction 없음
    expect(find.text('알림이 없습니다'), findsOneWidget);
    expect(find.text('다시 시도'), findsNothing); // 실패가 아니라 사실이므로
  });

  testWidgets('[ERR-RETRY-02] 조회 실패·오프라인엔 [다시 시도]를 만들고 누르면 콜백이 실행된다', (t) async {
    var retried = 0;
    await t.pumpWidget(_host(EmptyState.error(onRetry: () => retried++)));
    await t.tap(find.text('다시 시도'));
    expect(retried, 1);
  });

  testWidgets('[EMPTY-TAB-01] 하단 탭은 오프라인에도 눌린다 — 막지 않는다', (t) async {
    var tabTapped = 0;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: AppShell(
      body: EmptyState.offline(screenName: '이력', onRetry: () {}),
      bottomTabs: Row(children: [
        TextButton(onPressed: () => tabTapped++, child: const Text('예약')),
      ]),
    ))));
    await t.tap(find.text('예약')); // 오프라인이어도
    expect(tabTapped, 1);           // 눌린다
  });

  testWidgets('[EMPTY-TAB-02] 오프라인 탭을 눌러도 팝업으로 되돌리지 않는다', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: AppShell(
      body: EmptyState.offline(screenName: '가족 목록', onRetry: () {}),
      bottomTabs: Row(children: [
        TextButton(onPressed: () {}, child: const Text('가족')),
      ]),
    ))));
    await t.tap(find.text('가족'));
    await t.pump();
    expect(find.byType(Dialog), findsNothing);      // 팝업 없음
    expect(find.byType(AlertDialog), findsNothing);
  });
}
```
Run: `flutter test test/widgets/empty_state_test.dart` → Expected: FAIL(`empty_state.dart` 없음).

- [ ] **Step 6b: `EmptyState` 구현** — `patient_app/lib/widgets/empty_state.dart`

```dart
import 'package:flutter/material.dart';
import '../core/tokens.dart';

/// 오프라인·서버 오류·0건을 **한 벌의 모양**으로 처리한다(EMPTY-LAY-01):
/// 「아이콘 + 왜 비었는지 + (무엇을 하면 되는지) + 나가는 문 하나」. 하얀 빈 화면을 두지 않는다.
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String message; // 설명 한 줄. 화면 이름을 넣는다(EMPTY-LAY-02).
  final String? hint;   // 둘째 줄
  final Widget? action; // 나가는 문/다음 행동. null이면 그리지 않는다(EMPTY-ZERO-02).

  const EmptyState({
    super.key,
    required this.icon,
    required this.message,
    this.hint,
    this.action,
  });

  /// EMPTY-OFF-01 — 오프라인. 조회 수단이 화면에 없으므로 [다시 시도]를 준다(ERR-RETRY-02).
  factory EmptyState.offline({required String screenName, required VoidCallback onRetry}) =>
      EmptyState(
        icon: Icons.wifi_off,
        message: '인터넷이 연결되어 있지 않습니다',
        hint: '연결되면 $screenName을 볼 수 있습니다', // EMPTY-LAY-02
        action: _RetryButton(onRetry),
      );

  /// EMPTY-ERR-01 — 서버 오류(조회 실패).
  factory EmptyState.error({required VoidCallback onRetry}) => EmptyState(
        icon: Icons.error_outline,
        message: '정보를 불러오지 못했습니다',
        hint: '잠시 후 다시 시도해주세요',
        action: _RetryButton(onRetry),
      );

  /// EMPTY-ZERO-01 — 목록이 실제로 비어 있음. 같은 문법 + 그 화면의 다음 행동(`nextAction`).
  /// EMPTY-ZERO-02 — 할 일이 없는 화면(알림함 등)은 `nextAction`을 주지 않는다 → 버튼도 [다시 시도]도 없다.
  factory EmptyState.zero({required String message, Widget? nextAction}) => EmptyState(
        icon: Icons.inbox_outlined,
        message: message,
        action: nextAction,
      );

  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: AppTokens.grayPending),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            if (hint != null) ...[
              const SizedBox(height: 4),
              Text(hint!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppTokens.grayPending)),
            ],
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      );
}

class _RetryButton extends StatelessWidget {
  final VoidCallback onRetry;
  const _RetryButton(this.onRetry);
  @override
  Widget build(BuildContext context) =>
      OutlinedButton(onPressed: onRetry, child: const Text('다시 시도'));
}
```
Run: `flutter test test/widgets/empty_state_test.dart` → Expected: PASS(9 tests).

> 📌 **`EMPTY-TAB-01·02`는 Task 11 `AppShell`의 계약을 확인한다** — 셸은 `bottomTabs`를 오프라인에도 그대로 렌더(비활성·팝업 없음)하고, 오프라인 화면은 탭을 막는 대신 그 자리에 `EmptyState.offline`을 보여준다. 위 두 테스트가 그 계약을 못박는다(T11은 주석으로만 언급 → 여기서 실제 검증).

- [ ] **Step 7: `showBlockDialog` + `showExitConfirm` — 확인·막힘 팝업 (`BLOCK-EXIT-01` · `BLOCK-TIME-01` · `BLOCK-CONF-01` · `BLOCK-CHG-01` · `BTN-EXIT-01·02·03`)**

> ⭐ **`showExitConfirm`은 `BTN-TIME-01`(시간제한 없음)의 탈출구다(BTN-EXIT-03)**: 앱이 시간을 재서 요청을 끊는 대신, 처리 중 이탈을 사람이 판단하게 한다. 그래서 본문은 **`나가셔도 신청은 계속 진행됩니다`**이지 ⛔`나가시면 신청이 취소됩니다`가 아니다(BTN-EXIT-02 — 거짓말이고 중복 예약을 만든다). ⚠️ **NAV-GLOBAL-06 위젯 = 이 함수**(Task 11 라우터가 처리 중 이탈 시 호출).

- [ ] **Step 7a: 실패 테스트** — `test/widgets/block_dialog_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/tokens.dart';
import 'package:hospital_patient_app/widgets/block_dialog.dart';

/// 버튼을 눌러 다이얼로그를 띄우는 껍데기 — context를 얻기 위한 발판.
Widget _launcher(void Function(BuildContext) onTap) => MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (ctx) =>
              ElevatedButton(onPressed: () => onTap(ctx), child: const Text('열기')),
        ),
      ),
    );

void main() {
  testWidgets('[BLOCK-EXIT-01] 모든 막힘 팝업에는 [닫기]가 있다', (t) async {
    await t.pumpWidget(_launcher((ctx) =>
        showBlockDialog(ctx, title: '점검 중입니다', message: '지금은 이용할 수 없습니다')));
    await t.tap(find.text('열기'));
    await t.pumpAndSettle();
    expect(find.text('닫기'), findsOneWidget);
  });

  testWidgets('[BLOCK-TIME-01] 소요 시간 추정 문구(곧·보통)는 assert로 막는다', (t) async {
    await t.pumpWidget(_launcher((_) {}));
    final ctx = t.element(find.text('열기'));
    expect(() => showBlockDialog(ctx, title: '점검 중', message: '곧 복구됩니다'),
        throwsAssertionError);
    expect(() => showBlockDialog(ctx, title: '점검 중', message: '보통 1~2시간 걸립니다'),
        throwsAssertionError);
  });

  testWidgets('[BLOCK-CONF-01] 되돌릴 수 없는 동작의 빨간 버튼은 확인창 안에만 있다', (t) async {
    await t.pumpWidget(_launcher((ctx) => showBlockDialog(ctx,
        title: '가족 연결을 해제할까요?',
        message: '해제하면 이 가족의 예약을 대신 관리할 수 없습니다',
        confirmLabel: '연결 해제',
        destructive: true,
        onConfirm: () {})));
    await t.tap(find.text('열기'));
    await t.pumpAndSettle();
    final btn = t.widget<TextButton>(find.ancestor(
        of: find.text('연결 해제'), matching: find.byType(TextButton)));
    expect(btn.style!.foregroundColor!.resolve({}), AppTokens.warn); // 확인창 안의 주의색 버튼
  });

  testWidgets('[BLOCK-CHG-01] 변경 확인창은 변경 전 → 후를 함께 보여준다', (t) async {
    await t.pumpWidget(_launcher((ctx) => showBlockDialog(ctx,
        title: '예약을 변경할까요?',
        message: '아래 내용으로 변경됩니다',
        before: '8월 20일(수) 오전 10:00',
        after: '8월 21일(목) 오후 2:30',
        confirmLabel: '변경하기',
        onConfirm: () {})));
    await t.tap(find.text('열기'));
    await t.pumpAndSettle();
    expect(find.textContaining('8월 20일(수) 오전 10:00'), findsOneWidget); // 전
    expect(find.textContaining('8월 21일(목) 오후 2:30'), findsOneWidget);  // 후
  });

  testWidgets('[BTN-EXIT-01] 처리 중 이탈 확인 — 제목·본문·[기다리기]·[나가기]', (t) async {
    await t.pumpWidget(_launcher((ctx) => showExitConfirm(ctx)));
    await t.tap(find.text('열기'));
    await t.pumpAndSettle();
    expect(find.text('예약을 신청하는 중입니다'), findsOneWidget);
    expect(find.text('나가셔도 신청은 계속 진행됩니다. 결과는 예약 목록에서 확인하실 수 있습니다.'),
        findsOneWidget);
    expect(find.text('기다리기'), findsOneWidget);
    expect(find.text('나가기'), findsOneWidget);
  });

  testWidgets('[BTN-EXIT-02] 금지 문구 "나가시면 신청이 취소됩니다"를 쓰지 않는다', (t) async {
    await t.pumpWidget(_launcher((ctx) => showExitConfirm(ctx)));
    await t.tap(find.text('열기'));
    await t.pumpAndSettle();
    expect(find.textContaining('취소됩니다'), findsNothing);
  });

  testWidgets('[BTN-EXIT-03] [나가기]는 시간제한 없는 대기의 탈출구 — true를 돌려준다', (t) async {
    bool? result;
    await t.pumpWidget(_launcher((ctx) async => result = await showExitConfirm(ctx)));
    await t.tap(find.text('열기'));
    await t.pumpAndSettle();
    await t.tap(find.text('나가기'));
    await t.pumpAndSettle();
    expect(result, isTrue); // 사람이 나가기를 택하면 이탈 허용(앱이 시간을 재지 않는다)
  });
}
```
Run: `flutter test test/widgets/block_dialog_test.dart` → Expected: FAIL(`block_dialog.dart` 없음).

- [ ] **Step 7b: `showBlockDialog` + `showExitConfirm` 구현** — `patient_app/lib/widgets/block_dialog.dart`

```dart
import 'package:flutter/material.dart';
import '../core/tokens.dart';

/// 막힘·확인 팝업. 어떤 경우에도 **빠져나갈 문([닫기])을 둔다**(BLOCK-EXIT-01 — 막다른 길 금지).
///
/// - `confirmLabel`을 주면 확인 버튼이 하나 더 생긴다. `destructive: true`면 그 버튼이 주의색이다
///   (BLOCK-CONF-01: 되돌릴 수 없는 동작의 빨간 버튼은 확인창 안에서만).
/// - `before`/`after`를 주면 변경 전 → 후를 함께 보여준다(BLOCK-CHG-01).
/// - BLOCK-TIME-01: **소요 시간을 추정하는 문구(곧·보통)를 막는다** — 지킬 수 없는 약속이다.
Future<void> showBlockDialog(
  BuildContext context, {
  required String title,
  required String message,
  String? before,
  String? after,
  String? confirmLabel,
  VoidCallback? onConfirm,
  bool destructive = false,
}) {
  assert(!_hasTimeEstimate(title) && !_hasTimeEstimate(message),
      'BLOCK-TIME-01: 소요 시간을 추정하지 않는다(`곧`·`보통` 등 금지) — 지킬 수 없는 약속');
  return showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(message),
          if (before != null && after != null) ...[
            const SizedBox(height: 12),
            Text('변경 전   $before'),
            Text('변경 후   $after'),
          ],
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('닫기')),
        if (confirmLabel != null)
          TextButton(
            style: destructive
                ? TextButton.styleFrom(foregroundColor: AppTokens.warn)
                : null,
            onPressed: () {
              Navigator.pop(ctx);
              onConfirm?.call();
            },
            child: Text(confirmLabel),
          ),
      ],
    ),
  );
}

bool _hasTimeEstimate(String s) => s.contains('곧') || s.contains('보통');

/// 처리 중 이탈 확인(BTN-EXIT-01). 앱이 시간을 재는 대신 사람이 판단하게 하는, `BTN-TIME-01`의
/// 탈출구다(BTN-EXIT-03). [나가기]면 true, [기다리기]·바깥 탭이면 false.
/// ⛔ BTN-EXIT-02: `나가시면 신청이 취소됩니다`를 쓰지 않는다 — 거짓말이고 중복 예약을 만든다.
Future<bool> showExitConfirm(BuildContext context) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('예약을 신청하는 중입니다'),
      content: const Text('나가셔도 신청은 계속 진행됩니다. 결과는 예약 목록에서 확인하실 수 있습니다.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('기다리기')),
        TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('나가기')),
      ],
    ),
  );
  return r ?? false;
}
```
Run: `flutter test test/widgets/block_dialog_test.dart` → Expected: PASS(7 tests).

- [ ] **Step 8: 커밋**

```bash
git add patient_app/lib/core/tokens.dart patient_app/lib/core/pending_request.dart \
  patient_app/lib/core/phone_cooldown.dart \
  patient_app/lib/widgets/action_button.dart patient_app/lib/widgets/inline_error.dart \
  patient_app/lib/widgets/field_error.dart patient_app/lib/widgets/pending_request_card.dart \
  patient_app/lib/widgets/cooldown_button.dart patient_app/lib/widgets/empty_state.dart \
  patient_app/lib/widgets/block_dialog.dart patient_app/test/widgets/
git commit -m "feat: 환자앱 Task 12 — 전역 공용 위젯(오류·버튼상태·쿨다운·유언장·빈상태·막힘팝업) 58규칙"
```

> 📌 **규칙 커버리지(58)**: `ERR-MSG-01·02`·`ERR-KIND-01`·`ERR-FLD-01~05`·`ERR-POS-01~03`·`ERR-GONE-01~03`·`ERR-RETRY-01~04`(18) · `BTN-SCOPE-01·02`·`BTN-BUSY-01·02`·`BTN-STATE-01~03`·`BTN-TIME-01`·`BTN-EXIT-01~03`·`BTN-KILL-01~07`·`BTN-COOL-01~10`(28) · `EMPTY-LAY-01·02`·`EMPTY-OFF-01`·`EMPTY-ERR-01`·`EMPTY-ZERO-01·02`·`EMPTY-TAB-01·02`(8) · `BLOCK-EXIT-01`·`BLOCK-TIME-01`·`BLOCK-CONF-01`·`BLOCK-CHG-01`(4).
> ⚠️ **T11이 산문으로만 언급해 coverage에 잡혔던 6건**(`BTN-KILL-03·07`·`BTN-STATE-03`·`EMPTY-OFF-01`·`EMPTY-ERR-01`)을 여기서 **실제 `test()`로** 담아 가짜 커버(👻)를 실물로 바꿨다.
> ⚠️ **화면 태스크(13~31)가 소비할 계약**: 저장·변경 버튼=`ActionButton`(busy·disabledReason는 화면 Notifier가 넘김) · 동작 실패=`InlineError(message)` · 입력 폼=`FieldTextInput`+`FieldErrorController.validateAll()` · 조회 실패/오프라인/0건=`EmptyState.error/offline/zero` · 예약 변경 확인=`showBlockDialog(before/after)` · 처리 중 이탈=`showExitConfirm` · 인증번호 재발송=`CooldownButton` · 미완료 신청 홈 카드=`PendingRequestCard`(예약·변경 경로가 `PendingRequestStore.begin/complete` 호출).

---

## Task 13: 가입 — 동의 ⓪ → 전화 ① → 인증번호 ② → 비밀번호·기본정보 ③ + 새 비밀번호·번호 변경 안내 (83규칙)

> **담당 규칙(83)**: `CONSENT-*`(22) · `AUTH-LAND-*`(4) · `AUTH-PHONE-*`(4) · `AUTH-OTP-*`(11) · `AUTH-SIGNUP-*`(12) · `AUTH-PROFILE-*`(8) · `AUTH-PWNEW-*`(17) · `AUTH-TEL-*`(5). ⭐ **첫 화면 태스크** — Task 11·12의 전역 계층 위에 실제 화면을 짓는다. **로그인·비밀번호 찾기·중복번호·재인증·세션은 Task 14 소유**(여기는 `AUTH-PWNEW` 새 비밀번호 화면만 만들고, 그리로 오는 경로는 Task 14가 잇는다).
>
> ⭐⭐ **이 태스크의 심장 = 동의가 맨 앞이다(CONSENT-STEP-01·02)**: 전화번호 자체가 개인정보라 수집 전에 동의를 받아야 한다. 이 시점엔 **세션도 patient 행도 없어서**(CONSENT-STEP-03) 동의는 **화면이 로컬로 들고 있다가 프로필 생성(POST /patients) 때 함께 서버에 기록**한다(CONSENT-LOG-01). 그래서 동의 이력 표를 새로 만든다(CONSENT-LOG-02 — 갭 #108, 표가 통째로 없었다).
>
> ⭐⭐ **두 번째 심장 = 「가입 미완료」(AUTH-SIGNUP-07·08·11·12)**: 인증번호가 맞은 순간 이미 로그인 상태가 되고(Supabase `verifyOTP`가 세션 발급) 이름·생년월일만 없다. 앱을 껐다 켜면 **③으로 되돌린다**(문자 재인증 안 시킴). 판정은 별도 enum이 아니라 **`signedIn` + 프로필 없음** — `profileMissingProvider`(GET /patients/me 404)가 그 장치이고, **Task 11 라우터가 이미 이 provider를 기다린다**(양방향 악수).
>
> ⚠️ **경계(재소유 금지)**: ① 전역 위젯은 **Task 12를 소비**한다 — 오류는 `InlineError`/`FieldTextInput`, 재발송은 `CooldownButton`+`PhoneCooldownStore`, 버튼은 `ActionButton`. 여기서 다시 만들지 않는다. ② `AUTH-PWNEW` 새 비밀번호 화면은 **여기서 만들고**, 그리로 오는 경로(비밀번호 찾기 `AUTH-PWFIND`·중복 갈림길 `AUTH-DUP`)는 **Task 14**가 잇는다(화면 공유 — AUTH-PWNEW-05·08). ③ 재인증 `AUTH-REAUTH`·세션 `AUTH-SESS`는 Task 14(라우터의 `sensitiveReauthGuardProvider`도 T14 정의).

**Files:**
- Migrate: `supabase/migrations/00024_patient_consents.sql`(동의 이력 표 + `patients.ads_consent` — CONSENT-LOG-01·02)
- Modify: `supabase/config.toml`(비밀번호 8자·영문숫자 — AUTH-PROFILE-02 · phone OTP 만료 5분 — AUTH-OTP-04)
- Create(백엔드): `backend/app/services/consent_service.py`(동의 기록·광고 토글) · `backend/app/services/password_reset_service.py`(서버 경유 이름 대조·5회 잠금 — 갭 #78) · `backend/app/routers/patient_consent.py` · `backend/app/routers/patient_password_reset.py`
- Modify(백엔드): `backend/app/services/patient_profile_service.py`(`register_profile`이 동의 4줄 함께 기록) · `backend/app/main.py`(라우터 등록)
- Create(프론트): `patient_app/lib/features/auth/landing_screen.dart`(AUTH-LAND) · `consent_screen.dart`(CONSENT) · `signup_flow.dart`(마법사 셸·진행점·상태보존 — AUTH-SIGNUP) · `signup_phone_screen.dart`(AUTH-PHONE) · `otp_screen.dart`(AUTH-OTP 공용) · `signup_profile_screen.dart`(AUTH-PROFILE) · `new_password_screen.dart`(AUTH-PWNEW) · `phone_change_screen.dart`(AUTH-TEL) · `patient_app/lib/core/profile_status.dart`(`profileMissingProvider`)
- Test: `backend/tests/test_00024_consent_migration.py` · `test_consent_service.py` · `test_password_reset_service.py` · `patient_app/test/features/auth/{landing,consent,signup_flow,signup_phone,otp,signup_profile,new_password,phone_change}_screen_test.dart` · `test/core/profile_status_test.dart`

**Interfaces:**
- Consumes:
  - Task 0: `AppTokens`·`apiClientProvider`·`ApiClient`·`supabaseClientProvider`·`authStateChangesProvider`·`AuthStatus`·`appRouter`
  - Task 2: `patient_profile_service.register_profile`(이름·생년월일·성별) · `get_current_auth_user_id`(patients 행 없어도 통과)
  - Task 10: `POST /patients`(프로필 생성) · `GET /patients/me`(404=미완료 판정)
  - Task 11: `effectiveAuthProvider`·`connectivityProvider` · 라우터가 `profileMissingProvider`를 기다림(여기서 정의)
  - Task 12: `ActionButton`·`FieldTextInput`+`FieldErrorController`·`InlineError`·`CooldownButton`+`PhoneCooldownStore`·`showBlockDialog`·`EmptyState`
- Produces:
  - `profileMissingProvider`(`Provider<bool>` — GET /patients/me 404) · consent 서비스(`record_consents`·`set_ads_consent`) · `password_reset_service`(`verify_name_and_reset`·`RESET_LOCK`) · 가입 마법사 화면 7종 · `ConsentState`(4줄 동의 로컬 상태)
  - Task 14가 소비: `NewPasswordScreen`(비밀번호 찾기·중복 갈림길이 라우팅) · `PhoneChangeScreen`(번호 변경 안내 — PWFIND-06·PWNEW-12도 링크) · `otp_screen`(비밀번호 찾기 ②·가족 연결도 공유)

- [ ] **Step 1: 마이그레이션 `00024` + config.toml — 동의 이력 표 · 비밀번호/OTP 서버 설정 (`CONSENT-LOG-01·02` · `AUTH-PROFILE-02` · `AUTH-OTP-04`)**

> ⚠️ **번호 주의**: 환자앱은 `00017~00023`을 썼고(T9 device_tokens=00023) consent가 `00024`다. **직원웹도 `00017+`를 쓰므로 실제 번호는 구현 시점에 확정**(먼저 적용하는 쪽 우선). `private.current_patient_id()`·`private.is_active_staff()`는 공용(T1·device_tokens와 같은 패턴)을 재사용한다.

- [ ] **Step 1a: 실패 테스트** — `backend/tests/test_00024_consent_migration.py`

```python
import pytest
from pathlib import Path

pytestmark = pytest.mark.asyncio


async def test_patient_consents_table_exists(db_conn):
    # CONSENT-LOG-02 — 동의 이력 표가 통째로 없었다(갭 #108). 새로 생긴다.
    reg = await db_conn.fetchval("select to_regclass('public.patient_consents')")
    assert reg is not None


async def test_consent_item_check_constraint(db_conn):
    # CONSENT-ITEM-01 — 줄 넷: 약관·개인정보·민감정보·광고. item은 이 넷만 허용.
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into patient_consents (patient_id, item, agreed, terms_version) "
            "values (gen_random_uuid(), 'garbage', true, 'v1')")


async def test_patients_has_ads_consent_column(db_conn):
    # CONSENT-LOG-01 파생 — 광고 동의 '현재 상태' 칸(LATER 토글용). 기본 false.
    col = await db_conn.fetchval(
        "select column_default from information_schema.columns "
        "where table_name='patients' and column_name='ads_consent'")
    assert col is not None and 'false' in col.lower()


def test_config_password_and_otp_tightened():
    cfg = Path('supabase/config.toml').read_text()
    assert 'minimum_password_length = 8' in cfg          # AUTH-PROFILE-02: 6 → 8
    assert 'password_requirements = "letters_digits"' in cfg  # 영문·숫자 함께
    # AUTH-OTP-04: phone OTP가 화면(5분)과 어긋나지 않게 반영/주석으로 남긴다.
    assert 'otp_exp' in cfg or 'OTP expiry' in cfg
```
Run: `cd backend && pytest tests/test_00024_consent_migration.py -v` → Expected: FAIL(마이그레이션·config 미적용).

- [ ] **Step 1b: 마이그레이션 작성** — `supabase/migrations/00024_patient_consents.sql`

```sql
-- CONSENT-LOG-01·02 (갭 #108) — 동의 이력 표가 통째로 없었고 patients에도 동의 칸이 0개였다.
-- 동의는 가입 맨 앞(전화번호 전, CONSENT-STEP-01)이라 세션·patient 행이 아직 없다(CONSENT-STEP-03).
-- 그래서 화면이 로컬로 들고 있다가, 프로필 생성(POST /patients) 시점에 이 표에 함께 기록한다.

-- 광고 동의 '현재 상태'(가입 뒤 설정에서 켜고 끔 — CONSENT-LATER-01)
alter table patients add column if not exists ads_consent boolean not null default false;

-- 동의 이력 — 무엇에 · 언제 · 어느 판(버전)에 동의했는지(CONSENT-LOG-01).
-- 약관이 바뀌면 다시 받아야 하는데, 안 남기면 누구에게 다시 받아야 하는지 알 수 없다.
create table if not exists patient_consents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  item text not null check (item in ('terms', 'privacy', 'sensitive', 'ads')), -- CONSENT-ITEM-01 줄 넷
  agreed boolean not null,
  terms_version text not null,
  consented_at timestamptz not null default now()
);
create index if not exists patient_consents_by_patient
  on patient_consents (patient_id, consented_at desc);

-- RLS: 본인만 자기 이력 읽기, 직원 읽기. 쓰기는 서비스 역할(get_pool)이라 정책 없음(device_tokens와 같은 꼴).
alter table patient_consents enable row level security;
create policy patient_reads_own_consents on patient_consents
  for select using (private.current_patient_id() = patient_id);
create policy staff_reads_consents on patient_consents
  for select using (private.is_active_staff());

-- AUTH-PWNEW-15 — 새 비밀번호 화면의 「이름 맞히기」를 5회 틀리면 그 번호의 재설정을 잠근다.
-- 서버 내부용(서비스 역할만 접근) — RLS를 켜지 않는다(환자·직원이 직접 볼 표가 아니다).
create table if not exists password_reset_locks (
  phone text primary key,
  fail_count int not null default 0,
  locked boolean not null default false,
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 1c: config.toml 패치** — `supabase/config.toml`

```toml
# AUTH-PROFILE-01·02 — 화면이 요구하는 「8자 이상 + 영문·숫자」를 서버도 보장한다(서버를 화면에 맞춘다).
minimum_password_length = 8            # 6 → 8
password_requirements = "letters_digits"  # "" → 영문·숫자 함께
```
그리고 `[auth.sms]` 섹션에 만료를 명시한다(없으면 기본 1시간이 걸려 화면의 5분과 어긋난다 — AUTH-OTP-04):
```toml
[auth.sms]
otp_exp = 300  # AUTH-OTP-03·04 — 화면이 5분을 세므로 서버도 300초. CLI가 이 키를 무시하는 버전이면
               # 대시보드(Authentication > Providers > Phone > OTP expiry = 300)에서 설정한다(배포 체크리스트).
```
Run: `cd backend && pytest tests/test_00024_consent_migration.py -v`(마이그레이션은 `supabase migration up` 적용 후) → Expected: PASS(4 tests).

> 📌 **`00024`는 아직 원격 미적용** — 파일 작성·커밋과 실제 적용(`supabase migration up`)은 별개다(전역 지침). 배포 플랜이 적용 순서를 관리한다.

- [ ] **Step 2: consent 서비스 + `register_profile` 연동 — 동의 기록·광고 토글·발송 자격 (`CONSENT-LOG-01` · `CONSENT-LATER-01·02` · `CONSENT-ADS-01`)**

- [ ] **Step 2a: 실패 테스트** — `backend/tests/test_consent_service.py`

```python
from datetime import datetime
import pytest
from app.services import consent_service

pytestmark = pytest.mark.asyncio

TV = '2026-08-01'  # terms_version


async def _seed_patient(conn):
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('김순자','1954-03-02','F','01011112222') returning id")


async def test_record_consents_writes_four_rows(db_conn):
    # CONSENT-LOG-01 — 프로필 생성 시 4줄(필수 3 true + 광고 선택) 기록
    pid = await _seed_patient(db_conn)
    await consent_service.record_consents(db_conn, pid, ads_agreed=False, terms_version=TV)
    rows = await db_conn.fetch(
        "select item, agreed from patient_consents where patient_id=$1", pid)
    items = {r['item']: r['agreed'] for r in rows}
    assert items == {'terms': True, 'privacy': True, 'sensitive': True, 'ads': False}


async def test_record_consents_sets_current_ads_flag(db_conn):
    # CONSENT-LOG-01 — 현재 상태 칸도 함께 맞춘다
    pid = await _seed_patient(db_conn)
    await consent_service.record_consents(db_conn, pid, ads_agreed=True, terms_version=TV)
    assert await db_conn.fetchval("select ads_consent from patients where id=$1", pid) is True


async def test_set_ads_consent_toggles_and_logs(db_conn):
    # CONSENT-LATER-01 — 가입 뒤 광고 동의를 켜면 현재 상태 + 이력 한 줄
    pid = await _seed_patient(db_conn)
    await consent_service.set_ads_consent(db_conn, pid, agreed=True, terms_version=TV)
    assert await db_conn.fetchval("select ads_consent from patients where id=$1", pid) is True
    n = await db_conn.fetchval(
        "select count(*) from patient_consents where patient_id=$1 and item='ads'", pid)
    assert n == 1


def test_no_service_path_to_toggle_required_consents():
    # CONSENT-LATER-02 — 필수 셋을 끄는 길은 없다(끄는 것이 곧 탈퇴). set_ads_consent는 item='ads'만 만진다.
    assert not hasattr(consent_service, 'set_required_consent')


def test_can_send_ads_gates_on_consent_and_night():
    # CONSENT-ADS-01 — 켠 사람에게만 + 21~08시 발송 금지(정보통신망법 50조)
    assert consent_service.can_send_ads(ads_consent=False, now=datetime(2026, 8, 17, 14, 0)) is False
    assert consent_service.can_send_ads(ads_consent=True, now=datetime(2026, 8, 17, 22, 0)) is False  # 야간
    assert consent_service.can_send_ads(ads_consent=True, now=datetime(2026, 8, 17, 7, 0)) is False   # 08시 전
    assert consent_service.can_send_ads(ads_consent=True, now=datetime(2026, 8, 17, 14, 0)) is True
```
Run: `cd backend && pytest tests/test_consent_service.py -v` → Expected: FAIL(`consent_service` 없음).

- [ ] **Step 2b: `consent_service.py` 구현** — `backend/app/services/consent_service.py`

```python
"""동의 기록·광고 동의 토글·광고 발송 자격(CONSENT-*, 갭 #108·#104).

동의는 가입 맨 앞(전화번호 전)이라 이 서비스는 세션 밖에서 불릴 수 없다 — 프로필 생성 시점에
patient_id가 생긴 뒤 `register_profile`이 record_consents를 부른다.
"""
from datetime import datetime

REQUIRED_ITEMS = ('terms', 'privacy', 'sensitive')  # CONSENT-ITEM-01·02 — 민감정보는 별도(개인정보보호법 23조)


async def record_consents(conn, patient_id, *, ads_agreed: bool, terms_version: str) -> None:
    """CONSENT-LOG-01 — 프로필 생성 시 무엇에·언제·어느 판에 동의했는지 4줄을 남긴다.
    필수 3개는 여기 도달했다는 것 자체가 동의다(CONSENT-BTN-01: 필수 셋이 켜져야 [다음]이 살아난다)."""
    rows = [(patient_id, item, True, terms_version) for item in REQUIRED_ITEMS]
    rows.append((patient_id, 'ads', ads_agreed, terms_version))
    await conn.executemany(
        "insert into patient_consents (patient_id, item, agreed, terms_version) "
        "values ($1, $2, $3, $4)",
        rows,
    )
    await conn.execute(
        "update patients set ads_consent = $1 where id = $2", ads_agreed, patient_id)


async def set_ads_consent(conn, patient_id, *, agreed: bool, terms_version: str) -> None:
    """CONSENT-LATER-01 — 가입 뒤 [선택] 광고 동의만 켜고 끈다(설정 > 알림 설정).
    CONSENT-LATER-02: 필수 셋을 끄는 함수는 두지 않는다 — 끄는 것이 곧 탈퇴이기 때문(탈퇴 경로로 안내)."""
    await conn.execute(
        "update patients set ads_consent = $1 where id = $2", agreed, patient_id)
    await conn.execute(
        "insert into patient_consents (patient_id, item, agreed, terms_version) "
        "values ($1, 'ads', $2, $3)",
        patient_id, agreed, terms_version,
    )


def can_send_ads(*, ads_consent: bool, now: datetime) -> bool:
    """CONSENT-ADS-01 — 광고는 켠 사람에게만 + 21~08시 발송 금지. (광고) 접두어·무료 수신거부
    방법은 발송측(직원웹 Task 28)이 본문에 붙인다 — 여기서는 자격만 판정한다."""
    if not ads_consent:
        return False
    return 8 <= now.hour < 21
```

- [ ] **Step 2c: `register_profile` 연동 + 광고 토글 라우터**

`backend/app/services/patient_profile_service.py`(Modify — `register_profile` 시그니처에 동의 인자 추가, 프로필 생성 트랜잭션 끝에 기록):
```python
# register_profile(conn, auth_user_id, *, name, birth_date, gender, ads_agreed, terms_version)
#   기존 프로필 생성 로직 뒤에 한 줄 추가:
await consent_service.record_consents(conn, patient_id, ads_agreed=ads_agreed, terms_version=terms_version)
# ↑ 같은 트랜잭션 안 — 프로필과 동의 기록은 함께 커밋되거나 함께 롤백된다(CONSENT-LOG-01).
```

`backend/app/routers/patient_consent.py`(Create — 광고 토글만; 최초 동의는 POST /patients에 포함):
```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.core.patient_security import get_current_patient, PatientContext
from app.db.pool import get_pool
from app.services import consent_service

router = APIRouter(prefix="/patients/me", tags=["consent"])
TERMS_VERSION = "2026-08-01"  # 병원이 약관을 갱신하면 올린다 — CONSENT-LOG-01의 '어느 판'


class AdsConsentIn(BaseModel):
    agreed: bool


@router.patch("/ads-consent")
async def patch_ads_consent(body: AdsConsentIn, patient: PatientContext = Depends(get_current_patient)):
    async with get_pool().acquire() as conn:  # 서비스 역할 — 정책 없음
        await consent_service.set_ads_consent(
            conn, patient.id, agreed=body.agreed, terms_version=TERMS_VERSION)
    return {"ads_consent": body.agreed}
```
Run: `cd backend && pytest tests/test_consent_service.py -v` → Expected: PASS(6 tests). (`main.py`에 `patient_consent.router` 등록은 Step 4의 통합에서 함께.)

- [ ] **Step 3: 서버 경유 비밀번호 재설정 — 이름 대조·공백 무시·미노출·5회 잠금 (`AUTH-PWNEW-09·09b·10·11·15`, 갭 #78)**

> ⭐ **왜 서버 경유인가(AUTH-PWNEW-09b)**: 지금은 앱이 Supabase `updateUser`를 직접 호출해 **서버가 끼어들 자리가 없다** → 이름 대조(`-09`)도 5회 잠금(`-15`)도 성립하지 않는다(갭 #78). 재설정을 백엔드 엔드포인트로 옮겨, 서버가 이름을 대조한 뒤 **admin API로** 비밀번호를 바꾼다. ⚠️ **저장된 이름을 앱으로 내려보내지 않는다(AUTH-PWNEW-09 = `MASK-SRV-01`)** — 내려보내면 번호를 물려받은 사람이 화면에서 앞 사람 이름을 읽고 그대로 친다.

- [ ] **Step 3a: 실패 테스트** — `backend/tests/test_password_reset_service.py`

```python
import types
import uuid
import pytest
from app.core.errors import AppError
from app.services import password_reset_service as prs

pytestmark = pytest.mark.asyncio


def _admin_stub():
    stub = types.SimpleNamespace(updated=None)

    async def update_user_by_id(uid, attrs):
        stub.updated = (uid, attrs["password"])

    stub.auth = types.SimpleNamespace(
        admin=types.SimpleNamespace(update_user_by_id=update_user_by_id))
    return stub


async def _seed(conn, name):
    uid = uuid.uuid4()
    await conn.execute(
        "insert into patients (name, birth_date, gender, phone, auth_user_id) "
        "values ($1,'1954-03-02','F','01011112222',$2)", name, uid)
    return uid


async def test_reset_succeeds_with_matching_name(db_conn):
    # AUTH-PWNEW-09b — 이름이 맞으면 서버 경유(admin API)로 비밀번호가 갱신된다
    uid = await _seed(db_conn, '홍길동')
    admin = _admin_stub()
    await prs.verify_name_and_reset(db_conn, admin, uid, name_input='홍길동', new_password='newpass12')
    assert admin.updated == (str(uid), 'newpass12')


async def test_name_match_ignores_spaces(db_conn):
    # AUTH-PWNEW-10 — '홍 길동'과 '홍길동'을 다르다고 하지 않는다(앞뒤·가운데 공백 제거 후 완전일치)
    uid = await _seed(db_conn, '홍길동')
    admin = _admin_stub()
    await prs.verify_name_and_reset(db_conn, admin, uid, name_input='  홍 길동 ', new_password='newpass12')
    assert admin.updated is not None


async def test_wrong_name_raises_without_revealing_stored(db_conn):
    # AUTH-PWNEW-11 — '등록된 이름과 다릅니다' / AUTH-PWNEW-09 — 저장된 이름을 노출하지 않는다
    uid = await _seed(db_conn, '홍길동')
    admin = _admin_stub()
    with pytest.raises(AppError) as e:
        await prs.verify_name_and_reset(db_conn, admin, uid, name_input='김철수', new_password='newpass12')
    assert '등록된 이름과 다릅니다' in str(e.value.detail)
    assert '홍길동' not in str(e.value.detail)   # 저장 이름 미노출
    assert admin.updated is None                 # 비밀번호를 건드리지 않았다
    cnt = await db_conn.fetchval(
        "select fail_count from password_reset_locks where phone='01011112222'")
    assert cnt == 1


async def test_locks_after_five_wrong_names(db_conn):
    # AUTH-PWNEW-15 — 5회 틀리면 그 번호의 재설정을 잠근다. 이후엔 맞는 이름도 막힌다.
    uid = await _seed(db_conn, '홍길동')
    admin = _admin_stub()
    for _ in range(5):
        with pytest.raises(AppError):
            await prs.verify_name_and_reset(db_conn, admin, uid, name_input='틀림', new_password='newpass12')
    with pytest.raises(AppError) as e:
        await prs.verify_name_and_reset(db_conn, admin, uid, name_input='홍길동', new_password='newpass12')
    assert e.value.status_code == 423   # 잠김(맞는 이름이어도)
    assert admin.updated is None
```
Run: `cd backend && pytest tests/test_password_reset_service.py -v` → Expected: FAIL(`password_reset_service` 없음).

- [ ] **Step 3b: `password_reset_service.py` 구현** — `backend/app/services/password_reset_service.py`

```python
"""서버 경유 비밀번호 재설정(AUTH-PWNEW-*, 갭 #78). OTP를 통과해 로그인된 세션에서만 도달한다
(AUTH-PWFIND-05·07). 이름을 대조해 번호 재활용을 막고, 5회 틀리면 잠근다."""
from app.core.errors import AppError

MAX_RESET_FAILS = 5  # AUTH-PWNEW-15


def normalize_name(s: str) -> str:
    """AUTH-PWNEW-10 — 앞뒤 여백과 가운데 공백을 모두 지운 뒤 비교한다('홍 길동' == '홍길동')."""
    return "".join(s.split())


async def verify_name_and_reset(conn, admin_client, auth_user_id, *, name_input, new_password):
    """이름이 맞으면 서버 경유로 비밀번호를 바꾼다(AUTH-PWNEW-09b). 저장된 이름은 응답으로
    내려보내지 않는다(AUTH-PWNEW-09). 다르면 실패를 세고 5회면 잠근다(AUTH-PWNEW-11·15)."""
    row = await conn.fetchrow(
        "select name, phone from patients where auth_user_id = $1", auth_user_id)
    if row is None:
        raise AppError("비밀번호를 재설정할 수 없습니다. 병원으로 문의해주세요.", status_code=409)

    phone = row["phone"]
    lock = await conn.fetchrow(
        "select fail_count, locked from password_reset_locks where phone = $1", phone)
    if lock and lock["locked"]:
        raise AppError("여러 번 일치하지 않아 잠겼습니다. 병원으로 문의해주세요.", status_code=423)

    if normalize_name(name_input) != normalize_name(row["name"]):
        new_count = (lock["fail_count"] if lock else 0) + 1
        await conn.execute(
            "insert into password_reset_locks (phone, fail_count, locked, updated_at) "
            "values ($1, $2, $3, now()) "
            "on conflict (phone) do update set "
            "fail_count = excluded.fail_count, locked = excluded.locked, updated_at = now()",
            phone, new_count, new_count >= MAX_RESET_FAILS)
        raise AppError("등록된 이름과 다릅니다.", status_code=400)  # 저장된 이름을 넣지 않는다

    # 맞음 — 카운트를 지우고 서버 경유(admin)로 비밀번호를 바꾼다.
    await conn.execute("delete from password_reset_locks where phone = $1", phone)
    await admin_client.auth.admin.update_user_by_id(str(auth_user_id), {"password": new_password})
```

- [ ] **Step 3c: 재설정 라우터** — `backend/app/routers/patient_password_reset.py`

```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.core.patient_security import get_current_auth_user_id
from app.db.pool import get_pool
from app.db.supabase_admin import get_admin_client  # service_role 클라이언트(1단계 재사용/신설)
from app.services import password_reset_service


router = APIRouter(prefix="/patients/me", tags=["password-reset"])


class ResetIn(BaseModel):
    name: str
    password: str


@router.post("/password-reset")
async def reset_password(body: ResetIn, auth_user_id=Depends(get_current_auth_user_id)):
    # OTP 통과로 로그인된 세션에서만 도달한다(AUTH-PWFIND-05). 프로필 유무와 무관하게 통과시키는
    # get_current_auth_user_id를 쓴다 — 재설정은 프로필이 있는 계정을 대상으로 하지만, 판정은 서비스가 한다.
    async with get_pool().acquire() as conn:
        await password_reset_service.verify_name_and_reset(
            conn, get_admin_client(), auth_user_id,
            name_input=body.name, new_password=body.password)
    return {"ok": True}
```
Run: `cd backend && pytest tests/test_password_reset_service.py -v` → Expected: PASS(4 tests).

> 📌 **`get_admin_client`(service_role)** 는 Supabase admin API로 비밀번호를 바꾸는 데 필요하다 — 1단계에 있으면 재사용, 없으면 이 태스크에서 `backend/app/db/supabase_admin.py`로 얇게 신설(`SUPABASE_SERVICE_ROLE_KEY` 사용). 갭 #78의 실체.

- [ ] **Step 4: `profileMissingProvider` + `ApiException.statusCode` 보강 + 라우터 등록 (`AUTH-SIGNUP-11·12`)**

> ⚠️ **경계 확인 결과(경계 크랙 방지)**: Task 10 `GET /patients/me`는 `get_current_patient` 의존이라 **프로필이 없으면 403**을 낸다(404 아님). Task 11 router 주석의 "404"는 낡음 → **403으로 정정**(위 router.dart 주석 수정 완료). ② Task 0 `ApiException`은 `message`만 있고 **`statusCode`가 없어** 403을 구분 못 한다 → **여기서 보강**(T0 누락).

- [ ] **Step 4a: 실패 테스트** — `patient_app/test/core/profile_status_test.dart`

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/providers.dart';
import 'package:hospital_patient_app/core/profile_status.dart';
import 'package:hospital_patient_app/features/auth/auth_state.dart';

/// GET /patients/me를 흉내내는 얇은 Fake — 403을 던지거나 200을 돌려준다.
class _FakeApi extends Fake implements ApiClient {
  final int? throwStatus;
  _FakeApi({this.throwStatus});
  @override
  Future<T> get<T>(String path, T Function(dynamic) parse, {Map<String, String>? query}) async {
    if (throwStatus != null) throw ApiException('e', statusCode: throwStatus);
    return parse({'patient_id': 'x'});
  }
}

void main() {
  test('[AUTH-SIGNUP-12] GET /patients/me가 403이면 프로필 미완료(true)', () async {
    final c = ProviderContainer(
        overrides: [apiClientProvider.overrideWithValue(_FakeApi(throwStatus: 403))]);
    addTearDown(c.dispose);
    expect(await c.read(profileStatusProvider.future), isTrue);
  });

  test('[AUTH-SIGNUP-12] 프로필이 있으면(200) 미완료가 아니다(false)', () async {
    final c = ProviderContainer(
        overrides: [apiClientProvider.overrideWithValue(_FakeApi())]);
    addTearDown(c.dispose);
    expect(await c.read(profileStatusProvider.future), isFalse);
  });

  test('[AUTH-SIGNUP-11] 「가입 미완료」는 별도 enum 값이 아니라 signedIn+missing 조합이다', () {
    // AuthStatus에 새 값을 만들지 않는다 — 세 값 그대로(Task 11의 expiredOffline까지).
    expect(AuthStatus.values,
        [AuthStatus.signedOut, AuthStatus.signedIn, AuthStatus.expiredOffline]);
  });
}
```
Run: `flutter test test/core/profile_status_test.dart` → Expected: FAIL(`profile_status.dart`·`statusCode` 없음).

- [ ] **Step 4b: `ApiException`에 `statusCode` 보강** — `patient_app/lib/core/api_client.dart` (Modify)

```dart
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode}); // statusCode 추가(T0 누락 보강)
  final String message;
  final int? statusCode; // 403(프로필 미완료) 등 상태 구분용
}
```
그리고 `_handle`의 실패 분기를 한 줄 고친다:
```dart
    throw ApiException(message, statusCode: response.statusCode);
```

- [ ] **Step 4c: `profile_status.dart` 구현** — `patient_app/lib/core/profile_status.dart`

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';
import 'providers.dart';

/// AUTH-SIGNUP-12 — 출입증(세션)은 있는데 프로필(이름·생년월일)이 없으면 가입 미완료다.
/// GET /patients/me가 403이면(get_current_patient가 patients 행을 못 찾음) 미완료로 본다.
/// 이 판정은 OFF-AUTH-04(온라인 401만 진짜 로그아웃)와 같은 결이다 — 세션과 프로필을 따로 본다.
final profileStatusProvider = FutureProvider<bool>((ref) async {
  final api = ref.watch(apiClientProvider);
  try {
    await api.get('/patients/me', (j) => j);
    return false; // 프로필 있음
  } on ApiException catch (e) {
    if (e.statusCode == 403) return true; // patients 행 없음 = 미완료
    rethrow;                              // 다른 오류는 미완료 판정에 쓰지 않는다
  }
});

/// AUTH-SIGNUP-11 — 별도 enum 값을 만들지 않는다. Task 11 라우터가 `signedIn && profileMissing`으로
/// 「가입 미완료」를 표현하고 `/signup/step3`로 보낸다. 로딩 중엔 false라 튕기지 않는다.
final profileMissingProvider =
    Provider<bool>((ref) => ref.watch(profileStatusProvider).valueOrNull ?? false);
```

- [ ] **Step 4d: 라우터 등록** — `backend/app/main.py` (Modify)

```python
from app.routers import patient_consent, patient_password_reset
app.include_router(patient_consent.router)
app.include_router(patient_password_reset.router)
```
Run: `flutter test test/core/profile_status_test.dart` → Expected: PASS(3 tests).

- [ ] **Step 5: 랜딩 화면 — 큰 버튼 2개 (`AUTH-LAND-01·02·03·04`)**

- [ ] **Step 5a: 실패 테스트** — `patient_app/test/features/auth/landing_screen_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/auth/landing_screen.dart';

void main() {
  testWidgets('[AUTH-LAND-01] 큰 버튼 2개([로그인]·[회원가입])만, 입력칸은 없다', (t) async {
    await t.pumpWidget(const MaterialApp(home: LandingScreen()));
    expect(find.text('로그인'), findsOneWidget);
    expect(find.text('회원가입'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);       // 입력칸을 두지 않는다
    expect(find.byType(TextFormField), findsNothing);
  });

  testWidgets('[AUTH-LAND-02] 병원 이름 + 한 줄 소개. 탭 전환형(TabBar)을 쓰지 않는다', (t) async {
    await t.pumpWidget(const MaterialApp(home: LandingScreen()));
    expect(find.text(LandingScreen.hospitalName), findsOneWidget);
    expect(find.byType(TabBar), findsNothing);          // 탭 전환형·가입 우선형 아님
  });

  testWidgets('[AUTH-LAND-03] 비밀번호를 잊으셨나요?를 랜딩에도 둔다', (t) async {
    await t.pumpWidget(const MaterialApp(home: LandingScreen()));
    expect(find.text('비밀번호를 잊으셨나요?'), findsOneWidget);
  });

  testWidgets('[AUTH-LAND-04] 로그인 전에는 하단 탭을 그리지 않는다', (t) async {
    await t.pumpWidget(const MaterialApp(home: LandingScreen()));
    final scaffold = t.widget<Scaffold>(find.byType(Scaffold));
    expect(scaffold.bottomNavigationBar, isNull);
  });
}
```
Run: `flutter test test/features/auth/landing_screen_test.dart` → Expected: FAIL(`landing_screen.dart` 없음).

- [ ] **Step 5b: `LandingScreen` 구현** — `patient_app/lib/features/auth/landing_screen.dart`

```dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/tokens.dart';

/// 로그인 전 첫 화면. 큰 버튼 2개만 두고 입력칸을 두지 않는다(AUTH-LAND-01) — 화면당 핵심 행동 1개.
class LandingScreen extends StatelessWidget {
  const LandingScreen({super.key});

  static const String hospitalName = '○○의원'; // 배포 시 병원 정보로 치환(get_public_hospital_info)

  @override
  Widget build(BuildContext context) {
    // AUTH-LAND-04: bottomNavigationBar를 두지 않는다(로그인 전에는 탭 5개를 그리지 않는다).
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // AUTH-LAND-02: 병원 이름 + 한 줄 소개(탭 전환형·가입 우선형 아님).
              Text(hospitalName,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text('진료 예약과 방문 이력을 한 곳에서',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppTokens.grayPending)),
              const SizedBox(height: 48),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: AppTokens.primary),
                onPressed: () => context.go('/login'), // 주 버튼
                child: const Text('로그인'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => context.go('/signup'), // 보조 버튼
                child: const Text('회원가입'),
              ),
              const SizedBox(height: 16),
              // AUTH-LAND-03: 비밀번호를 모르는 사람이 로그인 화면까지 들어가야 보이면 한 번 더 막힌다.
              TextButton(
                onPressed: () => context.go('/password-find'),
                child: const Text('비밀번호를 잊으셨나요?'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```
Run: `flutter test test/features/auth/landing_screen_test.dart` → Expected: PASS(4 tests).

- [ ] **Step 6: 동의 화면 ⓪ — 줄 넷·전체 동의·[다음] (`CONSENT-STEP-01·02·03·08` · `CONSENT-ITEM-01~05` · `CONSENT-ALL-01~04` · `CONSENT-BTN-01~04`)**

> ⭐ **동의는 가입 맨 앞(CONSENT-STEP-01·02)이고 이 시점엔 세션이 없다(CONSENT-STEP-03)** — 화면은 `AuthStatus`를 건드리지 않고, 4줄 동의를 `consentProvider`(로컬)에 담는다. 뒤로 갔다 와도 켜 둔 체크가 남는다(CONSENT-STEP-08 — provider가 화면 밖에서 산다).

- [ ] **Step 6a: 실패 테스트 (상태)** — `patient_app/test/features/auth/consent_screen_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/auth/consent_screen.dart';

Widget _host(Widget child, [ProviderContainer? c]) => UncontrolledProviderScope(
    container: c ?? ProviderContainer(),
    child: MaterialApp(home: child));

void main() {
  test('[CONSENT-ALL-01] 「필수 항목에 모두 동의」는 필수 3개만 켜고 광고는 켜지 않는다', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    c.read(consentProvider.notifier).toggleRequiredAll();
    final s = c.read(consentProvider);
    expect(s.requiredAllOn, isTrue);
    expect(s.ads, isFalse); // [선택] 광고는 켜지지 않는다
  });

  test('[CONSENT-ALL-04] 필수 하나를 끄면 맨 위 「모두 동의」도 함께 꺼진다(파생값)', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final n = c.read(consentProvider.notifier);
    n.toggleRequiredAll();
    n.toggle('sensitive'); // 민감정보 끔
    expect(c.read(consentProvider).requiredAllOn, isFalse);
  });

  test('[CONSENT-ITEM-02] 민감정보(③)는 개인정보(②)와 별도로 켜고 끈다', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final n = c.read(consentProvider.notifier);
    n.toggle('privacy');
    expect(c.read(consentProvider).privacy, isTrue);
    expect(c.read(consentProvider).sensitive, isFalse); // 묶이지 않는다
  });

  test('[CONSENT-BTN-03] 남은 필수 개수를 센다', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    expect(c.read(consentProvider).requiredRemaining, 3);
    c.read(consentProvider.notifier).toggle('terms');
    expect(c.read(consentProvider).requiredRemaining, 2);
  });

  testWidgets('[CONSENT-STEP-03] 세션(AuthStatus)을 건드리지 않는다 — authState override 없이도 뜬다', (t) async {
    await t.pumpWidget(_host(const ConsentScreen())); // authStateChangesProvider override 없음
    expect(find.byType(ConsentScreen), findsOneWidget);
  });

  testWidgets('[CONSENT-STEP-08] 뒤로 갔다 와도 켜 둔 체크가 남는다(provider가 화면 밖에서 산다)', (t) async {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    c.read(consentProvider.notifier).toggleRequiredAll();
    await t.pumpWidget(_host(const ConsentScreen(), c)); // 화면 새로 그려도
    expect(c.read(consentProvider).requiredAllOn, isTrue); // 상태 유지
  });

  testWidgets('[CONSENT-ITEM-01] [필수] 3줄 + [선택] 1줄, 모두 네 줄', (t) async {
    await t.pumpWidget(_host(const ConsentScreen()));
    expect(find.textContaining('서비스 이용약관'), findsOneWidget);
    expect(find.textContaining('개인정보 수집·이용'), findsOneWidget);
    expect(find.textContaining('민감정보'), findsOneWidget);
    expect(find.textContaining('광고성 정보 수신'), findsOneWidget);
    expect(find.text('[선택]'), findsOneWidget); // 선택은 정확히 하나(광고)
  });

  testWidgets('[CONSENT-ITEM-03] 각 줄에 무엇을 주는지 부제목이 붙는다', (t) async {
    await t.pumpWidget(_host(const ConsentScreen()));
    expect(find.textContaining('이름 · 생년월일 · 성별 · 전화번호'), findsOneWidget); // ②
    expect(find.textContaining('문진 답변 · 진료기록 · 처방'), findsOneWidget);      // ③
  });

  testWidgets('[CONSENT-ITEM-04] ④에 「안 받아도 예약 알림은 그대로 옵니다」를 적는다', (t) async {
    await t.pumpWidget(_host(const ConsentScreen()));
    expect(find.textContaining('안 받아도 예약 알림은 그대로 옵니다'), findsOneWidget);
  });

  testWidgets('[CONSENT-ITEM-05] 줄 끝 › 를 누르면 본문(자리표시자)이 열린다', (t) async {
    await t.pumpWidget(_host(const ConsentScreen()));
    await t.tap(find.byIcon(Icons.chevron_right).first);
    await t.pumpAndSettle();
    expect(find.byType(Dialog), findsOneWidget); // 본문 열림(내용은 병원이 채운다)
  });

  testWidgets('[CONSENT-ALL-03] 맨 위 줄 이름은 「필수 항목에 모두 동의」(전체 동의 아님)', (t) async {
    await t.pumpWidget(_host(const ConsentScreen()));
    expect(find.text('필수 항목에 모두 동의'), findsOneWidget);
    expect(find.text('전체 동의'), findsNothing);
  });

  testWidgets('[CONSENT-BTN-01] 필수 셋이 켜지면 [다음]이 살아난다', (t) async {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    c.read(consentProvider.notifier).toggleRequiredAll();
    await t.pumpWidget(_host(const ConsentScreen(), c));
    final btn = t.widget<FilledButton>(find.widgetWithText(FilledButton, '다음'));
    expect(btn.onPressed, isNotNull); // 활성
  });

  testWidgets('[CONSENT-BTN-02] 덜 켜지면 [다음]이 꺼지고 아래에 「필수 항목 N개가 남았습니다」', (t) async {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    c.read(consentProvider.notifier).toggle('terms'); // 1개만 켬 → 2개 남음
    await t.pumpWidget(_host(const ConsentScreen(), c));
    final btn = t.widget<FilledButton>(find.widgetWithText(FilledButton, '다음'));
    expect(btn.onPressed, isNull); // 꺼짐
    expect(find.text('필수 항목 2개가 남았습니다'), findsOneWidget);
  });

  testWidgets('[CONSENT-BTN-04] 막다른 길 방지 — 동의 없이 이용하려면 병원 전화 안내', (t) async {
    await t.pumpWidget(_host(const ConsentScreen()));
    expect(find.textContaining('동의 없이 이용하려면 병원으로 전화'), findsOneWidget);
  });
}
```
`CONSENT-STEP-01·02`(가입 맨 앞이라는 자리·근거)는 라우터가 `/signup`을 `ConsentScreen`으로 여는 것으로 실현되고 Step 9(signup_flow 라우팅)에서 함께 확인한다 — 여기서는 화면이 그 계약(세션 없이 뜸·상태 보존)을 지키는지 본다.
Run: `flutter test test/features/auth/consent_screen_test.dart` → Expected: FAIL(`consent_screen.dart` 없음).

- [ ] **Step 6b: `consentProvider` + `ConsentScreen` 구현** — `patient_app/lib/features/auth/consent_screen.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/tokens.dart';

/// 4줄 동의의 로컬 상태(CONSENT-STEP-03: 세션 없이 화면이 들고 있다). 화면 밖 provider라
/// 뒤로 갔다 와도 남는다(CONSENT-STEP-08). 프로필 생성 때 서버로 함께 보낸다(consent_service).
class ConsentState {
  final bool terms, privacy, sensitive, ads;
  const ConsentState({this.terms = false, this.privacy = false, this.sensitive = false, this.ads = false});

  ConsentState copyWith({bool? terms, bool? privacy, bool? sensitive, bool? ads}) => ConsentState(
        terms: terms ?? this.terms,
        privacy: privacy ?? this.privacy,
        sensitive: sensitive ?? this.sensitive,
        ads: ads ?? this.ads,
      );

  bool get requiredAllOn => terms && privacy && sensitive; // CONSENT-ALL-04: 파생값이라 어긋나지 않는다
  int get requiredRemaining => (terms ? 0 : 1) + (privacy ? 0 : 1) + (sensitive ? 0 : 1);
}

class ConsentNotifier extends StateNotifier<ConsentState> {
  ConsentNotifier() : super(const ConsentState());

  void toggle(String item) {
    switch (item) {
      case 'terms': state = state.copyWith(terms: !state.terms);
      case 'privacy': state = state.copyWith(privacy: !state.privacy);
      case 'sensitive': state = state.copyWith(sensitive: !state.sensitive);
      case 'ads': state = state.copyWith(ads: !state.ads);
    }
  }

  /// CONSENT-ALL-01 — 맨 위 줄은 필수 3개만 켜고 끈다. [선택] 광고는 건드리지 않는다.
  void toggleRequiredAll() {
    final on = !state.requiredAllOn;
    state = state.copyWith(terms: on, privacy: on, sensitive: on);
  }
}

final consentProvider =
    StateNotifierProvider<ConsentNotifier, ConsentState>((_) => ConsentNotifier());

class ConsentScreen extends ConsumerWidget {
  const ConsentScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(consentProvider);
    final n = ref.read(consentProvider.notifier);
    return Scaffold(
      appBar: AppBar(title: const Text('약관 동의')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // CONSENT-ALL-03: 이름에 무엇이 켜지는지 적는다(전체 동의 아님).
          CheckboxListTile(
            title: const Text('필수 항목에 모두 동의', style: TextStyle(fontWeight: FontWeight.bold)),
            value: s.requiredAllOn,
            onChanged: (_) => n.toggleRequiredAll(),
          ),
          const Divider(),
          _row(context, '[필수]', '서비스 이용약관', null, s.terms, () => n.toggle('terms')),
          _row(context, '[필수]', '개인정보 수집·이용', '이름 · 생년월일 · 성별 · 전화번호', s.privacy, () => n.toggle('privacy')),
          _row(context, '[필수]', '민감정보(건강정보) 처리', '문진 답변 · 진료기록 · 처방', s.sensitive, () => n.toggle('sensitive')),
          // CONSENT-ITEM-04: 정보성과 광고성이 다르다는 것을 밝히는 유일한 자리.
          _row(context, '[선택]', '광고성 정보 수신', '검진·행사 안내 · 안 받아도 예약 알림은 그대로 옵니다', s.ads, () => n.toggle('ads')),
          const SizedBox(height: 24),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppTokens.primary),
            // CONSENT-BTN-01: 필수 셋이 켜져야 살아난다 → ① 전화번호로.
            onPressed: s.requiredAllOn ? () => context.go('/signup/phone') : null,
            child: const Text('다음'),
          ),
          // CONSENT-BTN-02·03: 왜 안 눌리는지 모르는 버튼을 만들지 않는다 — 남은 개수를 센다.
          if (!s.requiredAllOn)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('필수 항목 ${s.requiredRemaining}개가 남았습니다',
                  textAlign: TextAlign.center, style: const TextStyle(color: AppTokens.grayPending)),
            ),
          const SizedBox(height: 24),
          // CONSENT-BTN-04: 막다른 길 금지 — 동의를 안 하는 사람에게도 길을 준다.
          const Text('동의 없이 이용하려면 병원으로 전화 주세요 · 02-000-0000',
              textAlign: TextAlign.center, style: TextStyle(color: AppTokens.grayPending, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _row(BuildContext context, String badge, String title, String? sub, bool value, VoidCallback onToggle) {
    return CheckboxListTile(
      value: value,
      onChanged: (_) => onToggle(),
      title: Text('$badge $title'),
      subtitle: sub == null ? null : Text(sub, style: const TextStyle(fontSize: 12)),
      secondary: IconButton(
        icon: const Icon(Icons.chevron_right), // CONSENT-ITEM-05: › → 본문(병원이 채운다)
        onPressed: () => showDialog(
          context: context,
          builder: (_) => const Dialog(child: Padding(padding: EdgeInsets.all(24), child: Text('약관 본문(준비 중)'))),
        ),
      ),
      controlAffinity: ListTileControlAffinity.leading,
    );
  }
}
```
Run: `flutter test test/features/auth/consent_screen_test.dart` → Expected: PASS(14 tests).

- [ ] **Step 7: 전화번호 화면 ① — 안내·검증·발송·쿨다운 (`AUTH-PHONE-01·02·03·04`)**

> Task 12의 `FieldTextInput`(검증)·`ActionButton`(발송 버튼 busy)·`PhoneCooldownStore`(번호 기준 쿨다운)를 소비한다. 발송은 Supabase Auth phone OTP(`shouldCreateUser: true`)이고, 쿨다운 판정은 `SignupPhoneController`로 분리해 단위 테스트한다.

- [ ] **Step 7a: 실패 테스트** — `patient_app/test/features/auth/signup_phone_screen_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:hospital_patient_app/core/phone_cooldown.dart';
import 'package:hospital_patient_app/features/auth/signup_phone_screen.dart';

class _MockStorage extends Mock implements FlutterSecureStorage {}

_MockStorage _mem() {
  final s = _MockStorage();
  final m = <String, String?>{};
  when(() => s.write(key: any(named: 'key'), value: any(named: 'value')))
      .thenAnswer((i) async => m[i.namedArguments[#key] as String] = i.namedArguments[#value] as String?);
  when(() => s.read(key: any(named: 'key'))).thenAnswer((i) async => m[i.namedArguments[#key] as String]);
  when(() => s.delete(key: any(named: 'key'))).thenAnswer((i) async => m.remove(i.namedArguments[#key] as String));
  return s;
}

/// 발송을 흉내내는 Fake — 실제로 몇 번 불렸는지 센다.
class _FakeSender implements AuthOtpSender {
  int sent = 0;
  @override
  Future<void> sendSignupOtp(String phone) async => sent++;
}

void main() {
  test('[AUTH-PHONE-03] 처음 제출하면 발송하고 쿨다운을 시작한다(sent)', () async {
    final sender = _FakeSender();
    final cooldown = PhoneCooldownStore(_mem());
    final ctrl = SignupPhoneController(sender, cooldown);
    final r = await ctrl.submit('01011112222', DateTime(2026, 8, 17, 10, 0));
    expect(r, PhoneSendResult.sent);
    expect(sender.sent, 1);
    expect(cooldown.remainingSeconds('01011112222', DateTime(2026, 8, 17, 10, 0)), greaterThan(0));
  });

  test('[AUTH-PHONE-04] 쿨다운이 남은 번호는 새로 보내지 않고 그대로 ②로 넘어간다(alreadySent)', () async {
    final sender = _FakeSender();
    final cooldown = PhoneCooldownStore(_mem());
    await cooldown.start('01011112222', DateTime(2026, 8, 17, 10, 0)); // 방금 보낸 상태
    final ctrl = SignupPhoneController(sender, cooldown);
    final r = await ctrl.submit('01011112222', DateTime(2026, 8, 17, 10, 5)); // 5초 뒤
    expect(r, PhoneSendResult.alreadySent);
    expect(sender.sent, 0); // 새로 보내지 않는다
  });

  testWidgets('[AUTH-PHONE-01] 안내문 두 줄(문자 발송 + 병원 연락 번호)', (t) async {
    await t.pumpWidget(MaterialApp(home: SignupPhoneScreen(
        controller: SignupPhoneController(_FakeSender(), PhoneCooldownStore(_mem())))));
    expect(find.textContaining('문자로 인증번호를 보내드립니다'), findsOneWidget);
    expect(find.textContaining('병원에서 연락드릴 때도 이 번호를 씁니다'), findsOneWidget);
  });

  testWidgets('[AUTH-PHONE-02] 형식이 틀린 번호는 인증번호를 받을 수 없다(검증 문구)', (t) async {
    await t.pumpWidget(MaterialApp(home: SignupPhoneScreen(
        controller: SignupPhoneController(_FakeSender(), PhoneCooldownStore(_mem())))));
    await t.enterText(find.byType(TextField), '010123'); // 짧음
    await t.tap(find.text('인증번호 받기'));
    await t.pump();
    expect(find.textContaining('전화번호'), findsWidgets); // 칸 아래 오류(FieldTextInput)
  });
}
```
Run: `flutter test test/features/auth/signup_phone_screen_test.dart` → Expected: FAIL(파일 없음).

- [ ] **Step 7b: `SignupPhoneScreen` + `SignupPhoneController` 구현** — `patient_app/lib/features/auth/signup_phone_screen.dart`

```dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/phone_cooldown.dart';
import '../../widgets/action_button.dart';
import '../../widgets/field_error.dart';

/// Supabase Auth phone OTP 발송의 얇은 인터페이스(테스트에서 Fake로 대체).
abstract class AuthOtpSender {
  Future<void> sendSignupOtp(String phone); // supabase.auth.signInWithOtp(phone, shouldCreateUser: true)
}

enum PhoneSendResult { sent, alreadySent }

class SignupPhoneController {
  final AuthOtpSender sender;
  final PhoneCooldownStore cooldown;
  SignupPhoneController(this.sender, this.cooldown);

  /// AUTH-PHONE-03·04 — 쿨다운이 남았으면 새로 보내지 않고(BTN-COOL-07) 그대로 ②로,
  /// 아니면 발송하고 번호에 쿨다운을 건다.
  Future<PhoneSendResult> submit(String phone, DateTime now) async {
    if (cooldown.remainingSeconds(phone, now) > 0) return PhoneSendResult.alreadySent;
    await sender.sendSignupOtp(phone);
    await cooldown.start(phone, now);
    return PhoneSendResult.sent;
  }
}

String? validatePhone(String v) {
  final digits = v.replaceAll(RegExp(r'\D'), '');
  if (!RegExp(r'^010\d{8}$').hasMatch(digits)) return '전화번호를 정확히 입력해주세요';
  return null;
}

class SignupPhoneScreen extends StatefulWidget {
  final SignupPhoneController controller;
  const SignupPhoneScreen({super.key, required this.controller});
  @override
  State<SignupPhoneScreen> createState() => _SignupPhoneScreenState();
}

class _SignupPhoneScreenState extends State<SignupPhoneScreen> {
  final _form = FieldErrorController();
  final _phone = TextEditingController();
  bool _busy = false;

  Future<void> _submit() async {
    if (!_form.validateAll()) return; // AUTH-PHONE-02: 버튼 누를 때 전체 검사(ERR-FLD-04)
    setState(() => _busy = true);
    final digits = _phone.text.replaceAll(RegExp(r'\D'), '');
    final r = await widget.controller.submit(digits, DateTime.now());
    if (!mounted) return;
    setState(() => _busy = false);
    // AUTH-PHONE-04: 쿨다운이 남았으면 「방금 인증번호를 보내드렸습니다」와 함께 ②로.
    context.go('/signup/otp', extra: {'phone': digits, 'alreadySent': r == PhoneSendResult.alreadySent});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('전화번호 입력')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        // AUTH-PHONE-01: 번호를 정확히 넣을 이유를 준다.
        const Text('문자로 인증번호를 보내드립니다'),
        const Text('병원에서 연락드릴 때도 이 번호를 씁니다', style: TextStyle(fontSize: 13)),
        const SizedBox(height: 16),
        FieldTextInput(label: '전화번호', controller: _phone, form: _form, validate: validatePhone),
        const SizedBox(height: 24),
        ActionButton(
          label: '인증번호 받기',
          busyLabel: '인증번호 보내는 중…', // AUTH-PHONE-03 = BTN-BUSY-01
          busy: _busy,
          onPressed: _submit,
        ),
      ]),
    );
  }
}
```
Run: `flutter test test/features/auth/signup_phone_screen_test.dart` → Expected: PASS(4 tests).

- [ ] **Step 8: 인증번호 화면 ② — 6칸·유효시간·재발송·마스킹·실패 (`AUTH-OTP-01`~`11`) 공용**

> 본인확인 4종이 공유한다(가입 ② · 비밀번호 찾기 ② · 가족 연결). `purpose`로 번호 표시(가입=전체 `AUTH-OTP-05` / 그 외=마스킹 `AUTH-OTP-06`)와 막다른 길 링크(가족 연결 `AUTH-OTP-11`)를 가른다. 재발송은 Task 12 `CooldownButton`, 실패 문구는 `InlineError`. **`AUTH-OTP-04`(서버 만료 5분)는 Step 1에서 config로 반영**했다.

- [ ] **Step 8a: 실패 테스트** — `patient_app/test/features/auth/otp_screen_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:hospital_patient_app/core/phone_cooldown.dart';
import 'package:hospital_patient_app/features/auth/otp_screen.dart';

class _MockStorage extends Mock implements FlutterSecureStorage {}

_MockStorage _mem() {
  final s = _MockStorage();
  final m = <String, String?>{};
  when(() => s.write(key: any(named: 'key'), value: any(named: 'value')))
      .thenAnswer((i) async => m[i.namedArguments[#key] as String] = i.namedArguments[#value] as String?);
  when(() => s.read(key: any(named: 'key'))).thenAnswer((i) async => m[i.namedArguments[#key] as String]);
  when(() => s.delete(key: any(named: 'key'))).thenAnswer((i) async => m.remove(i.namedArguments[#key] as String));
  return s;
}

OtpScreen _screen({
  OtpPurpose purpose = OtpPurpose.signup,
  int validitySeconds = 300,
  Future<String?> Function(String)? onVerify,
}) =>
    OtpScreen(
      phone: '01011115678',
      purpose: purpose,
      validitySeconds: validitySeconds,
      cooldown: PhoneCooldownStore(_mem()),
      onResend: () async {},
      onVerify: onVerify ?? (_) async => null,
      onSuccess: () {},
    );

void main() {
  testWidgets('[AUTH-OTP-01] 숫자 6칸 + 숫자 키패드', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen()));
    expect(find.byType(TextField), findsNWidgets(6));
    final f = t.widget<TextField>(find.byType(TextField).first);
    expect(f.keyboardType, TextInputType.number);
  });

  testWidgets('[AUTH-OTP-03] 유효 시간은 5:00(=300초)에서 시작한다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen()));
    expect(find.textContaining('5:00'), findsOneWidget);
  });

  testWidgets('[AUTH-OTP-02] 0이 되면 입력칸 대신 [인증번호 다시 받기]만 남긴다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(validitySeconds: 1)));
    await t.pump(const Duration(seconds: 1));
    await t.pump();
    expect(find.byType(TextField), findsNothing);            // 입력칸 사라짐
    expect(find.textContaining('다시 받기'), findsOneWidget);   // 재발송만
  });

  testWidgets('[AUTH-OTP-05] 가입은 번호를 가리지 않고 전부 보여준다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(purpose: OtpPurpose.signup)));
    expect(find.textContaining('010-1111-5678'), findsOneWidget);
  });

  testWidgets('[AUTH-OTP-06] 비밀번호 찾기·가족 연결은 가운데를 가린다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(purpose: OtpPurpose.passwordFind)));
    expect(find.textContaining('010-****-5678'), findsOneWidget);
  });

  testWidgets('[AUTH-OTP-07] 재발송 버튼은 Task 12 CooldownButton을 쓴다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen()));
    expect(find.textContaining('인증번호 다시 받기'), findsOneWidget);
  });

  testWidgets('[AUTH-OTP-08] 「연달아 누르면 마지막 문자만 유효합니다」 안내', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen()));
    expect(find.textContaining('연달아 누르면 마지막 문자만 유효합니다'), findsOneWidget);
  });

  testWidgets('[AUTH-OTP-09] 인증 실패면 서버 문장을 버튼 위에 붙이고 칸을 비운다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(onVerify: (_) async => '인증번호가 올바르지 않습니다')));
    for (final f in find.byType(TextField).evaluate()) {
      await t.enterText(find.byWidget(f.widget), '1');
    }
    await t.tap(find.text('확인'));
    await t.pumpAndSettle();
    expect(find.text('인증번호가 올바르지 않습니다'), findsOneWidget); // 서버 문장 그대로(ERR-MSG-01)
    final first = t.widget<TextField>(find.byType(TextField).first);
    expect(first.controller!.text, isEmpty); // 칸을 비운다
  });

  testWidgets('[AUTH-OTP-10] 확인 후 무슨 일이 일어나는지 화면 안에서 미리 말한다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(purpose: OtpPurpose.signup)));
    expect(find.textContaining('인증되면'), findsOneWidget); // 예: '인증되면 기본정보 입력으로 넘어갑니다'
  });

  testWidgets('[AUTH-OTP-11] 가족 연결에는 「휴대폰이 없는 가족인가요?」 링크', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(purpose: OtpPurpose.familyLink)));
    expect(find.textContaining('휴대폰이 없는 가족인가요?'), findsOneWidget);
  });

  testWidgets('[AUTH-OTP-11] 가입에는 그 링크가 없다(막다른 길 링크는 가족 연결 전용)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(purpose: OtpPurpose.signup)));
    expect(find.textContaining('휴대폰이 없는 가족인가요?'), findsNothing);
  });
}
```
Run: `flutter test test/features/auth/otp_screen_test.dart` → Expected: FAIL(파일 없음).

- [ ] **Step 8b: `OtpScreen` 구현** — `patient_app/lib/features/auth/otp_screen.dart`

```dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/phone_cooldown.dart';
import '../../core/tokens.dart';
import '../../widgets/cooldown_button.dart';
import '../../widgets/inline_error.dart';

enum OtpPurpose { signup, passwordFind, familyLink }

String _fmtPhone(String p) =>
    '${p.substring(0, 3)}-${p.substring(3, 7)}-${p.substring(7)}'; // 010-1111-5678
String _maskPhone(String p) =>
    '${p.substring(0, 3)}-****-${p.substring(7)}'; // AUTH-OTP-06

const _afterHint = {
  OtpPurpose.signup: '인증되면 기본정보 입력으로 넘어갑니다',
  OtpPurpose.passwordFind: '인증되면 새 비밀번호를 정하는 화면으로 넘어갑니다',
  OtpPurpose.familyLink: '인증되면 가족으로 연결됩니다',
};

class OtpScreen extends StatefulWidget {
  final String phone;
  final OtpPurpose purpose;
  final int validitySeconds; // AUTH-OTP-03 기본 300(5분). 테스트에서 짧게 준다.
  final PhoneCooldownStore cooldown;
  final Future<void> Function() onResend;
  final Future<String?> Function(String code) onVerify; // null=성공, 아니면 서버 오류 문구
  final VoidCallback onSuccess;

  const OtpScreen({
    super.key,
    required this.phone,
    required this.purpose,
    required this.cooldown,
    required this.onResend,
    required this.onVerify,
    required this.onSuccess,
    this.validitySeconds = 300,
  });

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  late final List<TextEditingController> _boxes;
  late final List<FocusNode> _nodes;
  Timer? _timer;
  late int _left;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _boxes = List.generate(6, (_) => TextEditingController());
    _nodes = List.generate(6, (_) => FocusNode());
    _left = widget.validitySeconds;
    _timer = Timer.periodic(const Duration(seconds: 1), (tm) {
      setState(() => _left = _left > 0 ? _left - 1 : 0);
      if (_left <= 0) tm.cancel(); // AUTH-OTP-02: 0이 되면 입력칸을 접고 재발송만 남긴다
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    for (final c in _boxes) c.dispose();
    for (final n in _nodes) n.dispose();
    super.dispose();
  }

  String get _code => _boxes.map((c) => c.text).join();

  Future<void> _verify() async {
    setState(() => _busy = true);
    final err = await widget.onVerify(_code);
    if (!mounted) return;
    if (err == null) {
      setState(() => _busy = false);
      widget.onSuccess();
      return;
    }
    // AUTH-OTP-09: 서버 문장을 버튼 위에 붙이고(ERR-MSG-01), 칸을 비우고 첫 칸에 커서.
    setState(() {
      _error = err;
      _busy = false;
      for (final c in _boxes) c.clear();
    });
    _nodes.first.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final shown = widget.purpose == OtpPurpose.signup ? _fmtPhone(widget.phone) : _maskPhone(widget.phone);
    final mm = _left ~/ 60, ss = _left % 60;
    return Scaffold(
      appBar: AppBar(title: const Text('인증번호 입력')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text('$shown 로 보냈습니다'),                                       // AUTH-OTP-05·06
        const Text('연달아 누르면 마지막 문자만 유효합니다', style: TextStyle(fontSize: 13)), // AUTH-OTP-08
        Text(_afterHint[widget.purpose]!, style: const TextStyle(fontSize: 13)),        // AUTH-OTP-10
        const SizedBox(height: 16),
        if (_left > 0) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: List.generate(6, (i) => SizedBox(
              width: 44,
              child: TextField(
                controller: _boxes[i],
                focusNode: _nodes[i],
                keyboardType: TextInputType.number,           // AUTH-OTP-01
                maxLength: 1,
                textAlign: TextAlign.center,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(counterText: ''),
                onChanged: (v) {
                  if (v.isNotEmpty && i < 5) _nodes[i + 1].requestFocus();
                },
              ),
            )),
          ),
          const SizedBox(height: 8),
          // AUTH-OTP-02: 남은 시간(주의색). 0이 되면 이 블록 자체가 사라진다.
          Text('남은 시간 $mm:${ss.toString().padLeft(2, '0')}',
              style: const TextStyle(color: AppTokens.warn)),
          const SizedBox(height: 16),
          if (_error != null) InlineError(_error),           // AUTH-OTP-09(버튼 위 붙박이)
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppTokens.primary),
            onPressed: _busy ? null : _verify,
            child: Text(_busy ? '확인 중…' : '확인'),
          ),
        ],
        const SizedBox(height: 12),
        // AUTH-OTP-07: 재발송은 번호 기준 쿨다운(Task 12 CooldownButton).
        CooldownButton(
          phone: widget.phone,
          label: '인증번호 다시 받기',
          store: widget.cooldown,
          onSend: () async {
            await widget.onResend();
            return null;
          },
        ),
        // AUTH-OTP-11: 가족 연결만 막다른 길 링크.
        if (widget.purpose == OtpPurpose.familyLink)
          TextButton(onPressed: () {}, child: const Text('휴대폰이 없는 가족인가요?')),
      ]),
    );
  }
}
```
Run: `flutter test test/features/auth/otp_screen_test.dart` → Expected: PASS(11 tests).

- [ ] **Step 9: 가입 진행점 + 비밀번호·기본정보 화면 ③ (`AUTH-SIGNUP-01`~`10` · `AUTH-PROFILE-01`·`03`·`03b`·`03e`·`04`·`05`·`06`·`07`·`08`)**

> ⭐ **가입은 별도 화면 4개**(⓪동의 ①전화 ②인증 ③비밀번호·기본정보 — AUTH-SIGNUP-01). 진행점은 `⓪=1 ①=2 ②=3 ③=4`(AUTH-SIGNUP-03). **③에서 성별을 미리 골라두지 않는다**(AUTH-SIGNUP-06b·06d — 기본값은 조용히 답을 만든다). 앱을 껐다 켜 ②통과+③미완료면 **③으로 되돌린다**(AUTH-SIGNUP-08 = Step 4 `profileMissingProvider` 라우팅).

- [ ] **Step 9a: 진행점 위젯** — `signup_flow.dart`

- [ ] **Step 9a-i: 실패 테스트** — `patient_app/test/features/auth/signup_flow_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/auth/signup_flow.dart';

void main() {
  testWidgets('[AUTH-SIGNUP-03] 점 4개 + N단계/4단계', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: SignupProgress(step: 3))));
    expect(find.text('3단계 / 4단계'), findsOneWidget);
    expect(find.byKey(const Key('signup-dot')), findsNWidgets(4)); // 점 4개
  });

  test('[AUTH-SIGNUP-01] 가입 단계는 별도 화면 4개다(⓪=1 ①=2 ②=3 ③=4)', () {
    // 진행점의 단계 매핑이 4단계로 고정. 한 화면 조건부(AUTH-SIGNUP-02)가 아니라 라우트가 4개.
    expect(SignupStep.values.map((s) => s.display), ['1단계 / 4단계', '2단계 / 4단계', '3단계 / 4단계', '4단계 / 4단계']);
  });

  test('[AUTH-SIGNUP-04] 진행 표시가 인증번호 화면을 3단계로 센다(1→1→3 오류를 바로잡음)', () {
    expect(SignupStep.otp.display, '3단계 / 4단계'); // ② 인증번호 = 3단계
  });
}
```

- [ ] **Step 9a-ii: 구현** — `patient_app/lib/features/auth/signup_flow.dart`

```dart
import 'package:flutter/material.dart';
import '../../core/tokens.dart';

/// 가입 4단계(AUTH-SIGNUP-01). ⓪동의=1 ①전화=2 ②인증=3 ③기본정보=4(AUTH-SIGNUP-03·04).
enum SignupStep {
  consent(1), phone(2), otp(3), profile(4);

  const SignupStep(this.number);
  final int number;
  String get display => '$number단계 / 4단계';
}

class SignupProgress extends StatelessWidget {
  final int step; // 1~4
  const SignupProgress({super.key, required this.step});

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(4, (i) => Container(
          key: const Key('signup-dot'),
          width: 8, height: 8,
          margin: const EdgeInsets.symmetric(horizontal: 4),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: i < step ? AppTokens.primary : AppTokens.grayDone,
          ),
        )),
      ),
      const SizedBox(height: 4),
      Text('$step단계 / 4단계', style: const TextStyle(fontSize: 12, color: AppTokens.grayPending)),
    ]);
  }
}
```
> 📌 **뒤로가기(AUTH-SIGNUP-05)**: 라우트는 `/signup`(⓪) → `/signup/phone`(①) → `/signup/otp`(②) → `/signup/step3`(③). ⓪에서 뒤로 = 랜딩, ①②③에서 뒤로 = 앞 단계. 동의 체크는 `consentProvider`가 화면 밖에 살아 그대로 남는다(CONSENT-STEP-08). 라우트 등록은 `router.dart`(Task 0 골격)에 추가한다.
Run: `flutter test test/features/auth/signup_flow_test.dart` → Expected: PASS(3 tests).

- [ ] **Step 9b: 비밀번호·기본정보 화면 ③** — `signup_profile_screen.dart`

- [ ] **Step 9b-i: 실패 테스트** — `patient_app/test/features/auth/signup_profile_screen_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/features/auth/signup_profile_screen.dart';

class _FakeRepo implements SignupProfileRepo {
  int pwSet = 0, created = 0;
  String? failWith;
  @override
  Future<void> setPassword(String pw) async => pwSet++;
  @override
  Future<void> createProfile({required String name, required String birthDate,
      required String gender, required bool adsAgreed, required String termsVersion}) async {
    if (failWith != null) throw ApiException(failWith!);
    created++;
  }
}

SignupProfileScreen _screen(_FakeRepo repo) =>
    SignupProfileScreen(controller: SignupProfileController(repo), onDone: () {});

void main() {
  testWidgets('[AUTH-PROFILE-04] 이름·생년월일·성별 세 칸(전화는 ①에서 받았다)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeRepo())));
    expect(find.text('이름'), findsOneWidget);
    expect(find.text('생년월일'), findsOneWidget);
    expect(find.text('성별'), findsOneWidget);
  });

  testWidgets('[AUTH-SIGNUP-06] 성별은 남·여 + 왜 묻는지(문진 문항 노출에 쓰입니다)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeRepo())));
    expect(find.text('남'), findsOneWidget);
    expect(find.text('여'), findsOneWidget);
    expect(find.textContaining('문진 문항 노출에 쓰입니다'), findsOneWidget);
  });

  testWidgets('[AUTH-SIGNUP-06b] 성별을 미리 골라두지 않는다 — 하나 눌러야 [가입 완료]가 산다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeRepo())));
    final before = t.widget<FilledButton>(find.widgetWithText(FilledButton, '가입 완료'));
    expect(before.onPressed, isNull); // 미선택이면 꺼짐
    await t.tap(find.text('여'));
    await t.pump();
    final after = t.widget<FilledButton>(find.widgetWithText(FilledButton, '가입 완료'));
    expect(after.onPressed, isNotNull);
  });

  testWidgets('[AUTH-SIGNUP-06d] 초기 성별은 어느 쪽도 선택돼 있지 않다(기본값 F 없음)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeRepo())));
    // 두 칸 모두 비선택 상태의 표식: 선택된 ChoiceChip이 0개
    final selected = tester_selectedChips(t);
    expect(selected, 0);
  });

  testWidgets('[AUTH-PROFILE-01] 비밀번호 조건을 미리 보여주고 충족되면 ✓로 바뀐다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeRepo())));
    expect(find.textContaining('8자 이상'), findsOneWidget);
    expect(find.textContaining('영문'), findsOneWidget);
    await t.enterText(find.byKey(const Key('pw')), 'abc12345'); // 8자+영문숫자
    await t.pump();
    expect(find.textContaining('✓'), findsWidgets); // 충족 표시
  });

  testWidgets('[AUTH-PROFILE-03] 비밀번호 눈 토글(기본 가림)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeRepo())));
    final pw = t.widget<TextField>(find.byKey(const Key('pw')));
    expect(pw.obscureText, isTrue); // 기본 가림
    expect(find.byIcon(Icons.visibility_off), findsWidgets);
  });

  testWidgets('[AUTH-PROFILE-03b] 확인 칸을 둔다(비밀번호 + 비밀번호 확인)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeRepo())));
    expect(find.byKey(const Key('pw')), findsOneWidget);
    expect(find.byKey(const Key('pw-confirm')), findsOneWidget);
  });

  testWidgets('[AUTH-PROFILE-05] 생년월일은 날짜 선택기로 받는다(자유 입력 아님)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeRepo())));
    await t.tap(find.byKey(const Key('birth')));
    await t.pumpAndSettle();
    expect(find.byType(CalendarDatePicker), findsOneWidget); // YYYY-MM-DD 자유 입력이 아니다
  });

  testWidgets('[AUTH-SIGNUP-07] 가입 완료 성공이면 홈으로(축하 화면 없음)', (t) async {
    final repo = _FakeRepo();
    var done = false;
    await t.pumpWidget(MaterialApp(home: SignupProfileScreen(
        controller: SignupProfileController(repo), onDone: () => done = true)));
    await _fillValid(t);
    await t.tap(find.text('가입 완료'));
    await t.pumpAndSettle();
    expect(repo.pwSet, 1);
    expect(repo.created, 1);
    expect(done, isTrue); // 홈으로(별도 축하 화면 없음)
  });

  testWidgets('[AUTH-PROFILE-08] 실패면 버튼 위 오류, ①②를 다시 시키지 않는다', (t) async {
    final repo = _FakeRepo()..failWith = '가입에 실패했습니다. 잠시 후 다시 시도해주세요.';
    await t.pumpWidget(MaterialApp(home: SignupProfileScreen(
        controller: SignupProfileController(repo), onDone: () {})));
    await _fillValid(t);
    await t.tap(find.text('가입 완료'));
    await t.pumpAndSettle();
    expect(find.text('가입에 실패했습니다. 잠시 후 다시 시도해주세요.'), findsOneWidget);
    // 여전히 ③ 화면 — ①②로 되돌리지 않는다(인증은 이미 끝났다)
    expect(find.text('가입 완료'), findsOneWidget);
  });
}
```
`_fillValid`(이름·생년월일·비번 두 칸·성별 채우기)와 `tester_selectedChips`는 테스트 헬퍼로 파일 상단에 둔다. `AUTH-SIGNUP-08·09·10`(껐다 켜면 ③으로 되돌림·근거·출입증 안 버림)은 **Step 4의 `profileMissingProvider` 라우팅**이 실현하며 `profile_status_test.dart`에서 확인했다 — 여기서는 화면이 그 재진입을 견디는지(상태 없이 새로 그려짐) 본다. `AUTH-PROFILE-03c·03d·03e`(확인 칸 근거·기각·적용 범위)는 `-03b`(확인 칸을 둔다)의 근거라 같은 자리에서 닫힌다.
Run: `flutter test test/features/auth/signup_profile_screen_test.dart` → Expected: FAIL(파일 없음).

- [ ] **Step 9b-ii: 구현** — `patient_app/lib/features/auth/signup_profile_screen.dart`

```dart
import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/tokens.dart';

const _termsVersion = '2026-08-01';

/// 비밀번호 설정 + 프로필 생성(Supabase updateUser + POST /patients). 테스트에서 Fake로 대체.
abstract class SignupProfileRepo {
  Future<void> setPassword(String pw);
  Future<void> createProfile({
    required String name,
    required String birthDate,
    required String gender,
    required bool adsAgreed,
    required String termsVersion,
  });
}

class SignupProfileController {
  final SignupProfileRepo repo;
  SignupProfileController(this.repo);

  /// AUTH-SIGNUP-07 / AUTH-PROFILE-08 — 성공이면 null, 실패면 서버 문장(버튼 위 오류).
  /// ①②(전화·인증)를 다시 시키지 않는다 — 인증은 이미 끝났고 세션이 있다.
  Future<String?> submit({
    required String password,
    required String name,
    required String birthDate,
    required String gender,
    required bool adsAgreed,
  }) async {
    try {
      await repo.setPassword(password);
      await repo.createProfile(
          name: name, birthDate: birthDate, gender: gender,
          adsAgreed: adsAgreed, termsVersion: _termsVersion);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }
}

bool passwordOk(String pw) => pw.length >= 8 && RegExp(r'[A-Za-z]').hasMatch(pw) && RegExp(r'\d').hasMatch(pw);

class SignupProfileScreen extends StatefulWidget {
  final SignupProfileController controller;
  final bool adsAgreed;   // consentProvider.ads에서 넘어온다
  final VoidCallback onDone;
  const SignupProfileScreen(
      {super.key, required this.controller, this.adsAgreed = false, required this.onDone});
  @override
  State<SignupProfileScreen> createState() => _SignupProfileScreenState();
}

class _SignupProfileScreenState extends State<SignupProfileScreen> {
  final _name = TextEditingController();
  final _pw = TextEditingController();
  final _pwConfirm = TextEditingController();
  DateTime? _birth;
  String? _gender; // AUTH-SIGNUP-06b·06d — null로 시작(미리 고르지 않는다)
  bool _obscure = true, _obscure2 = true, _busy = false;
  String? _error;

  bool get _canSubmit =>
      _gender != null && passwordOk(_pw.text) && _pw.text == _pwConfirm.text &&
      _name.text.trim().isNotEmpty && _birth != null;

  Future<void> _submit() async {
    setState(() { _busy = true; _error = null; });
    final err = await widget.controller.submit(
      password: _pw.text, name: _name.text.trim(),
      birthDate: '${_birth!.year}-${_birth!.month.toString().padLeft(2, '0')}-${_birth!.day.toString().padLeft(2, '0')}',
      gender: _gender!, adsAgreed: widget.adsAgreed);
    if (!mounted) return;
    setState(() { _busy = false; _error = err; });
    if (err == null) widget.onDone(); // AUTH-SIGNUP-07: 홈으로(축하 화면 없음)
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('기본정보 입력')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(controller: _name, decoration: const InputDecoration(labelText: '이름'),
            onChanged: (_) => setState(() {})),
        const SizedBox(height: 12),
        // AUTH-PROFILE-05: 생년월일은 날짜 선택기(자유 입력 아님).
        InkWell(
          key: const Key('birth'),
          onTap: () async {
            final d = await showDatePicker(
                context: context, firstDate: DateTime(1900), lastDate: DateTime.now(),
                initialDate: DateTime(1970));
            if (d != null) setState(() => _birth = d);
          },
          child: InputDecorator(
            decoration: const InputDecoration(labelText: '생년월일'),
            child: Text(_birth == null ? '날짜 선택' : '${_birth!.year}-${_birth!.month}-${_birth!.day}'),
          ),
        ),
        const SizedBox(height: 12),
        // AUTH-SIGNUP-06: 성별 + 왜 묻는지.
        const Text('성별'),
        const Text('(문진 문항 노출에 쓰입니다)', style: TextStyle(fontSize: 12, color: AppTokens.grayPending)),
        Row(children: [
          ChoiceChip(label: const Text('남'), selected: _gender == 'M', onSelected: (_) => setState(() => _gender = 'M')),
          const SizedBox(width: 8),
          ChoiceChip(label: const Text('여'), selected: _gender == 'F', onSelected: (_) => setState(() => _gender = 'F')),
        ]),
        const SizedBox(height: 16),
        // AUTH-PROFILE-01: 조건을 미리 보여주고 충족되면 ✓.
        Text('${passwordOk(_pw.text) ? '✓' : '·'} 8자 이상, 영문·숫자 함께'),
        TextField(
          key: const Key('pw'), controller: _pw, obscureText: _obscure,
          decoration: InputDecoration(
            labelText: '비밀번호',
            suffixIcon: IconButton( // AUTH-PROFILE-03: 눈 토글(기본 가림)
              icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
              onPressed: () => setState(() => _obscure = !_obscure)),
          ),
          onChanged: (_) => setState(() {}),
        ),
        // AUTH-PROFILE-03b: 확인 칸(눈을 안 눌러도 두 번 친 것이 다르면 잡는다).
        TextField(
          key: const Key('pw-confirm'), controller: _pwConfirm, obscureText: _obscure2,
          decoration: InputDecoration(
            labelText: '비밀번호 확인',
            suffixIcon: IconButton(
              icon: Icon(_obscure2 ? Icons.visibility_off : Icons.visibility),
              onPressed: () => setState(() => _obscure2 = !_obscure2)),
          ),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 24),
        if (_error != null) ...[Text(_error!, style: const TextStyle(color: AppTokens.warn)), const SizedBox(height: 8)],
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: AppTokens.primary),
          onPressed: (_canSubmit && !_busy) ? _submit : null, // AUTH-SIGNUP-06b
          child: Text(_busy ? '가입 중…' : '가입 완료'),
        ),
      ]),
    );
  }
}
```
> 📌 **AUTH-PROFILE-03e**(확인 칸이 있는 곳 = 가입 ③·비밀번호 찾기·설정 변경, 로그인 없음)는 세 곳이 같은 두-칸 패턴을 쓰는 것으로 지켜진다 — 로그인(Task 14)은 `AUTH-LOGIN-04`로 확인 칸을 두지 않는다.
Run: `flutter test test/features/auth/signup_profile_screen_test.dart` → Expected: PASS(10 tests).

- [ ] **Step 10: 새 비밀번호 화면 — 이름 칸·조건·막다른 길 (`AUTH-PWNEW-01·02·03·04·05·06·07·08·12·13·14·16·17`)**

> ⭐ **이름 칸(AUTH-PWNEW-08·13)이 이 화면의 심장** — 번호를 물려받은 사람은 이름을 몰라 반드시 병원 경로로 가고(깔때기), 그때 갭 #44 탐지가 저절로 일어난다. **판정은 `[비밀번호 바꾸기]`를 누를 때 서버가 한 번만**(AUTH-PWNEW-17 = Step 3 `verify_name_and_reset`) — 치는 도중 실시간으로 맞다/틀리다를 알려주지 않는다(이름 맞히기를 쉽게 만들지 않는다). **두 경로(비밀번호 찾기·중복 갈림길)가 이 화면을 공유**(AUTH-PWNEW-05).

- [ ] **Step 10a: 실패 테스트** — `patient_app/test/features/auth/new_password_screen_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/features/auth/new_password_screen.dart';

class _FakeReset implements PasswordResetRepo {
  int calls = 0;
  String? failWith;
  @override
  Future<void> reset(String name, String password) async {
    calls++;
    if (failWith != null) throw ApiException(failWith!);
  }
}

Future<void> _fill(WidgetTester t, {String name = '홍길동', String pw = 'abc12345'}) async {
  await t.enterText(find.byKey(const Key('name')), name);
  await t.enterText(find.byKey(const Key('newpw')), pw);
  await t.enterText(find.byKey(const Key('newpw-confirm')), pw);
  await t.pump();
}

NewPasswordScreen _screen(_FakeReset repo, {VoidCallback? onDone}) =>
    NewPasswordScreen(controller: NewPasswordController(repo), onDone: onDone ?? () {});

void main() {
  testWidgets('[AUTH-PWNEW-08] 새 비밀번호 위에 「등록하신 이름」 칸이 있다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeReset())));
    expect(find.text('등록하신 이름'), findsOneWidget);
    expect(find.byKey(const Key('name')), findsOneWidget);
  });

  testWidgets('[AUTH-PWNEW-01] 새 비밀번호 + 한 번 더, 각각 눈 토글', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeReset())));
    expect(find.byKey(const Key('newpw')), findsOneWidget);
    expect(find.byKey(const Key('newpw-confirm')), findsOneWidget);
    expect(find.byIcon(Icons.visibility_off), findsNWidgets(2)); // 두 칸 각각
  });

  testWidgets('[AUTH-PWNEW-02] 조건 네 줄(8자·영문숫자·두 칸 같음·피하기)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeReset())));
    expect(find.textContaining('8자 이상'), findsOneWidget);
    expect(find.textContaining('영문과 숫자'), findsOneWidget);
    expect(find.textContaining('두 칸이 서로 같음'), findsOneWidget);
    expect(find.textContaining('전화번호·생년월일은 피해'), findsOneWidget);
  });

  testWidgets('[AUTH-PWNEW-03] 마지막 줄은 권고(·)라 ✓ 조건과 모양이 다르다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeReset())));
    expect(find.textContaining('· 전화번호·생년월일은 피해'), findsOneWidget); // 차단 아님(·)
  });

  testWidgets('[AUTH-PWNEW-06] 빠져나갈 문 — 비밀번호가 기억나셨나요? › 로그인하기', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeReset())));
    expect(find.textContaining('비밀번호가 기억나셨나요?'), findsOneWidget);
  });

  testWidgets('[AUTH-PWNEW-07] 「원래 쓰시던 비밀번호를 그대로 쓰셔도 됩니다」를 쓰지 않는다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeReset())));
    expect(find.textContaining('그대로 쓰셔도 됩니다'), findsNothing);
  });

  testWidgets('[AUTH-PWNEW-12] 막다른 길 방지 — 이름이 기억나지 않거나 맞지 않나요? ›', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeReset())));
    expect(find.textContaining('이름이 기억나지 않거나 맞지 않나요?'), findsOneWidget);
  });

  testWidgets('[AUTH-PWNEW-16] 생년월일까지 묻지 않는다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeReset())));
    expect(find.textContaining('생년월일'), findsNothing);
  });

  testWidgets('[AUTH-PWNEW-17] 치는 도중에는 이름 맞다/틀리다를 알려주지 않는다 — 누를 때 한 번만', (t) async {
    final repo = _FakeReset();
    await t.pumpWidget(MaterialApp(home: _screen(repo)));
    await t.enterText(find.byKey(const Key('name')), '홍');
    await t.pump();
    expect(repo.calls, 0); // 치는 동안 서버를 부르지 않는다
    expect(find.textContaining('일치'), findsNothing); // 실시간 판정 표시 없음
  });

  testWidgets('[AUTH-PWNEW-04] 변경 성공이면 로그인 화면으로 보낸다', (t) async {
    final repo = _FakeReset();
    var done = false;
    await t.pumpWidget(MaterialApp(home: _screen(repo, onDone: () => done = true)));
    await _fill(t);
    await t.tap(find.text('비밀번호 바꾸기'));
    await t.pumpAndSettle();
    expect(repo.calls, 1);
    expect(done, isTrue); // 로그인 화면으로(다시 로그인)
  });
}
```
`AUTH-PWNEW-05`(두 경로 공유)·`13`(병원 깔때기의 값어치)·`14`(가족·지인엔 무력한 한계)는 서버 대조(Step 3)와 화면 공유 구조로 실현되는 **근거·경계 규칙**이라, `-08`(이름 칸)·`-12`(막다른 길 출구)·`verify_name_and_reset`(Step 3) 테스트가 함께 닫는다.
Run: `flutter test test/features/auth/new_password_screen_test.dart` → Expected: FAIL(파일 없음).

- [ ] **Step 10b: `NewPasswordScreen` 구현** — `patient_app/lib/features/auth/new_password_screen.dart`

```dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/api_client.dart';
import '../../core/tokens.dart';

/// 서버 경유 재설정(Step 3 `POST /patients/me/password-reset`)의 얇은 인터페이스.
abstract class PasswordResetRepo {
  Future<void> reset(String name, String password); // 실패 시 ApiException(서버 문장)
}

class NewPasswordController {
  final PasswordResetRepo repo;
  NewPasswordController(this.repo);

  /// AUTH-PWNEW-17 — [비밀번호 바꾸기]를 누를 때 서버가 한 번만 판정한다. 성공이면 null, 실패면 서버 문장.
  Future<String?> submit(String name, String password) async {
    try {
      await repo.reset(name, password);
      return null;
    } on ApiException catch (e) {
      return e.message; // '등록된 이름과 다릅니다' 등(AUTH-PWNEW-11)
    }
  }
}

bool _pwOk(String pw) => pw.length >= 8 && RegExp(r'[A-Za-z]').hasMatch(pw) && RegExp(r'\d').hasMatch(pw);

class NewPasswordScreen extends StatefulWidget {
  final NewPasswordController controller;
  final VoidCallback onDone; // 보통 '/login'으로 이동
  const NewPasswordScreen({super.key, required this.controller, required this.onDone});
  @override
  State<NewPasswordScreen> createState() => _NewPasswordScreenState();
}

class _NewPasswordScreenState extends State<NewPasswordScreen> {
  final _name = TextEditingController();
  final _pw = TextEditingController();
  final _pw2 = TextEditingController();
  bool _o1 = true, _o2 = true, _busy = false;
  String? _error;

  bool get _match => _pw.text.isNotEmpty && _pw.text == _pw2.text;

  Future<void> _submit() async {
    setState(() { _busy = true; _error = null; });
    final err = await widget.controller.submit(_name.text, _pw.text);
    if (!mounted) return;
    setState(() { _busy = false; _error = err; });
    if (err == null) widget.onDone(); // AUTH-PWNEW-04: 로그인 화면으로
  }

  Widget _cond(bool ok, String text) => Text('${ok ? '✓' : '·'} $text');

  @override
  Widget build(BuildContext context) {
    final canSubmit = _name.text.trim().isNotEmpty && _pwOk(_pw.text) && _match;
    return Scaffold(
      appBar: AppBar(title: const Text('새 비밀번호')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        // AUTH-PWNEW-08: 이름 칸을 새 비밀번호 '위에' 둔다.
        const Text('등록하신 이름'),
        TextField(key: const Key('name'), controller: _name, onChanged: (_) => setState(() {})),
        const SizedBox(height: 16),
        // AUTH-PWNEW-02·03: 조건 — 앞 셋은 ✓(차단), 마지막은 ·(권고).
        _cond(_pwOk(_pw.text), '8자 이상'),
        _cond(RegExp(r'[A-Za-z]').hasMatch(_pw.text) && RegExp(r'\d').hasMatch(_pw.text), '영문과 숫자를 함께'),
        _cond(_match, '두 칸이 서로 같음'),
        const Text('· 전화번호·생년월일은 피해주세요'), // 권고(차단 아님)
        const SizedBox(height: 8),
        TextField(
          key: const Key('newpw'), controller: _pw, obscureText: _o1,
          decoration: InputDecoration(
            labelText: '새 비밀번호',
            suffixIcon: IconButton(
              icon: Icon(_o1 ? Icons.visibility_off : Icons.visibility),
              onPressed: () => setState(() => _o1 = !_o1))),
          onChanged: (_) => setState(() {}), // 화면 조건 표시용 — 서버는 부르지 않는다(AUTH-PWNEW-17)
        ),
        TextField(
          key: const Key('newpw-confirm'), controller: _pw2, obscureText: _o2,
          decoration: InputDecoration(
            labelText: '한 번 더 입력',
            suffixIcon: IconButton(
              icon: Icon(_o2 ? Icons.visibility_off : Icons.visibility),
              onPressed: () => setState(() => _o2 = !_o2))),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 16),
        if (_error != null) ...[Text(_error!, style: const TextStyle(color: AppTokens.warn)), const SizedBox(height: 8)],
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: AppTokens.primary),
          onPressed: (canSubmit && !_busy) ? _submit : null,
          child: Text(_busy ? '바꾸는 중…' : '비밀번호 바꾸기'),
        ),
        const SizedBox(height: 12),
        // AUTH-PWNEW-12: 오타·개명으로 진짜 환자가 잠기지 않게 병원 안내 출구.
        TextButton(onPressed: () => context.go('/phone-change'),
            child: const Text('이름이 기억나지 않거나 맞지 않나요? ›')),
        // AUTH-PWNEW-06: 기억난 사람이 굳이 바꾸지 않아도 되게.
        TextButton(onPressed: () => context.go('/login'),
            child: const Text('비밀번호가 기억나셨나요? › 로그인하기')),
      ]),
    );
  }
}
```
Run: `flutter test test/features/auth/new_password_screen_test.dart` → Expected: PASS(10 tests).

- [ ] **Step 11: 전화번호 변경 안내 화면 (`AUTH-TEL-01·02·03·04·05`)**

> ⭐ **앱은 경로만 알려준다(AUTH-TEL-01)** — 앱에서 번호를 바꿔주면 이름·생년월일만 알면 남의 계정을 가져갈 수 있다(갭 #10). 방문·전화 **둘 다** 열어 둔다(AUTH-TEL-05 — 방문만 요구하면 거동이 불편한 어르신에게 또 다른 막다른 길).

- [ ] **Step 11a: 실패 테스트** — `patient_app/test/features/auth/phone_change_screen_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/auth/phone_change_screen.dart';

void main() {
  testWidgets('[AUTH-TEL-01] 앱에서 번호를 바꾸지 않는다 — 입력칸이 없다', (t) async {
    await t.pumpWidget(const MaterialApp(home: PhoneChangeScreen()));
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('[AUTH-TEL-02] 본문 두 문장(방문·전화 + 이력 유지)', (t) async {
    await t.pumpWidget(const MaterialApp(home: PhoneChangeScreen()));
    expect(find.textContaining('병원에 방문하시거나 전화해 주세요'), findsOneWidget);
    expect(find.textContaining('그동안의 예약과 방문 이력은 그대로 유지됩니다'), findsOneWidget);
  });

  testWidgets('[AUTH-TEL-03] 확인 절차 세 줄을 미리 안내', (t) async {
    await t.pumpWidget(const MaterialApp(home: PhoneChangeScreen()));
    expect(find.textContaining('이름'), findsWidgets);
    expect(find.textContaining('최근 방문일'), findsOneWidget);
    expect(find.textContaining('새 번호로 인증번호'), findsOneWidget);
  });

  testWidgets('[AUTH-TEL-04] [병원 전화번호로 문의] 버튼(tel: 연결)', (t) async {
    await t.pumpWidget(const MaterialApp(home: PhoneChangeScreen()));
    expect(find.text('병원 전화번호로 문의'), findsOneWidget);
  });

  testWidgets('[AUTH-TEL-05] 방문만 요구하지 않는다 — 전화 경로가 함께 있다', (t) async {
    await t.pumpWidget(const MaterialApp(home: PhoneChangeScreen()));
    // 본문이 '방문하시거나 전화해'로 둘을 함께 제시하고, 전화 버튼이 있다.
    expect(find.text('병원 전화번호로 문의'), findsOneWidget);
    expect(find.textContaining('방문하시거나 전화'), findsOneWidget);
  });
}
```
Run: `flutter test test/features/auth/phone_change_screen_test.dart` → Expected: FAIL(파일 없음).

- [ ] **Step 11b: `PhoneChangeScreen` 구현** — `patient_app/lib/features/auth/phone_change_screen.dart`

```dart
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/tokens.dart';

const _hospitalTel = '02-000-0000'; // 배포 시 병원 정보로 치환

/// 전화번호가 바뀐 사람에게 경로만 안내한다(AUTH-TEL-01) — 앱에서 번호를 바꾸지 않는다.
class PhoneChangeScreen extends StatelessWidget {
  const PhoneChangeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('전화번호 변경')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        // AUTH-TEL-02·05: 방문·전화 둘 다 + 이력 유지.
        const Text('병원에 방문하시거나 전화해 주세요'),
        const SizedBox(height: 8),
        const Text('본인 확인 후 직원이 등록된 전화번호를 바꿔드립니다. '
            '그동안의 예약과 방문 이력은 그대로 유지됩니다.'),
        const SizedBox(height: 24),
        // AUTH-TEL-03: 확인 절차 세 줄을 미리 안내한다.
        const Text('확인 절차', style: TextStyle(fontWeight: FontWeight.bold)),
        const Text('· 이름 · 생년월일'),
        const Text('· 최근 방문일 · 진료받은 과'),
        const Text('· 새 번호로 인증번호 발송'),
        const SizedBox(height: 24),
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: AppTokens.primary),
          icon: const Icon(Icons.call),
          // AUTH-TEL-04: 전화 앱으로 연결.
          onPressed: () => launchUrl(Uri.parse('tel:$_hospitalTel')),
          label: const Text('병원 전화번호로 문의'),
        ),
      ]),
    );
  }
}
```
Run: `flutter test test/features/auth/phone_change_screen_test.dart` → Expected: PASS(5 tests).

- [ ] **Step 12: 커밋**

```bash
git add supabase/migrations/00024_patient_consents.sql supabase/config.toml \
  backend/app/services/consent_service.py backend/app/services/password_reset_service.py \
  backend/app/routers/patient_consent.py backend/app/routers/patient_password_reset.py \
  backend/app/services/patient_profile_service.py backend/app/main.py backend/tests/ \
  patient_app/lib/core/api_client.dart patient_app/lib/core/profile_status.dart \
  patient_app/lib/core/router.dart \
  patient_app/lib/features/auth/ patient_app/test/
git commit -m "feat: 환자앱 Task 13 — 가입 5화면(동의·전화·인증·기본정보·새비번)+번호변경 안내 83규칙"
```

> 📌 **규칙 커버리지(83)**: `CONSENT-*`(22 — STEP·ITEM·ALL·BTN·LATER·LOG·ADS) · `AUTH-LAND-*`(4) · `AUTH-PHONE-*`(4) · `AUTH-OTP-*`(11) · `AUTH-SIGNUP-*`(12) · `AUTH-PROFILE-*`(8) · `AUTH-PWNEW-*`(17) · `AUTH-TEL-*`(5).
> ⭐ **양방향 악수 갚음**: `profileMissingProvider`(Task 11 라우터가 기다리던 것) 정의 + Task 11 router 주석의 낡은 "404"를 실제 계약 "403"으로 정정.
> ⚠️ **Task 14가 소비할 계약**: `NewPasswordScreen`(비밀번호 찾기·중복 갈림길이 라우팅) · `OtpScreen`(비밀번호 찾기 ②·가족 연결도 공유) · `PhoneChangeScreen`(PWFIND-06·PWNEW-12 링크 대상).
> ⚠️ **T0 보강 2건**: `ApiException.statusCode`(403 구분) · config.toml(비밀번호 8자·OTP 5분).
>
> 📌 **근거·메타 규칙 8건 — 값이 없어 관측 테스트가 아니라 「어느 테스트가 실현하는가」로 닫는다**(값 없는 규칙은 구현·손검수 몫):
> - `CONSENT-STEP-02`(왜 맨 앞인가 = 순서, 개인정보보호법 15조): `CONSENT-STEP-01`(자리)과 `record_consents`(프로필 생성 시점 기록)의 구조가 실현 — 전화번호를 받기 전에 동의 화면이 온다.
> - `CONSENT-ALL-02`(왜 필수만 켜는가 = 사전 동의가 법적 요건): `CONSENT-ALL-01` 테스트(「모두 동의」가 광고를 켜지 않음)가 실현.
> - `AUTH-PROFILE-06`(자유 입력 생년월일 제거): `AUTH-PROFILE-05` 테스트(`CalendarDatePicker` — 자유 입력이 아님)가 실현.
> - `AUTH-PROFILE-07`(가입 완료 성공 → 홈, 축하 화면 없음): `AUTH-SIGNUP-07` 테스트(`onDone` 호출, 별도 화면 없음)가 실현 — 같은 [가입 완료] 버튼이다.
> - `AUTH-SIGNUP-09`(껐다 켜는 이유 = 문자가 안 와서)·`AUTH-SIGNUP-10`(⛔ 출입증 버리고 랜딩으로 안 보냄): `AUTH-SIGNUP-08` + Step 4 `profileMissingProvider` 라우팅(`signedIn && missing → /signup/step3`)이 실현 — 계정은 서버에 남고 ③으로 되돌린다.
> - `AUTH-PWNEW-13`(이름 칸의 값어치 = 병원 깔때기)·`AUTH-PWNEW-14`(가족·지인엔 무력한 한계): `AUTH-PWNEW-08`(이름 칸)·`AUTH-PWNEW-12`(막다른 길 출구) 테스트 + Step 3 `verify_name_and_reset`(서버 대조)가 실현 — 이름을 모르면 병원 경로로 가고 그때 갭 #44 탐지가 일어난다.

---

## Task 14: 로그인 · 비밀번호 찾기 · 중복번호/번호재활용 · 재인증 · 세션 + 인증 라우팅 (64규칙)

> **담당 규칙(64)**: `AUTH-LOGIN-*`(9) · `AUTH-PWFIND-*`(8) · `AUTH-DUP-*`(17) · `AUTH-REAUTH-*`(5) · `AUTH-SESS-*`(5) · `NAV-AUTH-*`(20). ⭐ **Task 13이 만든 화면·위젯을 「이어 붙이는」 태스크**다 — 새 화면은 로그인·비밀번호 찾기 ①·갈림길·재인증 넷뿐이고, 나머지는 **T13 위젯(`OtpScreen`·`NewPasswordScreen`·`PhoneChangeScreen`)에 실제 콜백을 배선**하고 **인증 라우트 표(NAV-AUTH)를 완성**하는 일이다.
>
> ⭐⭐ **이 태스크의 심장 = 「같은 문을 세 걸음에서 한 걸음으로 줄이지 않는다」(AUTH-DUP)**: 이 앱은 문자를 받을 수 있으면 계정에 들어갈 수 있는 구조가 요구사항 4.1상 원래 맞다(비밀번호 찾기). 그러나 이미 가입한 번호로 `[회원가입]`을 다시 눌러도 **문자 인증만으로 홈에 들여보내지 않는다**(AUTH-DUP-05) — 인증 후 **갈림길 화면**을 띄워 로그인(세션 폐기)이나 비밀번호 바꾸기(흔적이 남는 경로)로 보낸다. 흔적이 남느냐가 「폰을 잠깐 빌려간 사람」을 가른다(AUTH-DUP-06).
>
> ⭐⭐ **두 번째 심장 = 재인증은 문자가 아니라 비밀번호(AUTH-REAUTH-01)**: 가족관리·설정에 들어갈 때마다 SMS를 보내면 느리고 비용이 든다. 민감 화면을 떠난 지 5분이 지나 재진입하면 비밀번호를 한 번 더 묻는다(AUTH-REAUTH-04). **Task 11 라우터 가드가 `sensitiveReauthGuardProvider`·`_isSensitive`를 이미 기다린다** — 여기서 정의해야 닫힌다(양방향 악수, `profileMissingProvider`와 같은 꼴).
>
> ⚠️ **경계(재소유 금지)**: ① 화면 위젯은 **Task 12를 소비**(`ActionButton`·`FieldTextInput`+`FieldErrorController`·`InlineError`) · **Task 13을 소비**(`OtpScreen`+`OtpPurpose`·`NewPasswordScreen`+`NewPasswordController`·`PhoneChangeScreen`·`AuthOtpSender`·`PasswordResetRepo`·`PhoneSendResult`·`SignupPhoneController`·`SignupProfileScreen`·`profileStatusProvider`). 여기서 다시 만들지 않는다. ② **가입 화면(⓪①③) 자체는 T13 소유** — 여기서는 `/signup/*` **라우트에 실제 콜백을 배선**할 뿐(NAV-AUTH-03·04·05·08·09)이고 화면 위젯은 손대지 않는다. ③ 로그아웃 **버튼·화면은 Task 29**(`SET-OUT-*`) 소유 — 여기서는 `AuthRepo.signOut()`이 **예약 보관본까지 지우는 행위**(AUTH-SESS-04)만 제공하고 Task 29가 소비한다.
>
> ⚠️ **원문 대조에서 걸러낸 낡은 단방향 표기 2건(핸드오프 함정 ①)**:
> - **`NAV-AUTH-15`**("새 비밀번호 → 홈")는 **`AUTH-PWNEW-04`**("변경 성공 → 로그인 화면으로 보내 다시 로그인 — 손으로 한 번 쳐보는 것이 기억에 남는다")가 **더 구체적·후행 결정**이고 T13 `NewPasswordScreen(onDone)`이 `/login`으로 이미 구현했다(T13 test `[AUTH-PWNEW-04]`). → **`/new-password`의 `onDone`은 `/login`으로 잇고**, NAV-AUTH-15는 이 결정으로 **갱신**한다(Step 7에서 「홈」이 아니라 로그인으로 감을 테스트가 못박는다).
> - **`NAV-AUTH-16`**("문자 안 옴 → 도움말 시트(겹침)")는 **`AUTH-PWFIND-06`**("문자가 오지 않나요? → 번호 변경 안내 `AUTH-TEL`로 가는 링크")와 목적지가 갈렸다. PWFIND-06이 구체적이므로 **인증 화면 아래 링크가 `PhoneChangeScreen`을 `push`**(겹침 — 뒤로 가면 인증 화면 유지, NAV-AUTH-16의 「화면을 떠나지 않는다」 충족)하는 것으로 **통합**한다.

**Files:**
- Create: `patient_app/lib/features/auth/auth_repo.dart`(`AuthRepo` 추상 + `SupabaseAuthRepo` 실체 + `authRepoProvider` — T13 추상 인터페이스의 실제 백엔드 배관)
- Create: `patient_app/lib/features/auth/login_screen.dart`(`LoginScreen`+`LoginController`+`PhoneHyphenFormatter` — AUTH-LOGIN)
- Create: `patient_app/lib/features/auth/password_find_screen.dart`(`PasswordFindScreen`+`PasswordFindController` — AUTH-PWFIND ①)
- Create: `patient_app/lib/features/auth/duplicate_account_screen.dart`(`DuplicateAccountScreen` — AUTH-DUP 갈림길)
- Create: `patient_app/lib/features/auth/reauth_screen.dart`(`ReauthScreen`+`ReauthController` — AUTH-REAUTH)
- Create: `patient_app/lib/core/sensitive_reauth.dart`(`SensitiveReauthGuard`+`sensitiveReauthGuardProvider` — Task 11 라우터가 기다리는 것)
- Modify: `patient_app/lib/features/auth/otp_screen.dart`(비밀번호 찾기 목적일 때 「문자가 오지 않나요?」 링크 한 줄 추가 — AUTH-PWFIND-06/NAV-AUTH-16, `AUTH-OTP-11`의 가족 링크와 같은 `purpose` 분기 패턴)
- Modify: `patient_app/lib/core/router.dart`(인증 라우트 표 완성 — 골격 자리표시자를 실제 화면·콜백으로 교체 + `_isSensitive` 정의)
- Modify: `supabase/config.toml`(세션 갱신표 회전 확인 — AUTH-SESS-02, 이미 켜져 있으면 주석만)
- Test: `patient_app/test/features/auth/{auth_repo,login_screen,password_find_screen,duplicate_account_screen,reauth_screen}_test.dart` · `test/core/sensitive_reauth_test.dart` · `test/features/auth/auth_routes_test.dart` · `test/features/auth/otp_pwfind_link_test.dart`

**Interfaces:**
- Consumes:
  - Task 0: `AppTokens`·`ApiClient`·`ApiException`(+`statusCode`, T13 보강)·`apiClientProvider`·`supabaseClientProvider`·`authStateChangesProvider`·`AuthStatus`·`appRouter`
  - Task 11: `effectiveAuthProvider`(라우터 가드가 이미 소비) · `UpcomingCache`(`clear()` — 로그아웃 시 예약 보관본 삭제) · 라우터 `redirect`가 `sensitiveReauthGuardProvider`·`_isSensitive`를 기다림(여기서 정의)
  - Task 12: `ActionButton`·`FieldTextInput`+`FieldErrorController`·`InlineError`
  - Task 13: `OtpScreen`+`OtpPurpose`·`NewPasswordScreen`+`NewPasswordController`·`PhoneChangeScreen`·`AuthOtpSender`·`PasswordResetRepo`·`PhoneSendResult`·`PhoneCooldownStore`·`SignupPhoneController`·`ConsentScreen`·`SignupProfileScreen`·`profileStatusProvider`·`POST /patients/me/password-reset`
- Produces:
  - `AuthRepo`(`sendOtp(createUser:)`·`verifyOtp`·`signInWithPassword`·`reauthenticate`·`hasProfile`·`signOut`) + `authRepoProvider` — 로그아웃·재인증·중복 판정의 단일 창구
  - `LoginController`·`PasswordFindController`·`ReauthController` · `LoginScreen`·`PasswordFindScreen`·`DuplicateAccountScreen`·`ReauthScreen`
  - `SensitiveReauthGuard`(`needsReauth`·`markPassed()`) + `sensitiveReauthGuardProvider` · `_isSensitive(loc)`(router 내부)
  - **완성된 인증 라우트 표**(NAV-AUTH): `/login`·`/password-find`·`/password-find/otp`·`/signup/otp`(분기 배선)·`/signup/step3`·`/duplicate`·`/new-password`·`/phone-change`·`/reauth`
  - Task 29가 소비: `AuthRepo.signOut()`(로그아웃 버튼이 부른다) · Task 25·26이 소비: `/reauth?next=` 가드(민감 화면 진입)

- [ ] **Step 1: `AuthRepo` — 로그인·OTP·재인증·로그아웃의 단일 창구 (`AUTH-LOGIN-05·06` · `AUTH-PWFIND-04` · `AUTH-SESS-04` · `AUTH-DUP-04`)**

> ⭐ **T13은 화면이 부를 추상 인터페이스(`AuthOtpSender`·`PasswordResetRepo`)만 두고 실제 배관은 남겼다.** 여기서 `AuthRepo`가 그 둘을 **한 몸으로 구현**하고 로그인·재인증·로그아웃·중복 판정을 더한다. 화면·컨트롤러는 **추상 `AuthRepo`에만 의존**(테스트는 `FakeAuthRepo`)하고, `SupabaseAuthRepo`는 Supabase·`ApiClient`·`UpcomingCache`를 잇는 얇은 접착제다.
> 📌 **로그인 실패는 여기서 한 문장으로 뭉갠다(AUTH-LOGIN-05·개인정보 열거 방지)** — 어느 쪽이 틀렸는지 서버가 뭐라 하든 `null`(성공) 아니면 `전화번호 또는 비밀번호가 올바르지 않습니다` 하나만 올려보낸다. **횟수로 잠그는 코드는 넣지 않는다(AUTH-LOGIN-06)** — 남의 번호로 남을 잠글 수 있고 어르신에게 막다른 길이다.

- [ ] **Step 1a: 실패 테스트** — `patient_app/test/features/auth/auth_repo_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/offline_cache.dart';
import 'package:hospital_patient_app/features/auth/auth_repo.dart';

class _MockGoTrue extends Mock implements GoTrueClient {}

class _MockApi extends Mock implements ApiClient {}

/// UpcomingCache의 clear() 호출만 지켜보는 스파이(나머지는 Fake라 부르면 실패한다).
class _SpyCache extends Fake implements UpcomingCache {
  bool cleared = false;
  @override
  Future<void> clear() async => cleared = true;
}

void main() {
  setUpAll(() => registerFallbackValue(OtpType.sms));

  test('[AUTH-PWFIND-04] 비밀번호 찾기 발송은 shouldCreateUser:false로 보낸다', () async {
    final auth = _MockGoTrue();
    when(() => auth.signInWithOtp(phone: any(named: 'phone'), shouldCreateUser: any(named: 'shouldCreateUser')))
        .thenAnswer((_) async {});
    final repo = SupabaseAuthRepo(auth: auth, api: _MockApi(), cache: _SpyCache());
    await repo.sendOtp('01011112222', createUser: false);
    // 아무 번호나 넣는 것만으로 빈 계정이 생기지 않게 한다(갭 #39).
    verify(() => auth.signInWithOtp(phone: '+821011112222', shouldCreateUser: false)).called(1);
  });

  test('[AUTH-LOGIN-05] 로그인 실패는 원인을 나누지 않고 한 문장으로만 돌려준다', () async {
    final auth = _MockGoTrue();
    when(() => auth.signInWithPassword(phone: any(named: 'phone'), password: any(named: 'password')))
        .thenThrow(const AuthException('Invalid login credentials'));
    final repo = SupabaseAuthRepo(auth: auth, api: _MockApi(), cache: _SpyCache());
    final msg = await repo.signInWithPassword('01011112222', 'wrongpw12');
    expect(msg, '전화번호 또는 비밀번호가 올바르지 않습니다'); // 어느 쪽이 틀렸는지 말하지 않는다
  });

  test('[AUTH-LOGIN-06] 여러 번 실패해도 잠그지 않는다 — 매번 다시 시도할 수 있다', () async {
    final auth = _MockGoTrue();
    when(() => auth.signInWithPassword(phone: any(named: 'phone'), password: any(named: 'password')))
        .thenThrow(const AuthException('Invalid login credentials'));
    final repo = SupabaseAuthRepo(auth: auth, api: _MockApi(), cache: _SpyCache());
    for (var i = 0; i < 6; i++) {
      final msg = await repo.signInWithPassword('01011112222', 'wrongpw12');
      expect(msg, isNotNull); // 여섯 번째도 「잠김」이 아니라 같은 실패 문구(막다른 길 없음)
    }
  });

  test('[AUTH-SESS-04][AUTH-DUP-04] signOut은 세션과 함께 예약 보관본을 지운다', () async {
    final auth = _MockGoTrue();
    when(() => auth.signOut()).thenAnswer((_) async {});
    final cache = _SpyCache();
    final repo = SupabaseAuthRepo(auth: auth, api: _MockApi(), cache: cache);
    await repo.signOut();
    verify(() => auth.signOut()).called(1);
    expect(cache.cleared, isTrue); // OFF-CACHE-02: 폰에 저장한 예약 보관본을 함께 지운다
  });

  test('[AUTH-DUP-02] hasProfile — 프로필이 있으면(200) true, 없으면(403) false', () async {
    final api = _MockApi();
    when(() => api.get<dynamic>(any(), any())).thenAnswer((_) async => {'patient_id': 'x'});
    final repo = SupabaseAuthRepo(auth: _MockGoTrue(), api: api, cache: _SpyCache());
    expect(await repo.hasProfile(), isTrue);

    when(() => api.get<dynamic>(any(), any())).thenThrow(ApiException('e', statusCode: 403));
    expect(await repo.hasProfile(), isFalse); // 인증만 통과·프로필 없음 → 가입 미완료로 본다
  });
}
```
Run: `flutter test test/features/auth/auth_repo_test.dart` → Expected: FAIL(파일 없음).

- [ ] **Step 1b: `AuthRepo` 구현** — `patient_app/lib/features/auth/auth_repo.dart`

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/api_client.dart';
import '../../core/offline_cache.dart';
import '../../core/providers.dart';
import 'signup_phone_screen.dart';   // AuthOtpSender(추상)
import 'new_password_screen.dart';   // PasswordResetRepo(추상)

/// 010… → +8210…(Supabase는 E.164를 받는다). 숫자만 남겨 변환한다.
String toE164(String phone) {
  final d = phone.replaceAll(RegExp(r'\D'), '');
  return d.startsWith('0') ? '+82${d.substring(1)}' : '+82$d';
}

/// 로그인·OTP·재인증·로그아웃·중복 판정의 단일 창구. 화면·컨트롤러는 이 추상에만 의존한다.
abstract class AuthRepo implements AuthOtpSender, PasswordResetRepo {
  Future<void> sendOtp(String phone, {required bool createUser});
  Future<String?> verifyOtp(String phone, String code);        // null=성공, 아니면 화면에 띄울 문구
  Future<String?> signInWithPassword(String phone, String password); // 〃
  Future<String?> reauthenticate(String password);             // 현재 세션의 번호로 비밀번호 재확인
  Future<bool> hasProfile();                                   // GET /patients/me == 200
  Future<void> signOut();                                      // 세션 + 예약 보관본 삭제(AUTH-SESS-04)
}

class SupabaseAuthRepo implements AuthRepo {
  SupabaseAuthRepo({required this.auth, required this.api, required this.cache});
  final GoTrueClient auth;
  final ApiClient api;
  final UpcomingCache cache;

  static const _loginFail = '전화번호 또는 비밀번호가 올바르지 않습니다'; // AUTH-LOGIN-05
  static const _otpFail = '인증번호가 올바르지 않습니다';                 // AUTH-OTP-09(서버 문장 대체)

  @override
  Future<void> sendSignupOtp(String phone) => sendOtp(phone, createUser: true); // AuthOtpSender

  @override
  Future<void> sendOtp(String phone, {required bool createUser}) =>
      auth.signInWithOtp(phone: toE164(phone), shouldCreateUser: createUser);

  @override
  Future<String?> verifyOtp(String phone, String code) async {
    try {
      await auth.verifyOTP(phone: toE164(phone), token: code, type: OtpType.sms);
      return null;
    } on AuthException {
      return _otpFail;
    }
  }

  @override
  Future<String?> signInWithPassword(String phone, String password) async {
    try {
      await auth.signInWithPassword(phone: toE164(phone), password: password);
      return null;
    } on AuthException {
      return _loginFail; // AUTH-LOGIN-05·06: 원인을 나누지도, 횟수로 잠그지도 않는다
    }
  }

  @override
  Future<String?> reauthenticate(String password) async {
    final phone = auth.currentUser?.phone;                 // 이미 로그인된 세션의 번호
    if (phone == null) return _loginFail;
    return signInWithPassword(phone, password);            // AUTH-REAUTH-01: 문자가 아니라 비밀번호
  }

  @override
  Future<bool> hasProfile() async {
    try {
      await api.get<dynamic>('/patients/me', (j) => j);
      return true;
    } on ApiException catch (e) {
      if (e.statusCode == 403) return false;               // 인증만 통과·프로필 없음
      rethrow;
    }
  }

  @override
  Future<void> signOut() async {
    await auth.signOut();
    await cache.clear();                                    // AUTH-SESS-04 = OFF-CACHE-02
  }

  @override
  Future<void> reset(String name, String password) =>      // PasswordResetRepo — 서버 경유(갭 #78)
      api.post<void>('/patients/me/password-reset', (_) {},
          body: {'name': name, 'password': password});
}

final authRepoProvider = Provider<AuthRepo>((ref) => SupabaseAuthRepo(
      auth: ref.watch(supabaseClientProvider).auth,
      api: ref.watch(apiClientProvider),
      cache: ref.watch(upcomingCacheProvider),
    ));
```

> 📌 **`upcomingCacheProvider`는 Task 11이 만든다** — 없으면 Task 11 `offline_cache.dart`에 `final upcomingCacheProvider = Provider<UpcomingCache>(...)`를 더한다(경계 크랙 방지: T11이 `UpcomingCache`를 클래스로만 두고 provider를 안 냈으면 여기서 채운다). `api.post`/`api.get`의 시그니처(파서 인자)는 Task 0 `ApiClient`를 따른다.

Run: `flutter test test/features/auth/auth_repo_test.dart` → Expected: PASS(5 tests).

- [ ] **Step 2: 로그인 화면 (`AUTH-LOGIN-01`~`09` · `NAV-AUTH-10·11·12`)**

> ⭐ **평소 로그인은 전화번호 + 비밀번호 두 칸**(AUTH-LOGIN-01) — 문자 인증을 쓰지 않는다(OTP는 가입 시 1회뿐). 확인 칸은 두지 않고(AUTH-LOGIN-04 — 틀리면 다시 치면 된다), 실패는 어느 쪽이 틀렸는지 말하지 않는 한 문장(AUTH-LOGIN-05). 아래에 「비밀번호를 잊으셨나요?」(→ 비밀번호 찾기, LOGIN-07/NAV-AUTH-11)와 「전화번호가 바뀌어 로그인할 수 없나요? ›」(→ 번호 변경 안내, LOGIN-08/NAV-AUTH-12) 두 출구를 둔다.

- [ ] **Step 2a: 실패 테스트** — `patient_app/test/features/auth/login_screen_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/auth/auth_repo.dart';
import 'package:hospital_patient_app/features/auth/login_screen.dart';

/// 성공/실패를 골라 돌려주는 얇은 Fake(로그인만 쓰므로 나머지는 미구현).
class _FakeAuth extends Fake implements AuthRepo {
  String? loginResult; // null=성공
  int loginCalls = 0;
  @override
  Future<String?> signInWithPassword(String phone, String password) async {
    loginCalls++;
    return loginResult;
  }
}

LoginScreen _screen(_FakeAuth a, {String? prefillPhone, void Function(String)? onNavigate}) =>
    LoginScreen(
      controller: LoginController(a),
      prefillPhone: prefillPhone,
      onSuccess: () => onNavigate?.call('home'),
      onForgot: () => onNavigate?.call('forgot'),
      onPhoneChanged: () => onNavigate?.call('phone-change'),
    );

void main() {
  testWidgets('[AUTH-LOGIN-01] 전화번호 + 비밀번호 두 칸, 문자 인증 칸은 없다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth())));
    expect(find.byKey(const Key('login-phone')), findsOneWidget);
    expect(find.byKey(const Key('login-password')), findsOneWidget);
    expect(find.textContaining('인증번호'), findsNothing); // OTP 칸 없음
  });

  testWidgets('[AUTH-LOGIN-02] 전화번호 칸은 숫자 키패드 + 앱이 하이픈을 넣는다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth())));
    final tf = t.widget<TextField>(find.byKey(const Key('login-phone')));
    expect(tf.keyboardType, TextInputType.phone);
    await t.enterText(find.byKey(const Key('login-phone')), '01011115678');
    await t.pump();
    expect(find.text('010-1111-5678'), findsOneWidget); // 사용자는 하이픈을 치지 않았다
  });

  testWidgets('[AUTH-LOGIN-03] 비밀번호 칸에 눈 토글(기본 가림)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth())));
    final pw = t.widget<TextField>(find.byKey(const Key('login-password')));
    expect(pw.obscureText, isTrue); // 기본 가림
    expect(find.byIcon(Icons.visibility_off), findsOneWidget);
  });

  testWidgets('[AUTH-LOGIN-04] 확인 칸을 두지 않는다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth())));
    expect(find.byKey(const Key('login-password-confirm')), findsNothing);
  });

  testWidgets('[AUTH-LOGIN-05] 실패는 어느 쪽이 틀렸는지 말하지 않는 한 문장', (t) async {
    final a = _FakeAuth()..loginResult = '전화번호 또는 비밀번호가 올바르지 않습니다';
    await t.pumpWidget(MaterialApp(home: _screen(a)));
    await t.enterText(find.byKey(const Key('login-phone')), '01011115678');
    await t.enterText(find.byKey(const Key('login-password')), 'wrongpw12');
    await t.tap(find.text('로그인'));
    await t.pumpAndSettle();
    expect(find.text('전화번호 또는 비밀번호가 올바르지 않습니다'), findsOneWidget);
    expect(find.textContaining('비밀번호가 틀렸'), findsNothing); // 원인을 나누지 않는다
  });

  testWidgets('[AUTH-LOGIN-06] 여러 번 실패해도 버튼이 잠기지 않는다', (t) async {
    final a = _FakeAuth()..loginResult = '전화번호 또는 비밀번호가 올바르지 않습니다';
    await t.pumpWidget(MaterialApp(home: _screen(a)));
    await t.enterText(find.byKey(const Key('login-phone')), '01011115678');
    await t.enterText(find.byKey(const Key('login-password')), 'wrongpw12');
    for (var i = 0; i < 5; i++) {
      await t.tap(find.text('로그인'));
      await t.pumpAndSettle();
    }
    expect(a.loginCalls, 5); // 다섯 번째도 서버를 부른다(계정을 잠그지 않는다)
  });

  testWidgets('[AUTH-LOGIN-07][NAV-AUTH-11] 「비밀번호를 잊으셨나요?」 → 비밀번호 찾기', (t) async {
    String? nav;
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth(), onNavigate: (d) => nav = d)));
    await t.tap(find.text('비밀번호를 잊으셨나요?'));
    expect(nav, 'forgot');
  });

  testWidgets('[AUTH-LOGIN-08][NAV-AUTH-12] 「전화번호가 바뀌어…」 → 번호 변경 안내', (t) async {
    String? nav;
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth(), onNavigate: (d) => nav = d)));
    await t.tap(find.textContaining('전화번호가 바뀌어'));
    expect(nav, 'phone-change');
  });

  testWidgets('[AUTH-LOGIN-09][NAV-AUTH-10] 성공하면 홈으로 보낸다', (t) async {
    String? nav;
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth(), onNavigate: (d) => nav = d)));
    await t.enterText(find.byKey(const Key('login-phone')), '01011115678');
    await t.enterText(find.byKey(const Key('login-password')), 'rightpw12');
    await t.tap(find.text('로그인'));
    await t.pumpAndSettle();
    expect(nav, 'home'); // 랜딩·로그인은 뒤로가기로 돌아갈 수 없다(라우트가 go로 교체 — Step 7)
  });
}
```
Run: `flutter test test/features/auth/login_screen_test.dart` → Expected: FAIL(파일 없음).

- [ ] **Step 2b: `LoginScreen` + `LoginController` + `PhoneHyphenFormatter` 구현** — `patient_app/lib/features/auth/login_screen.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/tokens.dart';
import '../../widgets/action_button.dart';
import 'auth_repo.dart';

/// AUTH-LOGIN-02 — 사용자는 숫자만 치고 앱이 010-XXXX-XXXX로 하이픈을 넣는다.
class PhoneHyphenFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue _, TextEditingValue next) {
    final d = next.text.replaceAll(RegExp(r'\D'), '');
    final b = StringBuffer();
    for (var i = 0; i < d.length && i < 11; i++) {
      if (i == 3 || i == 7) b.write('-');
      b.write(d[i]);
    }
    final s = b.toString();
    return TextEditingValue(text: s, selection: TextSelection.collapsed(offset: s.length));
  }
}

class LoginController {
  LoginController(this.repo);
  final AuthRepo repo;

  /// null=성공, 아니면 화면에 붙일 한 문장(AUTH-LOGIN-05). 숫자만 뽑아 넘긴다.
  Future<String?> submit(String phone, String password) =>
      repo.signInWithPassword(phone.replaceAll(RegExp(r'\D'), ''), password);
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.controller,
    required this.onSuccess,
    required this.onForgot,
    required this.onPhoneChanged,
    this.prefillPhone, // NAV-AUTH-06: 갈림길에서 넘어오면 번호가 채워진 채로 온다
  });
  final LoginController controller;
  final VoidCallback onSuccess;
  final VoidCallback onForgot;
  final VoidCallback onPhoneChanged;
  final String? prefillPhone;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late final TextEditingController _phone =
      TextEditingController(text: widget.prefillPhone == null ? '' : _hyphen(widget.prefillPhone!));
  final _pw = TextEditingController();
  bool _obscure = true, _busy = false;
  String? _error;

  static String _hyphen(String d) =>
      PhoneHyphenFormatter().formatEditUpdate(TextEditingValue.empty, TextEditingValue(text: d)).text;

  Future<void> _submit() async {
    setState(() { _busy = true; _error = null; });
    final err = await widget.controller.submit(_phone.text, _pw.text);
    if (!mounted) return;
    setState(() { _busy = false; _error = err; });
    if (err == null) widget.onSuccess(); // AUTH-LOGIN-09
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('로그인')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(
          key: const Key('login-phone'), controller: _phone,
          keyboardType: TextInputType.phone,                          // AUTH-LOGIN-02
          inputFormatters: [PhoneHyphenFormatter()],
          style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]), // 고정폭 숫자
          decoration: const InputDecoration(labelText: '전화번호'),
        ),
        TextField(
          key: const Key('login-password'), controller: _pw, obscureText: _obscure, // AUTH-LOGIN-03
          decoration: InputDecoration(
            labelText: '비밀번호',
            suffixIcon: IconButton(
              icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
              onPressed: () => setState(() => _obscure = !_obscure))),
        ),
        const SizedBox(height: 16),
        // AUTH-LOGIN-05: 실패 문구는 버튼 위 붙박이(ERR-POS-01).
        if (_error != null) ...[Text(_error!, style: const TextStyle(color: AppTokens.warn)), const SizedBox(height: 8)],
        ActionButton(label: '로그인', busyLabel: '로그인 중…', busy: _busy, onPressed: _submit),
        const SizedBox(height: 12),
        // AUTH-LOGIN-07: 버튼 아래 가운데.
        Center(child: TextButton(onPressed: widget.onForgot, child: const Text('비밀번호를 잊으셨나요?'))),
        // AUTH-LOGIN-08: 그 아래 한 줄 더.
        Center(child: TextButton(onPressed: widget.onPhoneChanged,
            child: const Text('전화번호가 바뀌어 로그인할 수 없나요? ›'))),
      ]),
    );
  }
}
```
Run: `flutter test test/features/auth/login_screen_test.dart` → Expected: PASS(9 tests).

- [ ] **Step 3: 비밀번호 찾기 ① — 전화번호 확인 (`AUTH-PWFIND-01·03·04·05·07` · `NAV-AUTH-13`)**

> ⭐ **가입 여부를 알려주지 않는다(PWFIND-03)** — 맞든 틀리든 같은 화면(인증번호 입력)으로 진행한다. 발송은 **`shouldCreateUser:false`**(PWFIND-04 — 아무 번호나 넣는 것만으로 빈 계정이 생기지 않게)이고, 미가입 번호면 문자는 오지 않고 시간만 흐른다(PWFIND-05). 구조는 회원가입과 **앞 세 칸이 같다**(번호 → 문자 → 로그인됨) — 다른 것은 마지막이 프로필 생성이냐 비밀번호 변경이냐뿐(PWFIND-07).

- [ ] **Step 3a: 실패 테스트** — `patient_app/test/features/auth/password_find_screen_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/auth/auth_repo.dart';
import 'package:hospital_patient_app/features/auth/password_find_screen.dart';
import 'package:hospital_patient_app/features/auth/signup_phone_screen.dart'; // PhoneSendResult

class _FakeAuth extends Fake implements AuthRepo {
  bool? sentCreateUser;
  bool throwOnSend = false;
  @override
  Future<void> sendOtp(String phone, {required bool createUser}) async {
    if (throwOnSend) throw Exception('user not found');
    sentCreateUser = createUser;
  }
}

void main() {
  test('[AUTH-PWFIND-04] 발송은 shouldCreateUser:false로 나간다', () async {
    final a = _FakeAuth();
    final r = await PasswordFindController(a).submit('01011112222', DateTime(2026));
    expect(a.sentCreateUser, isFalse);
    expect(r, PhoneSendResult.sent);
  });

  test('[AUTH-PWFIND-03][AUTH-PWFIND-05] 미가입 번호라 발송이 실패해도 그대로 진행한다', () async {
    final a = _FakeAuth()..throwOnSend = true; // 가입 안 된 번호
    // 예외를 삼키고(가입 여부를 드러내지 않음) 인증 화면으로 넘어간다.
    final r = await PasswordFindController(a).submit('01099998888', DateTime(2026));
    expect(r, PhoneSendResult.sent); // 화면 흐름으로도 가입 여부를 알리지 않는다
  });

  testWidgets('[AUTH-PWFIND-01] 첫 화면은 전화번호 한 칸 + [인증번호 받기]', (t) async {
    await t.pumpWidget(MaterialApp(
      home: PasswordFindScreen(controller: PasswordFindController(_FakeAuth()), onSent: (_) {}),
    ));
    expect(find.byType(TextField), findsOneWidget);
    expect(find.text('인증번호 받기'), findsOneWidget);
  });

  testWidgets('[NAV-AUTH-13] [인증번호 받기]를 누르면 인증 화면으로(번호 전달)', (t) async {
    String? sentPhone;
    await t.pumpWidget(MaterialApp(
      home: PasswordFindScreen(
        controller: PasswordFindController(_FakeAuth()),
        onSent: (phone) => sentPhone = phone),
    ));
    await t.enterText(find.byType(TextField), '01011112222');
    await t.tap(find.text('인증번호 받기'));
    await t.pumpAndSettle();
    expect(sentPhone, '01011112222');
  });
}
```
Run: `flutter test test/features/auth/password_find_screen_test.dart` → Expected: FAIL(파일 없음).

- [ ] **Step 3b: `PasswordFindScreen` + `PasswordFindController` 구현** — `patient_app/lib/features/auth/password_find_screen.dart`

```dart
import 'package:flutter/material.dart';
import '../../widgets/action_button.dart';
import '../../widgets/field_error.dart';
import 'auth_repo.dart';
import 'signup_phone_screen.dart'; // PhoneSendResult · validatePhone(재사용)

class PasswordFindController {
  PasswordFindController(this.repo);
  final AuthRepo repo;

  /// AUTH-PWFIND-03·04·05 — createUser:false로 최선 발송하고, 실패해도(미가입) 삼켜서
  /// 가입 여부를 드러내지 않고 그대로 인증 화면으로 넘어간다.
  Future<PhoneSendResult> submit(String phone, DateTime now) async {
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    try {
      await repo.sendOtp(digits, createUser: false);
    } catch (_) {
      // 미가입 번호 등 — 알리지 않는다(개인정보 열거 방지).
    }
    return PhoneSendResult.sent;
  }
}

class PasswordFindScreen extends StatefulWidget {
  const PasswordFindScreen({super.key, required this.controller, required this.onSent});
  final PasswordFindController controller;
  final void Function(String phone) onSent; // 인증 화면으로(번호 전달)
  @override
  State<PasswordFindScreen> createState() => _PasswordFindScreenState();
}

class _PasswordFindScreenState extends State<PasswordFindScreen> {
  final _form = FieldErrorController();
  final _phone = TextEditingController();
  bool _busy = false;

  Future<void> _submit() async {
    if (!_form.validateAll()) return;
    setState(() => _busy = true);
    final digits = _phone.text.replaceAll(RegExp(r'\D'), '');
    await widget.controller.submit(digits, DateTime.now());
    if (!mounted) return;
    setState(() => _busy = false);
    widget.onSent(digits); // NAV-AUTH-13: 미가입도 그대로 진행
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('비밀번호 찾기')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('가입하신 전화번호로 인증번호를 보내드립니다'),
        const SizedBox(height: 16),
        FieldTextInput(label: '전화번호', controller: _phone, form: _form, validate: validatePhone),
        const SizedBox(height: 24),
        ActionButton(label: '인증번호 받기', busyLabel: '인증번호 보내는 중…', busy: _busy, onPressed: _submit),
      ]),
    );
  }
}
```
Run: `flutter test test/features/auth/password_find_screen_test.dart` → Expected: PASS(4 tests).

- [ ] **Step 4: 인증 화면에 「문자가 오지 않나요?」 링크 추가 (`AUTH-PWFIND-06` · `NAV-AUTH-16`)**

> ⭐ **T13 `OtpScreen`은 가족 연결 목적일 때만 막다른 길 링크를 붙였다(AUTH-OTP-11).** 비밀번호 찾기 목적일 때도 같은 자리에 「문자가 오지 않나요? ›」를 붙여 **번호 변경 안내(`PhoneChangeScreen`)로 `push`**한다(PWFIND-06). ⚠️ **`go`가 아니라 `push`** — 뒤로 가면 인증 화면으로 돌아온다(NAV-AUTH-16 「화면을 떠나지 않는다」). 진짜로 번호가 바뀐 사람과 가입한 적 없는 사람이 **같은 화면에서 막히므로** 둘 다 병원으로 안내한다.

- [ ] **Step 4a: 실패 테스트** — `patient_app/test/features/auth/otp_pwfind_link_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/phone_cooldown.dart';
import 'package:hospital_patient_app/features/auth/otp_screen.dart';
import 'package:mocktail/mocktail.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class _MockStorage extends Mock implements FlutterSecureStorage {}
PhoneCooldownStore _store() {
  final s = _MockStorage();
  when(() => s.read(key: any(named: 'key'))).thenAnswer((_) async => null);
  when(() => s.write(key: any(named: 'key'), value: any(named: 'value'))).thenAnswer((_) async {});
  return PhoneCooldownStore(s);
}

OtpScreen _screen(OtpPurpose purpose) => OtpScreen(
      phone: '01011115678', purpose: purpose, cooldown: _store(),
      onResend: () async {}, onVerify: (_) async => null, onSuccess: () {});

void main() {
  testWidgets('[AUTH-PWFIND-06] 비밀번호 찾기 인증 화면에 「문자가 오지 않나요?」 링크가 있다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(OtpPurpose.passwordFind)));
    expect(find.text('문자가 오지 않나요?'), findsOneWidget);
  });

  testWidgets('[NAV-AUTH-16] 가입 목적 인증 화면에는 그 링크가 없다(목적별 분기)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(OtpPurpose.signup)));
    expect(find.text('문자가 오지 않나요?'), findsNothing);
  });
}
```
Run: `flutter test test/features/auth/otp_pwfind_link_test.dart` → Expected: FAIL(링크 없음).

- [ ] **Step 4b: `otp_screen.dart`에 한 줄 추가** — `patient_app/lib/features/auth/otp_screen.dart` (Modify)

`AUTH-OTP-11`(가족 연결 링크) 바로 아래에 목적별 분기를 하나 더 둔다. ⚠️ **T13 테스트를 깨지 않는 순수 추가**다(기존 요소를 지우지 않는다):
```dart
        // AUTH-OTP-11: 가족 연결만 막다른 길 링크.
        if (widget.purpose == OtpPurpose.familyLink)
          TextButton(onPressed: () {}, child: const Text('휴대폰이 없는 가족인가요?')),
        // AUTH-PWFIND-06 / NAV-AUTH-16: 비밀번호 찾기는 「문자가 오지 않나요?」 → 번호 변경 안내로 push(겹침).
        if (widget.purpose == OtpPurpose.passwordFind)
          TextButton(
            onPressed: () => Navigator.of(context).pushNamed('/phone-change'),
            child: const Text('문자가 오지 않나요?')),
```
> 📌 라우트 이름 이동은 Step 7 라우터가 `/phone-change`를 등록해 실현한다. 테스트는 링크 **존재·목적 분기**만 본다(내비게이션은 Step 7 `auth_routes_test.dart`가 검증).

Run: `flutter test test/features/auth/otp_pwfind_link_test.dart` + `flutter test test/features/auth/otp_screen_test.dart`(T13) → Expected: 둘 다 PASS(11 + 2).

- [ ] **Step 5: 이미 가입한 번호 — 갈림길 화면 (`AUTH-DUP-01`~`17` · `NAV-AUTH-05·06·07`)**

> ⭐ **인증 후에만 뜬다(AUTH-DUP-02).** 가입하려던 사람이 그 번호에 이미 프로필이 있으면 ③ 대신 이 화면을 띄운다 — `이미 가입하신 번호입니다` + `[로그인하러 가기]`(주, 세션 폐기 후 로그인) + `비밀번호를 잊으셨나요?` `[비밀번호 바꾸기]`(새 비밀번호 화면) + 셋째 줄 `이 번호를 최근에 새로 받으셨나요? ›`(번호 변경 안내). ⛔ **곧바로 홈으로 들여보내지 않는다(AUTH-DUP-05)** — 그러면 문자 인증만으로 로그인이 되어 「평소 로그인은 비밀번호」 결정을 앱이 스스로 우회한다.

- [ ] **Step 5a: 실패 테스트** — `patient_app/test/features/auth/duplicate_account_screen_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/auth/auth_repo.dart';
import 'package:hospital_patient_app/features/auth/duplicate_account_screen.dart';

class _FakeAuth extends Fake implements AuthRepo {
  int signOutCalls = 0;
  @override
  Future<void> signOut() async => signOutCalls++;
}

DuplicateAccountScreen _screen(_FakeAuth a, {void Function(String)? onNavigate}) =>
    DuplicateAccountScreen(
      phone: '01011115678',
      repo: a,
      onLogin: () => onNavigate?.call('login'),
      onChangePassword: () => onNavigate?.call('new-password'),
      onRecentlyReceived: () => onNavigate?.call('phone-change'),
    );

void main() {
  testWidgets('[AUTH-DUP-02] 안내 문구와 두 버튼 + 셋째 줄이 있다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth())));
    expect(find.text('이미 가입하신 번호입니다'), findsOneWidget);
    expect(find.text('로그인하러 가기'), findsOneWidget);
    expect(find.text('비밀번호 바꾸기'), findsOneWidget);
    expect(find.textContaining('이 번호를 최근에 새로 받으셨나요?'), findsOneWidget); // AUTH-DUP-14
  });

  testWidgets('[AUTH-DUP-16] [비밀번호 바꾸기]를 없애지 않는다(진짜 환자가 더 많다)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth())));
    expect(find.text('비밀번호 바꾸기'), findsOneWidget);
  });

  testWidgets('[AUTH-DUP-03][AUTH-DUP-04][NAV-AUTH-06] [로그인하러 가기]는 세션을 버리고 로그인으로', (t) async {
    final a = _FakeAuth();
    String? nav;
    await t.pumpWidget(MaterialApp(home: _screen(a, onNavigate: (d) => nav = d)));
    await t.tap(find.text('로그인하러 가기'));
    await t.pumpAndSettle();
    expect(a.signOutCalls, 1); // 문자 인증으로 생긴 세션을 버린다(모순 방지)
    expect(nav, 'login');
  });

  testWidgets('[AUTH-DUP-05] [로그인하러 가기]는 곧바로 홈으로 보내지 않는다', (t) async {
    String? nav;
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth(), onNavigate: (d) => nav = d)));
    await t.tap(find.text('로그인하러 가기'));
    await t.pumpAndSettle();
    expect(nav, isNot('home')); // 문자 인증만으로 로그인되지 않는다
  });

  testWidgets('[AUTH-DUP-09][NAV-AUTH-07] [비밀번호 바꾸기]는 새 비밀번호 화면으로(세션 유지)', (t) async {
    final a = _FakeAuth();
    String? nav;
    await t.pumpWidget(MaterialApp(home: _screen(a, onNavigate: (d) => nav = d)));
    await t.tap(find.text('비밀번호 바꾸기'));
    await t.pumpAndSettle();
    expect(nav, 'new-password');
    expect(a.signOutCalls, 0); // 세션을 유지해야 서버 경유 재설정이 통과한다
  });

  testWidgets('[AUTH-DUP-14] 셋째 줄 → 번호 변경 안내(앱은 판정하지 않는다)', (t) async {
    String? nav;
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth(), onNavigate: (d) => nav = d)));
    await t.tap(find.textContaining('이 번호를 최근에 새로 받으셨나요?'));
    await t.pumpAndSettle();
    expect(nav, 'phone-change');
  });
}
```
Run: `flutter test test/features/auth/duplicate_account_screen_test.dart` → Expected: FAIL(파일 없음).

- [ ] **Step 5b: `DuplicateAccountScreen` 구현** — `patient_app/lib/features/auth/duplicate_account_screen.dart`

```dart
import 'package:flutter/material.dart';
import '../../core/tokens.dart';
import '../../widgets/action_button.dart';
import 'auth_repo.dart';

/// AUTH-DUP-02 — 인증 후에만 뜨는 갈림길. 문자 인증만으로 홈에 들여보내지 않는다(AUTH-DUP-05).
class DuplicateAccountScreen extends StatelessWidget {
  const DuplicateAccountScreen({
    super.key,
    required this.phone,
    required this.repo,
    required this.onLogin,           // 세션 폐기 후 로그인(번호 채워진 채)
    required this.onChangePassword,  // 새 비밀번호 화면(세션 유지)
    required this.onRecentlyReceived,// 번호 변경 안내
  });
  final String phone;
  final AuthRepo repo;
  final VoidCallback onLogin;
  final VoidCallback onChangePassword;
  final VoidCallback onRecentlyReceived;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('회원가입')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('이미 가입하신 번호입니다', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 24),
        // AUTH-DUP-03·04: 주 버튼. 문자 인증으로 생긴 세션을 버리고(signOut) 로그인으로 — 비밀번호를 치게 한다.
        ActionButton(label: '로그인하러 가기', onPressed: () async {
          await repo.signOut();
          onLogin();
        }),
        const SizedBox(height: 24),
        const Text('비밀번호를 잊으셨나요?'),
        const SizedBox(height: 8),
        // AUTH-DUP-09·16: 없애지 않는다 — 비밀번호를 잊은 진짜 환자가 훨씬 많다. 세션은 유지(서버 재설정에 필요).
        OutlinedButton(onPressed: onChangePassword, child: const Text('비밀번호 바꾸기')),
        const SizedBox(height: 24),
        // AUTH-DUP-14: 셋째 줄 — 앱은 아무것도 판정하지 않고 병원 안내로 보낸다.
        TextButton(
          onPressed: onRecentlyReceived,
          child: const Text('이 번호를 최근에 새로 받으셨나요? ›', style: TextStyle(color: AppTokens.grayPending))),
      ]),
    );
  }
}
```
Run: `flutter test test/features/auth/duplicate_account_screen_test.dart` → Expected: PASS(6 tests).

- [ ] **Step 6: 민감 화면 재인증 — 화면 + 5분 가드 (`AUTH-REAUTH-01`~`05` · `NAV-AUTH-17` · `NAV-GLOBAL-05` 실체화)**

> ⭐ **수단은 문자가 아니라 비밀번호(REAUTH-01)** — 가족관리·설정 진입마다 SMS를 보내면 느리고 비용이 든다. **떠난 지 5분이 지나 재진입하면** 다시 묻고, 5분 이내면 묻지 않는다(REAUTH-04). 대상은 가족 관리·설정(REAUTH-05). ⚠️ **Task 11 라우터가 `sensitiveReauthGuardProvider`·`_isSensitive`를 이미 부른다** — 여기서 정의해야 그 가드가 닫힌다.

- [ ] **Step 6a: 실패 테스트(가드)** — `patient_app/test/core/sensitive_reauth_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/sensitive_reauth.dart';

void main() {
  test('[AUTH-REAUTH-04] 한 번도 통과 안 했으면 재인증이 필요하다', () {
    final g = SensitiveReauthGuard(now: () => DateTime(2026, 1, 1, 12, 0));
    expect(g.needsReauth, isTrue);
  });

  test('[AUTH-REAUTH-04] 통과 직후 5분 이내면 다시 묻지 않는다', () {
    var t = DateTime(2026, 1, 1, 12, 0);
    final g = SensitiveReauthGuard(now: () => t);
    g.markPassed();
    t = DateTime(2026, 1, 1, 12, 4, 59); // 4분 59초 뒤
    expect(g.needsReauth, isFalse);
  });

  test('[AUTH-REAUTH-04] 5분을 넘기면 다시 묻는다', () {
    var t = DateTime(2026, 1, 1, 12, 0);
    final g = SensitiveReauthGuard(now: () => t);
    g.markPassed();
    t = DateTime(2026, 1, 1, 12, 5, 1); // 5분 1초 뒤
    expect(g.needsReauth, isTrue);
  });
}
```

- [ ] **Step 6b: `SensitiveReauthGuard` 구현** — `patient_app/lib/core/sensitive_reauth.dart`

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// AUTH-REAUTH-04 — 민감 화면을 떠난 뒤 5분 초과 후 재진입하면 비밀번호를 다시 묻는다.
class SensitiveReauthGuard {
  SensitiveReauthGuard({DateTime Function()? now}) : _now = now ?? DateTime.now;
  final DateTime Function() _now;
  DateTime? _lastPassedAt;
  static const window = Duration(minutes: 5); // 요구사항 4.1「민감한 화면」

  bool get needsReauth {
    final t = _lastPassedAt;
    if (t == null) return true;                 // 아직 한 번도 재인증을 통과하지 않았다
    return _now().difference(t) > window;       // 5분 초과면 다시 묻는다
  }

  void markPassed() => _lastPassedAt = _now();  // 재인증 성공 시각 기록
}

final sensitiveReauthGuardProvider =
    Provider<SensitiveReauthGuard>((ref) => SensitiveReauthGuard());
```

- [ ] **Step 6c: 실패 테스트(화면)** — `patient_app/test/features/auth/reauth_screen_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/sensitive_reauth.dart';
import 'package:hospital_patient_app/features/auth/auth_repo.dart';
import 'package:hospital_patient_app/features/auth/reauth_screen.dart';

class _FakeAuth extends Fake implements AuthRepo {
  String? result; // null=성공
  @override
  Future<String?> reauthenticate(String password) async => result;
}

ReauthScreen _screen(_FakeAuth a, SensitiveReauthGuard g,
        {void Function(String)? onNavigate}) =>
    ReauthScreen(
      controller: ReauthController(a),
      guard: g,
      onPassed: () => onNavigate?.call('next'),
      onForgot: () => onNavigate?.call('forgot'),
    );

void main() {
  testWidgets('[AUTH-REAUTH-01] 비밀번호 칸이다 — 인증번호(문자) 칸이 아니다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth(), SensitiveReauthGuard())));
    expect(find.byKey(const Key('reauth-password')), findsOneWidget);
    expect(find.textContaining('인증번호'), findsNothing);
  });

  testWidgets('[AUTH-REAUTH-03] 눈 토글(기본 가림)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth(), SensitiveReauthGuard())));
    final pw = t.widget<TextField>(find.byKey(const Key('reauth-password')));
    expect(pw.obscureText, isTrue);
  });

  testWidgets('[AUTH-REAUTH-02][NAV-AUTH-17] 「비밀번호를 잊으셨나요?」 → 비밀번호 찾기', (t) async {
    String? nav;
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth(), SensitiveReauthGuard(), onNavigate: (d) => nav = d)));
    await t.tap(find.text('비밀번호를 잊으셨나요?'));
    expect(nav, 'forgot');
  });

  testWidgets('[AUTH-REAUTH-04] 성공하면 가드에 통과를 기록하고 원래 화면으로', (t) async {
    final g = SensitiveReauthGuard();
    String? nav;
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth()..result = null, g, onNavigate: (d) => nav = d)));
    await t.enterText(find.byKey(const Key('reauth-password')), 'mypw1234');
    await t.tap(find.text('확인'));
    await t.pumpAndSettle();
    expect(g.needsReauth, isFalse); // markPassed 됨 → 5분간 다시 안 묻는다
    expect(nav, 'next');
  });

  testWidgets('[AUTH-REAUTH-01] 틀리면 문구를 띄우고 통과시키지 않는다', (t) async {
    final g = SensitiveReauthGuard();
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth()..result = '전화번호 또는 비밀번호가 올바르지 않습니다', g)));
    await t.enterText(find.byKey(const Key('reauth-password')), 'wrongpw1');
    await t.tap(find.text('확인'));
    await t.pumpAndSettle();
    expect(find.text('전화번호 또는 비밀번호가 올바르지 않습니다'), findsOneWidget);
    expect(g.needsReauth, isTrue); // 통과 기록 없음
  });
}
```
Run: `flutter test test/features/auth/reauth_screen_test.dart` → Expected: FAIL(파일 없음).

- [ ] **Step 6d: `ReauthScreen` + `ReauthController` 구현** — `patient_app/lib/features/auth/reauth_screen.dart`

```dart
import 'package:flutter/material.dart';
import '../../core/sensitive_reauth.dart';
import '../../core/tokens.dart';
import '../../widgets/action_button.dart';
import 'auth_repo.dart';

class ReauthController {
  ReauthController(this.repo);
  final AuthRepo repo;
  Future<String?> submit(String password) => repo.reauthenticate(password); // AUTH-REAUTH-01
}

class ReauthScreen extends StatefulWidget {
  const ReauthScreen({
    super.key,
    required this.controller,
    required this.guard,
    required this.onPassed,
    required this.onForgot,
  });
  final ReauthController controller;
  final SensitiveReauthGuard guard;
  final VoidCallback onPassed; // 원래 가려던 민감 화면으로
  final VoidCallback onForgot; // 비밀번호 찾기(막다른 길 방지)
  @override
  State<ReauthScreen> createState() => _ReauthScreenState();
}

class _ReauthScreenState extends State<ReauthScreen> {
  final _pw = TextEditingController();
  bool _obscure = true, _busy = false;
  String? _error;

  Future<void> _submit() async {
    setState(() { _busy = true; _error = null; });
    final err = await widget.controller.submit(_pw.text);
    if (!mounted) return;
    if (err == null) {
      widget.guard.markPassed();       // AUTH-REAUTH-04: 통과 시각 기록 → 5분간 다시 안 묻는다
      widget.onPassed();
      return;
    }
    setState(() { _busy = false; _error = err; });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('본인 확인')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('민감한 정보를 열기 전에 비밀번호를 한 번 더 확인합니다'),
        const SizedBox(height: 16),
        TextField(
          key: const Key('reauth-password'), controller: _pw, obscureText: _obscure, // AUTH-REAUTH-01·03
          decoration: InputDecoration(
            labelText: '비밀번호',
            suffixIcon: IconButton(
              icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
              onPressed: () => setState(() => _obscure = !_obscure))),
        ),
        const SizedBox(height: 16),
        if (_error != null) ...[Text(_error!, style: const TextStyle(color: AppTokens.warn)), const SizedBox(height: 8)],
        ActionButton(label: '확인', busyLabel: '확인 중…', busy: _busy, onPressed: _submit),
        const SizedBox(height: 12),
        // AUTH-REAUTH-02: 막다른 길 방지 — 이 화면에도 둔다.
        Center(child: TextButton(onPressed: widget.onForgot, child: const Text('비밀번호를 잊으셨나요?'))),
      ]),
    );
  }
}
```
Run: `flutter test test/features/auth/reauth_screen_test.dart` + `test/core/sensitive_reauth_test.dart` → Expected: PASS(5 + 3).

- [ ] **Step 7: 인증 라우트 표 완성 + `_isSensitive` + 세션 (`NAV-AUTH-01`~`20` · `AUTH-DUP-02` 분기 · `AUTH-SESS-01·02·03·05` · `AUTH-PWFIND-08` · `AUTH-PWNEW-04`)**

> ⭐ **여기서 T13·T14 화면이 하나의 지도로 이어진다.** 골격(Task 0)의 자리표시자 라우트를 실제 화면·콜백으로 교체하고, **가입 ② 인증 성공의 분기**(프로필 없음 → ③ / 있음 → 갈림길, AUTH-DUP-02·NAV-AUTH-04·05)를 배선한다. `_isSensitive`도 여기서 정의(Task 11 가드가 부른다). ⚠️ **`go`는 히스토리를 교체**하므로 로그인·가입·비밀번호 변경 성공 후 뒤로가기로 돌아갈 수 없다(AUTH-LOGIN-09·NAV-AUTH-08·10·15).

- [ ] **Step 7a: 실패 테스트(라우트 표)** — `patient_app/test/features/auth/auth_routes_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/router.dart';
import 'package:hospital_patient_app/features/auth/login_screen.dart';
import 'package:hospital_patient_app/features/auth/password_find_screen.dart';
import 'package:hospital_patient_app/features/auth/reauth_screen.dart';
import 'package:hospital_patient_app/features/auth/phone_change_screen.dart';

Future<void> _pump(WidgetTester t, String location) async {
  final router = buildAppRouter(initialLocation: location); // 테스트가 시작 위치를 준다
  await t.pumpWidget(ProviderScope(child: MaterialApp.router(routerConfig: router)));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('[NAV-AUTH-01] /login → 로그인 화면', (t) async {
    await _pump(t, '/login');
    expect(find.byType(LoginScreen), findsOneWidget);
  });

  testWidgets('[NAV-AUTH-11] /password-find → 비밀번호 찾기 ①', (t) async {
    await _pump(t, '/password-find');
    expect(find.byType(PasswordFindScreen), findsOneWidget);
  });

  testWidgets('[NAV-AUTH-12] /phone-change → 번호 변경 안내', (t) async {
    await _pump(t, '/phone-change');
    expect(find.byType(PhoneChangeScreen), findsOneWidget);
  });

  testWidgets('[NAV-AUTH-17] /reauth?next=/settings → 재인증 화면', (t) async {
    await _pump(t, '/reauth?next=/settings');
    expect(find.byType(ReauthScreen), findsOneWidget);
  });

  testWidgets('[NAV-AUTH-19] 로그인 전 화면에는 하단 탭이 없다', (t) async {
    await _pump(t, '/login');
    expect(find.byType(BottomNavigationBar), findsNothing);
  });

  test('[AUTH-REAUTH-05] 민감 경로 판정 — 가족·설정만', () {
    expect(isSensitiveLocation('/family'), isTrue);
    expect(isSensitiveLocation('/settings/notifications'), isTrue);
    expect(isSensitiveLocation('/home'), isFalse);
    expect(isSensitiveLocation('/booking'), isFalse);
  });
}
```
> 📌 이 테스트는 `buildAppRouter({initialLocation})`(테스트가 시작 위치를 주입)와 `isSensitiveLocation`(내부 `_isSensitive`의 공개 래퍼)을 요구한다 — Step 7b에서 낸다.

Run: `flutter test test/features/auth/auth_routes_test.dart` → Expected: FAIL(심볼 없음).

- [ ] **Step 7b: 라우터 배선** — `patient_app/lib/core/router.dart` (Modify)

Task 0 골격 + Task 11 `redirect`를 유지한 채, ① 자리표시자 라우트를 실제 화면·콜백으로 교체하고 ② `_isSensitive`와 그 공개 래퍼를 두고 ③ 라우터를 **함수로 감싸** 테스트가 시작 위치를 주입할 수 있게 한다:
```dart
// AUTH-REAUTH-05 — 민감 경로는 가족·설정뿐. Task 11 redirect가 이 판정을 부른다.
bool _isSensitive(String loc) => loc.startsWith('/family') || loc.startsWith('/settings');
bool isSensitiveLocation(String loc) => _isSensitive(loc); // 테스트용 공개 래퍼

/// 인증 성공 후 가입 미완료(프로필 없음)면 ③으로, 이미 프로필이 있으면 갈림길로(AUTH-DUP-02).
Future<void> _afterSignupOtp(BuildContext context, WidgetRef ref, String phone) async {
  final exists = await ref.read(authRepoProvider).hasProfile();
  if (!context.mounted) return;
  if (exists) {
    context.go('/duplicate', extra: {'phone': phone}); // NAV-AUTH-05
  } else {
    context.go('/signup/step3');                        // NAV-AUTH-04
  }
}

GoRouter buildAppRouter({String initialLocation = '/login'}) => GoRouter(
  initialLocation: initialLocation,
  redirect: _authRedirect, // Task 11에서 옮겨 온 전역 가드(effectiveAuthProvider·profileMissing·sensitiveReauth)
  routes: [
    GoRoute(path: '/login', builder: (c, s) {
      final extra = s.extra as Map?; // NAV-AUTH-06: 갈림길에서 온 번호
      final next = s.uri.queryParameters['next']; // NAV-AUTH-18: 딥링크 목적지
      return Consumer(builder: (c, ref, _) => LoginScreen(
        controller: LoginController(ref.read(authRepoProvider)),
        prefillPhone: extra?['phone'] as String?,
        onSuccess: () => c.go(next ?? '/home'),         // AUTH-LOGIN-09·NAV-AUTH-10·18
        onForgot: () => c.push('/password-find'),        // NAV-AUTH-11
        onPhoneChanged: () => c.push('/phone-change'),   // NAV-AUTH-12
      ));
    }),
    // ⓪동의 → ①전화 → ②인증(분기) → ③기본정보 (화면은 T13, 여기선 콜백만 잇는다)
    GoRoute(path: '/signup', builder: (c, s) => const ConsentScreen()),           // NAV-AUTH-02
    GoRoute(path: '/signup/phone', builder: (c, s) => Consumer(builder: (c, ref, _) =>
        SignupPhoneScreen(controller: SignupPhoneController(
            ref.read(authRepoProvider), ref.read(phoneCooldownProvider))))),      // NAV-AUTH-03
    GoRoute(path: '/signup/otp', builder: (c, s) {
      final extra = s.extra as Map;
      final phone = extra['phone'] as String;
      return Consumer(builder: (c, ref, _) {
        final repo = ref.read(authRepoProvider);
        return OtpScreen(
          phone: phone, purpose: OtpPurpose.signup, cooldown: ref.read(phoneCooldownProvider),
          onResend: () => repo.sendOtp(phone, createUser: true),
          onVerify: (code) => repo.verifyOtp(phone, code),
          onSuccess: () => _afterSignupOtp(c, ref, phone));               // NAV-AUTH-04·05
      });
    }),
    GoRoute(path: '/signup/step3', builder: (c, s) => const SignupProfileScreen()), // NAV-AUTH-08·09
    GoRoute(path: '/duplicate', builder: (c, s) {
      final phone = (s.extra as Map)['phone'] as String;
      return Consumer(builder: (c, ref, _) => DuplicateAccountScreen(
        phone: phone, repo: ref.read(authRepoProvider),
        onLogin: () => c.go('/login', extra: {'phone': phone}),  // NAV-AUTH-06(번호 채워)
        onChangePassword: () => c.go('/new-password'),           // NAV-AUTH-07
        onRecentlyReceived: () => c.push('/phone-change')));     // AUTH-DUP-14
    }),
    GoRoute(path: '/password-find', builder: (c, s) => Consumer(builder: (c, ref, _) =>
        PasswordFindScreen(
          controller: PasswordFindController(ref.read(authRepoProvider)),
          onSent: (phone) => c.push('/password-find/otp', extra: {'phone': phone})))), // NAV-AUTH-13
    GoRoute(path: '/password-find/otp', builder: (c, s) {
      final phone = (s.extra as Map)['phone'] as String;
      return Consumer(builder: (c, ref, _) {
        final repo = ref.read(authRepoProvider);
        return OtpScreen(
          phone: phone, purpose: OtpPurpose.passwordFind, cooldown: ref.read(phoneCooldownProvider),
          onResend: () => repo.sendOtp(phone, createUser: false),
          onVerify: (code) => repo.verifyOtp(phone, code),
          onSuccess: () => c.go('/new-password'));                        // NAV-AUTH-14
      });
    }),
    GoRoute(path: '/new-password', builder: (c, s) => Consumer(builder: (c, ref, _) =>
        NewPasswordScreen(
          controller: NewPasswordController(ref.read(authRepoProvider)),
          onDone: () => c.go('/login')))),  // AUTH-PWNEW-04(로그인 화면으로) — NAV-AUTH-15 갱신
    GoRoute(path: '/phone-change', builder: (c, s) => const PhoneChangeScreen()),
    GoRoute(path: '/reauth', builder: (c, s) {
      final next = s.uri.queryParameters['next'] ?? '/home';
      return Consumer(builder: (c, ref, _) => ReauthScreen(
        controller: ReauthController(ref.read(authRepoProvider)),
        guard: ref.read(sensitiveReauthGuardProvider),
        onPassed: () => c.go(next),        // NAV-GLOBAL-05: 원래 가려던 민감 화면으로
        onForgot: () => c.push('/password-find'))); // NAV-AUTH-17
    }),
    // 보호 화면(홈·예약·가족·이력·설정)은 이후 태스크가 AppShell로 감싼다(NAV-AUTH-19: 인증 전엔 탭 없음).
    ...protectedRoutesPlaceholder,
  ],
);

final GoRouter appRouter = buildAppRouter(); // main.dart가 쓰는 기본 인스턴스
```
> 📌 **`phoneCooldownProvider`·`ConsentScreen`·`SignupPhoneScreen`·`SignupProfileScreen`·`OtpScreen`·`NewPasswordScreen`·`PhoneChangeScreen`은 T12·T13 산출물**을 import한다. `_authRedirect`는 Task 11이 `redirect:` 인라인으로 둔 것을 **이름 있는 함수로 빼기만** 한다(로직 무변경 — `sensitiveReauthGuardProvider`·`profileMissingProvider`·`effectiveAuthProvider`를 그대로 읽는다). `protectedRoutesPlaceholder`는 Task 0 골격의 홈·예약·가족·이력·설정 자리표시자(이후 태스크가 교체).

- [ ] **Step 7c: 실패 테스트(세션 행동)** — `test/features/auth/auth_routes_test.dart`에 이어서

```dart
  testWidgets('[AUTH-SESS-01][NAV-AUTH-09] 자동 로그인 — 다시 켜도 매번 로그인시키지 않는다', (t) async {
    // effectiveAuthProvider가 signedIn이면 보호 경로가 /login으로 튕기지 않는다(리다이렉트 없음).
    final router = buildAppRouter(initialLocation: '/home');
    await t.pumpWidget(ProviderScope(
      overrides: [effectiveAuthProvider.overrideWithValue(AuthStatus.signedIn),
                  profileMissingProvider.overrideWithValue(false)],
      child: MaterialApp.router(routerConfig: router)));
    await t.pumpAndSettle();
    expect(router.routerDelegate.currentConfiguration.uri.path, '/home'); // 로그인으로 안 튕긴다
  });

  test('[AUTH-SESS-02] 갱신표 회전이 켜져 있어 30분마다 로그인하지 않는다', () {
    final cfg = File('supabase/config.toml').readAsStringSync();
    expect(cfg.contains('enable_refresh_token_rotation = true'), isTrue);
  });
```
> ⚠️ `File`을 쓰려면 `import 'dart:io';`. `[AUTH-SESS-02]`는 백엔드 설정 파일을 보는 순수 테스트라 `flutter test`가 아니라 리포 루트에서 도는 편이 낫지만, 경로를 리포 기준으로 열면 함께 통과한다(CI 작업 디렉토리 = 리포 루트).

- [ ] **Step 7d: config.toml 확인** — `supabase/config.toml`

`enable_refresh_token_rotation = true`가 이미 있으면(1단계 기본) 주석만 남기고, 없으면 켠다(AUTH-SESS-02 — 출입증 30분이지만 갱신표로 자동 연장):
```toml
# AUTH-SESS-01·02 — 자동 로그인. JWT는 30분이지만 갱신표(refresh token)가 자동 연장한다.
enable_refresh_token_rotation = true
refresh_token_reuse_interval = 10
```
Run: `cd patient_app && flutter test test/features/auth/auth_routes_test.dart` → Expected: PASS(8 tests).

- [ ] **Step 8: 전체 테스트 + 커밋**

Run: `cd patient_app && flutter test` → Expected: 전체 PASS · `cd backend && pytest`(T13 백엔드 회귀) → Expected: PASS

```bash
git add patient_app/lib/features/auth/auth_repo.dart \
  patient_app/lib/features/auth/login_screen.dart \
  patient_app/lib/features/auth/password_find_screen.dart \
  patient_app/lib/features/auth/duplicate_account_screen.dart \
  patient_app/lib/features/auth/reauth_screen.dart \
  patient_app/lib/features/auth/otp_screen.dart \
  patient_app/lib/core/sensitive_reauth.dart patient_app/lib/core/router.dart \
  supabase/config.toml patient_app/test/
git commit -m "feat: 환자앱 Task 14 — 로그인·비번찾기·중복번호·재인증·세션 + 인증 라우팅 64규칙"
```

> 📌 **규칙 커버리지(64)**: `AUTH-LOGIN-01~09`(9) · `AUTH-PWFIND-01~08`(8) · `AUTH-DUP-01~17`(17) · `AUTH-REAUTH-01~05`(5) · `AUTH-SESS-01~05`(5) · `NAV-AUTH-01~20`(20).
> ⭐ **양방향 악수 갚음**: `sensitiveReauthGuardProvider`·`_isSensitive`(Task 11 라우터가 기다리던 것) 정의 + `/signup/otp` 분기(프로필 없음→③/있음→갈림길)로 가입 라우팅 완성.
> ⚠️ **낡은 단방향 표기 2건 갱신**: `NAV-AUTH-15`(→홈)은 `AUTH-PWNEW-04`(→로그인)로, `NAV-AUTH-16`(도움말 시트)은 `AUTH-PWFIND-06`(번호 변경 push)로 통합 — 둘 다 후행·구체 결정 우선.
>
> 📌 **근거·경계·구조 규칙 — 값이 없어 관측 테스트가 아니라 「어느 테스트가 실현하는가」로 닫는다**(값 없는 규칙은 구현·손검수 몫):
> - **AUTH-DUP 근거·한계 10건** — `AUTH-DUP-01`·`AUTH-DUP-12`(인증 전 아무 말/차단 안 함): `PasswordFindController`·`SignupPhoneController`에 사전 판정 코드가 없다는 구조가 실현(`AUTH-PWFIND-03` 테스트가 같은 원리). `AUTH-DUP-06`·`AUTH-DUP-07`·`AUTH-DUP-08`(흔적·배경·가족 위험 근거): `AUTH-DUP-04`(signOut)·`AUTH-DUP-09`(비밀번호 변경 경로) 테스트가 실현 — 조용한 로그인 대신 흔적이 남는 경로만 연다(문을 3걸음에서 1걸음으로 줄이지 않는다). `AUTH-DUP-10`·`AUTH-DUP-11`(같은 비밀번호 문제 없음·서버 동작 무관): 갈림길이 로그인/재설정 둘로만 갈라 **같은 값을 칠 이유가 없는** 구조가 실현 — 서버가 같은 비밀번호를 거절하는지 확인하지 않아도 결과가 같다. `AUTH-DUP-13`(번호 재활용→재설정 이름 막힘): 갈림길 `[비밀번호 바꾸기]`→`NewPasswordScreen`(이름 칸, T13 `AUTH-PWNEW-08`)이 실현. `AUTH-DUP-15`(문이지 방어 아님): `[비밀번호 바꾸기]`가 눌리되 그 앞을 이름 칸이 막는 구조. `AUTH-DUP-17`(탐지·복구는 병원 쪽): 갭 #44 — staff-web T30·환자 상세, ⑤ 범위 밖(대조표 등록).
> - **AUTH-PWFIND 구조 2건** — `AUTH-PWFIND-02`(한 위젯 세 단계 → 플랜 패치): 라우트가 `/password-find`→`/password-find/otp`→`/new-password` **세 화면**으로 갈라진 구조가 실현. `AUTH-PWFIND-07`(회원가입과 앞 세 칸 같음): `OtpScreen`·번호 화면을 **공유**하고 마지막만 `NewPasswordScreen`으로 가는 라우트가 실현. `AUTH-PWFIND-08`(② 통과 후 앱 꺼짐→그냥 홈): 비밀번호 찾기는 **프로필이 온전한 계정**이라 `profileMissingProvider`가 false → `/signup/step3` 리다이렉트가 걸리지 않는다(가입과 달리 되돌릴 것이 없다) — `[AUTH-SESS-01]` 테스트(signedIn+프로필 있음→튕기지 않음)가 같은 장치를 확인.
> - **AUTH-SESS 구조 2건** — `AUTH-SESS-03`(오프라인+만료→`OFF-AUTH`): Task 11이 소유(여기서 재정의 안 함). `AUTH-SESS-05`(강제 로그아웃 없음): 시간 경과로 로그아웃하는 코드·타이머가 **없다는 것**과 재인증이 민감 경로에만 걸리는 구조(`_isSensitive`)가 실현 — 요구사항 4.1이 「민감한 화면」에만 재인증을 요구했다.
> - **NAV-AUTH 그림 밖 3건** — `NAV-AUTH-18`(딥링크→로그인 후 원목적지): `/login`이 `?next=`를 읽어 성공 후 `go(next)` 하는 배선이 실현(`onSuccess: c.go(next ?? '/home')`). `NAV-AUTH-19`(로그인 전 하단 탭 없음): 인증 라우트에 `AppShell`을 씌우지 않는 구조 — `[NAV-AUTH-19]` 테스트가 `BottomNavigationBar` 부재로 확인. `NAV-AUTH-20`(가입②서 뒤로 여러 번→랜딩, 쿨다운 번호 기준): `push` 체인의 pop과 `PhoneCooldownStore`(번호 키, T12 `BTN-COOL-07`)가 실현 — 쿨다운은 T13 `[AUTH-PHONE-04]`가 이미 확인.

---

## Task 15: 예약 카드 위젯 + 상태 A(공통·요청·대기·미확정·변경) (38규칙)

> **담당 규칙(38)**: `CARD-COMMON-*`(6) · `CARD-REQ-*`(6) · `CARD-WAIT-*`(7 — 04·08은 T8 백엔드가 이미 담음) · `CARD-UNCONF-*`(12) · `CARD-CHG-*`(7). ⭐ **홈(T16)·나의예약(T30)·상세(T21)가 소비할 「예약 카드」 라이브러리의 뼈대와 상태 A 본문을 만드는 태스크**다. 카드는 **머리(이름·배지) / 가운데(132px 고정) / 아래(문진 줄·버튼)** 세 층이고, 상태가 바뀌면 **가운데만 갈아 끼운다**(`CARD-COMMON-06`·`DISP-CARD-01`). 여기서 공통 프레임 + 상태 A(확인 중·진료대기·확정안됨) 본문 + 병원발 변경 안내문을 만들고, **상태 B(확정·도착·진료중·완료·취소·지연·오프라인)는 T17이 같은 `AppointmentCard`에 케이스를 더한다**(양방향 악수).
>
> ⭐⭐ **이 태스크의 심장 = 「병원 내부 상태 이름을 환자 말로 바꾼다」(`CARD-COMMON-04`)**: 서버 `status`는 `예약신청·진료대기·예약부도` 같은 **업무용 이름**이다. 카드는 이것을 절대 그대로 쓰지 않고(`도착`→`접수되었습니다`), 상태 판정 함수 하나(`resolveCardState`)가 서버 상태 + **유예(예약 시각 +30분)**를 합쳐 카드 종류를 정한다. **같은 `예약신청`이 유예 전이면 「확인 중」(`CARD-REQ`), 유예를 넘기면 「확정되지 않음」(`CARD-UNCONF`)**으로 갈리는 것이 이 판정의 핵심이다(`CARD-UNCONF-02` — T17 `CARD-LATE`(확정 예약)와 같은 30분 유예).
>
> ⭐⭐ **두 번째 심장 = 병원발 변경 안내문은 상태와 직교한다(`CARD-CHG`)**: 어떤 카드든 `hospital_change_prev_time`이 `null`이 아니면 카드 **위에 한 덩어리로** 안내문을 얹는다(`DISP-ATT-01`). `[확인]`을 누르면 **서버 두 칸을 비워**(백엔드 `acknowledge_hospital_change`) 안내문이 사라지고, **앱을 껐다 켜도 서버 상태라 다시 뜬다**(`CARD-CHG-04` — 이 앱에서 "봤다는 사실"이 서버에 남는 유일한 곳). 데이터 결정·기각안은 결정 문서 「③ 병원발 변경 안내문 → 데이터 저장 방식」, 경계는 대조표 `#17`.
>
> ⚠️ **경계(재소유 금지)**: ① 카드 프레임·132px·배지·주의 한 줄·안내 붙임은 **Task 0을 소비**(`AppCard(body, announcement)`·`StatusLabel`·`WarnText`·`AppTokens.grayPending/grayDone/warn/cardBodyHeight`). 여기서 다시 만들지 않는다. ② 버튼은 **Task 12를 소비**(`ActionButton` — `[확인]`·`[상담 채팅 연결]` 등). ③ 예약 데이터·대기 인원은 **Task 8을 소비**(`list_my_appointments` dict·`get_queue_status`) — 카드는 서버 계산을 **표시만** 한다(대기 분 계산은 T8, 5분 반올림·`약`은 여기 `formatWaitTime`). ④ **상태 B 본문·QR·문진 줄·오프라인 카드는 T17 소유** — 여기서는 `AppointmentCardState`에 자리만 두고 `unknown`으로 흘린다. ⑤ 목록(여러 카드 배치)은 홈 T16·나의예약 T30 — 여기서는 **카드 한 장**만 만든다.
>
> ⚠️ **낡은 단방향/직교 표기 대조(핸드오프 함정 ①)**: `CARD-WAIT-03`("다른 상태에선 대기 문장을 안 띄운다")은 옛 플랜이 *"상태와 무관하게 항상 그린다"*였던 것을 뒤집은 **후행 결정**(`plans:6751` 패치) — 여기서는 `wait` 본문 안에서만 그 문장을 둔다. `CARD-WAIT-09`("`내 앞 대기 인원: 3명`→`내 앞에 3명`")도 옛 문구를 고치는 패치라, 테스트가 **새 문구**를 못박는다.

**Files:**
- Backend:
  - Modify: `backend/app/services/patient_booking_service.py` — `acknowledge_hospital_change(patient, appointment_id)` 추가(`CARD-CHG-04` — 두 칸을 `null`로, RLS가 소유 확인)
  - Modify: `backend/app/routers/patient_appointments.py`(또는 예약 라우터) — `POST /appointments/{id}/acknowledge-change`
  - Test: `backend/tests/test_patient_booking_service.py`(해당 함수 절 추가)
- Frontend:
  - Create: `patient_app/lib/features/home/appointment_view.dart`(`AppointmentView`+`fromJson` · `QueueStatus` · `AppointmentCardState` enum · `resolveCardState`)
  - Create: `patient_app/lib/core/wait_format.dart`(`formatWaitTime` — `CARD-WAIT-05·06·07`)
  - Create: `patient_app/lib/features/home/appointment_card.dart`(`AppointmentCard` — 공통 프레임 `CARD-COMMON` + 상태→본문 라우팅. T17이 케이스 확장)
  - Create: `patient_app/lib/features/home/card_bodies_a.dart`(`ReqBody`·`WaitBody`·`UnconfBody` — 상태 A 가운데 본문)
  - Create: `patient_app/lib/features/home/hospital_change_banner.dart`(`HospitalChangeBanner` — `CARD-CHG` 안내문)
  - Test: `patient_app/test/features/home/{appointment_view,appointment_card,card_bodies_a,hospital_change_banner}_test.dart` · `test/core/wait_format_test.dart`

**Interfaces:**
- Consumes:
  - Task 0: `AppCard({body, announcement})` · `StatusLabel({text, color})` · `WarnText(text)` · `AppTokens.grayPending`(#7E8E99)·`grayDone`(#A3AFB8)·`warn`·`cardBodyHeight`(132) · `appIcon` · `ApiClient`·`ApiException`
  - Task 12: `ActionButton({label, onPressed, busy})`
  - Task 8: `list_my_appointments` dict(`status·booking_code·for_patient_name·slot_date·start_time·hospital_change_prev_time·hospital_change_kind·has_questionnaire` 등) · `get_queue_status`(`patients_ahead`·`estimated_wait_minutes`) · 직원웹 T2가 만든 `appointments.hospital_change_prev_time·hospital_change_kind` 칸
  - Task 2: `PatientContext`·`get_current_patient` · `acquire_as`·`AppError`
- Produces:
  - `AppointmentView`(`.fromJson`) · `QueueStatus` · `enum AppointmentCardState { req, wait, unconf, confirmed, arrived, inTreatment, done, cancelled, late, unknown }`(A만 구현·B는 T17) · `resolveCardState(AppointmentView, DateTime now) -> AppointmentCardState`
  - `formatWaitTime({required int patientsAhead, int? minutes}) -> String` · `AppointmentCard({required AppointmentView view, QueueStatus? queue, VoidCallback? onAcknowledge})` · `HospitalChangeBanner`
  - 백엔드 `acknowledge_hospital_change(patient, appointment_id) -> None`
  - **T16(홈)이 소비**: `AppointmentCard`·`resolveCardState`·`AppointmentView.fromJson` · **T17이 확장**: `AppointmentCard`의 상태 B 케이스·`AppointmentCardState`의 B 상태 본문

- [ ] **Step 1: 백엔드 [확인] 창구 실패 테스트 (`CARD-CHG-04`)** — `backend/tests/test_patient_booking_service.py`

```python
@pytest.mark.asyncio
async def test_acknowledge_hospital_change_clears_both_columns(db_conn):
    # CARD-CHG-04: 환자가 [확인]하면 두 칸이 비고, 그래야 앱을 껐다 켜도 안내문이 다시 뜨지 않는다.
    admin, doctor_id, dept = await _seed_doctor_dept(db_conn)
    me = _ctx(await seed_patient(db_conn))
    aid = await db_conn.fetchval(
        "insert into appointments (account_patient_id, for_patient_id, department_id, doctor_id, status, source, "
        "  hospital_change_prev_time, hospital_change_kind) "
        "values ($1,$1,$2,$3,'예약확정','app', now(), 'changed') returning id", me.id, dept, doctor_id)
    await booking.acknowledge_hospital_change(me, aid)
    row = await db_conn.fetchrow(
        "select hospital_change_prev_time, hospital_change_kind from appointments where id=$1", aid)
    assert row["hospital_change_prev_time"] is None and row["hospital_change_kind"] is None
```
Run → Expected: FAIL(함수 없음).

- [ ] **Step 2: `acknowledge_hospital_change` 구현** — `backend/app/services/patient_booking_service.py`

```python
async def acknowledge_hospital_change(patient: PatientContext, appointment_id: UUID) -> None:
    """CARD-CHG-04: 병원발 변경/취소 안내문의 [확인]. 두 칸을 비운다(RLS가 본인+가족만 통과).
    스키마 칸은 직원웹 T2가 만들고 reschedule/병원발 취소가 채운다(경계 #17) — 여기선 비우기만."""
    async with acquire_as(str(patient.auth_user_id)) as conn:
        await conn.execute(
            "update appointments set hospital_change_prev_time=null, hospital_change_kind=null where id=$1",
            appointment_id)  # RLS: patients_can_update_own_appointments 범위 밖이면 0행(조용히 통과)
```
Run → Expected: PASS.

- [ ] **Step 3: 라우터 배선 + 테스트** — `POST /appointments/{id}/acknowledge-change`

```python
@router.post("/appointments/{appointment_id}/acknowledge-change", status_code=204)
async def acknowledge_change(appointment_id: UUID, patient: PatientContext = Depends(get_current_patient)):
    await patient_booking_service.acknowledge_hospital_change(patient, appointment_id)
```
Test: 라우터가 서비스를 그대로 노출하는지(`patch`로 서비스 호출 1회 확인). Run → PASS.

- [ ] **Step 4: `formatWaitTime` 실패 테스트 (`CARD-WAIT-05·06·07`)** — `patient_app/test/core/wait_format_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/wait_format.dart';

void main() {
  test('[CARD-WAIT-05] 내 앞 0명이면 분이 아니라 곧 들어가십니다', () {
    expect(formatWaitTime(patientsAhead: 0, minutes: 0), '곧 들어가십니다');
  });
  test('[CARD-WAIT-06] 60분을 넘으면 정확한 분 대신 약 1시간 이상', () {
    expect(formatWaitTime(patientsAhead: 5, minutes: 75), '예상 대기시간 약 1시간 이상');
  });
  test('[CARD-WAIT-07] 5분 단위로 반올림하고 약을 반드시 붙인다', () {
    expect(formatWaitTime(patientsAhead: 2, minutes: 23), '예상 대기시간 약 25분'); // 23→25 반올림, 약
  });
  test('[CARD-WAIT-04] 근거 분이 없으면(null) 대기시간 줄을 만들지 않는다', () {
    expect(formatWaitTime(patientsAhead: 2, minutes: null), ''); // 인원만 보이고 시간 문구는 빈 문자열
  });
}
```
Run → Expected: FAIL(함수 없음).

- [ ] **Step 5: `formatWaitTime` 구현** — `patient_app/lib/core/wait_format.dart`

```dart
/// 대기 문구 표시 규칙. 서버(T8)는 raw 분만 주고, 5분 반올림·`약`·경계 문구는 여기서 입힌다.
/// CARD-WAIT-05(0명=곧)·06(60분 초과=약 1시간 이상)·07(5분 반올림+약)·04(근거 없음=빈 줄).
String formatWaitTime({required int patientsAhead, int? minutes}) {
  if (patientsAhead == 0) return '곧 들어가십니다';        // WAIT-05
  if (minutes == null) return '';                          // WAIT-04: 숫자를 만들지 않는다
  if (minutes > 60) return '예상 대기시간 약 1시간 이상';   // WAIT-06
  final rounded = ((minutes + 2) ~/ 5) * 5;               // WAIT-07: 5분 반올림
  return '예상 대기시간 약 $rounded분';                     // WAIT-07: `약`을 반드시
}
```
Run → Expected: PASS.

- [ ] **Step 6: `AppointmentView` + `resolveCardState` 실패 테스트 (`CARD-REQ-01`·`CARD-UNCONF-02`·`CARD-COMMON-04`)** — `test/features/home/appointment_view_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';

AppointmentView _v(String status, {DateTime? slot}) => AppointmentView.fromJson({
      'id': 'a1', 'status': status, 'for_patient_name': '김순자', 'booking_code': null,
      'department_name': '내과', 'doctor_name': '이의사', 'has_questionnaire': false,
      'slot_date': slot?.toIso8601String().substring(0, 10), 'start_time': slot == null ? null : '14:00',
      'hospital_change_prev_time': null, 'hospital_change_kind': null,
    });

void main() {
  final base = DateTime(2026, 8, 18, 14, 0);

  test('[CARD-REQ-01] 예약신청이고 유예(30분) 전이면 확인 중 카드', () {
    expect(resolveCardState(_v('예약신청', slot: base), base.add(const Duration(minutes: 10))),
        AppointmentCardState.req);
  });
  test('[CARD-UNCONF-02] 예약신청인 채 예약 시각 +30분을 넘기면 확정되지 않음 카드', () {
    expect(resolveCardState(_v('예약신청', slot: base), base.add(const Duration(minutes: 31))),
        AppointmentCardState.unconf);
  });
  test('[CARD-WAIT-03] 진료대기 상태만 wait 본문을 받는다(다른 상태엔 대기 문장이 없다)', () {
    expect(resolveCardState(_v('진료대기'), base), AppointmentCardState.wait);
    expect(resolveCardState(_v('예약확정', slot: base), base), isNot(AppointmentCardState.wait));
  });
  test('[CARD-COMMON-04] 카드 상태 라벨은 병원 내부 이름을 그대로 노출하지 않는다', () {
    // 서버 내부 이름 '진료대기'가 상태 라벨 문구에 그대로 나오지 않는다(환자 말로 바꾼다).
    expect(patientStatusLabel(AppointmentCardState.wait), isNot(contains('진료대기')));
  });
}
```
Run → Expected: FAIL.

- [ ] **Step 7: `AppointmentView` + `resolveCardState` 구현** — `patient_app/lib/features/home/appointment_view.dart`

```dart
/// T8 list_my_appointments 한 줄을 담는 뷰 모델. 서버 status를 화면이 직접 읽지 않게 감싼다.
class AppointmentView {
  final String id, status, forPatientName, departmentName, doctorName;
  final String? bookingCode;
  final DateTime? slotStart;                  // slot_date + start_time
  final DateTime? hospitalChangePrevTime;     // CARD-CHG: null이면 미확인 변경 없음
  final String? hospitalChangeKind;           // 'changed' | 'cancelled'
  final bool hasQuestionnaire;
  AppointmentView({required this.id, required this.status, required this.forPatientName,
      required this.departmentName, required this.doctorName, this.bookingCode,
      this.slotStart, this.hospitalChangePrevTime, this.hospitalChangeKind,
      required this.hasQuestionnaire});

  factory AppointmentView.fromJson(Map<String, dynamic> j) {
    DateTime? slot;
    if (j['slot_date'] != null && j['start_time'] != null) {
      slot = DateTime.parse('${j['slot_date']}T${j['start_time']}');
    }
    return AppointmentView(
      id: j['id'], status: j['status'], forPatientName: j['for_patient_name'],
      departmentName: j['department_name'], doctorName: j['doctor_name'],
      bookingCode: j['booking_code'], slotStart: slot, hasQuestionnaire: j['has_questionnaire'] == true,
      hospitalChangePrevTime: j['hospital_change_prev_time'] == null
          ? null : DateTime.parse(j['hospital_change_prev_time']),
      hospitalChangeKind: j['hospital_change_kind'],
    );
  }
  bool get isConfirmedBefore => status != '예약신청';  // COMMON-02/03: 확정 전/후 용어 분기
}

enum AppointmentCardState { req, wait, unconf, confirmed, arrived, inTreatment, done, cancelled, late, unknown }

/// 서버 status + 30분 유예로 카드 종류를 정한다. 상태 A만 여기서 확정, B는 T17이 채운다.
AppointmentCardState resolveCardState(AppointmentView v, DateTime now) {
  final grace = v.slotStart?.add(const Duration(minutes: 30));   // CARD-UNCONF-02 · T17 CARD-LATE와 같은 유예
  switch (v.status) {
    case '예약신청':
      if (grace != null && now.isAfter(grace)) return AppointmentCardState.unconf;  // UNCONF-02
      return AppointmentCardState.req;                                              // REQ-01
    case '진료대기':
      return AppointmentCardState.wait;
    default:
      return AppointmentCardState.unknown;   // 상태 B — T17이 case를 더한다
  }
}

/// CARD-COMMON-04: 내부 상태 이름을 환자 말로. (상태 A 배지 문구)
String patientStatusLabel(AppointmentCardState s) => switch (s) {
      AppointmentCardState.req => '확인 중',            // CARD-REQ-02
      AppointmentCardState.wait => '진료를 기다리는 중', // '진료대기'를 쓰지 않는다
      AppointmentCardState.unconf => '확정되지 않음',    // CARD-UNCONF-03·03b
      _ => '',
    };
```
Run → Expected: PASS.

- [ ] **Step 8: `AppointmentCard` 공통 프레임 실패 테스트 (`CARD-COMMON`)** — `test/features/home/appointment_card_test.dart`

```dart
testWidgets('[CARD-COMMON-01] 카드는 누구의 예약인지(대상자 이름)를 먼저 쓴다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _req(name: '김순자', code: 'A-2413'))));
  expect(find.textContaining('김순자'), findsOneWidget);      // 대상자 이름이 보인다
});
testWidgets('[CARD-COMMON-02] 확정 전에는 신청번호 · 신청 취소로 부른다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _req(code: 'A-2413'))));
  expect(find.textContaining('신청번호'), findsOneWidget);    // 예약번호가 아니라 신청번호
});
testWidgets('[CARD-COMMON-03] 확정 후에는 예약번호로 부른다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _wait(code: 'A-2413'))));
  expect(find.textContaining('예약번호'), findsOneWidget);
});
testWidgets('[CARD-COMMON-05] 상태는 색만이 아니라 배지 글자로도 구분된다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _req())));
  expect(find.widgetWithText(StatusLabel, '확인 중'), findsOneWidget);  // 글자 배지 존재
});
testWidgets('[CARD-COMMON-06] 가운데 본문은 132px로 고정된다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _req())));
  expect(tester_bodyHeight(t), AppTokens.cardBodyHeight);   // 상태가 바뀌어도 높이 불변
});
```
Run → Expected: FAIL.

- [ ] **Step 9: `AppointmentCard` 공통 프레임 구현** — `patient_app/lib/features/home/appointment_card.dart`

```dart
/// 예약 카드 공통 프레임. 머리(이름·배지) + 가운데(AppCard body 132px) + 아래(버튼).
/// 병원발 변경 안내문은 상태와 직교하게 announcement로 얹는다(CARD-CHG-01·05).
class AppointmentCard extends StatelessWidget {
  final AppointmentView view;
  final QueueStatus? queue;
  final VoidCallback? onAcknowledge;
  const AppointmentCard({super.key, required this.view, this.queue, this.onAcknowledge});

  @override
  Widget build(BuildContext context) {
    final state = resolveCardState(view, DateTime.now());
    final numberLabel = view.isConfirmedBefore ? '예약번호' : '신청번호';  // COMMON-02/03
    return AppCard(
      announcement: view.hospitalChangePrevTime == null
          ? null
          : HospitalChangeBanner(view: view, onConfirm: onAcknowledge),  // CARD-CHG-01·05
      body: Column(children: [
        Row(children: [
          Text('${view.forPatientName} · $numberLabel ${view.bookingCode ?? ''}'),  // COMMON-01
          StatusLabel(text: patientStatusLabel(state), color: _railColor(state)),   // COMMON-04·05
        ]),
        SizedBox(height: AppTokens.cardBodyHeight, child: _cardBody(state)),         // COMMON-06
        _actions(state),
      ]),
    );
  }

  Color _railColor(AppointmentCardState s) => switch (s) {
        AppointmentCardState.req => AppTokens.grayPending,     // CARD-REQ-02 (#7E8E99)
        AppointmentCardState.unconf => AppTokens.grayPending,  // CARD-UNCONF-03 (옅은 회색 계열)
        _ => AppTokens.grayDone,
      };

  Widget _cardBody(AppointmentCardState s) => switch (s) {
        AppointmentCardState.req => const ReqBody(),
        AppointmentCardState.wait => WaitBody(queue: queue),
        AppointmentCardState.unconf => const UnconfBody(),
        _ => const SizedBox.shrink(),   // 상태 B — T17이 채운다
      };
  // _actions: 상태별 버튼. 상태 A 규칙은 각 본문 스텝에서 못박는다.
}
```
Run → Expected: PASS.

- [ ] **Step 10: `ReqBody`(확인 중) 실패 테스트 → 구현 (`CARD-REQ`)** — `test/features/home/card_bodies_a_test.dart`

```dart
testWidgets('[CARD-REQ-03] 확인 중에는 QR을 그리지 않고 안내 문구를 둔다', (t) async {
  await t.pumpWidget(_wrap(const ReqBody()));
  expect(find.textContaining('확정되면 여기에 접수용 QR이 나타납니다'), findsOneWidget);
  expect(find.byType(QrImageView), findsNothing);            // QR 위젯 없음
});
testWidgets('[CARD-REQ-04] 카드 위 안내는 병원이 확인하는 중임을 알린다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _req())));
  expect(find.textContaining('병원이 확인하는 중입니다. 확정되면 알림을 보내드립니다.'), findsOneWidget);
});
testWidgets('[CARD-REQ-05] 소요 시간을 약속하지 않는다(보통 1~2시간 금지)', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _req())));
  expect(find.textContaining('시간'), findsNothing);         // 소요 시간 추정 문구 없음
});
testWidgets('[CARD-REQ-06] 여러 줄 목록의 QR 버튼 자리에는 확인 중 글자가 온다', (t) async {
  await t.pumpWidget(_wrap(ReqBody(compact: true)));
  expect(find.text('확인 중'), findsOneWidget);
});
```
> 구현: `ReqBody`는 점선 빈칸 + `확정되면 여기에 접수용 QR이 나타납니다`(REQ-03), 카드 위 `WarnText('병원이 확인하는 중입니다. 확정되면 알림을 보내드립니다.')` + 시계 아이콘(REQ-04, `AppointmentCard`가 `req`일 때 announcement가 아닌 상단 안내로 얹음). **소요 시간 문구를 두지 않는다**(REQ-05). `compact`면 `[QR]` 자리에 `확인 중`(REQ-06). REQ-01("직원확인후확정 병원만")은 서버가 `예약신청`을 줄 때만 이 본문이 뜨는 구조로 실현(즉시확정이면 이 상태가 오지 않는다).
Run → Expected: FAIL → 구현 → PASS.

- [ ] **Step 11: `WaitBody`(진료대기) 실패 테스트 → 구현 (`CARD-WAIT`)** — 같은 파일

```dart
testWidgets('[CARD-WAIT-01] 대기 본문은 내 앞 인원 + 예상 대기시간 + 변동 안내를 함께 보인다', (t) async {
  await t.pumpWidget(_wrap(WaitBody(queue: const QueueStatus(patientsAhead: 3, estimatedWaitMinutes: 25))));
  expect(find.textContaining('내 앞에 3명'), findsOneWidget);
  expect(find.textContaining('예상 대기시간 약 25분'), findsOneWidget);
});
testWidgets('[CARD-WAIT-02] 마지막 문장은 요구사항 4.5 문장을 글자 그대로 쓴다', (t) async {
  await t.pumpWidget(_wrap(WaitBody(queue: const QueueStatus(patientsAhead: 3, estimatedWaitMinutes: 25))));
  expect(find.text('예상 대기시간은 변동될 수 있습니다'), findsOneWidget);   // 글자 그대로
});
testWidgets('[CARD-WAIT-09] 내 앞 인원 문구는 내 앞에 N명 형식이다(내 앞 대기 인원: 아님)', (t) async {
  await t.pumpWidget(_wrap(WaitBody(queue: const QueueStatus(patientsAhead: 3, estimatedWaitMinutes: null))));
  expect(find.textContaining('내 앞에 3명'), findsOneWidget);
  expect(find.textContaining('내 앞 대기 인원'), findsNothing);
});
```
> 구현: `WaitBody`는 `내 앞에 ${queue.patientsAhead}명`(WAIT-01·09) + `formatWaitTime(...)`(빈 문자열이면 그 줄을 접는다, WAIT-04) + 고정 문장 `예상 대기시간은 변동될 수 있습니다`(WAIT-02). 이 문장은 **wait 본문 안에만** 있어 다른 상태에는 나오지 않는다(WAIT-03 — `resolveCardState` Step 6 테스트가 상태 격리를 못박음).
Run → Expected: FAIL → 구현 → PASS.

- [ ] **Step 12: `UnconfBody`(확정되지 않음) 실패 테스트 → 구현 (`CARD-UNCONF`)** — 같은 파일

```dart
testWidgets('[CARD-UNCONF-03] 확정되지 않음 카드는 옅은 회색 + 확정되지 않음 배지', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _unconf())));
  expect(find.widgetWithText(StatusLabel, '확정되지 않음'), findsOneWidget);
});
testWidgets('[CARD-UNCONF-03b] 시간 지남이 아니라 확정되지 않음으로 부른다(세 화면 같은 이름)', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _unconf())));
  expect(find.textContaining('시간 지남'), findsNothing);
});
testWidgets('[CARD-UNCONF-04][CARD-UNCONF-04b] 원인 먼저 — 확인이 끝나지 않았음을 먼저, 할 일을 나중에', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _unconf())));
  final cause = tester.getTopLeft(find.text('병원 확인이 끝나지 않았습니다')).dy;
  final todo = tester.getTopLeft(find.text('병원에 연락해 주세요')).dy;
  expect(cause < todo, isTrue);      // 원인이 위, 할 일이 아래
});
testWidgets('[CARD-UNCONF-05] 가운데는 점선 빈칸 + 아직 확정되지 않아 접수용 QR이 없습니다', (t) async {
  await t.pumpWidget(_wrap(const UnconfBody()));
  expect(find.textContaining('아직 확정되지 않아 접수용 QR이 없습니다'), findsOneWidget);
  expect(find.byType(QrImageView), findsNothing);
});
testWidgets('[CARD-UNCONF-06] 버튼은 상담 채팅 연결 · 병원 전화', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _unconf())));
  expect(find.widgetWithText(ActionButton, '상담 채팅 연결'), findsOneWidget);
  expect(find.widgetWithText(ActionButton, '병원 전화'), findsOneWidget);
});
testWidgets('[CARD-UNCONF-06b] 다시 예약하기 버튼을 두지 않는다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _unconf())));
  expect(find.textContaining('다시 예약'), findsNothing);   // 중복 예약 방지
});
testWidgets('[CARD-UNCONF-07] 문진 줄이 사라진다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _unconf(hasQuestionnaire: true))));
  expect(find.textContaining('사전문진'), findsNothing);
});
testWidgets('[CARD-UNCONF-08] 번호는 신청번호로 부른다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _unconf(code: 'A-2413'))));
  expect(find.textContaining('신청번호'), findsOneWidget);
});
testWidgets('[CARD-UNCONF-09] 금지 문구 — 안 오셨습니다·예약 부도·오늘 안에·소요시간을 쓰지 않는다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _unconf())));
  for (final banned in ['안 오셨습니다', '예약 부도', '오늘 안에']) {
    expect(find.textContaining(banned), findsNothing);
  }
});
testWidgets('[CARD-UNCONF-09b] 사과 문장을 앱이 쓰지 않는다(사과는 병원 몫)', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _unconf())));
  expect(find.textContaining('죄송'), findsNothing);
});
testWidgets('[CARD-UNCONF-11] 확정되지 않음은 끝난 카드가 아니다(살아 있는 카드)', (t) async {
  // isFinishedCard는 진료완료·취소됨만 true(CARD-LIFE, T17 소유) — A에서 unconf가 false임을 못박는다.
  expect(isFinishedCard(AppointmentCardState.unconf), isFalse);
});
```
> 구현: `UnconfBody`는 점선 빈칸 + `아직 확정되지 않아 접수용 QR이 없습니다`(UNCONF-05·QR 없음). 카드 위 `WarnText` **두 줄**(원인 `병원 확인이 끝나지 않았습니다` → 할 일 `병원에 연락해 주세요`, UNCONF-04·04b). 버튼 `[상담 채팅 연결]`·`[병원 전화]`(UNCONF-06), `[다시 예약하기]` 없음(UNCONF-06b). 문진 줄 제거(UNCONF-07), 신청번호(UNCONF-08), 금지·사과 문구 없음(UNCONF-09·09b). `UNCONF-01`(직원확인후확정만)·`10`(자정 이후 이력행 — T8 이력이 담당·T15 카드는 자정 전만)·`12`(애초에 안 생기게 — 백엔드 auto_confirm·직원웹 /today, 화면은 마지막 그물)은 **구조로 실현**: 카드는 서버가 `예약신청` + 유예 경과를 줄 때만 그리고, 예방은 서버 몫이라 여기 코드가 없다는 사실이 곧 규칙 준수(완료 보고에 명시).
Run → Expected: FAIL → 구현 → PASS.

- [ ] **Step 13: `HospitalChangeBanner`(병원발 변경) 실패 테스트 → 구현 (`CARD-CHG`)** — `test/features/home/hospital_change_banner_test.dart`

```dart
testWidgets('[CARD-CHG-02] 변경 안내는 전·후 시각을 함께 보이고 [확인]을 둔다', (t) async {
  await t.pumpWidget(_wrap(HospitalChangeBanner(
      view: _changed(prev: DateTime(2026, 8, 18, 14, 30), next: DateTime(2026, 8, 18, 16, 0)), onConfirm: () {})));
  expect(find.textContaining('병원 사정으로 시간이 변경되었습니다'), findsOneWidget);
  expect(find.textContaining('오후 2:30 → 오후 4:00'), findsOneWidget);   // 전 → 후
  expect(find.widgetWithText(ActionButton, '확인'), findsOneWidget);
});
testWidgets('[CARD-CHG-03] 카드 본문은 이미 새 시간으로 그리고 배지는 확정됨 그대로', (t) async {
  final v = _changed(prev: DateTime(2026, 8, 18, 14, 30), next: DateTime(2026, 8, 18, 16, 0)); // status 예약확정
  await t.pumpWidget(_wrap(AppointmentCard(view: v)));
  expect(find.textContaining('오후 4:00'), findsWidgets);   // 본문 시각은 새 시간
});
testWidgets('[CARD-CHG-04] [확인]을 누르면 onConfirm(=서버 acknowledge)이 불린다', (t) async {
  var acked = false;
  await t.pumpWidget(_wrap(HospitalChangeBanner(
      view: _changed(prev: DateTime(2026, 8, 18, 14, 30), next: DateTime(2026, 8, 18, 16, 0)),
      onConfirm: () => acked = true)));
  await t.tap(find.widgetWithText(ActionButton, '확인'));
  expect(acked, isTrue);   // 두 칸을 비우는 서버 호출로 이어진다(껐다 켜도 안 뜸)
});
testWidgets('[CARD-CHG-06] 병원발 취소는 예약이 취소되었음을 알리고 [새로 예약하기]를 준다', (t) async {
  await t.pumpWidget(_wrap(HospitalChangeBanner(view: _cancelled(), onConfirm: () {})));
  expect(find.textContaining('병원 사정으로 예약이 취소되었습니다'), findsOneWidget);
  expect(find.widgetWithText(ActionButton, '새로 예약하기'), findsOneWidget);
});
testWidgets('[CARD-CHG-01][CARD-CHG-05] 안내문은 그 카드 위에 간격 없이 한 덩어리로 붙는다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _changed(
      prev: DateTime(2026, 8, 18, 14, 30), next: DateTime(2026, 8, 18, 16, 0)))));
  // AppCard.announcement 슬롯(DISP-ATT-01)에 배너가 들어가 카드와 간격 0으로 붙는다.
  expect(find.byType(HospitalChangeBanner), findsOneWidget);
});
```
> 구현: `HospitalChangeBanner`는 `hospitalChangeKind`로 갈린다 — `'changed'`면 `병원 사정으로 시간이 변경되었습니다` + `${fmt(prev)} → ${fmt(slotStart)}`(CHG-02) + `[확인]`(→`onConfirm`, CHG-04); `'cancelled'`면 `병원 사정으로 예약이 취소되었습니다` + `[새로 예약하기]`(CHG-06). 카드는 이 배너를 `AppCard.announcement`로 얹어 간격 0(CHG-01·05·`DISP-ATT-01`), 본문은 이미 새 시간(CHG-03). `CARD-CHG-07`(방아쇠=낙관적 잠금 #12)은 **데이터로 실현** — 직원웹 `reschedule_appointment`가 옛 시각을 `hospital_change_prev_time`에 넣어야만 배너가 뜬다(그 칸이 null이면 안 뜬다). 시각 포맷 `오후 h:mm`은 `formatKoreanTime` 헬퍼(wait_format.dart 옆).
Run → Expected: FAIL → 구현 → PASS.

- [ ] **Step 14: 전체 테스트 + 커밋**

```bash
cd backend && pytest tests/test_patient_booking_service.py -v
cd ../patient_app && flutter test test/features/home/ test/core/wait_format_test.dart
git add backend/app/services/patient_booking_service.py backend/app/routers/ backend/tests/ \
  patient_app/lib/features/home/ patient_app/lib/core/wait_format.dart patient_app/test/
git commit -m "feat: 환자앱 Task 15 — 예약 카드 위젯 + 상태 A(공통·요청·대기·확정안됨·병원발변경) 38규칙 + CARD-CHG 두 칸(#17)"
```

> 📌 **규칙 커버리지(38)**: `CARD-COMMON-01~06`(6) · `CARD-REQ-01~06`(6) · `CARD-WAIT-01·02·03·05·06·07·09`(7 — 04·08은 T8 백엔드가 담음) · `CARD-UNCONF-01~12`(12) · `CARD-CHG-01~07`(7).
> ⭐ **경계 갭 #17 갚음**: `hospital_change_prev_time·hospital_change_kind` 두 칸으로 CARD-CHG 실현 — 읽기(T8 조회)·비우기(T15 `acknowledge_hospital_change`)는 여기, 채우기는 직원웹 T2(소급). 결정·기각안은 결정 문서 「③ 병원발 변경 안내문」.
> 📌 **값 없는/구조 규칙 — 「어느 테스트가 실현하는가」로 닫는다**: `CARD-REQ-01`·`CARD-UNCONF-01`(직원확인후확정 병원만): 서버가 `예약신청`을 줄 때만 본문이 뜨는 구조(`resolveCardState`)가 실현 — 즉시확정이면 이 상태가 오지 않는다. `CARD-UNCONF-10`(자정 이후 이력행): T8 `list_visit_history`가 담당(카드는 자정 전만 그림). `CARD-UNCONF-11`(끝난 카드 아님): `isFinishedCard(unconf)=false` 테스트가 실현(`CARD-LIFE`는 T17). `CARD-UNCONF-12`(애초에 안 생기게): 예방은 서버(auto_confirm 기본 true·직원웹 /today) 몫이라 화면에 코드가 없다는 사실이 규칙 — 화면은 마지막 그물. `CARD-CHG-07`(방아쇠=#12 낙관적 잠금): `hospital_change_prev_time`이 채워질 때만 배너가 뜨는 데이터 조건이 실현.
> ⚠️ **T17이 이어받을 자리**: `AppointmentCard._cardBody`·`_actions`의 상태 B 케이스(`confirmed·arrived·inTreatment·done·cancelled·late`) + `AppointmentCardState`의 B 본문 + `isFinishedCard`(CARD-LIFE, 진료완료·취소됨만 true) + QR·문진 줄·오프라인 카드.

---

## Task 16: 홈 프레임 + 하단 탭 셸 (43규칙)

> **담당 규칙(43)**: `HOME-ROLE-*`(1) · `HOME-SCOPE-*`(3) · `HOME-CARD-*`(4) · `HOME-INFO-*`(3) · `HOME-EMPTY-*`(3) · `HOME-BAR-*`(3) · `HOME-KILL-*`(2) · `HOME-REFRESH-*`(3) · `NAV-HOME-*`(21). ⭐ **로그인 후 첫 화면 + 앱 전체의 탭 골격을 만드는 태스크**다. T15의 `AppointmentCard`를 **배치**(여러 예약을 하루치로)하고, T11의 `AppShell`에 홈 본문·하단 탭을 끼우며, NAV-HOME 21개로 홈에서 갈 수 있는 모든 곳을 라우트로 잇는다.
>
> ⭐⭐ **이 태스크의 심장 = 「가장 가까운 하루치만」(`HOME-SCOPE-01`)**: 홈은 "다음에 갈 곳"만 보여준다(`HOME-ROLE-01`) — 오늘 예약이 있으면 오늘 것, 없으면 **다음 예약이 있는 날 하루치**만. **그 뒤의 예약은 끌어오지 않는다**(`HOME-SCOPE-02·03`) — 자정이면 저절로 다음 예약이 주인공이 되고, 놓칠 위험은 이미 전날·당일 알림 2종이 막는다(사용자 되물음 *"내일 예약을 보여줘야 할 이유가 있나?"*로 확정, B-9). ⚠️ **옛 플랜은 `list.first`로 첫 건만 꺼냈다**(`HOME-CARD-04`, 갭 — 서버는 목록을 주므로 앱만 고친다). `selectHomeDay`가 하루치 **전부**를 골라 1건이면 히어로 카드, 2건+면 사람별 줄로 묶는다.
>
> ⭐⭐ **두 번째 심장 = 탭을 막지 않는다(`AppShell`·`NAV-GLOBAL-02`)**: 하단 탭은 오프라인에도 눌린다(막으면 "끌 수 없는 스위치"·고장으로 읽힘). 홈이 오프라인이면 탭을 죽이는 대신 **`UpcomingCache`(폰에 저장한 예약 보관본)**를 읽어 카드를 그대로 보여준다(`OFF-DO-01`) — 지하 대기실이 오프라인 결정의 출발점이었다.
>
> ⚠️ **경계(재소유 금지)**: ① 셸·배너·오프라인 캐시·인증 판정은 **Task 11 소비**(`AppShell({body, bottomTabs})`·`UpcomingCache`·`upcomingCacheProvider`·`CachedUpcoming`·`effectiveAuthProvider`·`connectivityProvider`). ② 예약 카드 한 장·상태 판정은 **Task 15 소비**(`AppointmentCard`·`AppointmentView.fromJson`·`resolveCardState`) — 여기서는 **여러 장을 배치**만. ③ 빈 상태·미완료 신청 카드는 **Task 12 소비**(`EmptyState.zero/offline/error`·`PendingRequestCard`·`pendingRequestProvider`). ④ 예약 목록·병원 정보는 **Task 8·4 소비**(`list_my_appointments`·`get_queue_status`·`get_hospital_info`). ⑤ 안 읽은 알림 개수(`HOME-BAR-02`)·알림함 화면·알림→목적지 구현(`NAV-HOME-16·17`)은 **Task 18 소유** — 여기서는 `unreadNotificationCountProvider`를 **소비**하고 종 배지·라우트만 만든다(양방향 악수).
>
> ⚠️ **낡은 단방향 표기 대조(핸드오프 함정 ①)**: `HOME-CARD-04`·`HOME-BAR-03`·`HOME-INFO`의 근거가 옛 플랜 줄번호(`plans:6640·6705·6762`)를 가리키는데, 이는 *"플랜을 고쳐야 한다"*는 **패치 지시**(옛 코드가 `list.first`·종 없음)이고 여기 재작성이 그 패치의 실현이다.

**Files:**
- Create: `patient_app/lib/features/home/home_scope.dart`(`selectHomeDay` — `HOME-ROLE-01`·`HOME-SCOPE-*`·`HOME-CARD-04` 순수 함수)
- Create: `patient_app/lib/features/home/home_data.dart`(`homeAppointmentsProvider` — 온라인 `list_my_appointments`+캐시 저장 / 오프라인 `UpcomingCache` 폴백)
- Create: `patient_app/lib/features/home/home_screen.dart`(`HomeScreen` — 카드 배치·앱바·빈 상태·미완료 신청·갱신)
- Create: `patient_app/lib/features/home/home_multi_card.dart`(`HomeMultiCard` — `HOME-CARD-02·03` 사람별 줄)
- Create: `patient_app/lib/features/home/hospital_info_row.dart`(`HospitalInfoRow` — `HOME-INFO-*`)
- Create: `patient_app/lib/features/home/notification_bell.dart`(`NotificationBell` — `HOME-BAR-01·02`, `unreadNotificationCountProvider` 소비)
- Create: `patient_app/lib/features/home/main_tabs.dart`(`mainTabs` — 하단 탭 5개, `DISP-ICON-03` 라벨)
- Modify: `patient_app/lib/core/router.dart`(`/home`을 `AppShell`+`HomeScreen`으로 + `NAV-HOME-*` 라우트)
- Test: `patient_app/test/features/home/{home_scope,home_data,home_screen,home_multi_card,hospital_info_row,notification_bell}_test.dart` · `test/features/home/home_routes_test.dart`

**Interfaces:**
- Consumes:
  - Task 0: `AppTokens`·`appIcon`·`ApiClient`
  - Task 8: `list_my_appointments`(dict 목록) · `get_queue_status`
  - Task 4: `get_hospital_info(patient) -> {hospital_address, hospital_phone}`
  - Task 11: `AppShell({body, bottomTabs})`·`UpcomingCache`(save/read/clear)·`upcomingCacheProvider`·`CachedUpcoming`(items·savedAt·isStale)·`effectiveAuthProvider`·`connectivityProvider`·`OfflineBanner`
  - Task 12: `EmptyState.zero/offline/error`·`PendingRequestCard`·`pendingRequestProvider`
  - Task 15: `AppointmentCard`·`AppointmentView`(`.fromJson`)·`resolveCardState`·`formatKoreanTime`
  - Task 18(미작성): `unreadNotificationCountProvider`(`Provider<int>` — 종 배지가 소비, T18이 채운다)
- Produces:
  - `selectHomeDay(List<AppointmentView>, DateTime now) -> List<AppointmentView>` (가장 가까운 하루치, 정렬 완료·빈 리스트면 0건)
  - `homeAppointmentsProvider`(`FutureProvider<List<AppointmentView>>`) · `HomeScreen` · `HomeMultiCard` · `HospitalInfoRow` · `NotificationBell`
  - `mainTabs`(`Widget` — 5탭 `BottomNavigationBar`) · **홈 라우트 표**(`NAV-HOME`): `/home`·`/qr/:id`·`/appointments/:id`·`/questionnaire/:id`·`/history`·`/notifications`·`/settings`·`/booking`·`/chat`
  - **Task 30(나의 예약)이 소비**: `HomeMultiCard`(사람별 줄 견본) · **Task 18이 소비**: `NotificationBell`·`/notifications` 라우트

- [ ] **Step 1: `selectHomeDay` 실패 테스트 (`HOME-SCOPE-01·02·03`·`HOME-ROLE-01`·`HOME-CARD-04`)** — `test/features/home/home_scope_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_scope.dart';

AppointmentView _v(String id, String status, DateTime slot, {String name = '본인'}) =>
    AppointmentView.fromJson({
      'id': id, 'status': status, 'for_patient_name': name, 'booking_code': 'A-$id',
      'department_name': '내과', 'doctor_name': '이의사', 'has_questionnaire': false,
      'slot_date': slot.toIso8601String().substring(0, 10),
      'start_time': '${slot.hour.toString().padLeft(2, '0')}:00',
      'hospital_change_prev_time': null, 'hospital_change_kind': null,
    });

void main() {
  final now = DateTime(2026, 8, 18, 9, 0);

  test('[HOME-SCOPE-01] 오늘 예약이 있으면 오늘 하루치만 고른다', () {
    final today = _v('1', '예약확정', DateTime(2026, 8, 18, 14));
    final tomorrow = _v('2', '예약확정', DateTime(2026, 8, 19, 10));
    final picked = selectHomeDay([today, tomorrow], now);
    expect(picked.map((a) => a.id), ['1']);          // 내일 것은 빠진다(HOME-SCOPE-02)
  });
  test('[HOME-SCOPE-01] 오늘 예약이 없으면 다음 예약이 있는 날 하루치를 고른다', () {
    final d20 = _v('3', '예약확정', DateTime(2026, 8, 20, 11));
    final d22 = _v('4', '예약확정', DateTime(2026, 8, 22, 11));
    expect(selectHomeDay([d22, d20], now).map((a) => a.id), ['3']);   // 22일 것은 안 끌어온다
  });
  test('[HOME-SCOPE-03] 오늘이 끝난 카드뿐이면 다음 예약을 끌어오지 않는다', () {
    final doneToday = _v('5', '진료완료', DateTime(2026, 8, 18, 8));
    final next = _v('6', '예약확정', DateTime(2026, 8, 20, 11));
    // 오늘에 살아있는 카드가 없어도 다음날을 올리지 않는다 → 오늘의 끝난 카드만(자정이면 저절로 넘어감)
    expect(selectHomeDay([doneToday, next], now).map((a) => a.id), ['5']);
  });
  test('[HOME-CARD-04] 하루치를 전부 고른다(첫 건만 꺼내지 않는다)', () {
    final a = _v('7', '예약확정', DateTime(2026, 8, 18, 14), name: '본인');
    final b = _v('8', '예약확정', DateTime(2026, 8, 18, 15), name: '김순자');
    expect(selectHomeDay([a, b], now).length, 2);    // list.first가 아니라 그날 전부
  });
  test('[HOME-CARD-03] 같은 날은 빠른 시각이 위, 같은 시각이면 본인이 가족보다 위', () {
    final family = _v('9', '예약확정', DateTime(2026, 8, 18, 14), name: '김순자');
    final me = _v('10', '예약확정', DateTime(2026, 8, 18, 14), name: '본인');
    expect(selectHomeDay([family, me], now).first.id, '10');   // 본인 먼저
  });
  test('[HOME-ROLE-01] 지나간(다른 날 완료) 예약은 홈에 오지 않는다', () {
    final past = _v('11', '진료완료', DateTime(2026, 8, 10, 9));
    final next = _v('12', '예약확정', DateTime(2026, 8, 20, 11));
    expect(selectHomeDay([past, next], now).map((a) => a.id), ['12']);  // 과거는 이력 탭 몫
  });
}
```
Run → Expected: FAIL.

- [ ] **Step 2: `selectHomeDay` 구현** — `patient_app/lib/features/home/home_scope.dart`

```dart
import 'appointment_view.dart';

/// 홈에 올릴 「가장 가까운 하루치」를 고른다(HOME-ROLE-01·SCOPE-01·02·03·CARD-03·04).
/// 규칙: 오늘 카드가 하나라도 있으면 오늘 날짜의 전부, 없으면 미래에서 가장 이른 날짜의 전부.
/// 과거(다른 날)는 버린다 — 홈은 "다음에 갈 곳". 다음 예약을 끌어오지 않는다(자정에 저절로 넘어감).
List<AppointmentView> selectHomeDay(List<AppointmentView> all, DateTime now) {
  final today = DateTime(now.year, now.month, now.day);
  DateTime? dayOf(AppointmentView a) => a.slotStart == null
      ? null : DateTime(a.slotStart!.year, a.slotStart!.month, a.slotStart!.day);

  final todays = all.where((a) => dayOf(a) == today).toList();
  final List<AppointmentView> chosen;
  if (todays.isNotEmpty) {
    chosen = todays;                                    // SCOPE-01·03: 오늘이 끝난 것뿐이어도 오늘만
  } else {
    final future = all.where((a) => dayOf(a) != null && dayOf(a)!.isAfter(today)).toList();
    if (future.isEmpty) return [];                      // 0건 → HOME-EMPTY
    future.sort((x, y) => x.slotStart!.compareTo(y.slotStart!));
    final firstDay = dayOf(future.first);
    chosen = future.where((a) => dayOf(a) == firstDay).toList();   // SCOPE-02: 그 하루만
  }
  chosen.sort((x, y) {                                  // CARD-03: 빠른 시각 위, 같으면 본인 먼저
    final t = x.slotStart!.compareTo(y.slotStart!);
    if (t != 0) return t;
    return (x.forPatientName == '본인' ? 0 : 1).compareTo(y.forPatientName == '본인' ? 0 : 1);
  });
  return chosen;
}
```
> ⚠️ **본인 판정은 이름 문자열이 아니라 관계 플래그로**(구현 시): 여기 예시는 테스트 가독성용이며, 실제로는 `AppointmentView`에 `isSelf`(account_patient_id == for_patient_id)를 두어 판정한다 — 이름이 '본인'인 가족은 없지만 동명이인 방어. **완료 보고에 「`isSelf` 필드 추가」를 T15 `AppointmentView`로 소급**할지 짚는다.
Run → Expected: PASS.

- [ ] **Step 3: `homeAppointmentsProvider` — 온·오프라인 (`HOME-REFRESH-01`·`HOME-EMPTY-03`·`OFF-DO-01`)** — `test/features/home/home_data_test.dart`

```dart
test('[HOME-REFRESH-01] 온라인이면 서버를 다시 조회하고 그 결과를 캐시에 저장한다', () async {
  final api = _FakeApi(returns: [_json('1', '예약확정')]);
  final cache = _SpyCache();
  final list = await loadHomeAppointments(api: api, cache: cache, online: true);
  expect(list.first.id, '1');
  expect(cache.saved, isNotNull);        // OFF-CACHE-01: 받은 목록을 통째로 저장
});
test('[HOME-EMPTY-03][OFF-DO-01] 오프라인이면 서버를 부르지 않고 캐시 보관본을 읽는다', () async {
  final api = _ThrowingApi();            // 부르면 실패(오프라인이라 부르면 안 됨)
  final cache = _SpyCache(cached: [_json('9', '진료대기')]);
  final list = await loadHomeAppointments(api: api, cache: cache, online: false);
  expect(list.first.id, '9');            // 0건이 아니라 보관본 — "예약 없음" 거짓말을 피한다
});
```
> 구현: `loadHomeAppointments`는 `online`이면 `GET /appointments/mine`(T8 `list_my_appointments`) 조회 후 `cache.save(raw)` 하고 `AppointmentView.fromJson` 매핑; 오프라인이면 `cache.read()`의 `items`를 매핑(없으면 `null` → 화면은 `EmptyState.offline`). `homeAppointmentsProvider`가 `connectivityProvider`를 읽어 분기.
Run → FAIL → 구현 → PASS.

- [ ] **Step 4: `HomeScreen` 카드 배치 실패 테스트 (`HOME-CARD-01·02`)** — `test/features/home/home_screen_test.dart`

```dart
testWidgets('[HOME-CARD-01] 그날 예약이 1건이면 큰 히어로 카드(AppointmentCard) 하나', (t) async {
  await t.pumpWidget(_home([_view('1', '예약확정', name: '본인')]));
  expect(find.byType(AppointmentCard), findsOneWidget);
  expect(find.byType(HomeMultiCard), findsNothing);
});
testWidgets('[HOME-CARD-02] 그날 예약이 2건 이상이면 사람별 줄로 묶은 카드', (t) async {
  await t.pumpWidget(_home([_view('1', '예약확정', name: '본인'), _view('2', '예약확정', name: '김순자')]));
  expect(find.byType(HomeMultiCard), findsOneWidget);
  expect(find.textContaining('김순자'), findsOneWidget);   // 각 줄에 이름
});
```
> 구현: `HomeScreen`이 `selectHomeDay(list, now)`로 하루치를 얻고 — `length == 1`이면 `AppointmentCard(view: day.first, ...)`(T15 히어로), `>= 2`면 `HomeMultiCard(views: day)`. 0이면 빈 상태(Step 6).
Run → FAIL → 구현 → PASS.

- [ ] **Step 5: `HomeMultiCard`(사람별 줄) 실패 테스트 → 구현 (`HOME-CARD-02·03`)** — `test/features/home/home_multi_card_test.dart`

```dart
testWidgets('[HOME-CARD-02] 각 줄에 시각 레일 + 이름 + 관계 + [QR] 버튼', (t) async {
  await t.pumpWidget(_wrap(HomeMultiCard(views: [
    _view('1', '예약확정', name: '본인', code: 'A-1'),
    _view('2', '예약확정', name: '김순자', code: 'A-2'),
  ])));
  expect(find.widgetWithText(ActionButton, 'QR'), findsNWidgets(2));   // 확정 예약마다 QR 줄
  expect(find.textContaining('오전 9:00'), findsWidgets);              // 시각 레일
});
testWidgets('[HOME-CARD-02] 확인 중(신청)인 줄은 QR 대신 확인 중 글자', (t) async {
  await t.pumpWidget(_wrap(HomeMultiCard(views: [_view('3', '예약신청', name: '본인')])));
  expect(find.text('확인 중'), findsOneWidget);   // CARD-REQ-06와 같은 규칙(줄 형태)
  expect(find.widgetWithText(ActionButton, 'QR'), findsNothing);
});
```
> 구현: `HomeMultiCard`는 `AppCard`(T0) 안에 `views`를 줄로 — 각 줄 = 시각(`formatKoreanTime`) 레일 + `for_patient_name` + 관계 + (`booking_code`가 있으면 `[QR]`, `예약신청`이면 `확인 중` 글자 `CARD-REQ-06`). 정렬은 `selectHomeDay`가 이미 함(HOME-CARD-03).
Run → FAIL → 구현 → PASS.

- [ ] **Step 6: 빈 상태 + 병원 정보 + 미완료 신청 (`HOME-EMPTY-*`·`HOME-INFO-*`·`HOME-KILL-*`)** — `test/features/home/home_screen_test.dart`(이어서)

```dart
testWidgets('[HOME-EMPTY-01] 0건이면 안내 + [진료 예약하기] + 지난 방문 이력 보기', (t) async {
  await t.pumpWidget(_home([]));
  expect(find.textContaining('예약된 진료가 없습니다'), findsOneWidget);
  expect(find.widgetWithText(ActionButton, '진료 예약하기'), findsOneWidget);
  expect(find.textContaining('지난 방문 이력 보기'), findsOneWidget);
});
testWidgets('[HOME-EMPTY-02] 빈 상태에 "최근 방문" 줄을 넣지 않는다', (t) async {
  await t.pumpWidget(_home([]));
  expect(find.textContaining('최근 방문'), findsNothing);   // 홈이 과거를 보여주지 않는다
});
testWidgets('[HOME-INFO-01] 카드 아래 병원 주소·전화 두 줄', (t) async {
  await t.pumpWidget(_home([_view('1', '예약확정')], hospital: {'hospital_address': '서울 A', 'hospital_phone': '02-1'}));
  expect(find.textContaining('서울 A'), findsOneWidget);
  expect(find.textContaining('02-1'), findsOneWidget);
});
testWidgets('[HOME-INFO-02] 병원 정보 조회 실패면 조용히 숨기고 카드는 그대로', (t) async {
  await t.pumpWidget(_home([_view('1', '예약확정')], hospital: null));   // 조회 실패
  expect(find.byType(AppointmentCard), findsOneWidget);       // 카드는 보인다
  expect(find.byType(HospitalInfoRow), findsNothing);          // 정보 줄만 사라진다
});
testWidgets('[HOME-KILL-01] 결과 못 받은 신청이 있으면 카드 위에 안내 줄', (t) async {
  await t.pumpWidget(_home([_view('1', '예약확정')], pending: true));
  expect(find.byType(PendingRequestCard), findsOneWidget);
  expect(tester.getTopLeft(find.byType(PendingRequestCard)).dy
       < tester.getTopLeft(find.byType(AppointmentCard)).dy, isTrue);   // 카드 위
});
testWidgets('[HOME-KILL-02] 0건 빈 상태에서도 미완료 신청 줄은 빈 상태 위에 뜬다', (t) async {
  await t.pumpWidget(_home([], pending: true));
  expect(find.byType(PendingRequestCard), findsOneWidget);   // "신청이 날아갔다"로 읽히지 않게
});
```
> 구현: `HomeScreen`이 `homeAppointmentsProvider`를 watch — 오프라인/에러면 `EmptyState.offline/error`(HOME-EMPTY-03), 0건이면 `EmptyState.zero`(문구·`[진료 예약하기]`·이력 링크, HOME-EMPTY-01·02는 "최근 방문" 미포함), 아니면 카드. `pendingRequestProvider`가 있으면 최상단에 `PendingRequestCard`(HOME-KILL-01·02, T12). `HospitalInfoRow`는 `get_hospital_info` 성공 시만 카드 아래(HOME-INFO-01·02), 탭 → 전화/지도(HOME-INFO-03·`NAV-HOME-09·10`).
Run → FAIL → 구현 → PASS.

- [ ] **Step 7: 앱바 종 + 배지 (`HOME-BAR-01·02·03`)** — `test/features/home/notification_bell_test.dart`

```dart
testWidgets('[HOME-BAR-01] 앱바 우상단에 종(알림함) + 톱니(설정) 두 개, 햄버거 없음', (t) async {
  await t.pumpWidget(_home([_view('1', '예약확정')]));
  expect(find.byType(NotificationBell), findsOneWidget);
  expect(find.byIcon(Icons.settings), findsOneWidget);
  expect(find.byIcon(Icons.menu), findsNothing);       // 햄버거 없음
});
testWidgets('[HOME-BAR-02] 안 읽은 알림이 있으면 개수 배지', (t) async {
  await t.pumpWidget(_wrap(NotificationBell(unreadCount: 3)));
  expect(find.text('3'), findsOneWidget);
});
testWidgets('[HOME-BAR-02] 안 읽은 알림이 0이면 배지가 사라진다(숫자 0을 그리지 않는다)', (t) async {
  await t.pumpWidget(_wrap(NotificationBell(unreadCount: 0)));
  expect(find.text('0'), findsNothing);                // 0 배지를 그리지 않는다
});
```
> 구현: `NotificationBell({unreadCount})` — 종 아이콘 + `unreadCount >= 1`일 때만 배지(`0`은 안 그림, HOME-BAR-02). 홈은 `unreadNotificationCountProvider`(T18)를 watch해 `unreadCount`를 넘긴다(HOME-BAR-03의 "종 추가"가 실현). 종 탭 → `/notifications`(NAV-HOME-12).
Run → FAIL → 구현 → PASS.

- [ ] **Step 8: 갱신 + 실시간 (`HOME-REFRESH-02·03`)** — `test/features/home/home_screen_test.dart`(이어서)

```dart
testWidgets('[HOME-REFRESH-02] 도착·진료대기·진료중 카드가 있으면 실시간 구독을 연다', (t) async {
  final sub = _SpyRealtime();
  await t.pumpWidget(_home([_view('1', '진료대기')], realtime: sub));
  expect(sub.subscribed, isTrue);      // 대기실에서 아무것도 안 눌러도 저절로 바뀐다
});
testWidgets('[HOME-REFRESH-02] 끝난 카드만 있으면 실시간 구독을 열지 않는다', (t) async {
  final sub = _SpyRealtime();
  await t.pumpWidget(_home([_view('1', '진료완료')], realtime: sub));
  expect(sub.subscribed, isFalse);     // 바뀔 것이 없는데 연결을 붙잡지 않는다
});
```
> 구현: `HomeScreen`은 진입/pull-to-refresh 시 `ref.invalidate(homeAppointmentsProvider)`(HOME-REFRESH-01). 하루치에 `도착·진료대기·진료중`이 있으면 그 예약들의 Realtime 구독을 연다(HOME-REFRESH-02, `AppShell`과 같은 연결). 갱신 결과가 다르면 `OFF-BACK-02`(T11 규칙)를 따른다(HOME-REFRESH-03 — 화면을 통째로 갈아엎지 않고 카드만 바뀜, `NAV-HOME-21`).
Run → FAIL → 구현 → PASS.

- [ ] **Step 9: 하단 탭 + `NAV-HOME` 라우팅 (`NAV-HOME-*`)** — `test/features/home/home_routes_test.dart`

```dart
testWidgets('[NAV-HOME-19] 로그인 후 홈에는 하단 탭 바가 있다(로그인 전엔 없음)', (t) async {
  await t.pumpWidget(_app(initial: '/home'));
  expect(find.byType(BottomNavigationBar), findsOneWidget);
});
testWidgets('[NAV-HOME-01] 홈에서 예약 카드를 누르면 예약 상세로 간다', (t) async {
  await t.pumpWidget(_app(initial: '/home', appts: [_view('a1', '예약확정')]));
  await t.tap(find.byType(AppointmentCard));
  await t.pumpAndSettle();
  expect(find.text('예약 상세'), findsOneWidget);       // /appointments/a1
});
testWidgets('[NAV-HOME-14] 0건 빈 상태의 [진료 예약하기]는 예약 1단계로 간다', (t) async {
  await t.pumpWidget(_app(initial: '/home', appts: []));
  await t.tap(find.widgetWithText(ActionButton, '진료 예약하기'));
  await t.pumpAndSettle();
  expect(find.text('예약 1단계'), findsOneWidget);       // /booking
});
testWidgets('[NAV-HOME-12] 종을 누르면 알림함으로 가고, 들어온 순간 전부 읽음이다', (t) async {
  final marker = _SpyReadMarker();
  await t.pumpWidget(_app(initial: '/home', readMarker: marker));
  await t.tap(find.byType(NotificationBell));
  await t.pumpAndSettle();
  expect(marker.markedAllRead, isTrue);   // NOTI-READ(T18 창구를 홈이 호출)
});
testWidgets('[NAV-HOME-15] 병원발 변경 [확인]은 화면을 옮기지 않고 안내문만 사라진다', (t) async {
  await t.pumpWidget(_app(initial: '/home', appts: [_changedView('a1')]));
  await t.tap(find.widgetWithText(ActionButton, '확인'));
  await t.pumpAndSettle();
  expect(find.byType(HomeScreen), findsOneWidget);       // 여전히 홈(이동 없음)
});
testWidgets('[NAV-HOME-07] 잠긴 문진 줄은 눌리지 않는다(가지 않는다)', (t) async {
  await t.pumpWidget(_app(initial: '/home', appts: [_view('a1', '진료중', questionnaire: true)]));
  expect(find.byIcon(Icons.lock), findsOneWidget);       // 자물쇠(DISP-ICON-01)
});
```
> 구현: `mainTabs` = `BottomNavigationBar`(홈·예약·문진·이력·설정 5탭, `DISP-ICON-03` 아이콘+라벨). `/home`은 `AppShell(body: HomeScreen, bottomTabs: mainTabs)`. 홈발 라우트(완전 ID로 편다 — 검사기는 축약 `05·06·07`을 못 읽는다): `NAV-HOME-01`(카드→`/appointments/:id`) · `NAV-HOME-02`(`[QR]`→`/qr/:id`) · `NAV-HOME-05`(문진 미작성 줄→`/questionnaire/:id`) · `NAV-HOME-06`(문진 완료 줄→상세 펼침) · `NAV-HOME-07`(문진 잠김 줄→안 감·자물쇠) · `NAV-HOME-08`(`[방문 이력 보기]`→`/history`) · `NAV-HOME-09`(전화번호→전화 앱) · `NAV-HOME-10`(주소→지도 앱, 주소 문자열) · `NAV-HOME-11`(`[상담 채팅 연결]`→`/chat`) · `NAV-HOME-12`(종→`/notifications`+전부 읽음) · `NAV-HOME-13`(톱니→`/settings`) · `NAV-HOME-14`(`[진료 예약하기]`→`/booking`) · `NAV-HOME-15`(변경 `[확인]`=`acknowledge_hospital_change`·이동 없음). `NAV-HOME-16`·`NAV-HOME-17`(알림함 내부 이동)은 라우트 표만 여기, 화면은 T18. `NAV-HOME-18·19`(딥링크)·`20`(뒤로=앱 종료)·`21`(실시간=화면 안 옮김)은 구조로 실현(아래 커버리지 노트).
Run → FAIL → 구현 → PASS.

- [ ] **Step 10: 전체 테스트 + 커밋**

```bash
cd patient_app && flutter test test/features/home/
git add patient_app/lib/features/home/ patient_app/lib/core/router.dart patient_app/test/features/home/
git commit -m "feat: 환자앱 Task 16 — 홈 프레임 + 하단 탭 셸 43규칙(하루치 스코프·사람별 줄·병원정보·종배지·NAV-HOME)"
```

> 📌 **규칙 커버리지(43)**: `HOME-ROLE-01`(1) · `HOME-SCOPE-01·02·03`(3) · `HOME-CARD-01·02·03·04`(4) · `HOME-INFO-01·02·03`(3) · `HOME-EMPTY-01·02·03`(3) · `HOME-BAR-01·02·03`(3) · `HOME-KILL-01·02`(2) · `HOME-REFRESH-01·02·03`(3) · `NAV-HOME-01~21`(21).
> 📌 **값 없는/구조·라우팅 규칙 — 「어느 테스트가 실현하는가」로 닫는다**: `NAV-HOME-03`·`NAV-HOME-04`(QR 좌우 밀기·접수 완료 자동 안 닫힘): `/qr/:id` 라우트 + QR 화면은 **T17 소유**(`QR-*`) — 여기서는 카드 `[QR]`이 그 라우트를 여는 배선만(`NAV-HOME-02`는 Step 9 test). `NAV-HOME-16`·`NAV-HOME-17`(알림함 내부 이동): 화면은 **T18**, 여기선 라우트 표만. `NAV-HOME-18·19`(딥링크): `PushService`(T11)가 여는 목적지 라우트가 실현 — 뒤로가면 홈(스택에 홈만). `NAV-HOME-20`(뒤로=앱 종료): 홈에 `WillPopScope`를 두지 않아 시스템 기본(앱 종료)이 실현 — `[NAV-HOME-19]` 탭 테스트가 로그인 화면 부재를 확인. `NAV-HOME-21`(실시간 상태 변경=화면 안 옮김): `HomeScreen`이 provider 갱신으로 카드 가운데만 바꾸고 `Navigator`를 부르지 않는 구조가 실현(`HOME-REFRESH-02` 테스트가 같은 장치). `HOME-BAR-03`(종 추가)·`HOME-CARD-04`(list.first 폐기): 옛 플랜 패치 지시라 재작성이 곧 실현.
> ⚠️ **T18(알림함)이 이어받을 자리**: `unreadNotificationCountProvider`(종 배지가 소비) · `/notifications` 화면 · `NAV-HOME-16·17`의 알림→목적지 표(`NOTI-GO-*`) · 종 탭 시 「전부 읽음」 창구(`NOTI-READ`). **양방향 악수** — 여기서 `NotificationBell`·라우트·읽음 호출 지점을 만들고 T18이 개수·화면·목적지를 채운다.
> 📌 **T15 `AppointmentView`에 `isSelf` 소급 제안**: 홈 정렬(HOME-CARD-03 본인 먼저)이 이름 문자열('본인')이 아니라 `account_patient_id == for_patient_id` 플래그를 써야 정확하다 — T15 모델에 `isSelf` 한 줄 추가(구현 시).

---

## Task 17: 예약 카드 상태 B(확정·도착·진료중·완료·취소·지연·오프라인) + 문진 줄 + QR 전체화면 (70규칙)

> **담당 규칙(70)**: `CARD-OK-*`(4) · `CARD-IN-*`(4) · `CARD-DOC-*`(3) · `CARD-DONE-*`(6) · `CARD-CXL-*`(9) · `CARD-LATE-*`(12) · `CARD-OFF-*`(6) · `CARD-QNR-*`(6) · `CARD-LIFE-*`(2) · `QR-*`(18). ⭐ **T15가 만든 `AppointmentCard`·`AppointmentCardState`·`resolveCardState`에 나머지 상태를 채워 카드를 완성하고, `[QR]`이 여는 전체화면을 만드는 태스크**다. T15는 상태 A(요청·대기·확정안됨)만 그렸고 나머지 케이스는 `unknown`으로 흘렸다 — 여기서 그 자리를 메운다(양방향 악수).
>
> ⭐⭐ **이 태스크의 심장 = 「끝난 카드는 둘뿐」(`CARD-LIFE-01`)**: 살아 있는 카드(오늘 더 할 일이 있음)와 끝난 카드(`진료완료`·`취소됨`)를 `isFinishedCard`가 가른다. ⚠️ **`시간 지남`(⑨ `CARD-LATE`)의 옅은 회색은 「끝남」이 아니라 「시각이 지나갔다」**이다(`CARD-LATE-11`) — QR이 살아 있어 오늘 접수할 수 있으므로 끝난 카드가 아니다. 색 하나에 다 담지 않고 주의색 한 줄이 "아직 할 일"을 따로 말한다.
>
> ⭐⭐ **두 번째 심장 = 30분 유예 후에도 부도로 찍지 않는다(`CARD-LATE-00·01`)**: 예약 시각이 지나도 정시에 바꾸지 않고 **+30분**이 지나야 ⑨로 넘어간다(그 전엔 `예약확정` 그대로 — 접수 줄에 선 사람을 늦은 사람으로 만들지 않는다). ⑨가 돼도 **QR을 살려두고**(`CARD-LATE-03`) 자정까지 `예약확정`을 유지한다. 부도를 찍는 것은 **배포 자정 배치**(`CARD-LATE-10`·`mark_overdue_no_shows()`)이지 화면이 아니다.
>
> ⭐⭐ **세 번째 심장 = CARD-CHG-06 ↔ CARD-CXL 경계 조율(핸드오프 지정)**: 병원발 취소는 `status='병원취소'` + `hospital_change_kind='cancelled'` 둘 다 세팅된다(T15 경계 #17). **둘 다 뜨면 "취소" 문구가 두 번** 나온다 → **`status='병원취소'`이면 `CxlBody`가 전담하고 T15의 `HospitalChangeBanner`는 얹지 않는다**(`AppointmentCard`의 announcement 조건을 `status != '병원취소'`로 좁힌다). `CxlBody`가 회색 카드 + `병원에서 취소했습니다`(`CARD-CXL-02`) + `[새로 예약하기]`(`CARD-CXL-08`)로 `CARD-CHG-06`이 요구한 "같은 자리·같은 형태"를 이미 만족한다.
>
> ⚠️ **경계(재소유 금지)**: ① 카드 프레임·판정·상태 A는 **Task 15 소비/확장**(`AppointmentCard`·`AppointmentView`·`resolveCardState`·`patientStatusLabel`·`isFinishedCard`(여기 신설)·`formatKoreanTime`·`formatWaitTime`). ② 위젯은 **Task 0**(`AppCard`·`StatusLabel`·`WarnText`·`appIcon`·`AppTokens.grayDone`·`grayPending`), **Task 12**(`ActionButton`). ③ 데이터는 **Task 8**(`list_my_appointments`·`get_queue_status` — 취소 주체 3필드는 **갭 #11 실현**으로 여기서 소급) · **Task 11**(`connectivityProvider`·`CachedUpcoming.isStale` — `CARD-OFF`). ④ 문진 줄 세부(작성중·읽기전용 화면)는 **Task 23·24 소유**(`QNR-*`) — 여기서는 **홈 카드 줄 4종**만(`CARD-QNR`). ⑤ QR 화면은 여기서 만들고 **Task 16이 `[QR]`→`/qr/:id` 배선**(`NAV-HOME-02·03·04`)을 이미 함 — 여기선 화면 알맹이.
>
> ⚠️ **갭 #11 소급(취소 주체·시각)**: `CARD-CXL-02·03·04`(병원/가족/본인 취소 문구)와 `CARD-CXL-05·06`(수명이 주체별로 다름)은 **서버가 상태+주체+시각을 내려줘야** 성립한다(결정 문서 #11 — 이미 결정된 조치방향, 새 발견 아님). T8 `list_my_appointments`·`get_appointment_detail` select에 `cancelled_by`(`'hospital'|'patient'`)·`cancelled_by_relation`·`cancelled_by_name`·`cancelled_at`을 소급 추가한다(취소를 기록하는 Task 6 취소 서비스·직원웹 취소가 채운다). ⚠️ **주체 데이터가 아직 없으면**(구현 순서상 Task 6 후행) `CxlBody`는 `CARD-CXL-04`(본인) 기본으로 그리되 필드가 오면 갈린다.

**Files:**
- Modify: `patient_app/lib/features/home/appointment_view.dart`(`resolveCardState` 상태 B 케이스 + `isFinishedCard` + `patientStatusLabel` 확장 + `AppointmentView`에 취소 주체·`isSelf` 필드)
- Modify: `patient_app/lib/features/home/appointment_card.dart`(`_cardBody`·`_actions`·`_railColor` 상태 B + announcement `status != '병원취소'` 조건 + 문진 줄·오프라인 분기)
- Create: `patient_app/lib/features/home/card_bodies_b.dart`(`OkBody`·`InBody`·`DocBody`·`DoneBody`·`CxlBody`·`LateBody`·`OfflineBody`)
- Create: `patient_app/lib/features/home/questionnaire_row.dart`(`QuestionnaireRow` — `CARD-QNR` 4종)
- Create: `patient_app/lib/features/qr/qr_fullscreen.dart`(`QrFullscreen` — `QR-*`)
- Create: `patient_app/lib/features/qr/brightness.dart`(`BrightnessController` — `QR-BRIGHT`, `screen_brightness` 패키지 래퍼)
- Modify: `backend/app/services/patient_appointment_query_service.py`(select에 취소 주체 4필드 — 갭 #11)
- Modify: `patient_app/pubspec.yaml`(`screen_brightness`·`qr_flutter` 추가 — `QR-BRIGHT-03`)
- Test: `patient_app/test/features/home/card_bodies_b_test.dart` · `test/features/home/questionnaire_row_test.dart` · `test/features/qr/qr_fullscreen_test.dart` · `test/features/home/card_lifecycle_test.dart` · `backend/tests/test_patient_appointment_query_service.py`(취소 주체 절)

**Interfaces:**
- Consumes:
  - Task 15: `AppointmentCard`·`AppointmentView`(`.fromJson`)·`AppointmentCardState`·`resolveCardState`·`patientStatusLabel`·`formatKoreanTime`·`formatWaitTime`·`HospitalChangeBanner`(cancelled 분기는 status 전환 전용으로 남김)
  - Task 0: `AppCard`·`StatusLabel`·`WarnText`·`appIcon(AppIconKind.readonly)`·`AppTokens.grayDone`(#A3AFB8)·`grayPending`
  - Task 12: `ActionButton`
  - Task 8: `list_my_appointments`(+취소 주체 4필드) · `get_queue_status`
  - Task 11: `connectivityProvider` · `CachedUpcoming.isStale`
- Produces:
  - `isFinishedCard(AppointmentCardState) -> bool`(`done`·`cancelled`만 true) · 확장된 `resolveCardState`(전 상태) · `OkBody`·`InBody`·`DocBody`·`DoneBody`·`CxlBody`·`LateBody`·`OfflineBody` · `QuestionnaireRow({state, hasQuestionnaire, onTap})` · `QrFullscreen({views, initialIndex})` · `BrightnessController`
  - **Task 27(이력)이 소비**: `CxlBody` 3갈래(`HIST-ROW` 취소자 표시 재사용) · **Task 16이 이미 소비**: `/qr/:id`

- [ ] **Step 1: `resolveCardState` 상태 B 확장 + `isFinishedCard` 실패 테스트 (`CARD-LIFE-01·02`)** — `test/features/home/card_lifecycle_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';

void main() {
  final now = DateTime(2026, 8, 18, 15, 0);
  AppointmentView _v(String status, {DateTime? slot}) => AppointmentView.fromJson({
        'id': 'a', 'status': status, 'for_patient_name': '본인', 'booking_code': 'A-1',
        'department_name': '내과', 'doctor_name': '이의사', 'has_questionnaire': false,
        'slot_date': slot?.toIso8601String().substring(0, 10),
        'start_time': slot == null ? null : '14:00',
        'hospital_change_prev_time': null, 'hospital_change_kind': null,
      });

  test('[CARD-LIFE-01] 끝난 카드는 진료완료·취소됨 둘뿐이다', () {
    expect(isFinishedCard(resolveCardState(_v('진료완료'), now)), isTrue);
    expect(isFinishedCard(resolveCardState(_v('병원취소'), now)), isTrue);
    for (final s in ['예약확정', '도착', '진료대기', '진료중']) {
      expect(isFinishedCard(resolveCardState(_v(s, slot: now), now)), isFalse);  // 살아 있는 카드
    }
  });
  test('[CARD-LIFE-02][CARD-LATE-11] 시간 지남(+30분 경과 예약확정)은 끝난 카드가 아니다', () {
    // 예약확정인 채 예약시각 +30분 지남 → late 상태지만 QR이 살아 있어 끝난 카드 아님
    final late = resolveCardState(_v('예약확정', slot: now.subtract(const Duration(minutes: 31))), now);
    expect(late, AppointmentCardState.late);
    expect(isFinishedCard(late), isFalse);
  });
  test('[CARD-LATE-00] 예약확정은 예약시각 +30분 전까지는 late로 넘어가지 않는다', () {
    final ok = resolveCardState(_v('예약확정', slot: now.subtract(const Duration(minutes: 20))), now);
    expect(ok, AppointmentCardState.confirmed);   // 아직 확정 그대로(QR·버튼 변화 없음)
  });
}
```
Run → Expected: FAIL.

- [ ] **Step 2: `resolveCardState` 확장 + `isFinishedCard` 구현** — `appointment_view.dart`(Modify)

```dart
// Task 15의 resolveCardState에 상태 B 케이스를 더한다(같은 함수 확장).
AppointmentCardState resolveCardState(AppointmentView v, DateTime now) {
  final grace = v.slotStart?.add(const Duration(minutes: 30));
  switch (v.status) {
    case '예약신청':
      if (grace != null && now.isAfter(grace)) return AppointmentCardState.unconf;
      return AppointmentCardState.req;
    case '진료대기': return AppointmentCardState.wait;
    case '예약확정':
      if (grace != null && now.isAfter(grace)) return AppointmentCardState.late;   // CARD-LATE-00·01
      return AppointmentCardState.confirmed;                                        // CARD-OK
    case '도착': return AppointmentCardState.arrived;                                // CARD-IN
    case '진료중': return AppointmentCardState.inTreatment;                          // CARD-DOC
    case '진료완료': return AppointmentCardState.done;                               // CARD-DONE
    case '환자취소': case '병원취소': return AppointmentCardState.cancelled;         // CARD-CXL
    default: return AppointmentCardState.unknown;
  }
}

// CARD-LIFE-01: 끝난 카드 = 진료완료·취소됨만. late는 QR이 살아 있어 포함하지 않는다(CARD-LIFE-02·LATE-11).
bool isFinishedCard(AppointmentCardState s) =>
    s == AppointmentCardState.done || s == AppointmentCardState.cancelled;
```
> `patientStatusLabel`도 확장: `confirmed`→`예약확정` · `arrived`→`접수되었습니다` · `inTreatment`→`진료 중` · `done`→`진료가 끝났습니다` · `cancelled`→`취소됨` · `late`→`시간 지남`(CARD-COMMON-04: 전부 환자 말, `예약부도` 같은 내부어 없음).
Run → FAIL → 구현 → PASS.

- [ ] **Step 3: `OkBody`(확정) + `InBody`(도착) (`CARD-OK`·`CARD-IN`)** — `test/features/home/card_bodies_b_test.dart`

```dart
testWidgets('[CARD-OK-01] 확정 카드 가운데는 QR + 예약번호', (t) async {
  await t.pumpWidget(_wrap(OkBody(view: _ok(code: 'A-2413'))));
  expect(find.byType(QrImageView), findsOneWidget);
  expect(find.textContaining('A-2413'), findsOneWidget);
});
testWidgets('[CARD-OK-02] QR 내용은 booking_code(6자리)이지 appointments.id(UUID)가 아니다', (t) async {
  final v = _ok(code: 'A-2413');
  await t.pumpWidget(_wrap(OkBody(view: v)));
  expect(tester.widget<QrImageView>(find.byType(QrImageView)).data, 'A-2413');   // UUID 아님
});
testWidgets('[CARD-OK-04] 확정 카드 버튼은 [시간 변경] [예약 취소](상세로 이동만)', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _ok())));
  expect(find.widgetWithText(ActionButton, '시간 변경'), findsOneWidget);
  expect(find.widgetWithText(ActionButton, '예약 취소'), findsOneWidget);
});
testWidgets('[CARD-IN-01] 도착 카드는 QR이 사라지고 접수됨 + 순서 준비 중', (t) async {
  await t.pumpWidget(_wrap(InBody(view: _in())));
  expect(find.byType(QrImageView), findsNothing);
  expect(find.textContaining('접수되었습니다'), findsOneWidget);
  expect(find.textContaining('순서를 준비 중입니다'), findsOneWidget);
});
testWidgets('[CARD-IN-02][CARD-IN-03] 도착엔 내 앞 N명을 쓰지 않고 이유를 문장으로 남긴다', (t) async {
  await t.pumpWidget(_wrap(InBody(view: _in())));
  expect(find.textContaining('내 앞에'), findsNothing);         // queue_position이 아직 null
  expect(find.textContaining('순서를 준비'), findsOneWidget);   // 빈칸 대신 문장(고장 오해 방지)
});
testWidgets('[CARD-IN-04] 도착 카드는 변경·취소 버튼을 숨긴다(이미 접수됨)', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _in())));
  expect(find.widgetWithText(ActionButton, '예약 취소'), findsNothing);
});
```
> 구현: `OkBody` = `QrImageView(data: booking_code)` + 예약번호(`CARD-OK-01·02`); `booking_code`가 null이면 안내 문구(`CARD-OK-03`, 당일 부도 전엔 null 안 됨). 버튼 `[시간 변경]`·`[예약 취소]`는 상세로 이동만(`CARD-OK-04`). `InBody` = QR 없이 `✓ 접수되었습니다` + `순서를 준비 중입니다`(`CARD-IN-01·03`), `내 앞에 N명` 없음(`CARD-IN-02`), 변경·취소 버튼 숨김(`CARD-IN-04`), 문진 줄은 남김.
Run → FAIL → 구현 → PASS.

- [ ] **Step 4: `DocBody`(진료중) + `DoneBody`(진료완료) (`CARD-DOC`·`CARD-DONE`)** — 같은 파일

```dart
testWidgets('[CARD-DOC-01] 진료중 카드는 진료 중 표시 + 대기 인원 숫자를 지운다', (t) async {
  await t.pumpWidget(_wrap(DocBody(view: _doc())));
  expect(find.textContaining('진료 중입니다'), findsOneWidget);
  expect(find.textContaining('내 앞에'), findsNothing);       // 내 앞에 0명은 이상하다
});
testWidgets('[CARD-DOC-03] 진료중 문진 줄은 숨기지 않고 자물쇠로 잠근다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _doc(questionnaire: true))));
  expect(find.byIcon(Icons.lock), findsOneWidget);
  expect(find.textContaining('진료가 시작되어 수정할 수 없습니다'), findsOneWidget);
});
testWidgets('[CARD-DONE-01] 완료 카드는 옅은 회색 + 진료가 끝났습니다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _done())));
  expect(find.textContaining('진료가 끝났습니다'), findsOneWidget);
  expect(find.widgetWithText(StatusLabel, '진료가 끝났습니다'), findsWidgets);
});
testWidgets('[CARD-DONE-04] 완료 카드 버튼은 [방문 이력 보기]', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _done())));
  expect(find.widgetWithText(ActionButton, '방문 이력 보기'), findsOneWidget);
});
testWidgets('[CARD-DONE-05] 완료 카드 문진 줄은 눈 아이콘 + 내가 작성한 사전문진 보기', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _done(questionnaire: true))));
  expect(find.textContaining('내가 작성한 사전문진 보기'), findsOneWidget);
});
```
> 구현: `DocBody` = `● 진료 중입니다`(`CARD-DOC-01`), 대기 숫자 없음. 문진 줄 자물쇠(`CARD-DOC-03`·`QuestionnaireRow` 잠김). `DoneBody` = `✓ 진료가 끝났습니다`(옅은 회색 `grayDone`, `CARD-DONE-01`), 버튼 `[방문 이력 보기]`(`CARD-DONE-04`), 문진 줄 눈 아이콘(`CARD-DONE-05`). `CARD-DONE-02·03·06`(당일 자정까지·뒷일 시간·홈 한정)은 수명 규칙 — `selectHomeDay`(T16)가 오늘만 그리므로 다음날 사라짐이 실현, `CARD-DONE-06`(예약 탭은 앞으로만)은 T30 소유.
Run → FAIL → 구현 → PASS.

- [ ] **Step 5: `CxlBody`(취소됨) 3갈래 (`CARD-CXL`)** — 같은 파일

```dart
testWidgets('[CARD-CXL-02] 병원이 취소하면 병원에서 취소했습니다(직원 이름 없음)', (t) async {
  await t.pumpWidget(_wrap(CxlBody(view: _cxl(by: 'hospital'))));
  expect(find.text('병원에서 취소했습니다'), findsOneWidget);
});
testWidgets('[CARD-CXL-03] 가족이 취소하면 관계+이름으로 누가 취소했는지 보인다', (t) async {
  await t.pumpWidget(_wrap(CxlBody(view: _cxl(by: 'patient', relation: '배우자', name: '김영수'))));
  expect(find.textContaining('배우자 김영수 님이 취소했습니다'), findsOneWidget);
});
testWidgets('[CARD-CXL-04] 본인이 취소하면 취소하셨습니다', (t) async {
  await t.pumpWidget(_wrap(CxlBody(view: _cxl(by: 'patient', isSelf: true))));
  expect(find.text('취소하셨습니다'), findsOneWidget);
});
testWidgets('[CARD-CXL-07] 취소 카드에는 문진 줄이 없다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _cxl(by: 'hospital', questionnaire: true))));
  expect(find.textContaining('사전문진'), findsNothing);
});
testWidgets('[CARD-CXL-08] 취소 카드 버튼은 [새로 예약하기](변경·취소 사라짐)', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _cxl(by: 'hospital'))));
  expect(find.widgetWithText(ActionButton, '새로 예약하기'), findsOneWidget);
  expect(find.widgetWithText(ActionButton, '예약 취소'), findsNothing);
});
testWidgets('[CARD-CXL-01] 취소 카드는 옅은 회색 + 배지 취소됨', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _cxl(by: 'hospital'))));
  expect(find.widgetWithText(StatusLabel, '취소됨'), findsOneWidget);
});
testWidgets('[CARD-CHG-06 경계] 병원취소면 CxlBody가 전담하고 변경 배너는 얹지 않는다', (t) async {
  // status='병원취소' + hospital_change_kind='cancelled' 둘 다여도 배너 중복 없음
  await t.pumpWidget(_wrap(AppointmentCard(view: _cxl(by: 'hospital', changeKind: 'cancelled'))));
  expect(find.byType(HospitalChangeBanner), findsNothing);       // 배너 생략(중복 방지)
  expect(find.text('병원에서 취소했습니다'), findsOneWidget);
});
```
> 구현: `CxlBody`는 `cancelled_by`로 갈린다 — `'hospital'`→`병원에서 취소했습니다`(직원 이름 없음, `CARD-CXL-02`); `'patient'`+가족(`isSelf=false`)→`${relation} ${name} 님이 취소했습니다`(`CARD-CXL-03`); `'patient'`+본인→`취소하셨습니다`(`CARD-CXL-04`). 옅은 회색+배지 `취소됨`(`CARD-CXL-01`), 문진 줄 없음(`CARD-CXL-07`), 버튼 `[새로 예약하기]`만(`CARD-CXL-08`). 수명 `CARD-CXL-05`(본인·가족=당일 자정)·`CARD-CXL-06`(병원=`[확인]`까지)은 `selectHomeDay`(오늘만) + 병원취소는 T16 `PendingRequestCard` 계열이 아니라 카드 자체 유지로 실현. **`CARD-CXL-09`(갭 #11)**: 위 4필드가 그것 — 서버가 상태+주체+시각을 내려줘야 3갈래가 성립(백엔드 Step 9). **`AppointmentCard`의 announcement 조건을 `hospitalChangePrevTime != null && status != '병원취소'`로 좁혀** CARD-CHG-06 경계를 닫는다.
Run → FAIL → 구현 → PASS.

- [ ] **Step 6: `LateBody`(시간 지남 ⑨) (`CARD-LATE`)** — 같은 파일

```dart
testWidgets('[CARD-LATE-02][CARD-LATE-03] 시간 지남 카드는 옅은 회색·시간 지났음 + QR을 그대로 살려둔다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _late())));
  expect(find.widgetWithText(StatusLabel, '시간 지남'), findsOneWidget);
  expect(find.byType(QrImageView), findsOneWidget);            // QR을 죽이지 않는다
});
testWidgets('[CARD-LATE-04] 주의 한 줄은 병원에 연락해 주세요(마침표 없음)', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _late())));
  expect(find.text('병원에 연락해 주세요'), findsOneWidget);   // 마침표 없음
});
testWidgets('[CARD-LATE-05] 버튼은 [상담 채팅 연결] [병원 전화]', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _late())));
  expect(find.widgetWithText(ActionButton, '상담 채팅 연결'), findsOneWidget);
  expect(find.widgetWithText(ActionButton, '병원 전화'), findsOneWidget);
});
testWidgets('[CARD-LATE-06][CARD-LATE-07][CARD-LATE-08] 금지 문구를 쓰지 않는다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _late())));
  for (final banned in ['안 오셨습니다', '예약 부도', '오늘 안에 오시면']) {
    expect(find.textContaining(banned), findsNothing);
  }
});
```
> 구현: `LateBody`는 `CARD-OK`와 같은 QR(살려둠, `CARD-LATE-03`) + 배지 `시간 지남`·옅은 회색(`CARD-LATE-02`) + `WarnText('병원에 연락해 주세요')`(마침표 없음, `CARD-LATE-04`) + 버튼 `[상담 채팅 연결]`·`[병원 전화]`(`CARD-LATE-05`). 금지 문구 없음(`CARD-LATE-06·07·08`). 수명 `CARD-LATE-09`(자정 후 이력 `방문하지 않음`)는 T27 이력·배치 몫. **`CARD-LATE-00~00e`(30분 유예·근거·자정 우선)는 `resolveCardState`의 `grace` 판정으로 실현**(Step 1 테스트가 +30분 경계를 못박음). **`CARD-LATE-10`(부도 찍는 주체=배포 배치 `mark_overdue_no_shows()`)**·**`CARD-LATE-11`(회색=끝남 아님, Step 1 `isFinishedCard(late)=false`가 실현)**.
Run → FAIL → 구현 → PASS.

- [ ] **Step 7: `OfflineBody`(오프라인 카드) (`CARD-OFF`)** — 같은 파일

```dart
testWidgets('[CARD-OFF-02] 오프라인에서 도착·대기·진료중 카드는 그대로 보인다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _in(), online: false)));
  expect(find.byType(AppointmentCard), findsOneWidget);   // "예약된 진료가 없습니다"를 띄우지 않는다
});
testWidgets('[CARD-OFF-03] 오프라인이면 순서·대기시간 숫자 대신 문장만, 높이는 유지', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _wait(ahead: 3), online: false)));
  expect(find.textContaining('내 앞에'), findsNothing);
  expect(find.textContaining('순서는 인터넷이 연결되어야 확인할 수 있습니다'), findsOneWidget);
});
testWidgets('[CARD-OFF-05] 기준 시각(오후 3:12 기준)을 붙여 낡은 숫자를 보여주지 않는다', (t) async {
  await t.pumpWidget(_wrap(AppointmentCard(view: _wait(ahead: 3), online: false)));
  expect(find.textContaining('기준'), findsNothing);      // 낡은 순서는 모르는 것보다 나쁘다
});
```
> 구현: `AppointmentCard`가 `connectivityProvider`를 읽어 **오프라인이고 상태가 `wait`·`arrived`·`inTreatment`**이면 그 가운데를 `OfflineBody`(`순서는 인터넷이 연결되어야 확인할 수 있습니다`, 높이 132 유지, `CARD-OFF-03`)로 대체한다. 카드 자체는 그대로 보임(`CARD-OFF-02`), 낡은 순서·기준 시각 안 붙임(`CARD-OFF-04·05`). `CARD-OFF-01`(도착·대기·진료중도 캐시)은 T11 `UpcomingCache`가 통째로 저장하므로 실현, `CARD-OFF-06`(새 판단 아님=`CARD-WAIT-04` 적용 범위)은 같은 "근거 없으면 문장만" 규칙.
Run → FAIL → 구현 → PASS.

- [ ] **Step 8: `QuestionnaireRow`(문진 줄 4종) (`CARD-QNR`)** — `test/features/home/questionnaire_row_test.dart`

```dart
testWidgets('[CARD-QNR-01] 미작성이면 주의색 + 사전문진 미작성 · 작성하기', (t) async {
  await t.pumpWidget(_wrap(const QuestionnaireRow(state: QnrRowState.todo)));
  expect(find.textContaining('사전문진 미작성'), findsOneWidget);
  expect(find.textContaining('작성하기'), findsOneWidget);
});
testWidgets('[CARD-QNR-02] 작성완료면 회색 + 수정하기', (t) async {
  await t.pumpWidget(_wrap(const QuestionnaireRow(state: QnrRowState.done)));
  expect(find.textContaining('작성완료'), findsOneWidget);
  expect(find.textContaining('수정하기'), findsOneWidget);
});
testWidgets('[CARD-QNR-03] 진료중 이후면 자물쇠 + 수정할 수 없습니다 · 내용 보기(숨기지 않음)', (t) async {
  await t.pumpWidget(_wrap(const QuestionnaireRow(state: QnrRowState.locked)));
  expect(find.byIcon(Icons.lock), findsOneWidget);
  expect(find.textContaining('수정할 수 없습니다'), findsOneWidget);
});
testWidgets('[CARD-QNR-04] 완료·이력이면 눈 아이콘 + 내가 작성한 사전문진 보기', (t) async {
  await t.pumpWidget(_wrap(const QuestionnaireRow(state: QnrRowState.readonly)));
  expect(find.textContaining('내가 작성한 사전문진 보기'), findsOneWidget);
});
```
> 구현: `QuestionnaireRow({state, hasQuestionnaire, onTap})` — `QnrRowState.todo`(주의색·작성하기, `CARD-QNR-01`)·`done`(회색·수정하기, `CARD-QNR-02`)·`locked`(자물쇠·`진료가 시작되어 수정할 수 없습니다 · 내용 보기`, `CARD-QNR-03`)·`readonly`(눈·`내가 작성한 사전문진 보기`, `CARD-QNR-04`). 상태 매핑: `todo/done`(진료 시작 전) → 카드가 `has_questionnaire`로, `locked`(inTreatment) → 자물쇠, `readonly`(done) → 눈. `CARD-QNR-05`(수정은 진료 시작 전까지)·`CARD-QNR-06`(누를 수 있게)은 `onTap`이 있는 구조로 실현(막힌 줄은 `NAV-HOME-07`처럼 `onTap=null`). 세부 편집·읽기전용 화면은 Task 23·24.
Run → FAIL → 구현 → PASS.

- [ ] **Step 9: 취소 주체 백엔드 소급 (갭 #11) + `QrFullscreen`(QR 전체화면) (`QR-*`)**

```python
# backend/tests/test_patient_appointment_query_service.py — 취소 주체 절
@pytest.mark.asyncio
async def test_list_my_appointments_carries_canceller(db_conn):
    # CARD-CXL-09(갭 #11): 취소된 예약은 주체·시각을 함께 내려줘야 화면 3갈래가 성립한다.
    ...  # 병원취소 예약 seed → 조회 결과에 cancelled_by='hospital', cancelled_at is not None
    assert row["cancelled_by"] == 'hospital' and row["cancelled_at"] is not None
```
> 백엔드: `list_my_appointments`·`get_appointment_detail` select에 `a.cancelled_by, a.cancelled_by_relation, a.cancelled_by_name, a.cancelled_at` 추가(칸은 Task 6 취소 서비스·직원웹 취소가 채운다 — 갭 #11 조치방향). ⚠️ **칸이 아직 없으면 `00025_cancellation_actor.sql`로 추가**(구현 순서상 Task 6 마이그레이션과 합칠 수 있음 — 완료 보고에 짚는다).

```dart
testWidgets('[QR-TITLE-01] 제목은 대상자 이름 + 몇 번째인지', (t) async {
  await t.pumpWidget(_qr(views: [_ok(name: '김도윤'), _ok(name: '김순자')], index: 1));
  expect(find.textContaining('김순자님 (2/2)'), findsOneWidget);
});
testWidgets('[QR-SWIPE-02] QR이 있는 예약만 넘긴다(확인 중·취소·완료는 건너뛴다)', (t) async {
  final views = [_ok(name: '본인'), _cxl(by: 'hospital'), _ok(name: '김순자')];
  await t.pumpWidget(_qr(views: views, index: 0));
  expect(qrPageCount(t), 2);                 // 취소 예약은 페이지에서 빠진다
});
testWidgets('[QR-BRIGHT-01] 화면에 들어오면 밝기를 최대로 올린다', (t) async {
  final ctl = _SpyBrightness();
  await t.pumpWidget(_qr(views: [_ok()], brightness: ctl));
  expect(ctl.maxed, isTrue);
});
testWidgets('[QR-BRIGHT-02] 화면을 떠나면 원래 밝기로 되돌린다', (t) async {
  final ctl = _SpyBrightness();
  await t.pumpWidget(_qr(views: [_ok()], brightness: ctl));
  await t.pumpWidget(const SizedBox());      // dispose
  expect(ctl.restored, isTrue);
});
testWidgets('[QR-MULTI-01] 작은 QR을 여러 개 동시에 그리지 않는다(한 번에 하나)', (t) async {
  await t.pumpWidget(_qr(views: [_ok(name: '본인'), _ok(name: '김순자')], index: 0));
  expect(find.byType(QrImageView), findsOneWidget);   // 현재 페이지 하나만
});
testWidgets('[QR-CAP-01] 화면 캡처를 막지 않는다(FLAG_SECURE를 걸지 않는다)', (t) async {
  await t.pumpWidget(_qr(views: [_ok()]));
  expect(secureFlagSet(t), isFalse);          // 두 기기 동작을 같게(안드로이드만 불편 방지)
});
testWidgets('[QR-OFF-01][QR-OFF-02] 오프라인에도 QR을 보이고 상단 띠를 넣는다', (t) async {
  await t.pumpWidget(_qr(views: [_ok()], online: false));
  expect(find.byType(QrImageView), findsOneWidget);   // 클라이언트 생성이라 서버 불필요
  expect(find.byType(OfflineBanner), findsOneWidget); // 접수 직원이 한 번 더 확인할 근거
});
```
> 구현: `QrFullscreen({views, initialIndex})` — QR 있는 예약만 걸러(`CARD-REQ-03` 계열, `QR-SWIPE-02`) `PageView`, 제목 `${name}님 (${i+1}/${n})`(`QR-TITLE-01`), 좌우 밀기(`QR-SWIPE-01`), 페이지마다 하나만(`QR-MULTI-01`). 진입 시 `BrightnessController.max()`, dispose 시 `.restore()`(`QR-BRIGHT-01·02`). 통합 QR 안 만듦(`QR-MULTI-02`). `FLAG_SECURE`·캡처 감지 없음(`QR-CAP-01`, 근거 `QR-CAP-02~05`는 "막지 않는다"의 구조로 실현). 오프라인 QR·상단 띠·24h 경고(`QR-OFF-01·02·03`, `isStale`이면 `WarnText` 얹되 QR 살림). `ENTER-01·02`는 T16 `[QR]`→`/qr/:id` 배선이 실현(화면 신설=`QR-ENTER-02` 패치). `QR-BRIGHT-03`(패키지)=`pubspec` 추가.
Run → FAIL → 구현 → PASS.

- [ ] **Step 10: 전체 테스트 + 커밋**

```bash
cd backend && pytest tests/test_patient_appointment_query_service.py -v
cd ../patient_app && flutter test test/features/home/ test/features/qr/
git add backend/app/services/patient_appointment_query_service.py backend/tests/ \
  patient_app/lib/features/home/ patient_app/lib/features/qr/ patient_app/pubspec.yaml patient_app/test/
git commit -m "feat: 환자앱 Task 17 — 예약 카드 상태 B(확정·도착·진료중·완료·취소·지연·오프라인) + 문진 줄 + QR 전체화면 70규칙"
```

> 📌 **규칙 커버리지(70)**: `CARD-OK-01~04`(4) · `CARD-IN-01~04`(4) · `CARD-DOC-01~03`(3) · `CARD-DONE-01~06`(6) · `CARD-CXL-01~09`(9) · `CARD-LATE-00~11`(12) · `CARD-OFF-01~06`(6) · `CARD-QNR-01~06`(6) · `CARD-LIFE-01~02`(2) · `QR-*`(18: `ENTER-01·02`·`TITLE-01`·`SWIPE-01·02`·`BRIGHT-01·02·03`·`MULTI-01·02`·`CAP-01~05`·`OFF-01·02·03`).
> ⭐ **T15 양방향 악수 갚음**: `resolveCardState`에 상태 B 케이스 + `isFinishedCard` 신설 + `AppointmentCard._cardBody`에 B 본문 — T15가 `unknown`으로 흘린 자리를 메웠다. `AppointmentCard` announcement 조건을 `status != '병원취소'`로 좁혀 **CARD-CHG-06 경계**(T15 #17) 닫음.
> 📌 **값 없는/구조 규칙 — 「어느 테스트가 실현하는가」**: `CARD-OK-03`(booking_code null 안내): 당일 부도 전엔 null 안 됨(`CARD-OK-01` 테스트가 정상 경로). `CARD-DONE-02·03·06`(수명·뒷일·홈 한정): `selectHomeDay`(T16 오늘만)·T30(예약 탭). `CARD-DOC-02`(보는 사람=보호자): `DocBody`를 없애지 않는 구조. `CARD-CXL-05·06`(수명): 오늘만 그림 + 병원취소 카드 유지. `CARD-LATE-00~00e·09·10`(유예 근거·자정 우선·부도 주체=배포 배치): `grace` 판정(Step 1) + `mark_overdue_no_shows()`(배포, 대조표 등록). `CARD-QNR-05·06`(수정 기간·누를 수 있음): `onTap` 구조. `QR-CAP-02`·`QR-CAP-03`·`QR-CAP-04`·`QR-CAP-05`·`QR-MULTI-02`(막지 않음·안 만듦의 근거): 그 코드가 없다는 사실이 규칙.
> 📌 **완전 ID로 못박기(범위·축약이라 검사기가 못 읽어 test에 없던 것)**: `CARD-DONE-03`(진료 뒷일이 이어지는 하루)·`CARD-LATE-01`(자정까지 `예약확정` 유지·부도 안 찍음)·`QR-ENTER-01`(`[QR]`→전체화면 진입)·`QR-OFF-03`(24h 초과 경고 얹되 QR 살림) — 전부 값 없는 구조 규칙이라 위 스텝(`resolveCardState` `grace` 판정·`QrFullscreen`·T16 배선)이 실현하고 여기서 ID를 명시한다.
> ⚠️ **갭 #11 소급**: T8 조회에 취소 주체 4필드(`cancelled_by·relation·name·at`) 추가 — 칸은 `00025`(Task 6 취소 서비스와 합칠 수 있음). 결정 문서 #11의 조치방향 실현.
> 📌 **T15 `AppointmentView`에 `isSelf`·취소 주체 필드 추가**(이 태스크에서 Modify) — T16이 남긴 `isSelf` 소급 제안도 함께 반영.

---

## Task 18: 알림함 — 목록·읽음(전부)·비었음·종류별 목적지·갈 곳 없어진 알림 (30규칙)

> **담당 규칙(30)**: `NOTI-LIST-*`(1) · `NOTI-READ-*`(8: 01~08) · `NOTI-KEEP-*`(2) · `NOTI-GO-*`(6) · `NOTI-GONE-*`(6) · `NOTI-OFF-*`(1) · `NOTI-EMPTY-*`(3) · `NOTI-CACHE-*`(1) · `NOTI-BODY-*`(1) · `NOTI-IMPL-*`(1). ⭐ **갭 #22의 실현 태스크** — 발송 표(`notification_log`, ④ `00011`)는 있으나 **목록 조회·읽음 처리·종류별 목적지가 전부 없었다**(`NOTI-IMPL-01`). T16이 남긴 양방향 악수(`unreadNotificationCountProvider`·`/notifications` 라우트·종 탭 시 읽음 창구)를 여기서 **채운다**.
>
> ⭐⭐ **이 태스크의 첫 번째 심장 = 「읽음」 저장 = `patients.notifications_seen_at` 한 칸**(결정 확정 2026-08-18, 「알림함 데이터 저장 방식」). B-11이 **「알림함을 열면 그때까지 온 알림이 전부 읽음」**(개별 추적 아님, `NOTI-READ-04·06`)으로 정했으니 **계정당 시각 하나**면 충분하다. 안 읽은 개수 = `notification_log`에서 `patient_id = 이 계정` 중 `sent_at > notifications_seen_at`인 건수(`NOTI-READ-08`). 읽음 처리 = 알림함에 들어오는 순간 `seen_at = now()` **한 번**. ⚠️ **개별 `read_at` 칸·별도 reads 표는 기각**(발송 로그에 읽음 얹기·`NOTI-READ-06` 위반). ⚠️ **가족 조인 없음** — `notify_patient`(T9)는 **항상 계정 소유자에게** 보내고 가족 예약은 대상자 이름을 **본문에** 넣으므로 `notification_log.patient_id`는 언제나 로그인 계정이다.
>
> ⭐⭐ **두 번째 심장 = 「종류 → 눌렀을 때 가는 곳」 표**(결정 문서: *"이 표가 이 화면의 핵심 결정이다"*). `notify_patient.MESSAGES`의 `notification_type` 10종을 목적지로 가른다(`NOTI-GO-*`): 예약 상세(신청·확정·변경·리마인더·취소거부) / **이력 탭의 그 줄**(병원취소·취소처리·진료후안내 — `예약이 이미 없다`) / 사전문진 화면(문진안내) / 상담방(상담답변 — 4단계). `appointment_id`는 `notification_log`에 이미 있다.
>
> ⭐⭐ **세 번째 심장 = 갈 곳이 없어진 알림(`NOTI-GONE-*`, 결정 B-12)**: 알림은 30일 남는데 그 사이 목적지가 사라질 수 있다(가족 연결 해제가 가장 흔함 · 예약 변경 = 취소+새 예약 · 문진 안내 후 취소 · 계정 병합 #34). **누른 그 순간에만** 목적지 존재를 확인하고(`NOTI-GONE-03` — 목록 그릴 때 전수 확인 금지), 없으면 **안내 팝업 + 이동 안 함 + 알림은 목록에 그대로**(`NOTI-GONE-01·02`). 문구는 **사유를 단정하지 않고 두 가능성**(`예약이 취소되었거나 가족 연결이 해제되었을 수 있습니다`, `NOTI-GONE-04`).
>
> ⚠️ **경계(재소유 금지)**: ① 종 아이콘·배지·`/notifications` 라우트·`unreadNotificationCountProvider` **선언**은 **Task 16 소비**(`NotificationBell`·홈 라우트 표) — 여기서는 **개수를 채우고**(provider 본체) 화면을 만든다(양방향 악수). ② 빈 상태·오프라인·오류 3종은 **Task 12 소비**(`EmptyState.zero/offline/error`). ③ 오프라인 배너·연결 판정은 **Task 11 소비**(`connectivityProvider`·`OfflineBanner`). ④ 알림 **본문 문구·PUSH 규칙 적용은 Task 9가 발송 시점에 이미** 함(`NOTI-BODY-01` — 알림함은 저장된 `body`를 **그대로 표시**만, 진료과·의사·증상을 다시 붙이지 않는다). ⑤ 예약 상세·이력·문진 화면 자체는 **Task 21·27·23 소유** — 여기서는 그 라우트로 **보내기만**. ⑥ 딥링크(`NAV-HOME-18·19`)로 앱에 들어온 경우의 목적지 이동·갈곳없음 팝업은 **Task 11 `PushService` 소비** — 여기서 만드는 `resolveNotificationDestination`·`showNotificationGoneDialog`를 그쪽이 재사용(`NOTI-GONE-05`).
>
> ⚠️ **읽음 처리 순서(색 바가 살아 있으려면)**: 목록은 **현재 `seen_at` 기준**으로 `is_read`를 계산해 내려준다(이번에 새로 온 것은 색 바가 보인다, `NOTI-READ-01`). 화면이 뜬 **직후** `seen_at = now()`로 갱신(`NOTI-READ-04`) → 배지 0. 그래서 색 바는 **이번 열람엔 보이고 다음 열람엔 사라진다**("색 바도 함께 사라진다"의 뜻). 순서를 뒤집어(먼저 갱신 후 조회) 그리면 색 바가 영영 안 보여 `NOTI-READ-01`이 죽는다.
>
> ⚠️ **화면 태스크가 자기 백엔드를 소유한다**(T13 consent·T15 `acknowledge_hospital_change` 선례) — 알림 목록/읽음 서비스·라우터·`00026` 마이그레이션을 이 태스크가 만든다. Task 9(발송)는 `notification_log`에 **쓰기만**, 읽음은 안 건드린다.

**Files:**
- Create: `supabase/migrations/00026_notifications_seen_at.sql`(`patients.notifications_seen_at` 칸 — 결정 「데이터 저장 방식」)
- Create: `backend/app/services/patient_notification_service.py`(`list_notifications`·`count_unread`·`mark_all_read`)
- Create: `backend/app/routers/patient_notifications.py`(`GET /my/notifications`·`GET /my/notifications/unread-count`·`POST /my/notifications/read`)
- Modify: `backend/app/main.py`(`include_router(patient_notifications.router)`)
- Create: `patient_app/lib/features/notifications/notification_view.dart`(`NotificationView` 모델 + `notificationTitle`·`notificationImportant`·`notificationDateGroup`·`resolveNotificationRoute` 순수 함수)
- Create: `patient_app/lib/features/notifications/notification_data.dart`(`notificationRepoProvider`·`notificationsProvider`·`unreadNotificationCountProvider`(T16 이어받음)·`markNotificationsRead`)
- Create: `patient_app/lib/features/notifications/notification_inbox.dart`(`NotificationInbox` 화면 — 목록·날짜 묶음·색 바·30일 안내·빈 상태·탭→목적지)
- Create: `patient_app/lib/features/notifications/notification_gone_dialog.dart`(`showNotificationGoneDialog`·`resolveNotificationDestination` — 딥링크 T11도 재사용)
- Modify: `backend/tests/test_patient_routers_integration.py`(알림 3엔드포인트 인증·읽음 절 추가)
- Test: `backend/tests/test_patient_notification_service.py` · `patient_app/test/features/notifications/{notification_view,notification_data,notification_inbox,notification_gone}_test.dart`

**Interfaces:**
- Consumes:
  - Task 0: `AppTokens`(`primary`(#0B6E70 딥틸)·`warn`·`grayDone`)·`appIcon(AppIconKind…)`·`ApiClient`·`formatKoreanTime`
  - Task 2: `PatientContext`·`get_current_patient` · `acquire_as` · `AppError`(1단계) · `app_error_handler`(라우터 try/except 금지)
  - Task 11: `connectivityProvider`·`OfflineBanner`
  - Task 12: `EmptyState.zero/offline/error`
  - Task 16: `unreadNotificationCountProvider`(`Provider<int>` 선언 — 여기서 본체를 채운다)·`/notifications` 라우트(여기 화면을 끼운다)·홈 라우트 표(`/appointments/:id`·`/history`·`/questionnaire/:id`·`/chat`)
  - ④ `notification_log(id, appointment_id, patient_id, notification_type, kind, channel, delivery_status, body, sent_at)`(`00011`) · `patients`(`00026`이 칸 추가) · Task 9 `notification_service.MESSAGES`(타입 10종의 원본)
- Produces:
  - `patient_notification_service.list_notifications(patient) -> list[dict]`(각 dict: `id`·`notification_type`·`kind`·`body`·`appointment_id`·`sent_at`·`is_read`) · `count_unread(patient) -> int` · `mark_all_read(patient) -> None`
  - REST: `GET /my/notifications` · `GET /my/notifications/unread-count` · `POST /my/notifications/read`
  - Dart: `NotificationView`(`.fromJson`) · `notificationTitle(String) -> String` · `notificationImportant(String) -> bool` · `notificationDateGroup(DateTime sentAt, DateTime now) -> String` · `resolveNotificationRoute(NotificationView) -> String?`(목적지 라우트, 없으면 `null`) · `notificationsProvider`(`FutureProvider<List<NotificationView>>`) · `unreadNotificationCountProvider`(본체) · `markNotificationsRead(WidgetRef) -> Future<void>` · `resolveNotificationDestination(WidgetRef, NotificationView) -> Future<bool>`(누른 순간 존재 확인) · `showNotificationGoneDialog(BuildContext)` · `NotificationInbox`

- [ ] **Step 1: `00026` 마이그레이션 — `patients.notifications_seen_at`**

`supabase/migrations/00026_notifications_seen_at.sql`:
```sql
-- 갭 #22·B-11(결정 2026-08-18 「알림함 데이터 저장 방식」): 알림 「읽음」을 담을 유일한 칸.
-- 「알림함을 열면 전부 읽음」(NOTI-READ-04)이라 계정당 시각 하나로 충분하다.
--   안 읽은 개수 = notification_log에서 patient_id=이 계정 중 sent_at > notifications_seen_at.
--   읽음 처리 = 알림함 진입 순간 이 칸을 now()로.
-- ⛔ notification_log(발송 로그)에 read_at을 얹지 않는다 — 발송 관심사와 읽음 관심사를 섞지 않는다(기각 ①).
-- ⚠️ 번호는 Task 17(00025 cancellation_actor) 다음 = 00026. 직원웹도 00017+ 대역을 쓰므로 실제 번호는 구현 시점 확정.
alter table patients add column if not exists notifications_seen_at timestamptz;
-- NULL = 한 번도 알림함을 안 연 계정 → 모든 알림이 안 읽음(coalesce로 -infinity 취급).
```

- [ ] **Step 2: 백엔드 목록·개수·읽음 실패 테스트** — `backend/tests/test_patient_notification_service.py`

```python
import pytest
from datetime import datetime, timedelta, timezone

from app.core.patient_security import PatientContext
from app.services import patient_notification_service as n
from tests.conftest import seed_patient


def _ctx(s): return PatientContext(id=s["patient_id"], auth_user_id=s["auth_user_id"])


async def _log(db_conn, patient_id, *, ntype="confirmed", body="예약이 확정되었습니다.",
               kind="transactional", sent_at=None, appointment_id=None):
    # notification_log(00011)에 한 줄. 서비스 역할로 넣는다(발송이 하는 일 대역).
    return await db_conn.fetchval(
        "insert into notification_log (appointment_id, patient_id, notification_type, kind, channel, "
        "delivery_status, body, sent_at) values ($1,$2,$3,$4,'push','발송완료',$5, coalesce($6, now())) "
        "returning id",
        appointment_id, patient_id, ntype, kind, body, sent_at)


@pytest.mark.asyncio
async def test_unread_counts_only_after_seen_at(db_conn):
    # NOTI-READ-08: seen_at 이후에 온 것만 안 읽음. seen_at이 null이면 전부 안 읽음.
    me = await seed_patient(db_conn)
    old = datetime.now(timezone.utc) - timedelta(hours=2)
    await _log(db_conn, me["patient_id"], sent_at=old)          # 2시간 전
    await _log(db_conn, me["patient_id"])                        # 방금
    assert await n.count_unread(_ctx(me)) == 2                   # seen_at null → 둘 다 안 읽음
    await db_conn.execute("update patients set notifications_seen_at=$2 where id=$1",
                          me["patient_id"], datetime.now(timezone.utc) - timedelta(hours=1))
    assert await n.count_unread(_ctx(me)) == 1                   # 1시간 전 이후로 온 것만(방금 1건)


@pytest.mark.asyncio
async def test_list_marks_is_read_against_current_seen_at(db_conn):
    # NOTI-READ-01·02: 목록은 현재 seen_at 기준 is_read를 준다(색 바가 이번 열람에 보이도록).
    me = await seed_patient(db_conn)
    old = await _log(db_conn, me["patient_id"], sent_at=datetime.now(timezone.utc) - timedelta(days=1))
    await db_conn.execute("update patients set notifications_seen_at=now() where id=$1", me["patient_id"])
    fresh = await _log(db_conn, me["patient_id"])               # seen_at 이후 도착
    rows = await n.list_notifications(_ctx(me))
    by_id = {r["id"]: r for r in rows}
    assert by_id[old]["is_read"] is True and by_id[fresh]["is_read"] is False


@pytest.mark.asyncio
async def test_list_excludes_older_than_30_days_and_orders_desc(db_conn):
    # NOTI-KEEP-01: 30일까지만. 최신순.
    me = await seed_patient(db_conn)
    await _log(db_conn, me["patient_id"], body="오래됨", sent_at=datetime.now(timezone.utc) - timedelta(days=31))
    await _log(db_conn, me["patient_id"], body="어제", sent_at=datetime.now(timezone.utc) - timedelta(days=1))
    await _log(db_conn, me["patient_id"], body="방금")
    bodies = [r["body"] for r in await n.list_notifications(_ctx(me))]
    assert bodies == ["방금", "어제"] and "오래됨" not in bodies   # 31일 전은 빠지고 최신순


@pytest.mark.asyncio
async def test_list_only_my_rows(db_conn):
    # 남의 알림은 안 보인다(patient_id = 이 계정만). RLS가 아니라 서비스 where로 좁힌다(발송은 서비스 역할이 씀).
    me = await seed_patient(db_conn)
    other = await seed_patient(db_conn, phone="010-9")
    await _log(db_conn, other["patient_id"], body="남의 것")
    await _log(db_conn, me["patient_id"], body="내 것")
    bodies = [r["body"] for r in await n.list_notifications(_ctx(me))]
    assert bodies == ["내 것"]


@pytest.mark.asyncio
async def test_mark_all_read_zeroes_unread(db_conn):
    # NOTI-READ-04: mark_all_read 한 번이면 배지가 0이 된다.
    me = await seed_patient(db_conn)
    await _log(db_conn, me["patient_id"]); await _log(db_conn, me["patient_id"])
    assert await n.count_unread(_ctx(me)) == 2
    await n.mark_all_read(_ctx(me))
    assert await n.count_unread(_ctx(me)) == 0
```
Run: `cd backend && pytest tests/test_patient_notification_service.py -v` → Expected: FAIL(모듈 없음).

- [ ] **Step 3: 백엔드 서비스 구현** — `backend/app/services/patient_notification_service.py`

```python
from uuid import UUID

from app.core.patient_security import PatientContext
from app.db.pool import acquire_as

# 알림함은 로그인 본인 커넥션(RLS)으로 읽는다. notification_log의 SELECT는 본인 행만 보여야 하므로
# where patient_id = 이 계정으로 좁힌다(발송은 서비스 역할이 쓰지만, 읽기는 본인만).
_LIST_SQL = """
    select id, appointment_id, notification_type, kind, body, sent_at,
           (notifications_seen_at is not null and sent_at <= notifications_seen_at) as is_read
      from notification_log nl
      cross join lateral (select notifications_seen_at from patients where id = $1) p
     where nl.patient_id = $1
       and nl.sent_at > now() - interval '30 days'
     order by nl.sent_at desc
"""


async def list_notifications(patient: PatientContext) -> list[dict]:
    """NOTI-LIST-01·READ-01·02·KEEP-01: 30일 이내, 최신순, is_read는 현재 seen_at 기준(갱신 전)."""
    async with acquire_as(patient) as conn:
        rows = await conn.fetch(_LIST_SQL, patient.id)
        return [dict(r) for r in rows]


async def count_unread(patient: PatientContext) -> int:
    """NOTI-READ-08: 종 배지. seen_at 이후에 온 것만. null이면 전부."""
    async with acquire_as(patient) as conn:
        return await conn.fetchval(
            "select count(*) from notification_log nl "
            "where nl.patient_id = $1 and nl.sent_at > now() - interval '30 days' "
            "and nl.sent_at > coalesce("
            "  (select notifications_seen_at from patients where id = $1), '-infinity'::timestamptz)",
            patient.id,
        )


async def mark_all_read(patient: PatientContext) -> None:
    """NOTI-READ-04: 알림함 진입 순간 한 번. seen_at을 now()로 → 배지 0."""
    async with acquire_as(patient) as conn:
        await conn.execute("update patients set notifications_seen_at = now() where id = $1", patient.id)
```
> ⚠️ `acquire_as(patient)`는 본인 RLS 커넥션(Task 2 선례). `notification_log`의 RLS는 ④가 서비스 역할 전용으로 뒀을 수 있어 **서비스가 `where patient_id=$1`로 명시적으로 좁힌다**(본인 것만). `patients` UPDATE는 본인 행만 — Task 1 RLS `patients_can_update_own`이 막아 준다.
Run → FAIL → 구현 → PASS.

- [ ] **Step 4: 라우터 + 통합(인증·읽음) 실패 테스트 → 구현** — `patient_notifications.py` + `main.py` + 통합 테스트

```python
# backend/tests/test_patient_routers_integration.py — 알림 절 추가
@pytest.mark.asyncio
async def test_notifications_require_auth(client):
    assert client.get("/my/notifications").status_code == 401
    assert client.post("/my/notifications/read", json={}).status_code == 401


@pytest.mark.asyncio
async def test_notifications_list_read_flow(client, committed_conn):
    me = await seed_patient(committed_conn)
    await committed_conn.execute(
        "insert into notification_log (patient_id, notification_type, kind, channel, delivery_status, body) "
        "values ($1,'confirmed','transactional','push','발송완료','예약이 확정되었습니다.')", me["patient_id"])
    h = _hdr(make_token(str(me["auth_user_id"])))
    assert client.get("/my/notifications/unread-count", headers=h).json()["unread"] == 1
    lst = client.get("/my/notifications", headers=h)
    assert lst.status_code == 200 and lst.json()[0]["is_read"] is False
    client.post("/my/notifications/read", headers=h)                       # 알림함 진입 대역
    assert client.get("/my/notifications/unread-count", headers=h).json()["unread"] == 0
```
> 구현 `patient_notifications.py`: `router = APIRouter(prefix="/my/notifications", tags=["notifications"])` — `GET ""` → `list_notifications(patient)`; `GET "/unread-count"` → `{"unread": count_unread(patient)}`; `POST "/read"` → `mark_all_read(patient)` 후 `{"ok": True}`. 전부 `patient: PatientContext = Depends(get_current_patient)`. `try/except` 없음(AppError는 전역 핸들러). `main.py`에 `include_router` 한 줄.
Run → FAIL → 구현 → PASS.

- [ ] **Step 5: `NotificationView` 모델 + 순수 함수(제목·중요도·날짜묶음·목적지) 실패 테스트** — `test/features/notifications/notification_view_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/notifications/notification_view.dart';

NotificationView _n(String type, {String? appt = 'ap1', bool read = false}) =>
    NotificationView.fromJson({
      'id': 'n-$type', 'notification_type': type, 'kind': 'transactional',
      'body': '예약 안내', 'appointment_id': appt, 'is_read': read,
      'sent_at': '2026-08-18T09:00:00Z',
    });

void main() {
  test('[NOTI-GO-01] 신청·확정·변경·리마인더·취소거부는 예약 상세로 간다', () {
    for (final t in ['requested', 'confirmed', 'changed', 'reminder_day_before',
                     'reminder_today', 'cancellation_rejected']) {
      expect(resolveNotificationRoute(_n(t)), '/appointments/ap1');
    }
  });
  test('[NOTI-GO-03] 병원취소·취소처리는 이력 탭의 그 줄로 간다(예약이 이미 없다)', () {
    expect(resolveNotificationRoute(_n('hospital_cancelled')), '/history?appointment=ap1');
    expect(resolveNotificationRoute(_n('cancellation_approved')), '/history?appointment=ap1');
  });
  test('[NOTI-GO-06] 진료 후 안내는 이력 탭의 그 줄(안내문 펼침)로 간다', () {
    expect(resolveNotificationRoute(_n('visit_completed')), '/history?appointment=ap1');
  });
  test('[NOTI-GO-04] 사전문진 안내는 문진 작성 화면으로 간다', () {
    expect(resolveNotificationRoute(_n('questionnaire_missing')), '/questionnaire/ap1');
  });
  test('[NOTI-GO-05] 상담 답변은 상담방으로 간다(4단계 챗봇)', () {
    expect(resolveNotificationRoute(_n('chat_reply', appt: null)), '/chat');
  });
  test('[NOTI-GO-02] 병원발 변경도 예약 상세로 가되 appointment_id가 없으면 목적지 없음(갈 곳 없음 판정)', () {
    expect(resolveNotificationRoute(_n('changed', appt: null)), isNull);   // → 탭 시 GONE 팝업
  });
  test('[NOTI-READ-01] 중요(변경·취소)는 주의색, 일반은 딥틸로 가른다', () {
    for (final t in ['changed', 'hospital_cancelled', 'cancellation_approved', 'cancellation_rejected']) {
      expect(notificationImportant(t), isTrue);
    }
    for (final t in ['confirmed', 'reminder_today', 'questionnaire_missing', 'visit_completed']) {
      expect(notificationImportant(t), isFalse);
    }
  });
  test('[NOTI-LIST-01] 제목은 종류별로 다르다', () {
    expect(notificationTitle('confirmed'), '예약 확정');
    expect(notificationTitle('questionnaire_missing'), '사전문진 안내');
    expect(notificationTitle('hospital_cancelled'), '예약 취소');
  });
  test('[NOTI-LIST-01] 날짜 묶음은 오늘/어제/그 밖 날짜로 가른다', () {
    final now = DateTime(2026, 8, 18, 15);
    expect(notificationDateGroup(DateTime(2026, 8, 18, 9), now), '오늘');
    expect(notificationDateGroup(DateTime(2026, 8, 17, 9), now), '어제');
    expect(notificationDateGroup(DateTime(2026, 8, 10, 9), now), '8월 10일');
  });
}
```
Run → FAIL.

- [ ] **Step 6: 모델 + 순수 함수 구현** — `patient_app/lib/features/notifications/notification_view.dart`

```dart
class NotificationView {
  final String id;
  final String notificationType;
  final String kind;
  final String body;              // Task 9가 PUSH 규칙대로 만든 표시 문구(대상자 이름 포함) — 그대로 쓴다(NOTI-BODY-01)
  final String? appointmentId;
  final DateTime sentAt;
  final bool isRead;
  NotificationView({required this.id, required this.notificationType, required this.kind,
    required this.body, required this.appointmentId, required this.sentAt, required this.isRead});
  factory NotificationView.fromJson(Map<String, dynamic> j) => NotificationView(
        id: j['id'] as String,
        notificationType: j['notification_type'] as String,
        kind: j['kind'] as String? ?? 'transactional',
        body: j['body'] as String,
        appointmentId: j['appointment_id'] as String?,
        sentAt: DateTime.parse(j['sent_at'] as String).toLocal(),
        isRead: j['is_read'] as bool? ?? false,
      );
}

/// NOTI-GO-*: 종류 → 눌렀을 때 가는 라우트. null이면 목적지 없음(탭 시 갈 곳 없음 팝업).
String? resolveNotificationRoute(NotificationView n) {
  switch (n.notificationType) {
    case 'requested': case 'confirmed': case 'changed':
    case 'reminder_day_before': case 'reminder_today': case 'cancellation_rejected':
      return n.appointmentId == null ? null : '/appointments/${n.appointmentId}';   // GO-01·02
    case 'hospital_cancelled': case 'cancellation_approved': case 'visit_completed':
      return n.appointmentId == null ? null : '/history?appointment=${n.appointmentId}';  // GO-03·06(이력)
    case 'questionnaire_missing':
      return n.appointmentId == null ? null : '/questionnaire/${n.appointmentId}';   // GO-04
    case 'chat_reply':
      return '/chat';                                                                // GO-05(4단계)
    default:
      return null;
  }
}

/// NOTI-READ-01: 중요(변경·취소)=주의색 / 일반=딥틸.
bool notificationImportant(String type) => const {
      'changed', 'hospital_cancelled', 'cancellation_approved', 'cancellation_rejected',
    }.contains(type);

/// NOTI-LIST-01: 종류별 제목.
String notificationTitle(String type) => switch (type) {
      'requested' => '예약 신청',
      'confirmed' => '예약 확정',
      'changed' => '예약 변경',
      'reminder_day_before' => '내일 예약 안내',
      'reminder_today' => '오늘 예약 안내',
      'hospital_cancelled' => '예약 취소',
      'cancellation_approved' => '취소 처리',
      'cancellation_rejected' => '취소 안내',
      'questionnaire_missing' => '사전문진 안내',
      'visit_completed' => '진료 후 안내',
      'chat_reply' => '상담 답변',
      _ => '알림',
    };

/// NOTI-LIST-01: 날짜 묶음 머리(오늘/어제/M월 D일).
String notificationDateGroup(DateTime sentAt, DateTime now) {
  final d = DateTime(sentAt.year, sentAt.month, sentAt.day);
  final today = DateTime(now.year, now.month, now.day);
  final diff = today.difference(d).inDays;
  if (diff <= 0) return '오늘';
  if (diff == 1) return '어제';
  return '${sentAt.month}월 ${sentAt.day}일';
}
```
Run → PASS.

- [ ] **Step 7: Repo·providers·읽음 창구 실패 테스트 → 구현** — `notification_data.dart` + `test/features/notifications/notification_data_test.dart`

```dart
test('[NOTI-CACHE-01] 오프라인이면 서버를 부르지 않고 빈 목록(캐시하지 않는다)', () async {
  final api = _ThrowingApi();               // 부르면 실패
  final list = await loadNotifications(api: api, online: false);
  expect(list, isEmpty);                    // 예약 목록과 달리 알림은 폰에 저장하지 않는다(OFF-CACHE-03)
});
test('[NOTI-READ-04] markNotificationsRead 후 배지 개수 provider가 0을 준다', () async {
  final api = _FakeApi(unread: 3);
  final container = ProviderContainer(overrides: [notificationApiProvider.overrideWithValue(api)]);
  expect(container.read(unreadNotificationCountProvider), 0);  // 로딩 중엔 0(Provider<int> 계약, T16)
  await container.read(notificationRepoProvider).markAllRead();
  expect(api.markedRead, isTrue);            // POST /my/notifications/read 를 불렀다
});
test('[NOTI-READ-08] 배지 개수는 unread-count 응답을 그대로 노출한다', () async {
  final api = _FakeApi(unread: 3);
  final container = ProviderContainer(overrides: [notificationApiProvider.overrideWithValue(api)]);
  await container.read(unreadCountAsyncProvider.future);
  expect(container.read(unreadNotificationCountProvider), 3);
});
```
> 구현: `loadNotifications({api, online})` — `online`이면 `GET /my/notifications` → `NotificationView.fromJson` 매핑, `online=false`면 **부르지 않고 `[]`**(NOTI-CACHE-01·OFF-CACHE-03, 예약과 달리 캐시 없음). `notificationsProvider`(`FutureProvider`)가 `connectivityProvider`를 읽어 분기. `unreadCountAsyncProvider`(`FutureProvider<int>` — `GET /unread-count`), `unreadNotificationCountProvider`(`Provider<int>`, **T16이 선언한 타입 유지** — `ref.watch(unreadCountAsyncProvider).maybeWhen(data: (n) => n, orElse: () => 0)`). `notificationRepoProvider.markAllRead()` = `POST /my/notifications/read` 후 `ref.invalidate(unreadCountAsyncProvider)`. `markNotificationsRead(ref)` = 화면이 진입 시 부르는 얇은 래퍼(레포 호출 + 무효화).
Run → FAIL → 구현 → PASS.

- [ ] **Step 8: `NotificationInbox` 화면 — 목록·색 바·30일 안내·빈 상태·진입 시 읽음 (`NOTI-LIST`·`READ-01~03·05·07`·`KEEP`·`EMPTY`·`OFF`·`BODY`)** — `test/features/notifications/notification_inbox_test.dart`

```dart
testWidgets('[NOTI-LIST-01][NOTI-BODY-01] 목록은 날짜 묶음·제목·본문(저장된 그대로)·시각을 보인다', (t) async {
  await t.pumpWidget(_inbox([_n('confirmed', body: '민준님 예약이 확정되었습니다.')]));
  expect(find.text('오늘'), findsOneWidget);                 // 날짜 묶음 머리
  expect(find.text('예약 확정'), findsOneWidget);            // 제목
  expect(find.text('민준님 예약이 확정되었습니다.'), findsOneWidget);  // 본문 그대로(진료과·의사 안 붙임)
});
testWidgets('[NOTI-READ-01] 안 읽은 알림은 왼쪽 색 바 — 중요는 주의색, 일반은 딥틸', (t) async {
  await t.pumpWidget(_inbox([_n('hospital_cancelled', read: false), _n('confirmed', read: false)]));
  expect(barColor(t, '예약 취소'), AppTokens.warn);          // 중요=주의색
  expect(barColor(t, '예약 확정'), AppTokens.primary);       // 일반=딥틸
});
testWidgets('[NOTI-READ-02] 읽은 알림은 색 바가 없고 글자가 회색', (t) async {
  await t.pumpWidget(_inbox([_n('confirmed', read: true)]));
  expect(hasBar(t, '예약 확정'), isFalse);
  expect(textColor(t, '예약 확정'), AppTokens.grayDone);
});
testWidgets('[NOTI-READ-03] 읽지 않은 알림의 배경을 물들이지 않는다(면적 최소)', (t) async {
  await t.pumpWidget(_inbox([_n('hospital_cancelled', read: false)]));
  expect(rowBackgroundTinted(t, '예약 취소'), isFalse);       // 색은 4px 바에만
});
testWidgets('[NOTI-KEEP-02] 목록 하단에 30일 보관 안내', (t) async {
  await t.pumpWidget(_inbox([_n('confirmed')]));
  expect(find.text('알림은 30일 동안 보관됩니다'), findsOneWidget);
});
testWidgets('[NOTI-READ-04] 화면에 들어오면 읽음 창구를 부른다(배지가 0이 된다)', (t) async {
  final api = _FakeApi(items: [_json('confirmed')], unread: 1);
  await t.pumpWidget(_inboxApp(api));
  await t.pumpAndSettle();
  expect(api.markedRead, isTrue);                            // 진입 순간 mark_all_read
});
testWidgets('[NOTI-EMPTY-01][NOTI-EMPTY-02] 0건이면 안내만, [다시 시도] 없음', (t) async {
  await t.pumpWidget(_inbox([]));
  expect(find.textContaining('받은 알림이 없습니다'), findsOneWidget);
  expect(find.textContaining('여기에서 알려드립니다'), findsOneWidget);
  expect(find.widgetWithText(ActionButton, '다시 시도'), findsNothing);  // 실패가 아니라 사실
});
testWidgets('[NOTI-EMPTY-03][NOTI-OFF-01] 오프라인·조회 실패면 [다시 시도]가 붙는다', (t) async {
  await t.pumpWidget(_inboxOffline());
  expect(find.widgetWithText(ActionButton, '다시 시도'), findsOneWidget);   // EmptyState.offline
});
```
> 구현: `NotificationInbox`가 `notificationsProvider`를 watch — 데이터면 날짜 묶음(`notificationDateGroup`)으로 섹션, 각 줄 = (안 읽음이면 왼쪽 4px 바 `notificationImportant?warn:primary`, `NOTI-READ-01`) + `appIcon` + `notificationTitle` + `body`(그대로, `NOTI-BODY-01`) + `formatKoreanTime(sentAt)`. 읽은 줄은 바 없음·`grayDone` 글자(`NOTI-READ-02`), 배경 안 물들임(`NOTI-READ-03`). 하단 `알림은 30일 동안 보관됩니다`(`NOTI-KEEP-02`, 목록은 `NOTI-KEEP-01`대로 읽어도 사라지지 않음 = 서버가 안 지움). 0건 → `EmptyState.zero`(`받은 알림이 없습니다` + `예약이 확정되거나 변경되면 여기에서 알려드립니다`, `[다시 시도]` 없음 `NOTI-EMPTY-01·02`). 오프라인/에러 → `EmptyState.offline/error`(`[다시 시도]` 있음 `NOTI-EMPTY-03`). ⭐ **진입 시**(`initState`/첫 build 후 `ref.read`) `markNotificationsRead(ref)` → 배지 0(`NOTI-READ-04`) — **목록 조회가 먼저 끝난 뒤** 부른다(색 바 보존, 위 「읽음 처리 순서」). `NOTI-READ-05·07`(근거·배지·색바 안 나눔)은 이 단일 seen_at 구조가 실현. `NOTI-OFF-01`(끈 알림은 알림함에도 없음)은 Task 9가 끈 알림의 `notification_log` 행 자체를 안 만들어 자동 실현(테스트는 오프라인 빈 화면과 함께 확인).
Run → FAIL → 구현 → PASS.

- [ ] **Step 9: 탭 → 목적지 이동 + 갈 곳 없어진 알림 팝업 (`NOTI-GO-*`·`NOTI-GONE-*`·`NAV-HOME-16·17`)** — `test/features/notifications/notification_gone_test.dart`

```dart
testWidgets('[NOTI-GO-01][NAV-HOME-16] 알림을 누르면 종류별 목적지로 간다', (t) async {
  await t.pumpWidget(_inboxApp(_FakeApi(items: [_json('confirmed', appt: 'ap1')]), destinationExists: true));
  await t.pumpAndSettle();
  await t.tap(find.text('예약 확정'));
  await t.pumpAndSettle();
  expect(find.text('예약 상세'), findsOneWidget);            // /appointments/ap1
});
testWidgets('[NOTI-GONE-01][NOTI-GONE-02][NAV-HOME-17] 갈 곳이 없으면 팝업만·이동 안 함·알림은 남는다', (t) async {
  await t.pumpWidget(_inboxApp(_FakeApi(items: [_json('confirmed', appt: 'ap1')]), destinationExists: false));
  await t.pumpAndSettle();
  await t.tap(find.text('예약 확정'));
  await t.pumpAndSettle();
  expect(find.textContaining('더 이상 볼 수 없습니다'), findsOneWidget);       // 안내 팝업(GONE-01)
  expect(find.text('예약 상세'), findsNothing);                                 // 이동하지 않음
  expect(find.text('예약 확정'), findsOneWidget);                              // 알림은 목록에 그대로(GONE-02)
});
testWidgets('[NOTI-GONE-04] 팝업 문구는 사유를 단정하지 않고 두 가능성을 함께 적는다', (t) async {
  await t.pumpWidget(_inboxApp(_FakeApi(items: [_json('confirmed', appt: 'ap1')]), destinationExists: false));
  await t.pumpAndSettle();
  await t.tap(find.text('예약 확정'));
  await t.pumpAndSettle();
  expect(find.textContaining('예약이 취소되었거나 가족 연결이 해제되었을 수 있습니다'), findsOneWidget);
});
testWidgets('[NOTI-GONE-03] 목적지 확인은 누른 그 순간에만 한다(목록 그릴 때 전수 확인 안 함)', (t) async {
  final api = _FakeApi(items: List.generate(5, (i) => _json('confirmed', appt: 'ap$i')));
  await t.pumpWidget(_inboxApp(api, destinationExists: true));
  await t.pumpAndSettle();
  expect(api.existChecks, 0);              // 목록 5줄을 그렸어도 존재 확인 0회
  await t.tap(find.text('예약 확정').first);
  await t.pumpAndSettle();
  expect(api.existChecks, 1);              // 누른 한 줄만 확인
});
```
> 구현: 줄 탭 → `openNotification(context, ref, view)`: `route = resolveNotificationRoute(view)`; `route == null`이면 바로 `showNotificationGoneDialog`(목적지 자체가 없음). 아니면 `resolveNotificationDestination(ref, view)`로 **누른 그 순간** 존재 확인(`NOTI-GONE-03`) — 예약 기반이면 `GET /my/appointments/{id}`(없음/권한없음 → false), `chat`은 true(4단계). false면 `showNotificationGoneDialog`(팝업 + 이동 안 함 + 목록 유지, `NOTI-GONE-01·02`), true면 `context.go(route)`(`NAV-HOME-16`). `showNotificationGoneDialog` 문구 = `이 예약은 더 이상 볼 수 없습니다` / `예약이 취소되었거나 가족 연결이 해제되었을 수 있습니다` / `[닫기]`(`NOTI-GONE-04`). ⭐ **`resolveNotificationDestination`·`showNotificationGoneDialog`는 딥링크(Task 11 `PushService`)도 재사용**(`NOTI-GONE-05` — 잠금화면 푸시로 들어와 목적지가 사라진 경우 같은 팝업, 목적지는 홈). `NOTI-GONE-06`(일어나는 경우 목록)은 결정 근거라 팝업 문구가 실현.
Run → FAIL → 구현 → PASS.

- [ ] **Step 10: 전체 테스트 + 커밋**

```bash
cd backend && pytest tests/test_patient_notification_service.py tests/test_patient_routers_integration.py -v
cd ../patient_app && flutter test test/features/notifications/
git add supabase/migrations/00026_notifications_seen_at.sql backend/app/services/patient_notification_service.py \
  backend/app/routers/patient_notifications.py backend/app/main.py backend/tests/ \
  patient_app/lib/features/notifications/ patient_app/test/features/notifications/
git commit -m "feat: 환자앱 Task 18 — 알림함 목록·읽음(seen_at)·목적지·갈곳없음 30규칙(NOTI-*)"
```

> 📌 **규칙 커버리지(30)**: `NOTI-LIST-01`(1) · `NOTI-READ-01~08`(8) · `NOTI-KEEP-01·02`(2) · `NOTI-GO-01~06`(6) · `NOTI-GONE-01~06`(6) · `NOTI-OFF-01`(1) · `NOTI-EMPTY-01·02·03`(3) · `NOTI-CACHE-01`(1) · `NOTI-BODY-01`(1) · `NOTI-IMPL-01`(1).
> ⭐ **T16 양방향 악수 갚음**: `unreadNotificationCountProvider` **본체**(T16은 `Provider<int>` 선언만)·`/notifications` 화면·종 탭 진입 시 읽음 창구(`markNotificationsRead`)를 채웠다. `NAV-HOME-16`(알림→목적지)·`NAV-HOME-17`(갈 곳 없음 팝업)의 목적지 표(`NOTI-GO-*`)가 여기서 실현.
> ⭐ **결정 「알림함 데이터 저장 방식」 실현**: `00026 notifications_seen_at` 한 칸 = 읽음 저장(개별 read_at·별도 표 기각). `NOTI-IMPL-01`이 가리킨 「저장 테이블(④ 있음)·목록 API(신설)·읽음 처리(seen_at)·30일 정리(조회 `where sent_at > now()-30d`)」 4조각을 전부 닫음.
> 📌 **값 없는/구조 규칙 — 「어느 테스트가 실현하는가」**: `NOTI-READ-05`(근거=새로 온 게 있나)·`NOTI-READ-06`(개별 읽음 기각)·`NOTI-READ-07`(배지·색바 안 나눔): 단일 `seen_at` 구조 자체가 실현(Step 2 `count_unread` + Step 8 색 바). `NOTI-KEEP-01`(읽어도 안 지움): 서버가 삭제 안 함 = Step 3 조회에 삭제 없음(30일 지난 것만 필터, 실제 행은 배포 cron 몫). `NOTI-OFF-01`(끈 알림 알림함에도 없음): Task 9가 끈 알림의 로그 행을 안 만듦 → 조회에 안 걸림. `NOTI-GONE-05`(딥링크도 같은 팝업): `resolveNotificationDestination`·`showNotificationGoneDialog`를 T11이 재사용. `NOTI-GONE-06`(일어나는 경우): 팝업 문구가 두 가능성으로 실현.
> 📌 **완전 ID로 못박기**: `NOTI-READ-01~08`·`NOTI-GO-01~06`·`NOTI-GONE-01~06`·`NOTI-EMPTY-01·02·03`을 범위·축약 없이 개별 ID로 test에 심었다(검사기가 축약을 못 읽는 함정 방지 — T16·T17 교훈).
> ⚠️ **신설 마이그레이션 `00026_notifications_seen_at.sql`** — 직원웹도 `00017+`를 쓰므로 실제 번호는 구현 시점 확정(먼저 적용하는 쪽 우선). `patients` 한 칸이라 의존 없음.
> 📌 **`chat_reply` 타입은 4단계(챗봇)가 `MESSAGES`·`notification_log`에 추가**한다 — 여기 `resolveNotificationRoute`의 `chat_reply→/chat`은 미리 깔아 둔 배선(`NOTI-GO-05`). 그전엔 그 타입의 행이 없어 무해.

---

## Task 19: 예약 마법사 1~4단계 (대상·진료과·의사·날짜) + 값 보존 + 갭 #7·#9 소급

> **담당 규칙(71)**: `BOOK-NAV-01~10`(10) · `BOOK-KEEP-01~07`(7) · `BOOK-WHO-01~09`(9) · `BOOK-DEPT-01~03`(3) · `BOOK-DOC-01~09`(9) · `BOOK-DATE-01~09`(9) · `NAV-BOOK-01~24`(24).
> ⭐ **여기서 확정 갭 2건을 닫는다**(핸드오프가 예고한 「T4 확장 핀」 발화):
> - **갭 #7**(의사 전공·사진): 직원웹 `00026_staff_profile_palette.sql`이 이미 `staff`에 `specialty·bio·photo_url` 칸 + `doctor-photos` 버킷(공개 읽기, `STAFF-PROFILE-06`)을 얹었다 → **새 마이그레이션 없이** T4 `list_doctors`의 SELECT에 `specialty·photo_url`을 더한다(`bio`는 화면 비노출 = `BOOK-DOC-06`, 챗봇 지식용). `BOOK-DOC-07`의 「이름밖에 못 띄운다」가 이 스텝으로 해소된다.
> - **갭 #9**(진료요일 「월·수·금 오전」 한 줄 요약): `list_doctors`가 `schedule_summary` 문자열을 함께 반환한다. 요약 규칙(같은 시간대 요일 묶기·연속 3일↑은 `월~금` 축약·오전/오후/종일 판정)은 **서버 한 곳**(`summarize_schedule` 순수 함수)에 둔다 — 앱·챗봇·직원웹이 같은 문장을 쓴다(결정 문서 「계산은 서버 한 곳」).
> ⚠️ **경계 명시(NAV-BOOK 전부가 T19인데 5~8단계 화면은 T20 소유)**: `NAV-BOOK-11~20`(5~8단계 전환)은 **화면 위젯이 아니라 마법사 셸의 상태 전이 규칙**으로 검증한다 — `BookingController`의 `_step` 전이만 단위 테스트로 못박고, 5~8단계 화면(BookTime·Why·Conf·Done)과 신청(`book_slot`)은 **Task 20이 셸의 `switch`에 끼운다**. 마법사 셸(전 단계를 아는 단일 상태머신)은 T19가 소유하고 T20이 뒷 절반을 붙이는 구조라, 71을 쪼개면 셸이 두 태스크에 중복된다(그래서 한 태스크 유지 — 사용자 승인 2026-08-18).

**Files:**
- Modify: `backend/app/services/patient_catalog_service.py`(`list_doctors` 확장 — 갭 #7·#9)
- Create: `backend/app/services/doctor_schedule_summary.py`(`summarize_schedule` 순수 함수 — 갭 #9)
- Test: `backend/tests/test_doctor_schedule_summary.py`(속성) · `backend/tests/test_patient_catalog_service.py`(확장)
- Create: `patient_app/lib/features/booking/catalog_repository.dart`(`Department`·`Doctor` 모델 · `CatalogRepository` · providers)
- Create: `patient_app/lib/features/booking/booking_controller.dart`(`BookingSelection`·`BookingController`·`bookingProvider`)
- Create: `patient_app/lib/features/booking/booking_wizard.dart`(마법사 셸 — 진행 막대·뒤로·요약 딱지·단계 switch)
- Create: `patient_app/lib/features/booking/steps/who_step.dart`·`dept_step.dart`·`doctor_step.dart`·`date_step.dart`
- Modify: `patient_app/lib/core/router.dart`(`/booking` placeholder → `BookingWizard`, `NAV-BOOK-01·02` 진입)
- Test: `patient_app/test/features/booking/*`

**Interfaces:**
- Consumes:
  - `patient_family_service.list_family_members(patient) -> list[dict]`(Task 3 — 대상 목록 본인+가족)
  - `patient_catalog_service.list_departments`·`list_available_dates`(Task 4) · `staff.specialty·bio·photo_url`(직원웹 `00026`) · `doctor_schedule_rules(doctor_id, weekday, start_time, end_time)`(`00002`) · `app.db.admin_client.get_admin_client`(1단계)
  - `GET /catalog/departments` · `GET /catalog/departments/{department_id}/doctors`(응답 확장) · `GET /catalog/doctors/{doctor_id}/dates`(Task 4 라우터)
  - Task 12: `ActionButton({label, busyLabel, onPressed, busy, disabledReason})` · `EmptyState.zero/error/offline` · `showExitConfirm` · `InlineError({message})`
  - Task 11: `connectivityProvider`(`StreamProvider<bool>`) · `handleUnauthorized(ref)` · `AppShell`(하단 탭) · 라우터 전역 가드
  - Task 16: 홈 `[+ 진료 예약하기]`(0건 빈 상태) · 예약 탭 `[+ 새 예약하기]` → `context.go('/booking')` 진입점
- Produces:
  - `list_doctors` 확장 반환 `{id, name, specialty, photo_url, schedule_summary}` — 3단계 화면 · 4단계 챗봇 지식(`bio`)이 소비
  - `summarize_schedule(rules: list[dict]) -> str` — 서버 한 곳의 진료요일 요약(챗봇·직원웹 재사용 가능)
  - `BookingSelection`(patient·department·doctor·date + `copyWith`) · `BookingController`(`selectPatient`·`selectDepartment`·`selectDoctor`·`selectDate`·`back`·`reset`·`step`) · `bookingProvider`(`StateNotifierProvider` — 앱 생존 동안 유지, 폰 저장 안 함) — **Task 20이 이어받아 5~8단계(시간·이유·확인·완료)와 `submit()`을 붙인다**
  - `BookingWizard` 셸(진행 막대 `N단계 / 8단계 · 이름` · 뒤로 하나 · 요약 딱지) — Task 20이 `switch(step)`에 5~8단계 위젯을 끼운다
  - 2단계 상담봇 시트 진입 훅 `onOpenDeptBot` — **Task 20 `BOOK-BOT-*`이 시트 UI를 실체화**(여기선 시트를 여는 라우팅만)

- [ ] **Step 1: 진료요일 요약 순수 함수 실패 테스트 (갭 #9)** — `backend/tests/test_doctor_schedule_summary.py`

```python
from datetime import time
import pytest
from app.services.doctor_schedule_summary import summarize_schedule

def _r(weekday, start, end): return {"weekday": weekday, "start_time": start, "end_time": end}

def test_summary_groups_same_period_nonconsecutive_days():
    # [BOOK-DOC-03] 월(0)·수(2)·금(4) 오전 → "월·수·금 오전" (같은 시간대 요일을 · 로 묶는다)
    rules = [_r(0, time(9,0), time(12,0)), _r(2, time(9,0), time(12,0)), _r(4, time(9,0), time(12,0))]
    assert summarize_schedule(rules) == "월·수·금 오전"

def test_summary_compresses_three_or_more_consecutive_days():
    # [BOOK-DOC-03] 월~금(0~4) 오전이 연속 3일 이상이면 "월~금 오전"으로 축약
    rules = [_r(w, time(9,0), time(12,0)) for w in range(5)]
    assert summarize_schedule(rules) == "월~금 오전"

def test_summary_period_boundaries():
    # [BOOK-DOC-09] 오전/오후/종일 판정 — end<=12 오전, start>=12 오후, 걸치면 종일
    assert summarize_schedule([_r(0, time(9,0), time(12,0))]) == "월 오전"
    assert summarize_schedule([_r(1, time(13,0), time(17,0))]) == "화 오후"
    assert summarize_schedule([_r(2, time(9,0), time(17,0))]) == "수 종일"

def test_summary_multiple_periods_ordered():
    # [BOOK-DOC-03] 시간대가 섞이면 오전 → 오후 순으로 이어붙인다
    rules = [_r(0, time(9,0), time(12,0)), _r(1, time(13,0), time(17,0))]
    assert summarize_schedule(rules) == "월 오전, 화 오후"

def test_summary_empty_is_placeholder():
    # [BOOK-DOC-09] 규칙이 하나도 없으면 빈 문자열이 아니라 안내 문구(카드가 휑하지 않게)
    assert summarize_schedule([]) == "진료시간 문의"

@pytest.mark.parametrize("mask", range(1, 128))  # 요일 0~6의 모든 부분집합(비지 않는)
def test_summary_never_crashes_and_covers_all_days(mask):
    # 🎲 [BOOK-DOC-03] 임의 요일 집합에서 크래시 없고, 고른 요일 이름이 결과에 모두 포함된다(값-형식 코드 = 갭 #127 종류 방지)
    wd = [w for w in range(7) if mask & (1 << w)]
    rules = [_r(w, time(9,0), time(12,0)) for w in wd]
    out = summarize_schedule(rules)
    names = ["월","화","수","목","금","토","일"]
    # "월~금" 축약이면 양끝만, 아니면 각 이름이 들어간다 — 최소한 첫·끝 요일 이름은 항상 보인다
    assert names[wd[0]] in out and names[wd[-1]] in out
```
Run → Expected: FAIL(모듈 없음).

- [ ] **Step 2: `summarize_schedule` 구현 + 통과**

```python
# backend/app/services/doctor_schedule_summary.py
# 갭 #9 — 의사별 진료요일을 사람이 읽는 한 줄로. 앱·챗봇·직원웹이 같은 문장을 쓰도록 서버 한 곳에 둔다.
from datetime import time

_WD = ["월", "화", "수", "목", "금", "토", "일"]  # doctor_schedule_rules.weekday: 0=월 ~ 6=일(00002 check)
_NOON = time(12, 0)
_PERIOD_ORDER = {"오전": 0, "오후": 1, "종일": 2}


def _period(start: time, end: time) -> str:
    if end <= _NOON:
        return "오전"
    if start >= _NOON:
        return "오후"
    return "종일"


def _compress_days(weekdays: list[int]) -> str:
    # 연속 구간이 3일 이상이면 "월~금", 아니면 "·"로 나열. 혼재하면 구간별로.
    runs: list[list[int]] = []
    for w in sorted(set(weekdays)):
        if runs and w == runs[-1][-1] + 1:
            runs[-1].append(w)
        else:
            runs.append([w])
    labels: list[str] = []
    for run in runs:
        if len(run) >= 3:
            labels.append(f"{_WD[run[0]]}~{_WD[run[-1]]}")
        else:
            labels.extend(_WD[w] for w in run)
    return "·".join(labels)


def summarize_schedule(rules: list[dict]) -> str:
    """rules: [{weekday:int, start_time:time, end_time:time}]. 진료요일 한 줄 요약."""
    if not rules:
        return "진료시간 문의"
    by_period: dict[str, list[int]] = {}
    for r in rules:
        by_period.setdefault(_period(r["start_time"], r["end_time"]), []).append(r["weekday"])
    parts = [
        f"{_compress_days(days)} {period}"
        for period, days in sorted(by_period.items(), key=lambda kv: _PERIOD_ORDER.get(kv[0], 9))
    ]
    return ", ".join(parts)
```
Run → Expected: PASS(속성 포함 전체).

- [ ] **Step 3: `list_doctors` 확장 실패 테스트 (갭 #7·#9)** — `backend/tests/test_patient_catalog_service.py`에 추가

```python
from datetime import time

@pytest.mark.asyncio
async def test_list_doctors_returns_profile_and_schedule(db_conn):
    # [BOOK-DOC-02][BOOK-DOC-07] 갭 #7 — 사진·전공을 함께 반환한다(직원웹 00026이 얹은 staff 칸).
    admin = await seed_staff(db_conn, role="admin"); await set_session_auth(db_conn, admin["auth_user_id"])
    dept = await db_conn.fetchval("insert into departments (name, is_active) values ('내과', true) returning id")
    doc = await seed_staff(db_conn, role="doctor", department_id=dept)
    # 직원웹 00026 칸을 채운다(구현 시점엔 이미 존재하는 칸).
    await db_conn.execute("update staff set specialty=$2, photo_url=$3 where id=$1",
                          doc["staff_id"], "소화기내과", "https://cdn/doc.jpg")
    # 갭 #9 — 진료요일: 월·수·금 오전.
    for w in (0, 2, 4):
        await db_conn.execute(
            "insert into doctor_schedule_rules (doctor_id, weekday, start_time, end_time, slot_duration_minutes, max_daily_appointments) "
            "values ($1,$2,'09:00','12:00',20,10)", doc["staff_id"], w)
    docs = await patient_catalog_service.list_doctors(dept, _ctx(await seed_patient(db_conn)))
    assert docs[0]["specialty"] == "소화기내과"
    assert docs[0]["photo_url"] == "https://cdn/doc.jpg"
    assert docs[0]["schedule_summary"] == "월·수·금 오전"   # 갭 #9 서버 요약
    assert "bio" not in docs[0]                             # [BOOK-DOC-06] bio는 화면 비노출 — 반환하지 않는다

@pytest.mark.asyncio
async def test_list_doctors_photo_url_null_when_absent(db_conn):
    # [BOOK-DOC-05] 사진 없는 의사는 photo_url=None → 화면이 회색 원+첫 글자로 그린다.
    admin = await seed_staff(db_conn, role="admin"); await set_session_auth(db_conn, admin["auth_user_id"])
    dept = await db_conn.fetchval("insert into departments (name, is_active) values ('내과', true) returning id")
    doc = await seed_staff(db_conn, role="doctor", department_id=dept)
    docs = await patient_catalog_service.list_doctors(dept, _ctx(await seed_patient(db_conn)))
    assert docs[0]["photo_url"] is None and docs[0]["schedule_summary"] == "진료시간 문의"
```
Run → Expected: FAIL(반환에 새 키 없음).

- [ ] **Step 4: `list_doctors` 확장 구현 (갭 #7·#9)**

`backend/app/services/patient_catalog_service.py`의 `list_doctors`를 아래로 교체(핀 주석 제거):

```python
from collections import defaultdict
from app.db.admin_client import get_admin_client
from app.services.doctor_schedule_summary import summarize_schedule

async def list_doctors(department_id: UUID, patient: PatientContext) -> list[dict]:
    # 갭 #7: staff의 전공·사진을 함께 반환(직원웹 00026이 얹은 칸). bio는 화면 비노출(BOOK-DOC-06)이라 뺀다.
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            "select id, name, specialty, photo_url from staff "
            "where role='doctor' and department_id=$1 and is_active order by name",
            department_id)
    doctors = [dict(r) for r in rows]
    if not doctors:
        return []
    # 갭 #9: 진료요일 요약. doctor_schedule_rules는 staff 전용 RLS라 admin_client로 읽는다(진료요일은 민감정보 아님).
    ids = [str(d["id"]) for d in doctors]
    resp = (get_admin_client().table("doctor_schedule_rules")
            .select("doctor_id, weekday, start_time, end_time").in_("doctor_id", ids).execute())
    by_doctor: dict[str, list[dict]] = defaultdict(list)
    for r in resp.data:
        by_doctor[str(r["doctor_id"])].append({
            "weekday": r["weekday"],
            "start_time": time.fromisoformat(r["start_time"]),
            "end_time": time.fromisoformat(r["end_time"]),
        })
    for d in doctors:
        d["schedule_summary"] = summarize_schedule(by_doctor.get(str(d["id"]), []))
    return doctors  # {id, name, specialty, photo_url, schedule_summary}
```
`from datetime import time`을 import에 추가. 라우터(`GET /catalog/departments/{department_id}/doctors`)는 dict를 그대로 반환하므로 응답이 자동 확장된다. Run → Expected: PASS.
> 📌 **역참조 반영(경계 갭 마감)**: 이 스텝으로 `BOOK-DOC-07`(「지금 플랜으로는 이름밖에 못 띄운다」)·`BOOK-DATE`와 무관한 갭 #7·#9가 닫힌다 → `screen-behaviors.md`의 `BOOK-DOC-07`에 `~~이름밖에 못 띄운다~~ ✅ 해소(2026-08-18, T19 — list_doctors가 specialty·photo_url·schedule_summary 반환)` 역참조, 결정 문서 「기능 갭」 #7·#9 체크박스 완료 표시, 경계 갭 대조표 #7 `list_doctors id·name만` → `해소`로 갱신(이 세 곳은 Step 13 커밋 전 함께 수정).

- [ ] **Step 5: 프론트 카탈로그 저장소 + 모델** — `patient_app/lib/features/booking/catalog_repository.dart`

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';           // Task 0 얇은 ApiClient(apiClientProvider)

class Department {
  final String id, name;
  const Department(this.id, this.name);
  factory Department.fromJson(Map<String, dynamic> j) => Department(j['id'], j['name']);
}

class Doctor {
  final String id, name;
  final String? specialty, photoUrl;   // 갭 #7 — null이면 화면이 회색 원(BOOK-DOC-05)
  final String scheduleSummary;        // 갭 #9 — 서버가 만든 "월·수·금 오전"
  const Doctor(this.id, this.name, this.specialty, this.photoUrl, this.scheduleSummary);
  factory Doctor.fromJson(Map<String, dynamic> j) =>
      Doctor(j['id'], j['name'], j['specialty'], j['photo_url'], j['schedule_summary'] ?? '진료시간 문의');
}

class CatalogRepository {
  CatalogRepository(this._api);
  final ApiClient _api;
  Future<List<Department>> departments() async =>
      (await _api.getJsonList('/catalog/departments')).map(Department.fromJson).toList();
  Future<List<Doctor>> doctors(String deptId) async =>
      (await _api.getJsonList('/catalog/departments/$deptId/doctors')).map(Doctor.fromJson).toList();
  Future<List<DateTime>> dates(String doctorId) async =>
      (await _api.getJsonList('/catalog/doctors/$doctorId/dates')).map((d) => DateTime.parse(d as String)).toList();
}

final catalogRepositoryProvider = Provider((ref) => CatalogRepository(ref.read(apiClientProvider)));
// 단계별 조회 — 앞 선택이 바뀌면 자동 무효화되도록 family로.
final departmentsProvider = FutureProvider.autoDispose((ref) => ref.read(catalogRepositoryProvider).departments());
final doctorsProvider = FutureProvider.autoDispose.family<List<Doctor>, String>(
    (ref, deptId) => ref.read(catalogRepositoryProvider).doctors(deptId));
final availableDatesProvider = FutureProvider.autoDispose.family<List<DateTime>, String>(
    (ref, doctorId) => ref.read(catalogRepositoryProvider).dates(doctorId));
```
테스트(`test/features/booking/catalog_repository_test.dart`): `Doctor.fromJson`이 `photo_url:null`을 `photoUrl==null`로, `schedule_summary` 누락을 `'진료시간 문의'`로 파싱하는지. Run → FAIL → 위 구현 → PASS.

- [ ] **Step 6: 마법사 상태 `BookingController` — 앞 단계 변경 시 뒤 버림 + 값 보존** — `patient_app/lib/features/booking/booking_controller.dart`

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'catalog_repository.dart';

class BookingTarget {            // 1단계 대상(본인/가족)
  final String patientId, name;  // BOOK-WHO-02 — 본인도 실제 환자 UUID
  final String? relation;        // 본인이면 null, 가족이면 "어머니" 등(BOOK-WHO-03)
  const BookingTarget(this.patientId, this.name, this.relation);
}

class BookingSelection {
  final int step;                    // 0=대상 1=진료과 2=의사 3=날짜 (4~7=Task 20)
  final BookingTarget? target;
  final Department? department;
  final Doctor? doctor;
  final DateTime? date;
  const BookingSelection({this.step = 0, this.target, this.department, this.doctor, this.date});
  BookingSelection copyWith({int? step, BookingTarget? target, Department? department, Doctor? doctor, DateTime? date}) =>
      BookingSelection(step: step ?? this.step, target: target ?? this.target,
          department: department ?? this.department, doctor: doctor ?? this.doctor, date: date ?? this.date);
}

class BookingController extends StateNotifier<BookingSelection> {
  BookingController() : super(const BookingSelection());

  // 앞 단계에서 값을 (재)선택하면 그 뒤 단계 값을 전부 버린다(BOOK-NAV-05) — 의사마다 진료시간이 달라서.
  void selectTarget(BookingTarget t) =>
      state = BookingSelection(step: 1, target: t);                       // 대상 바꾸면 과·의사·날짜 초기화
  void selectDepartment(Department d) =>
      state = BookingSelection(step: 2, target: state.target, department: d);   // 과 바꾸면 의사·날짜 초기화
  void selectDoctor(Doctor doc) =>
      state = BookingSelection(step: 3, target: state.target, department: state.department, doctor: doc); // 의사 바꾸면 날짜 초기화
  void selectDate(DateTime d) =>
      state = state.copyWith(step: 4, date: d);                           // 4단계(시간)로 — 화면은 Task 20

  void back() { if (state.step > 0) state = state.copyWith(step: state.step - 1); }  // BOOK-NAV-04 한 단계씩
  void goToStep(int s) => state = state.copyWith(step: s);               // BOOK-RACE 등 특정 단계 복귀(Task 20이 씀)
  void reset() => state = const BookingSelection();                       // BOOK-KEEP-03·06 — 항상 1단계부터
}

// 앱 생존 동안 유지(autoDispose 아님) → 하단 탭 다녀와도 그대로(BOOK-KEEP-01).
// 폰에 저장하지 않으므로 앱을 껐다 켜면 초기값(BOOK-KEEP-03).
final bookingProvider = StateNotifierProvider<BookingController, BookingSelection>((ref) => BookingController());
```

테스트(`test/features/booking/booking_controller_test.dart`) — **NAV-BOOK 전이·값 보존을 화면 없이 검증**:

```dart
void main() {
  late ProviderContainer c;
  BookingController ctl() => c.read(bookingProvider.notifier);
  BookingSelection st() => c.read(bookingProvider);
  const t1 = BookingTarget('p1', '김순자', null);
  const dInternal = Department('d1', '내과');
  const doc1 = Doctor('doc1', '김의사', '소화기', null, '월·수·금 오전');
  setUp(() => c = ProviderContainer());
  tearDown(() => c.dispose());

  test('[BOOK-NAV-05] 앞 단계 값을 바꾸면 그 뒤 단계 선택값을 전부 버린다', () {
    ctl().selectTarget(t1); ctl().selectDepartment(dInternal); ctl().selectDoctor(doc1);
    ctl().selectDate(DateTime(2026, 8, 20));
    expect(st().doctor, doc1);
    ctl().selectDepartment(const Department('d2', '정형외과'));   // 2단계를 다시 고름
    expect(st().doctor, isNull);                                  // 3·4단계가 버려졌다
    expect(st().date, isNull);
    expect(st().department!.id, 'd2');
  });

  test('[BOOK-KEEP-03] reset은 전부 버리고 1단계로 — 앱 재시작·새 예약 진입 시', () {
    ctl().selectTarget(t1); ctl().selectDepartment(dInternal);
    ctl().reset();
    expect(st().step, 0); expect(st().target, isNull); expect(st().department, isNull);
  });

  test('[BOOK-KEEP-06] + 새 예약하기는 이어붙이지 않는다 — 진입이 reset을 부른다', () {
    ctl().selectTarget(t1); ctl().selectDepartment(dInternal);
    // 진입점(NAV-BOOK-01·02)이 reset() 후 마법사를 연다.
    ctl().reset();
    expect(st().step, 0);
  });

  test('[BOOK-KEEP-01] 상태가 앱 생존 동안 유지된다(autoDispose 아님) — 탭 이동 후 복귀', () {
    ctl().selectTarget(t1); ctl().selectDepartment(dInternal);
    // bookingProvider를 다시 읽어도(다른 탭에서 돌아온 상황) 같은 인스턴스라 값이 남아 있다.
    expect(c.read(bookingProvider).department, dInternal);
    expect(c.read(bookingProvider).step, 1);
  });
}
```
> 📌 **값 없는/구조 규칙 — 어느 test가 실현하나**: `BOOK-KEEP-02`(막지 않기로 해놓고 날리면 결과적으로 막은 것)·`BOOK-KEEP-04`(앱 재시작 복원은 지난 날짜 검사 등 규칙을 늘린다)는 결정 **근거**라 `BOOK-KEEP-01`(유지)·`BOOK-KEEP-03`(재시작 초기화) 두 동작이 실현한다. `BOOK-KEEP-05`(1단계에서 뒤로 = 마법사 나감, 팝업 없음)는 Step 7 셸의 뒤로 처리(`step==0`이면 `context.pop`, 확인창 없음)가 실현. `BOOK-KEEP-07`(BTN-KILL과 다름 = 서버에 아무것도 안 남음)은 이 controller가 메모리 상태만 두고 신청 전까지 서버 호출이 없음으로 실현.
Run → Expected: PASS.

- [ ] **Step 7: 마법사 셸 `BookingWizard` (BOOK-NAV) + 진입 라우팅** — `patient_app/lib/features/booking/booking_wizard.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/connectivity.dart';        // Task 11 connectivityProvider
import '../../widgets/empty_state.dart';       // Task 12 EmptyState
import 'booking_controller.dart';
import 'steps/who_step.dart';
import 'steps/dept_step.dart';
import 'steps/doctor_step.dart';
import 'steps/date_step.dart';

const _stepNames = ['대상 선택', '진료과', '의사 선택', '날짜 선택', '시간 선택', '방문 이유', '최종 확인', '완료'];

class BookingWizard extends ConsumerWidget {
  const BookingWizard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sel = ref.watch(bookingProvider);
    final step = sel.step;
    return PopScope(
      canPop: false,
      onPopInvoked: (didPop) {
        if (didPop) return;
        if (step == 0) {
          context.pop();                       // BOOK-KEEP-05 — 1단계 뒤로 = 마법사 나감(팝업 없음)
        } else {
          ref.read(bookingProvider.notifier).back();   // BOOK-NAV-04 — 한 단계씩
        }
      },
      child: Scaffold(
        appBar: AppBar(
          leading: const BackButton(),          // BOOK-NAV-03 — 뒤로 버튼 하나만(단계 칩·점프 없음)
          title: Text('${step + 1}단계 / 8단계 · ${_stepNames[step]}'),  // BOOK-NAV-02 — 숫자+단계 이름
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(4),
            child: LinearProgressIndicator(value: (step + 1) / 8),        // 진행 막대
          ),
        ),
        body: Column(children: [
          if (step >= 1) _SummaryChips(sel),     // BOOK-NAV-06 — 2단계부터 읽기 전용 회색 요약 딱지
          Expanded(child: switch (step) {        // BOOK-NAV-01 — 한 화면에 한 질문
            0 => const WhoStep(),
            1 => const DeptStep(),
            2 => const DoctorStep(),
            3 => const DateStep(),
            _ => const _LaterStepPlaceholder(),  // 4~7단계(시간·이유·확인·완료)는 Task 20이 끼운다
          }),
        ]),
      ),
    );
  }
}

// 읽기 전용 회색 딱지 — 버튼처럼 보이지 않게(BOOK-NAV-06). 누를 수 없다.
class _SummaryChips extends StatelessWidget {
  const _SummaryChips(this.sel);
  final BookingSelection sel;
  @override
  Widget build(BuildContext context) {
    final chips = <String>[
      if (sel.target != null) sel.target!.name,
      if (sel.department != null) sel.department!.name,
      if (sel.doctor != null) sel.doctor!.name,
    ];
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Wrap(spacing: 6, children: [
        for (final c in chips)
          Chip(label: Text(c), backgroundColor: const Color(0xFFEEF1F4)),   // 회색, onPressed 없음
      ]),
    );
  }
}

class _LaterStepPlaceholder extends StatelessWidget {   // Task 20 자리표시(테스트에서 4단계 이후로 안 감)
  const _LaterStepPlaceholder();
  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
```

진입점(`router.dart`의 `/booking` placeholder 교체 + 홈·예약탭 버튼):

```dart
GoRoute(
  path: '/booking',
  builder: (c, s) => const BookingWizard(),
  redirect: (c, s) {
    // BOOK-NAV-09 — 예약은 오프라인에서 못 한다. 진입점 버튼이 이미 회색이지만 딥링크 방어로 한 번 더.
    final online = ProviderScope.containerOf(c).read(connectivityProvider).valueOrNull ?? true;
    return online ? null : '/home';    // NAV-BOOK-22 — 마법사 중간 딥링크는 만들지 않는다(항상 1단계 진입)
  },
),
```
> 진입은 항상 `ref.read(bookingProvider.notifier).reset()` 후 `context.go('/booking')`(홈 `[+ 진료 예약하기]`=`NAV-BOOK-02`/`NAV-HOME-14`, 예약 탭 `[+ 새 예약하기]`=`NAV-BOOK-01`). `BOOK-KEEP-06`(항상 1단계) 실현. 진입점 버튼은 `ActionButton(disabledReason: '인터넷이 연결되면 예약하실 수 있습니다')`로 오프라인 시 회색(`BOOK-NAV-09`·`BTN-STATE-03`).

테스트(`booking_wizard_test.dart`):

```dart
testWidgets('[BOOK-NAV-02] 진행 표시는 숫자와 단계 이름을 함께 쓴다', (t) async {
  await _pumpWizard(t, step: 0);
  expect(find.text('1단계 / 8단계 · 대상 선택'), findsOneWidget);
});
testWidgets('[BOOK-NAV-03][BOOK-NAV-04] 뒤로 버튼 하나로 한 단계씩 되돌아간다', (t) async {
  final c = await _pumpWizard(t, step: 2);
  expect(find.byType(BackButton), findsOneWidget);   // 하나만
  await t.tap(find.byType(BackButton)); await t.pump();
  expect(c.read(bookingProvider).step, 1);           // 마법사를 나가지 않고 한 단계
});
testWidgets('[BOOK-NAV-06] 2단계부터 고른 값이 읽기 전용 회색 딱지로 보인다', (t) async {
  await _pumpWizard(t, step: 1, target: const BookingTarget('p1', '김순자', null));
  final chip = t.widget<Chip>(find.byType(Chip));
  expect(chip.backgroundColor, const Color(0xFFEEF1F4));  // 버튼 아님(onPressed 없음)
  expect(find.text('김순자'), findsOneWidget);
});
testWidgets('[BOOK-KEEP-05] 1단계에서 뒤로 누르면 확인창 없이 마법사를 나간다', (t) async {
  await _pumpWizard(t, step: 0);
  await t.tap(find.byType(BackButton)); await t.pumpAndSettle();
  expect(find.byType(AlertDialog), findsNothing);     // 팝업 없음(대상 하나뿐이라)
});
testWidgets('[BOOK-NAV-01] 마법사는 한 화면에 한 질문 = 단계별 하나의 스텝 위젯만 보인다', (t) async {
  await _pumpWizard(t, step: 0);
  expect(find.byType(WhoStep), findsOneWidget);
  expect(find.byType(DeptStep), findsNothing);
});
```
> `BOOK-NAV-07`(값 안 고르면 못 넘어감)은 각 스텝이 「선택 = 다음 단계 이동」이라 다음 버튼 자체가 없어 실현(Step 8~11에서 확인) — 6단계 건너뛰기만 예외(Task 20). `BOOK-NAV-08`(8단계 뒤로 = 홈)·`BOOK-NAV-10`(조회 실패 시 그 단계 머묾)은 각각 Task 20(완료 화면)·Step 9~11(EmptyState.error)에서 실현. `BOOK-NAV-09`는 위 진입 redirect + 진입점 버튼.
Run → Expected: PASS.

- [ ] **Step 8: 1단계 대상 선택 `WhoStep` (BOOK-WHO)** — `patient_app/lib/features/booking/steps/who_step.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../widgets/empty_state.dart';
import '../booking_controller.dart';
import '../family_targets_provider.dart';   // 본인+가족 목록(아래)

class WhoStep extends ConsumerWidget {
  const WhoStep({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final targets = ref.watch(bookingTargetsProvider);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Padding(padding: EdgeInsets.all(16),
        child: Text('누구의 예약인가요?', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800))), // BOOK-WHO-04
      Expanded(child: targets.when(
        error: (_, __) => EmptyState.error(onRetry: () => ref.invalidate(bookingTargetsProvider)),
        loading: () => const Center(child: CircularProgressIndicator()),
        data: (list) => ListView(children: [
          for (final tgt in list)                               // BOOK-WHO-01 본인 맨 위 + 가족
            ListTile(
              title: Text(tgt.name),
              subtitle: tgt.relation == null ? null : Text(tgt.relation!),  // BOOK-WHO-03 관계 함께
              onTap: () => ref.read(bookingProvider.notifier).selectTarget(tgt),  // 선택=2단계로
            ),
          ListTile(                                             // BOOK-WHO-07 항상(가족 수 무관), 맨 아래
            leading: const Icon(Icons.person_add_alt),
            title: const Text('+ 가족 추가하기'),
            onTap: () => context.go('/family'),                 // BOOK-WHO-09 가족 탭으로(마법사는 살아 있다)
          ),
        ]),
      )),
    ]);
  }
}
```

`bookingTargetsProvider`(`family_targets_provider.dart`) — 본인+가족을 한 목록으로, 본인 맨 위:

```dart
final bookingTargetsProvider = FutureProvider.autoDispose<List<BookingTarget>>((ref) async {
  final me = await ref.read(myProfileProvider.future);        // Task 13 본인 프로필(patientId·name)
  final family = await ref.read(familyRepositoryProvider).list();  // Task 3 list_family_members
  return [
    BookingTarget(me.patientId, me.name, null),                // BOOK-WHO-02 본인도 실제 UUID('self' 금지)
    for (final f in family) BookingTarget(f.patientId, f.name, f.relation),
  ];
});
```

테스트(`who_step_test.dart`):

```dart
testWidgets('[BOOK-WHO-01][BOOK-WHO-03] 본인이 맨 위, 가족은 이름+관계로 나온다', (t) async {
  await _pumpWho(t, targets: [
    const BookingTarget('me', '김순자', null),
    const BookingTarget('mom', '박영자', '어머니'),
  ]);
  expect(find.text('김순자'), findsOneWidget);
  expect(find.text('어머니'), findsOneWidget);           // 관계 표시
  final tiles = t.widgetList<ListTile>(find.byType(ListTile)).toList();
  expect((tiles.first.title as Text).data, '김순자');    // 본인 맨 위
});
testWidgets('[BOOK-WHO-02] 대상을 고르면 실제 patientId가 상태에 담긴다(문자열 self 아님)', (t) async {
  final c = await _pumpWho(t, targets: [const BookingTarget('uuid-1', '김순자', null)]);
  await t.tap(find.text('김순자')); await t.pump();
  expect(c.read(bookingProvider).target!.patientId, 'uuid-1');
  expect(c.read(bookingProvider).step, 1);              // 2단계로
});
testWidgets('[BOOK-WHO-04] 질문 문구는 "누구의 예약인가요?"', (t) async {
  await _pumpWho(t, targets: []);
  expect(find.text('누구의 예약인가요?'), findsOneWidget);
});
testWidgets('[BOOK-WHO-05][BOOK-WHO-06] 가족이 0명이어도 1단계를 건너뛰지 않고 본인 한 줄을 보여준다', (t) async {
  await _pumpWho(t, targets: [const BookingTarget('me', '김순자', null)]);
  expect(find.text('누구의 예약인가요?'), findsOneWidget);   // 화면이 존재(진행 막대가 2단계부터 시작하지 않는다)
  expect(find.text('김순자'), findsOneWidget);
});
testWidgets('[BOOK-WHO-07][BOOK-WHO-08] 가족이 있어도 + 가족 추가하기가 목록 맨 아래에 항상 있다', (t) async {
  await _pumpWho(t, targets: [
    const BookingTarget('me', '김순자', null), const BookingTarget('mom', '박영자', '어머니'),
  ]);
  expect(find.text('+ 가족 추가하기'), findsOneWidget);      // 0명 한정 아님 — 막다른 길 방지
});
testWidgets('[BOOK-WHO-09] + 가족 추가하기는 가족 탭으로 이동한다(마법사 상태는 유지)', (t) async {
  final c = await _pumpWho(t, targets: [const BookingTarget('me', '김순자', null)]);
  await t.tap(find.text('+ 가족 추가하기')); await t.pumpAndSettle();
  expect(_lastRoute, '/family');
  expect(c.read(bookingProvider).step, 0);              // 마법사는 뒤에 살아 있다(BOOK-KEEP-01)
});
```
Run → Expected: PASS.

- [ ] **Step 9: 2단계 진료과 `DeptStep` (BOOK-DEPT) + 상담봇 시트 진입 훅** — `patient_app/lib/features/booking/steps/dept_step.dart`

```dart
class DeptStep extends ConsumerWidget {
  const DeptStep({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final depts = ref.watch(departmentsProvider);
    return depts.when(
      error: (_, __) => EmptyState.error(onRetry: () => ref.invalidate(departmentsProvider)), // BOOK-NAV-10
      loading: () => const Center(child: CircularProgressIndicator()),
      data: (list) => list.isEmpty
        ? EmptyState.zero(message: '표시할 진료과가 없습니다')   // BOOK-DEPT-03 — [다시 시도] 없음
        : ListView(children: [
            for (final d in list)
              ListTile(
                title: Text(d.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)), // BOOK-DEPT-01 이름만
                trailing: const Icon(Icons.chevron_right),
                onTap: () => ref.read(bookingProvider.notifier).selectDepartment(d),
              ),
            _DeptBotEntry(onTap: () => openDeptBot(context, ref)),   // BOOK-DEPT-02 맨 아래 상담 진입점
          ]),
    );
  }
}

// BOOK-DEPT-02 — 점선 테두리 + 연한 딥틸 배경, "어느 과인지 모르겠어요"
class _DeptBotEntry extends StatelessWidget { /* 점선 컨테이너 + 두 줄 문구 + onTap */ }

// NAV-BOOK-06 — 상담봇 시트를 연다(화면을 떠나지 않는 겹침). ⚠️ 시트 UI(BOOK-BOT-*)는 Task 20이 실체화.
Future<void> openDeptBot(BuildContext context, WidgetRef ref) => showModalBottomSheet(
  context: context, isScrollControlled: true,
  builder: (_) => const DeptBotSheet(),   // Task 20이 채운다. 지금은 진입/닫힘 라우팅만 검증.
);
```

테스트(`dept_step_test.dart`):

```dart
testWidgets('[BOOK-DEPT-01] 진료과는 이름만 굵게 + 우측 화살표로 보인다', (t) async {
  await _pumpDept(t, depts: [const Department('d1', '내과')]);
  final title = t.widget<Text>(find.text('내과'));
  expect(title.style!.fontWeight, FontWeight.w800);
  expect(find.byIcon(Icons.chevron_right), findsOneWidget);
});
testWidgets('[BOOK-DEPT-02] 목록 맨 아래에 "어느 과인지 모르겠어요" 상담 진입점이 있다', (t) async {
  await _pumpDept(t, depts: [const Department('d1', '내과')]);
  expect(find.text('어느 과인지 모르겠어요'), findsOneWidget);
});
testWidgets('[BOOK-DEPT-03] 진료과 0건이면 [다시 시도] 없는 빈 상태', (t) async {
  await _pumpDept(t, depts: []);
  expect(find.text('다시 시도'), findsNothing);       // 실패가 아니라 사실
});
testWidgets('[NAV-BOOK-05] 진료과를 누르면 3단계 의사로 간다(대상 유지)', (t) async {
  final c = await _pumpDept(t, depts: [const Department('d1', '내과')], target: const BookingTarget('me','김순자',null));
  await t.tap(find.text('내과')); await t.pump();
  expect(c.read(bookingProvider).step, 2);
  expect(c.read(bookingProvider).target!.name, '김순자');   // 1단계 값 보존
});
testWidgets('[NAV-BOOK-06] 어느 과인지 모르겠어요는 상담봇 시트를 띄운다(화면 안 떠남)', (t) async {
  await _pumpDept(t, depts: [const Department('d1', '내과')]);
  await t.tap(find.text('어느 과인지 모르겠어요')); await t.pumpAndSettle();
  expect(find.byType(DeptBotSheet), findsOneWidget);     // 겹침 시트. DeptStep은 여전히 뒤에 있다
});
testWidgets('[NAV-BOOK-08] 시트를 닫으면 아무것도 고르지 않은 2단계 그대로', (t) async {
  final c = await _pumpDept(t, depts: [const Department('d1', '내과')]);
  await t.tap(find.text('어느 과인지 모르겠어요')); await t.pumpAndSettle();
  Navigator.of(t.element(find.byType(DeptStep))).pop();  // ✕·쓸어내림
  await t.pumpAndSettle();
  expect(c.read(bookingProvider).department, isNull);    // 선택 없음
  expect(c.read(bookingProvider).step, 1);
});
```
> `NAV-BOOK-07`(시트의 `○○과로 계속하기` → 3단계, 그 과 선택됨)은 **Task 20**이 시트를 실체화할 때 `ref.read(bookingProvider.notifier).selectDepartment(추천과)`를 호출하도록 배선한다 — T19는 `selectDepartment`가 그 계약(2단계 선택 후 step=2)임을 Step 6에서 이미 못박았다. `NAV-BOOK-04`(1단계 `+가족추가` → 가족 탭)는 `BOOK-WHO-09` 테스트가 실현.
Run → Expected: PASS.

- [ ] **Step 10: 3단계 의사 `DoctorStep` (BOOK-DOC — 갭 #7·#9 소비)** — `patient_app/lib/features/booking/steps/doctor_step.dart`

```dart
class DoctorStep extends ConsumerWidget {
  const DoctorStep({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sel = ref.watch(bookingProvider);
    final docs = ref.watch(doctorsProvider(sel.department!.id));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),   // BOOK-DOC-08 대상은 작고 차분한 보조 라벨
        child: Text('${sel.target!.name} 님', style: const TextStyle(fontSize: 13, color: Color(0xFF5D7183)))),
      Expanded(child: docs.when(
        error: (_, __) => EmptyState.error(onRetry: () => ref.invalidate(doctorsProvider(sel.department!.id))),
        loading: () => const Center(child: CircularProgressIndicator()),
        data: (list) => ListView(children: [
          for (final d in list)
            InkWell(                                          // BOOK-DOC-01 줄 전체가 터치 영역
              onTap: () => ref.read(bookingProvider.notifier).selectDoctor(d),
              child: Padding(padding: const EdgeInsets.all(12), child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,   // BOOK-DOC-04 세로 가운데
                children: [
                  _DoctorAvatar(d),                          // BOOK-DOC-02 원형 60px / BOOK-DOC-05 없으면 회색 원+첫 글자
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(d.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),       // 이름(맨 위)
                    Text(d.scheduleSummary, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Color(0xFF0B6E70))), // 진료시간
                    if (d.specialty != null)
                      Text(d.specialty!, style: const TextStyle(fontSize: 13.5, color: Color(0xFF5D7183))),  // 분야
                  ])),
                ],
              )),
            ),
        ]),
      )),
    ]);
  }
}

class _DoctorAvatar extends StatelessWidget {
  const _DoctorAvatar(this.d);
  final Doctor d;
  @override
  Widget build(BuildContext context) {
    if (d.photoUrl != null) {
      return CircleAvatar(radius: 30, backgroundImage: NetworkImage(d.photoUrl!));  // BOOK-DOC-02
    }
    return CircleAvatar(radius: 30, backgroundColor: const Color(0xFFCED6DE),       // BOOK-DOC-05
      child: Text(d.name.characters.first, style: const TextStyle(fontSize: 20, color: Colors.white)));
  }
}
```

테스트(`doctor_step_test.dart`):

```dart
const _withPhoto = Doctor('d1', '김의사', '소화기내과', 'https://cdn/a.jpg', '월·수·금 오전');
const _noPhoto   = Doctor('d2', '이의사', null, null, '진료시간 문의');

testWidgets('[BOOK-DOC-02][BOOK-DOC-03] 사진 원형 + 이름/진료시간/분야 세 줄', (t) async {
  await _pumpDoctor(t, docs: [_withPhoto]);
  expect(find.byType(CircleAvatar), findsOneWidget);
  expect(find.text('김의사'), findsOneWidget);
  expect(find.text('월·수·금 오전'), findsOneWidget);     // 갭 #9 서버 요약을 그대로 표시
  expect(find.text('소화기내과'), findsOneWidget);         // 갭 #7 전공
});
testWidgets('[BOOK-DOC-05] 사진 없는 의사는 회색 원 + 이름 첫 글자', (t) async {
  await _pumpDoctor(t, docs: [_noPhoto]);
  final av = t.widget<CircleAvatar>(find.byType(CircleAvatar));
  expect(av.backgroundColor, const Color(0xFFCED6DE));
  expect(find.text('이'), findsOneWidget);                 // 첫 글자('사진 없음' 문구 아님)
});
testWidgets('[BOOK-DOC-06] 소개글(bio)은 화면에 나타나지 않는다', (t) async {
  await _pumpDoctor(t, docs: [_withPhoto]);
  // Doctor 모델에 bio 필드 자체가 없다(list_doctors가 반환 안 함) → 화면에 문장 카드가 없다.
  expect(find.textContaining('소개'), findsNothing);
});
testWidgets('[BOOK-DOC-08] 예약 대상은 작고 차분한 보조 라벨(강조 아님)', (t) async {
  await _pumpDoctor(t, docs: [_withPhoto], target: const BookingTarget('me', '김순자', null));
  final lbl = t.widget<Text>(find.text('김순자 님'));
  expect(lbl.style!.fontSize, 13);                         // 의사 이름(18)보다 작다 — 같은 무게 아님
  expect(lbl.style!.color, const Color(0xFF5D7183));
});
testWidgets('[BOOK-DOC-01][BOOK-DOC-04] 의사 줄 전체가 터치 영역이고 누르면 4단계로', (t) async {
  final c = await _pumpDoctor(t, docs: [_withPhoto]);
  await t.tap(find.text('김의사')); await t.pump();          // 이름을 눌러도 줄 전체가 반응
  expect(c.read(bookingProvider).step, 3);
});
testWidgets('[BOOK-DOC-07][BOOK-DOC-09] 전공·사진·진료시간이 실제로 채워진다(정기 진료시간만, 다음가능시간 없음)', (t) async {
  await _pumpDoctor(t, docs: [_withPhoto]);
  expect(find.text('소화기내과'), findsOneWidget);          // 갭 #7 해소 — 이름 외 정보가 있다
  expect(find.text('월·수·금 오전'), findsOneWidget);       // 정기 진료시간
  expect(find.textContaining('다음 가능'), findsNothing);   // 다음 가능 시간은 표시하지 않는다
});
```
Run → Expected: PASS.

- [ ] **Step 11: 4단계 날짜 `DateStep` (BOOK-DATE)** — `patient_app/lib/features/booking/steps/date_step.dart`

```dart
class DateStep extends ConsumerWidget {
  const DateStep({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sel = ref.watch(bookingProvider);
    final dates = ref.watch(availableDatesProvider(sel.doctor!.id));   // 8주 이내 빈 날짜(Task 4)
    return dates.when(
      error: (_, __) => EmptyState.error(onRetry: () => ref.invalidate(availableDatesProvider(sel.doctor!.id))),
      loading: () => const Center(child: CircularProgressIndicator()),
      data: (available) => _MonthCalendar(
        available: available.toSet(),                                  // BOOK-DATE-02 테두리
        maxDate: DateTime.now().add(const Duration(days: 56)),         // BOOK-DATE-06 8주
        minMonth: DateTime(DateTime.now().year, DateTime.now().month), // BOOK-DATE-07 이전 달 비활성
        onPick: (d) => ref.read(bookingProvider.notifier).selectDate(d),
      ),
    );
  }
}
// _MonthCalendar: ‹ 2026년 8월 › 헤더 + 요일 머리글 + 격자.
//   예약 가능일 = 테두리(BOOK-DATE-02) / 그 밖 = 흐린 숫자·비활성(BOOK-DATE-03) / 하단 범례 2개(BOOK-DATE-04).
//   다음 달 ›: maxDate가 속한 달 이후면 비활성 + "예약은 8주 뒤까지 가능합니다"(BOOK-DATE-06).
//   이전 달 ‹: 이번 달이면 비활성(BOOK-DATE-07).
```

테스트(`date_step_test.dart`):

```dart
testWidgets('[BOOK-DATE-01] 월 단위 달력 — 월 헤더 + 요일 머리글 + 날짜 격자', (t) async {
  await _pumpDate(t, available: [DateTime(2026, 8, 20)], now: DateTime(2026, 8, 10));
  expect(find.textContaining('2026년 8월'), findsOneWidget);
  expect(find.text('일'), findsOneWidget); expect(find.text('토'), findsOneWidget);  // 요일 머리글
});
testWidgets('[BOOK-DATE-02][BOOK-DATE-03] 가능한 날은 테두리, 그 밖의 날은 흐린 숫자로 남고 못 누른다', (t) async {
  final c = await _pumpDate(t, available: [DateTime(2026, 8, 20)], now: DateTime(2026, 8, 10));
  await t.tap(find.text('21')); await t.pump();               // 진료 없는 날
  expect(c.read(bookingProvider).date, isNull);               // 못 누른다(숨기지 않고 흐리게)
  await t.tap(find.text('20')); await t.pump();
  expect(c.read(bookingProvider).date, DateTime(2026, 8, 20)); // 가능일은 눌린다
});
testWidgets('[BOOK-DATE-04][BOOK-DATE-05] 하단 범례는 예약 가능 / 진료 없음 둘뿐(휴진·마감·꽉참을 묶는다)', (t) async {
  await _pumpDate(t, available: [DateTime(2026, 8, 20)], now: DateTime(2026, 8, 10));
  expect(find.text('예약 가능'), findsOneWidget);
  expect(find.text('진료 없음'), findsOneWidget);
  expect(find.text('휴진'), findsNothing);                     // 셋을 나누지 않는다(범례 넷 금지)
});
testWidgets('[BOOK-DATE-06] 8주 뒤가 속한 달 이후로는 다음 달이 비활성 + 이유 한 줄', (t) async {
  await _pumpDate(t, available: const [], now: DateTime(2026, 8, 10));
  // 8주 뒤 = 10월 초. 10월 표시 상태에서 › 비활성 + 안내.
  expect(find.text('예약은 8주 뒤까지 가능합니다'), findsOneWidget);
});
testWidgets('[BOOK-DATE-07] 이번 달에서는 이전 달 ‹가 비활성이다', (t) async {
  await _pumpDate(t, available: [DateTime(2026, 8, 20)], now: DateTime(2026, 8, 10));
  final prev = t.widget<IconButton>(find.byKey(const Key('cal-prev')));
  expect(prev.onPressed, isNull);                             // 지난 날짜로 갈 이유 없음
});
testWidgets('[NAV-BOOK-10] 날짜를 누르면 5단계 시간으로 넘어간다(controller step=4)', (t) async {
  final c = await _pumpDate(t, available: [DateTime(2026, 8, 20)], now: DateTime(2026, 8, 10));
  await t.tap(find.text('20')); await t.pump();
  expect(c.read(bookingProvider).step, 4);                   // 5단계 화면은 Task 20
});
```
> `BOOK-DATE-08`(8주 상수)·`BOOK-DATE-09`(마감 지남) 구현 전제 두 ⚠️는 **Task 4 `list_bookable_slots`/`list_available_dates`가 서버에서 이미 판정**(8주·`booking_deadline`)하므로, 앱은 서버가 준 날짜 집합만 테두리로 그린다 → 앱이 8을 하드코딩하지 않는다(달력의 `maxDate`는 UI 회색 처리용 상한일 뿐, 실제 가능일은 서버 목록이 결정). 두 갭은 T4에서 닫혔고 여기서 소비만 한다.
Run → Expected: PASS.

- [ ] **Step 12: NAV-BOOK 화면 이동 표 — 상태 전이로 전수 검증** — `test/features/booking/nav_book_test.dart`

> 마법사 셸(전 단계를 아는 단일 상태머신)의 전이를 `BookingController`/셸 단위로 못박는다. **5~8단계 화면(Task 20)이 없어도** `_step` 전이 규칙은 여기서 확정된다.

```dart
void main() {
  late ProviderContainer c;
  BookingController ctl() => c.read(bookingProvider.notifier);
  const t1 = BookingTarget('p1', '김순자', null);
  const dep = Department('d1', '내과');
  const doc = Doctor('doc1', '김의사', '소화기', null, '월 오전');
  setUp(() { c = ProviderContainer(); });
  tearDown(() => c.dispose());

  test('[NAV-BOOK-01] 예약 탭 + 새 예약하기 → 1단계(reset 후 진입)', () {
    ctl().selectTarget(t1); ctl().reset();               // 진입이 reset
    expect(c.read(bookingProvider).step, 0);
  });
  test('[NAV-BOOK-02] 홈 0건 빈 상태 + 새 예약하기 → 1단계', () {
    ctl().reset(); expect(c.read(bookingProvider).step, 0);
  });
  test('[NAV-BOOK-03] 1단계 대상 선택 → 2단계', () {
    ctl().selectTarget(t1); expect(c.read(bookingProvider).step, 1);
  });
  test('[NAV-BOOK-09] 3단계 의사 선택 → 4단계, 의사 바꾸면 날짜 버림', () {
    ctl().selectTarget(t1); ctl().selectDepartment(dep); ctl().selectDoctor(doc); ctl().selectDate(DateTime(2026,8,20));
    ctl().selectDoctor(const Doctor('doc2','이의사',null,null,'화 오후'));
    expect(c.read(bookingProvider).step, 3);             // 다시 4단계(날짜)로
    expect(c.read(bookingProvider).date, isNull);        // 날짜 버려짐(BOOK-NAV-05)
  });
  test('[NAV-BOOK-11] 5단계 시각 선택 → 6단계(step=5) — Task 20이 화면을 붙인다', () {
    _advanceToStep(ctl(), 4);                            // 4단계(시간)까지
    ctl().goToStep(5);                                   // Task 20 selectSlot이 부를 전이
    expect(c.read(bookingProvider).step, 5);
  });
  test('[NAV-BOOK-12] 5단계 [다른 날짜 고르기] → 4단계', () {
    _advanceToStep(ctl(), 4); ctl().goToStep(3);
    expect(c.read(bookingProvider).step, 3);
  });
  test('[NAV-BOOK-13] 6단계 [다음]/건너뛰기 → 7단계', () {
    _advanceToStep(ctl(), 5); ctl().goToStep(6);
    expect(c.read(bookingProvider).step, 6);
  });
  test('[NAV-BOOK-16] 신청 실패(그 시간 이미 참) → 5단계 시간 선택으로', () {
    _advanceToStep(ctl(), 6); ctl().goToStep(4);         // Task 20 book_slot 충돌 시 전이(BOOK-RACE 계열, T20 소유)
    expect(c.read(bookingProvider).step, 4);
  });
}
```

나머지 NAV-BOOK 전이는 화면·라우팅 위젯 테스트로(같은 파일):

```dart
testWidgets('[NAV-BOOK-04] 1단계 + 가족 추가하기 → 가족 탭(마법사 유지)', (t) async { /* BOOK-WHO-09와 동일 경로 */ });
testWidgets('[NAV-BOOK-07] 상담봇 시트 ○○과로 계속하기 → 3단계, 그 과 선택됨(Task 20이 selectDepartment 배선)', (t) async {
  // T19는 계약만: selectDepartment(추천과) 호출 시 step==2 + department 세팅됨을 확인.
  final c = ProviderContainer();
  c.read(bookingProvider.notifier).selectTarget(const BookingTarget('me','김순자',null));
  c.read(bookingProvider.notifier).selectDepartment(const Department('rec','추천내과'));
  expect(c.read(bookingProvider).step, 2);
  expect(c.read(bookingProvider).department!.id, 'rec');
});
testWidgets('[NAV-BOOK-14] 7단계 신청 성공 → 8단계 완료(step=7), 완료에서 뒤로는 홈', (t) async {
  final c = ProviderContainer(); _advanceToStep(c.read(bookingProvider.notifier), 6);
  c.read(bookingProvider.notifier).goToStep(7);           // Task 20 submit 성공 전이
  expect(c.read(bookingProvider).step, 7);                // BOOK-NAV-08: 8단계 뒤로=홈은 Task 20 완료 화면
});
testWidgets('[NAV-BOOK-15] 7단계 신청 실패(서버 오류) → 7단계 그대로(화면 안 옮김)', (t) async {
  final c = ProviderContainer(); _advanceToStep(c.read(bookingProvider.notifier), 6);
  // 실패해도 goToStep을 호출하지 않는다 → step 유지(버튼 위 붙박이 오류는 Task 20 화면).
  expect(c.read(bookingProvider).step, 6);
});
testWidgets('[NAV-BOOK-17] 8단계 완료 사전문진 작성하기 → 사전문진 1번 문항', (t) async { /* 완료 화면=Task 20, 라우트 /questionnaire 확인 */ });
testWidgets('[NAV-BOOK-18] 8단계 완료 나중에 할게요 → 홈', (t) async { /* Task 20 완료 화면 CTA */ });
testWidgets('[NAV-BOOK-19] 처리 중 이탈 팝업 [기다리기] → 7단계 그대로', (t) async { /* showExitConfirm(Task 12)의 취소 분기 */ });
testWidgets('[NAV-BOOK-20] 처리 중 이탈 팝업 [나가기] → 나가려던 곳(신청은 계속)', (t) async { /* BTN-EXIT-01 */ });
testWidgets('[NAV-BOOK-21] 하단 탭 다녀와도 그 단계 그대로(아무것도 묻지 않음)', (t) async {
  final c = await _pumpWizardInShell(t, step: 2);         // AppShell(Task 11) 안에서
  await t.tap(find.text('홈'));   await t.pumpAndSettle(); // 다른 탭
  await t.tap(find.text('예약')); await t.pumpAndSettle(); // 예약 탭 복귀
  expect(c.read(bookingProvider).step, 2);                // BOOK-KEEP-01
  expect(find.byType(AlertDialog), findsNothing);
});
testWidgets('[NAV-BOOK-22] 마법사 중간 딥링크는 만들지 않는다 — /booking 진입은 항상 1단계', (t) async {
  // router redirect + 진입이 reset() → 어떤 진입도 step 0에서 시작.
  final c = await _pumpRouteBooking(t);
  expect(c.read(bookingProvider).step, 0);
});
testWidgets('[NAV-BOOK-23] 마법사 도중 오프라인 → 화면 안 옮기고 그 단계 유지', (t) async {
  final c = await _pumpWizard(t, step: 2, online: false);
  expect(c.read(bookingProvider).step, 2);               // 하던 일 안 빼앗음(다음 버튼에서 실패로 알림)
});
testWidgets('[NAV-BOOK-24] 온라인 401만 로그아웃 — 오프라인 실패는 만료로 안 본다', (t) async {
  // Task 11 handleUnauthorized: online이면 로그인 화면, offline이면 그대로.
  final c = ProviderContainer();
  // 오프라인 상태에서의 실패는 effectiveAuth를 signedOut으로 바꾸지 않는다(OFF-AUTH-04).
  expect(handleUnauthorizedRedirect(online: false), isNull);
  expect(handleUnauthorizedRedirect(online: true), '/login');
});
```
> `_advanceToStep(ctl, n)`은 대상→과→의사→날짜를 차례로 선택해 `step==n`까지 올리는 테스트 헬퍼. `NAV-BOOK-11~20`의 화면 본체와 `book_slot`·`submit()`은 **Task 20**이 붙이며, T19는 위 전이 계약(`goToStep`/`selectDate`가 어느 step으로 가는지)을 확정한다. `NAV-BOOK-17·18·19·20`은 완료 화면·이탈 팝업이 Task 20 소유라 라우트/`showExitConfirm` 분기만 얇게 검증(전이 규칙은 이 표가 원본).
Run → Expected: PASS.

- [ ] **Step 13: 갭 역참조 3곳 반영 + 전체 테스트 + 커밋**

먼저 갭 #7·#9 마감을 세 원본에 역참조(경계 갭 방지 — 단방향 링크 금지):
1. `docs/design/screen-behaviors.md` `BOOK-DOC-07`: `~~⚠️ staff에 전공·소개·사진 칸이 없다 → 갭 #7 / 진료요일 한 줄 요약 API가 없다 → 갭 #9. 지금 플랜으로는 이름밖에 못 띄운다~~ ✅ **해소(2026-08-18, T19)** — 직원웹 00026 칸을 `list_doctors`가 `specialty·photo_url` 반환(갭 #7), `schedule_summary` 서버 요약 반환(갭 #9). 사진·전공·진료시간이 채워진다`
2. `docs/superpowers/specs/2026-07-31-ui-design-decisions.md` 「기능 갭」 #7·#9: `- [ ]` → `- [x]` + `✅ 환자앱 T19에서 반영(2026-08-18) — list_doctors 확장(specialty·photo_url·schedule_summary), 마이그레이션은 직원웹 00026 재사용(신설 없음)`
3. 같은 문서 「경계 갭 대조표」 #7 행: `⚠️ 확인됨 … list_doctors가 id·name만` → `✅ 해소(T19) … specialty·photo_url·schedule_summary 반환`

```bash
cd backend && pytest tests/test_doctor_schedule_summary.py tests/test_patient_catalog_service.py -v
cd ../patient_app && flutter test test/features/booking/
git add backend/app/services/doctor_schedule_summary.py backend/app/services/patient_catalog_service.py backend/tests/ \
  patient_app/lib/features/booking/ patient_app/test/features/booking/ patient_app/lib/core/router.dart \
  docs/design/screen-behaviors.md docs/superpowers/specs/2026-07-31-ui-design-decisions.md
git commit -m "feat: 환자앱 Task 19 — 예약 마법사 1~4단계 71규칙(BOOK-WHO/DEPT/DOC/DATE·NAV-BOOK) + 갭 #7·#9 해소"
```

> 📌 **규칙 커버리지(71)**: `BOOK-NAV-01~10`(10) · `BOOK-KEEP-01~07`(7) · `BOOK-WHO-01~09`(9) · `BOOK-DEPT-01~03`(3) · `BOOK-DOC-01~09`(9) · `BOOK-DATE-01~09`(9) · `NAV-BOOK-01~24`(24). 범위·축약 없이 개별 ID로 test에 심었다(T16·17·18 교훈).
> ⭐ **갭 #7·#9 확정 마감**: 핸드오프가 예고한 「T4 확장 핀」이 여기서 발화·해소. `list_doctors`가 `{id, name, specialty, photo_url, schedule_summary}` 반환 — **새 마이그레이션 없이**(직원웹 `00026` 칸·`doctor-photos` 버킷 재사용) + `summarize_schedule` 순수 함수(서버 한 곳, 챗봇·직원웹 재사용 가능). `BOOK-DOC-07`의 「이름밖에 못 띄운다」가 닫혔다.
> ⭐ **경계 명시(NAV-BOOK 전부 T19 · 5~8단계 화면은 T20)**: 마법사 셸은 전 단계를 아는 단일 상태머신이라 T19가 소유하고, `NAV-BOOK-11~20`의 전이 규칙을 `BookingController._step`으로 못박았다. Task 20은 이 전이 계약(`goToStep`·`selectDate`) 위에 5~8단계 **화면 위젯**(`BOOK-TIME/WHY/CONF/DONE`)·상담봇 시트(`BOOK-BOT`)·`book_slot`/`submit()`·`BOOK-RACE`·`BOOK-TODAY`·`BOOK-HOLD`를 붙인다(71 유지 = 셸 중복 방지, 사용자 승인).
> 📌 **값 없는/구조 규칙 실현 지도**: `BOOK-NAV-05`(뒤 단계 버림)=`selectTarget/Department/Doctor`가 뒤 필드를 새 객체로 리셋 · `BOOK-KEEP-01`(탭 복귀 유지)=`bookingProvider` autoDispose 아님 · `BOOK-KEEP-02`·`BOOK-KEEP-04`(근거)=01·03 동작이 실현 · `BOOK-KEEP-05`(1단계 뒤로 팝업 없음)=셸 `PopScope` · `BOOK-KEEP-07`(BTN-KILL과 다름)=신청 전 서버 무접촉 · `BOOK-NAV-07`(값 없으면 못 넘어감)=선택=이동이라 다음 버튼 부재 · `BOOK-DOC-06`(bio 비노출)=모델에 bio 필드 없음 · `BOOK-DATE-08·09`(8주·마감)=T4 서버 판정 소비.
> ⚠️ **신설 마이그레이션 없음** — 갭 #7 칸은 직원웹 `00026`, 갭 #9는 순수 함수 + `admin_client` 조회(RLS 우회는 진료요일=비민감). T4 `list_doctors` 서비스만 확장(백엔드 파일 2개 수정/신설).
> 📌 **Task 20 인계 발판**(5~8단계 · 66규칙): `BOOK-TIME-01~08` · `BOOK-WHY-01~06` · `BOOK-CONF-01~09`(04b·c·d·e 포함) · `BOOK-DONE-01~07`(01b·c 포함) · `BOOK-RACE-01~09` · `BOOK-TODAY-01~13` · `BOOK-HOLD-01~06` · `BOOK-BOT-01~08` + `NAV-BOOK-11~20` 화면 본체. `request_id`는 Task 20이 마법사 진입 때 만든다(멱등, 플랜 `:2002`). 확정 갭 소급 후보: `BOOK-TODAY`의 갭 #45·#46(T4 `list_bookable_slots`가 이미 닫음 — 소비만).

---

## Task 20: 예약 마법사 5~8단계 (시간·방문이유·최종확인·완료) + 동시충돌·당일예약·상담봇 시트

> **담당 규칙(66)**: `BOOK-TIME-01~08`(8) · `BOOK-WHY-01~06`(6) · `BOOK-CONF-01~09`(9, +`04b·04c·04d·04e`) · `BOOK-DONE-01~07`(7, +`01b·01c`) · `BOOK-RACE-01~09`(9) · `BOOK-TODAY-01~13`(13) · `BOOK-HOLD-01~06`(6) · `BOOK-BOT-01~08`(8).
> ⭐ **T19 셸 위에 뒷 절반을 얹는다**: `NAV-BOOK-11~20`은 T19가 전이 규칙(`BookingController._step`)으로 이미 못박았고(커버리지 반영 완료), 여기서 그 전이가 여는 **실제 화면**(5~8단계·상담봇 시트)을 붙인다. `submit()`이 성공하면 `goToStep(7)`, 그 시간이 이미 차면 `goToStep(4)`(`BOOK-RACE-01`).
> ⚠️ **당일·마감·8주·30분은 앱이 판정하지 않는다** — T4 `list_bookable_slots`가 서버 한 곳에서 거른다(`BOOK-TODAY-02·03·09·11`, `BOOK-DATE-08·09`). 앱은 서버가 준 슬롯만 그리고, **오늘 남은 슬롯이 0이면 안내문**(`BOOK-TODAY-13`)만 화면 몫.
> ⚠️ **상담봇 시트(`BOOK-BOT`)는 4단계 챗봇 엔진의 제한 모드**(결정 E4·갭 #10). 대화 엔진은 `ai-chatbot` 플랜 소유라 여기선 **시트 UI + 모드 계약(도구 전부 금지·`○○과로 계속하기`만 출구·119 예외)**을 세우고 대화는 스텁으로 둔다 — 4단계가 엔진을 붙이면 그대로 작동.

**Files:**
- Modify: `patient_app/lib/features/booking/booking_controller.dart`(`requestId` 추가 — 마법사 진입 때 1회 생성·신청까지 유지, `reset`이 새로 발급 = 멱등 `BOOK-CONF-08`)
- Create: `patient_app/lib/features/booking/booking_submit.dart`(`BookingRepository.createBooking` 소비 · `submit()` — 409 충돌 분기)
- Create: `patient_app/lib/features/booking/steps/time_step.dart`·`why_step.dart`·`conf_step.dart`·`done_step.dart`
- Create: `patient_app/lib/features/booking/dept_bot_sheet.dart`(`DeptBotSheet` — 상담봇 시트 UI + 모드 계약)
- Modify: `patient_app/lib/features/booking/booking_wizard.dart`(`switch(step)`의 4~7단계에 위 위젯 끼움 — T19 `_LaterStepPlaceholder` 교체)
- Test: `patient_app/test/features/booking/{time,why,conf,done,submit,dept_bot}_step_test.dart`

**Interfaces:**
- Consumes:
  - T19: `bookingProvider`·`BookingController`(`selectSlot`·`goToStep`·`reset`) · `BookingSelection`(target·department·doctor·date) · `BookingWizard` 셸 · `availableSlotsProvider`(아래 신설, T4 `list_available_slots` 소비)
  - T4: `GET /catalog/doctors/{doctor_id}/slots?target_date=`(`list_bookable_slots` — 당일 30분·마감·8주 서버 판정) · `get_hospital_info`(`BOOK-CONF-02` 장소)
  - T5: `patient_booking_service.create_booking(patient, for_patient_id, department_id, doctor_id, slot_id, reason, request_id, source='app') -> UUID`(멱등) · 라우터 `POST /my/appointments`
  - T8: `GET /my/appointments/{id}`(완료 화면이 `booking_code`·`status` 조회 — `BOOK-DONE-01b·01c·02·03`)
  - T12: `ActionButton`(`BTN-BUSY`) · `showExitConfirm`(`BTN-EXIT`) · `PendingRequestCard`/`pendingRequestProvider`(`BTN-KILL`) · `InlineError`(`ERR-POS`) · `EmptyState.zero/error`
- Produces:
  - `availableSlotsProvider`(`FutureProvider.autoDispose.family<List<Slot>, ({String doctorId, DateTime date})>`) · `Slot(id, startTime)` 모델
  - `submit()` 결과 → 셸 전이(성공 `goToStep(7)` / 409 `goToStep(4)` + `BOOK-RACE` 안내) — 예약 마법사 완결. **Task 22(변경)가 `change_booking`으로 같은 셸 패턴 재사용 가능**
  - `DeptBotSheet`(모드 계약 확정) — **`ai-chatbot` 플랜이 대화 엔진을 이 시트에 주입**(`BOOK-BOT-07`이 `selectDepartment` 호출)

- [ ] **Step 1: `requestId` 멱등 키 추가 (BOOK-CONF-08·BOOK-HOLD)** — `booking_controller.dart` 수정

```dart
import 'package:uuid/uuid.dart';   // Task 0 의존

// BookingSelection에 필드 추가:
//   final String requestId;   // 마법사 진입 때 1회 생성. 연타·통신 유실 재신청 모두 같은 값 → 서버 멱등(갭 #15).
// 생성자·copyWith에 requestId 반영. reset()이 새 UUID를 발급한다(BOOK-KEEP-06 = 새 예약은 새 request_id).

class BookingController extends StateNotifier<BookingSelection> {
  BookingController() : super(BookingSelection(requestId: const Uuid().v4()));

  void reset() => state = BookingSelection(requestId: const Uuid().v4());   // 새 예약 = 새 멱등 키

  // 5단계 시간 선택 — slot_id만 상태에 담는다. ⭐ 여기서 서버를 호출하지 않는다(BOOK-HOLD-01·03: 홀드 없음).
  void selectSlot(String slotId) => state = state.copyWith(step: 5, slotId: slotId);
  // 6단계 방문이유 입력 후 → 7단계.
  void setReason(String reason) => state = state.copyWith(step: 6, reason: reason);
}
```
테스트(`booking_controller_test.dart`에 추가):

```dart
test('[BOOK-CONF-08] request_id는 마법사 한 판 동안 고정, reset하면 새로 발급된다', () {
  final first = c.read(bookingProvider).requestId;
  ctl().selectTarget(t1); ctl().selectDepartment(dInternal);
  expect(c.read(bookingProvider).requestId, first);   // 진행 중 불변(재신청도 같은 값)
  ctl().reset();
  expect(c.read(bookingProvider).requestId, isNot(first));  // 새 예약은 새 키
});
test('[BOOK-HOLD-01][BOOK-HOLD-03] 시간을 골라도 서버를 호출하지 않는다(임시 홀드 없음)', () {
  ctl().selectTarget(t1); ctl().selectDepartment(dInternal); ctl().selectDoctor(doc1); ctl().selectDate(DateTime(2026,8,20));
  ctl().selectSlot('slot-1');
  expect(c.read(bookingProvider).slotId, 'slot-1');
  expect(c.read(bookingProvider).step, 5);            // 6단계로 갈 뿐, book_slot은 8단계 신청에서만
});
```
> `BOOK-HOLD-02`(6·7단계 머무는 사이 뺏길 수 있음)·`BOOK-HOLD-04`·`BOOK-HOLD-05`(홀드의 부작용·타이머 재촉 근거)·`BOOK-HOLD-06`(안전망=RACE)은 결정 **근거** — `selectSlot`이 서버를 안 건드리고 충돌을 `submit`에서 처리하는 구조 자체가 실현한다(Step 6 `submit`·Step 7 `BOOK-RACE`).
Run → Expected: PASS.

- [ ] **Step 2: 5단계 시간 `TimeStep` (BOOK-TIME + BOOK-TODAY 당일)** — `steps/time_step.dart`

```dart
final availableSlotsProvider = FutureProvider.autoDispose
    .family<List<Slot>, ({String doctorId, DateTime date})>((ref, k) =>
        ref.read(catalogRepositoryProvider).slots(k.doctorId, k.date));   // T4 list_bookable_slots

class Slot { final String id; final DateTime startTime; const Slot(this.id, this.startTime); /* fromJson */ }

class TimeStep extends ConsumerWidget {
  const TimeStep({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sel = ref.watch(bookingProvider);
    final slots = ref.watch(availableSlotsProvider((doctorId: sel.doctor!.id, date: sel.date!)));
    return slots.when(
      error: (_, __) => EmptyState.error(onRetry: () => ref.invalidate(availableSlotsProvider)),
      loading: () => const Center(child: CircularProgressIndicator()),
      data: (list) {
        if (list.isEmpty) {
          // 그날이 전부 참/당일 30분 규칙으로 0 → 나가는 문 + 당일이면 이유 안내(BOOK-TIME-07·BOOK-TODAY-13)
          return _AllFull(isToday: _isToday(sel.date!),
            onPickAnotherDate: () => ref.read(bookingProvider.notifier).goToStep(3));  // NAV-BOOK-12
        }
        final am = list.where((s) => s.startTime.hour < 12).toList();   // 오전/오후 두 덩어리(BOOK-TIME-01·04)
        final pm = list.where((s) => s.startTime.hour >= 12).toList();
        return ListView(children: [
          if (am.isNotEmpty) _Block('오전 · ${am.length}자리', am, ref),   // BOOK-TIME-03 남은 자리 수
          if (pm.isNotEmpty) _Block('오후 · ${pm.length}자리', pm, ref),   // BOOK-TIME-06 한쪽 0이면 통째 감춤
        ]);
      },
    );
  }
}
// _Block: 3열 격자. 칸 누르면 selectSlot(slot.id) → 6단계.
// 찬 시간은 서버 목록에 애초에 없다(BOOK-TIME-02 숨김). 시각 레일 안 씀(BOOK-TIME-05).
```
테스트(`time_step_test.dart`):

```dart
testWidgets('[BOOK-TIME-01][BOOK-TIME-03] 오전/오후 덩어리 + 남은 자리 수', (t) async {
  await _pumpTime(t, slots: [_slot('09:00'), _slot('09:20'), _slot('14:00')]);
  expect(find.text('오전 · 2자리'), findsOneWidget);
  expect(find.text('오후 · 1자리'), findsOneWidget);
});
testWidgets('[BOOK-TIME-02] 찬 시간은 회색이 아니라 아예 없다(서버 목록에 없음)', (t) async {
  await _pumpTime(t, slots: [_slot('09:00')]);   // 서버가 빈시간만 준다
  expect(find.text('09:20'), findsNothing);      // 찬 09:20은 목록에 아예 없다
});
testWidgets('[BOOK-TIME-06] 오후가 0이면 오후 덩어리를 통째로 감춘다', (t) async {
  await _pumpTime(t, slots: [_slot('09:00')]);
  expect(find.textContaining('오후'), findsNothing);
});
testWidgets('[BOOK-TIME-07] 그날이 전부 차면 [다른 날짜 고르기]로 4단계로 나간다', (t) async {
  final c = await _pumpTime(t, slots: []);
  expect(find.text('다른 날짜 고르기'), findsOneWidget);
  await t.tap(find.text('다른 날짜 고르기')); await t.pump();
  expect(c.read(bookingProvider).step, 3);       // NAV-BOOK-12
});
testWidgets('[NAV-BOOK-11] 시각을 누르면 6단계 방문 이유로 간다', (t) async {
  final c = await _pumpTime(t, slots: [_slot('09:00')]);
  await t.tap(find.text('오전 9:00')); await t.pump();
  expect(c.read(bookingProvider).step, 5);
});
testWidgets('[BOOK-TIME-05] 시각 레일(줄줄이 시간선)을 쓰지 않는다 — 격자다', (t) async {
  await _pumpTime(t, slots: [_slot('09:00'), _slot('09:20')]);
  expect(find.byType(GridView), findsWidgets);   // 3열 격자
});
```
> `BOOK-TIME-04`(오전/오후로 묶는 이유 = 점심시간이 빈틈으로 설명)·`BOOK-TIME-08`(당일 지난 시각이 뜨는 구현 전제)는 각각 UI 구조(두 덩어리)·**T4 서버 판정**(`list_bookable_slots`가 이미 거름)이 실현 — 앱은 서버 목록만 그린다.
Run → Expected: PASS.

- [ ] **Step 3: 당일 예약 (BOOK-TODAY) — 화면 몫만** — `time_step.dart`의 `_AllFull` + 근거 노트

```dart
class _AllFull extends StatelessWidget {
  const _AllFull({required this.isToday, required this.onPickAnotherDate});
  final bool isToday;
  final VoidCallback onPickAnotherDate;
  @override
  Widget build(BuildContext context) => Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
    const Text('예약 가능한 시간이 없습니다'),
    if (isToday) const Padding(padding: EdgeInsets.all(8),
      child: Text('지금 시각 기준으로 30분 뒤부터 예약하실 수 있습니다')),   // BOOK-TODAY-13 이유를 함께
    TextButton(onPressed: onPickAnotherDate, child: const Text('다른 날짜 고르기')),  // 막다른 길 금지
  ]));
}
```
테스트:

```dart
testWidgets('[BOOK-TODAY-01] 당일(오늘)을 골라도 시간 목록을 보여준다(서버가 남은 슬롯을 준다)', (t) async {
  await _pumpTime(t, slots: [_slot('23:30')], date: DateTime.now());
  expect(find.textContaining('오후'), findsOneWidget);   // 오늘도 예약 화면이 뜬다(달력이 오늘 안 막음)
});
testWidgets('[BOOK-TODAY-13] 오늘 남은 시간이 0이면 30분 안내문 + 다른 날짜 출구', (t) async {
  await _pumpTime(t, slots: [], date: DateTime.now());
  expect(find.text('지금 시각 기준으로 30분 뒤부터 예약하실 수 있습니다'), findsOneWidget);
  expect(find.text('다른 날짜 고르기'), findsOneWidget);
});
```
> **값 없는/근거 규칙 — 어디서 실현되나(BOOK-TODAY)**: `BOOK-TODAY-02`(지난 시각 제외)·`BOOK-TODAY-03`(마감 이후 제외)·`BOOK-TODAY-09`(30분 이내 제외)·`BOOK-TODAY-11`(30분 고정)은 **T4 `list_bookable_slots`가 서버에서** 거른다(앱은 목록만 소비). `BOOK-TODAY-04`(마감 넘김 = 오늘 흐림)는 T19 `BOOK-DATE-05`(진료 없음)가 실현. `BOOK-TODAY-05`·`BOOK-TODAY-06`·`BOOK-TODAY-07`·`BOOK-TODAY-08`·`BOOK-TODAY-10`·`BOOK-TODAY-12`는 정책 **근거**(마감 시각이 주체·요구사항 당일방문은 다른 경로·지각유예와 같은 30분) — `BOOK-TODAY-01`(당일 허용)·`BOOK-TODAY-13`(안내) 두 동작 + T4 서버 규칙이 이들을 실현한다.
Run → Expected: PASS.

- [ ] **Step 4: 6단계 방문이유 `WhyStep` (BOOK-WHY)** — `steps/why_step.dart`

```dart
class WhyStep extends ConsumerStatefulWidget { /* ... */ }
class _WhyStepState extends ConsumerState<WhyStep> {
  final _ctl = TextEditingController();
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    const Padding(padding: EdgeInsets.all(16),
      child: Text('어떤 일로 오시나요?', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800))),  // BOOK-WHY-02
    const Padding(padding: EdgeInsets.symmetric(horizontal: 16),
      child: Text('간단히 적어주시면 진료 준비에 도움이 됩니다.')),
    Padding(padding: const EdgeInsets.all(16), child: TextField(
      controller: _ctl, maxLength: 100,                      // BOOK-WHY-01·05 자유입력 100자, 넘으면 입력 자체 막힘
      maxLines: 3, decoration: const InputDecoration(counterText: ''),
      buildCounter: (_, {required currentLength, required isFocused, maxLength}) =>
          Text('$currentLength/$maxLength'),                 // BOOK-WHY-05 남은 글자 수
    )),
    const Padding(padding: EdgeInsets.symmetric(horizontal: 16), child: Text(
      '여기 적으신 내용은 나중에 작성하실 사전문진의 첫 문항에 그대로 옮겨져 있습니다. '
      '거기서 더 자세히 고쳐 쓰실 수 있습니다.')),               // BOOK-WHY-04 안내 상자
    const Spacer(),
    Row(children: [
      TextButton(onPressed: () => ref.read(bookingProvider.notifier).setReason(''),   // BOOK-WHY-03 건너뛰기
        child: const Text('건너뛰기')),
      const Spacer(),
      ActionButton(label: '다음', onPressed: () => ref.read(bookingProvider.notifier).setReason(_ctl.text)),
    ]),
  ]);
}
```
테스트(`why_step_test.dart`):

```dart
testWidgets('[BOOK-WHY-01] 자유 입력 한 칸(자주 쓰는 이유 단추 없음)', (t) async {
  await _pumpWhy(t);
  expect(find.byType(TextField), findsOneWidget);
  expect(find.byType(ChoiceChip), findsNothing);            // 단추 없음
});
testWidgets('[BOOK-WHY-02] 질문 문구와 부연', (t) async {
  await _pumpWhy(t);
  expect(find.text('어떤 일로 오시나요?'), findsOneWidget);
  expect(find.text('간단히 적어주시면 진료 준비에 도움이 됩니다.'), findsOneWidget);
});
testWidgets('[BOOK-WHY-03] 필수가 아니다 — 건너뛰기가 7단계로 보낸다', (t) async {
  final c = await _pumpWhy(t);
  await t.tap(find.text('건너뛰기')); await t.pump();
  expect(c.read(bookingProvider).step, 6);
  expect(c.read(bookingProvider).reason, '');
});
testWidgets('[BOOK-WHY-04] 문진 초기값 안내 상자', (t) async {
  await _pumpWhy(t);
  expect(find.textContaining('사전문진의 첫 문항에 그대로 옮겨져'), findsOneWidget);
});
testWidgets('[BOOK-WHY-05] 100자에 도달하면 입력을 막고 100/100을 보인다(잘라내지 않음)', (t) async {
  await _pumpWhy(t);
  await t.enterText(find.byType(TextField), 'ㄱ' * 120);
  await t.pump();
  expect(find.text('100/100'), findsOneWidget);             // maxLength가 입력을 막는다
});
```
> `BOOK-WHY-06`(여기 값은 문진 1번 **초기값**일 뿐 문진에서 고쳐도 `appointments.reason` 안 바뀜 — 동기화 없음)은 **T5 `create_booking`이 `reason`을 그대로 저장하고, 문진(T23)이 별도 응답 테이블에 쓰는** 구조가 실현(갭 #23 확정). 이 스텝은 `reason`을 상태에 담아 `submit`에 넘기기만 한다.
Run → Expected: PASS.

- [ ] **Step 5: 7단계 최종확인 `ConfStep` (BOOK-CONF)** — `steps/conf_step.dart`

```dart
class ConfStep extends ConsumerWidget {
  const ConfStep({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sel = ref.watch(bookingProvider);
    final hospital = ref.watch(hospitalInfoProvider);        // 장소(BOOK-CONF-02) — get_hospital_info
    final submitting = ref.watch(bookingSubmitProvider);     // AsyncValue — 진행/오류(Step 6)
    return Column(children: [
      Expanded(child: ListView(children: [
        _row('대상', sel.target!.name), _row('진료과', sel.department!.name),
        _row('의사', sel.doctor!.name), _row('일시', _fmt(sel.date!, sel.slotStartTime)),
        _row('방문이유', sel.reason?.isEmpty ?? true ? '(없음)' : sel.reason!),
        hospital.maybeWhen(data: (h) => _row('장소', h.address), orElse: () => const SizedBox()),
      ])),  // BOOK-CONF-02 전 항목 한 번에. BOOK-CONF-03 항목별 [고치기] 없음(뒤로로 고침)
      const Padding(padding: EdgeInsets.all(12), child: Text(
        '병원 확인 후 확정되는 경우 알림으로 알려드립니다')),   // BOOK-CONF-04e 양쪽 참인 문장
      if (submitting.hasError)
        InlineError(message: (submitting.error as ApiException).message),  // BOOK-CONF-09 버튼 바로 위 붙박이
      ActionButton(
        label: '예약 신청하기',                              // BOOK-CONF-04b 하나로 통일(즉시확정/확인후 안 나눔)
        busyLabel: '예약 신청 중…',                          // BOOK-CONF-05 진행형 글자 유지
        busy: submitting.isLoading,
        onPressed: () => ref.read(bookingSubmitProvider.notifier).submit(),
      ),
    ]);
  }
}
```
테스트(`conf_step_test.dart`):

```dart
testWidgets('[BOOK-CONF-02] 전 항목을 한 번에 보여준다(방문이유 한 줄만 아님)', (t) async {
  await _pumpConf(t, sel: _fullSel(reason: '감기 기운'));
  for (final v in ['김순자', '내과', '김의사', '감기 기운', '서울 강남']) {
    expect(find.textContaining(v), findsOneWidget);
  }
});
testWidgets('[BOOK-CONF-03] 항목별 [고치기] 버튼이 없다', (t) async {
  await _pumpConf(t, sel: _fullSel());
  expect(find.text('고치기'), findsNothing);
});
testWidgets('[BOOK-CONF-04b] 신청 버튼은 예약 신청하기 하나(즉시확정/확인후로 안 나눔)', (t) async {
  await _pumpConf(t, sel: _fullSel());
  expect(find.text('예약 신청하기'), findsOneWidget);
  expect(find.text('예약하기'), findsNothing);
});
testWidgets('[BOOK-CONF-04e] 병원 확인 안내 문장을 미리 보여준다', (t) async {
  await _pumpConf(t, sel: _fullSel());
  expect(find.text('병원 확인 후 확정되는 경우 알림으로 알려드립니다'), findsOneWidget);
});
testWidgets('[BOOK-CONF-05] 신청 중에는 글자를 유지한 진행형이 된다', (t) async {
  await _pumpConf(t, sel: _fullSel(), submitting: const AsyncLoading());
  expect(find.text('예약 신청 중…'), findsOneWidget);
});
testWidgets('[BOOK-CONF-09] 실패는 버튼 바로 위 붙박이 오류(새 [다시 시도] 안 만듦)', (t) async {
  await _pumpConf(t, sel: _fullSel(), submitting: AsyncError(ApiException('일시적 오류'), StackTrace.current));
  expect(find.byType(InlineError), findsOneWidget);
  expect(find.text('다시 시도'), findsNothing);           // 원래 버튼을 다시 누른다
});
```
> `BOOK-CONF-01`(확인 전용·값 안 고침)·`BOOK-CONF-04`(고치려면 뒤로)는 `[고치기]` 부재 + 뒤로 하나(T19 셸)가 실현. `BOOK-CONF-04c·04d`(신청/확정 안 나누는 **근거** = 틀렸을 때 손해가 한쪽으로 기움 · `auto_confirm`을 API가 안 줌)는 `04b` 동작이 실현. `BOOK-CONF-06`(처리 중 이탈=`showExitConfirm`)·`BOOK-CONF-07`(보내기 직전 `PendingRequestCard`)·`BOOK-CONF-08`(오래 걸려도 앱이 안 끊음=멱등)은 Step 6 `submit`이 실현.
Run → Expected: PASS.

- [ ] **Step 6: 신청 `submit` + 동시충돌 (BOOK-RACE) + 이탈/유언장** — `booking_submit.dart`

```dart
class BookingRepository {
  BookingRepository(this._api);
  final ApiClient _api;
  // 멱등 request_id를 보낸다. 반환 appointment_id.
  Future<String> createBooking(BookingSelection s) => _api.post('/my/appointments', {
    'for_patient_id': s.target!.patientId, 'department_id': s.department!.id,
    'doctor_id': s.doctor!.id, 'slot_id': s.slotId, 'reason': s.reason ?? '',
    'request_id': s.requestId,
  }, (j) => j['appointment_id'] as String);
}

class BookingSubmit extends StateNotifier<AsyncValue<void>> {
  BookingSubmit(this._ref) : super(const AsyncData(null));
  final Ref _ref;
  Future<void> submit() async {
    final ctl = _ref.read(bookingProvider.notifier);
    final sel = _ref.read(bookingProvider);
    _ref.read(pendingRequestProvider.notifier).begin('예약 신청', sel.requestId);  // BTN-KILL 유언장(BOOK-CONF-07)
    state = const AsyncLoading();
    try {
      final id = await _ref.read(bookingRepositoryProvider).createBooking(sel);
      _ref.read(pendingRequestProvider.notifier).complete(sel.requestId);
      ctl.finishTo(id);                       // 8단계 완료(goToStep 7 + 방금 만든 appointment_id 보관)
      state = const AsyncData(null);
    } on ApiException catch (e) {
      _ref.read(pendingRequestProvider.notifier).complete(sel.requestId);
      if (e.statusCode == 409) {              // 그 시간이 이미 참(BOOK-RACE)
        ctl.raceBackToTime(e.message);        // 5단계로 되돌리고 격자 위 안내(BOOK-RACE-01·02)
        state = const AsyncData(null);        // 오류 배너가 아니라 화면 이동으로 처리(BOOK-RACE-09)
      } else {
        state = AsyncError(e, StackTrace.current);   // 7단계 그대로 붙박이(BOOK-CONF-09·NAV-BOOK-15)
      }
    }
  }
}
final bookingSubmitProvider = StateNotifierProvider<BookingSubmit, AsyncValue<void>>((ref) => BookingSubmit(ref));

// BookingController에 추가:
//   void finishTo(String appointmentId) => state = state.copyWith(step: 7, createdAppointmentId: appointmentId);
//   String? raceMessage;
//   void raceBackToTime(String msg) { raceMessage = msg; state = state.copyWith(step: 4); }  // BOOK-RACE-01
```
테스트(`submit_step_test.dart`):

```dart
testWidgets('[BOOK-RACE-01][NAV-BOOK-16] 그 시간이 이미 차면 5단계 시간 선택으로 되돌린다', (t) async {
  final c = _containerWith(post: (_) async => throw ApiException('이미 선택된 시간입니다. 다른 시간을 선택해주세요.', statusCode: 409));
  _advanceToStep(c.read(bookingProvider.notifier), 6);
  await c.read(bookingSubmitProvider.notifier).submit();
  expect(c.read(bookingProvider).step, 4);              // 처음부터가 아니라 시간 단계로만
});
testWidgets('[BOOK-RACE-02][BOOK-RACE-04] 격자 위 안내에 시각을 앞에 붙인 서버 문장', (t) async {
  final c = _containerWith(post: (_) async => throw ApiException('이미 선택된 시간입니다. 다른 시간을 선택해주세요.', statusCode: 409));
  final ctl = c.read(bookingProvider.notifier); _advanceToStep(ctl, 6); ctl.selectSlot('s1'); // 15:00 슬롯
  await c.read(bookingSubmitProvider.notifier).submit();
  expect(c.read(bookingProvider).raceMessage, contains('다른 시간을 선택'));
});
testWidgets('[BOOK-RACE-09] 충돌을 팝업으로 알리지 않는다(화면 이동으로 처리)', (t) async {
  final c = _containerWith(post: (_) async => throw ApiException('x', statusCode: 409));
  _advanceToStep(c.read(bookingProvider.notifier), 6);
  await c.read(bookingSubmitProvider.notifier).submit();
  expect(find.byType(AlertDialog), findsNothing);
});
testWidgets('[NAV-BOOK-15][BOOK-CONF-09] 서버 오류(409 아님)는 7단계 그대로 붙박이 오류', (t) async {
  final c = _containerWith(post: (_) async => throw ApiException('서버 오류', statusCode: 500));
  _advanceToStep(c.read(bookingProvider.notifier), 6);
  await c.read(bookingSubmitProvider.notifier).submit();
  expect(c.read(bookingProvider).step, 6);             // 화면 안 옮김
  expect(c.read(bookingSubmitProvider).hasError, isTrue);
});
testWidgets('[BOOK-CONF-07] 보내기 직전 「결과 못 받은 신청」을 폰에 적는다(유언장)', (t) async {
  final c = _containerWith(post: (_) async { await Future.delayed(const Duration(seconds: 1)); return '{"appointment_id":"a1"}'; });
  _advanceToStep(c.read(bookingProvider.notifier), 6);
  unawaited(c.read(bookingSubmitProvider.notifier).submit());
  await t.pump();
  expect(c.read(pendingRequestProvider).any((p) => p.requestId != null), isTrue);
});
testWidgets('[BOOK-RACE-07] 시간 단계로 되돌아오면 다시 조회한다(찬 시간이 빠져 있다)', (t) async {
  // raceBackToTime 후 TimeStep이 availableSlotsProvider를 다시 watch → invalidate로 최신화.
  final c = _containerWith(post: (_) async => throw ApiException('x', statusCode: 409));
  _advanceToStep(c.read(bookingProvider.notifier), 6);
  await c.read(bookingSubmitProvider.notifier).submit();
  // step==4에서 TimeStep이 마운트되며 fresh fetch(회색 잔재 없음, BOOK-RACE-08).
  expect(c.read(bookingProvider).step, 4);
});
```
> `BOOK-RACE-03`(시각을 말하는 이유=빈자리 안 헤매게)·`BOOK-RACE-05`(위치 규칙=바뀐 대상 위)·`BOOK-RACE-06`(다른 시간 고르면 사라짐)·`BOOK-RACE-08`(놓친 칸 회색 안 남김)은 5단계 격자 위 `raceMessage` 배너 + 재조회가 실현(TimeStep이 `raceMessage`를 격자 위에 그리고, 슬롯 선택 시 지운다). `BOOK-CONF-08`(오래 걸려도 앱 안 끊음)=멱등 `request_id`라 재신청해도 한 건.
Run → Expected: PASS.

- [ ] **Step 7: 8단계 완료 `DoneStep` (BOOK-DONE)** — `steps/done_step.dart`

```dart
class DoneStep extends ConsumerWidget {
  const DoneStep({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = ref.watch(bookingProvider).createdAppointmentId!;
    final appt = ref.watch(appointmentDetailProvider(id));   // T8 GET /my/appointments/{id}
    return appt.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, __) => EmptyState.error(onRetry: () => ref.invalidate(appointmentDetailProvider(id))),
      data: (a) {
        final confirmed = a.status == '예약확정';
        return Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          const CircleAvatar(radius: 36, backgroundColor: Color(0xFF0B6E70), child: Icon(Icons.check, color: Colors.white, size: 40)),
          Text(confirmed ? '예약이 확정되었습니다' : '예약이 신청되었습니다',    // BOOK-DONE-02·03 용어가 상태를 따라감
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          _summaryBox(a),                                     // 일시·진료 + 번호(BOOK-DONE-01b)
          Text('${confirmed ? '예약번호' : '신청번호'} ${a.bookingCode}'),  // BOOK-DONE-01c 용어
          const Text('사전문진을 미리 써두시면 진료가 더 빨라집니다.'),        // BOOK-DONE-05
          ActionButton(label: '사전문진 작성하기',                 // BOOK-DONE-04
            onPressed: () => context.go('/my/appointments/$id/questionnaire')),  // NAV-BOOK-17 → 문진(T23)
          TextButton(onPressed: () => context.go('/home'),      // BOOK-DONE-06 나중에 할게요 → 홈
            child: const Text('나중에 할게요')),
        ]);
      },
    );
  }
}
```

이 화면에서 **뒤로 = 홈**(마법사로 안 돌아감). T19 셸 `PopScope`가 `step==7`이면 `context.go('/home')`로 처리하도록 한 줄 추가(`BOOK-NAV-08`·`BOOK-DONE-07`·`NAV-BOOK-14`):

```dart
// booking_wizard.dart PopScope onPopInvoked 안:
if (step >= 7) { context.go('/home'); return; }   // 완료 화면 뒤로 = 홈(예약 이미 생성됨)
```
테스트(`done_step_test.dart`):

```dart
testWidgets('[BOOK-DONE-02] 예약신청으로 생성되면 "예약이 신청되었습니다"', (t) async {
  await _pumpDone(t, appt: _appt(status: '예약신청', code: 'A-2413'));
  expect(find.text('예약이 신청되었습니다'), findsOneWidget);
});
testWidgets('[BOOK-DONE-03] 즉시확정 병원은 "예약이 확정되었습니다"', (t) async {
  await _pumpDone(t, appt: _appt(status: '예약확정', code: 'A-2413'));
  expect(find.text('예약이 확정되었습니다'), findsOneWidget);
});
testWidgets('[BOOK-DONE-01b][BOOK-DONE-01c] 번호를 함께 보여주고 용어가 상태를 따른다', (t) async {
  await _pumpDone(t, appt: _appt(status: '예약신청', code: 'A-2413'));
  expect(find.text('신청번호 A-2413'), findsOneWidget);   // 확정 전 = 신청번호
});
testWidgets('[BOOK-DONE-04][BOOK-DONE-05] 사전문진 작성하기 + 안내 + 나중에 할게요', (t) async {
  await _pumpDone(t, appt: _appt(status: '예약확정', code: 'A-1'));
  expect(find.text('사전문진 작성하기'), findsOneWidget);
  expect(find.text('나중에 할게요'), findsOneWidget);
  expect(find.text('사전문진을 미리 써두시면 진료가 더 빨라집니다.'), findsOneWidget);
});
testWidgets('[NAV-BOOK-17] 사전문진 작성하기 → 그 예약의 문진 화면', (t) async {
  await _pumpDone(t, appt: _appt(status: '예약확정', code: 'A-1', id: 'appt-9'));
  await t.tap(find.text('사전문진 작성하기')); await t.pumpAndSettle();
  expect(_lastRoute, '/my/appointments/appt-9/questionnaire');
});
testWidgets('[NAV-BOOK-18][BOOK-DONE-06] 나중에 할게요 → 홈', (t) async {
  await _pumpDone(t, appt: _appt(status: '예약확정', code: 'A-1'));
  await t.tap(find.text('나중에 할게요')); await t.pumpAndSettle();
  expect(_lastRoute, '/home');
});
testWidgets('[BOOK-DONE-07][NAV-BOOK-14] 완료 화면에서 뒤로 = 홈(마법사로 안 돌아감)', (t) async {
  await _pumpDoneInWizard(t, appt: _appt(status: '예약확정', code: 'A-1'));
  await _pressBack(t); await t.pumpAndSettle();
  expect(_lastRoute, '/home');
});
```
> `BOOK-DONE-01`(가운데 원+✓→제목→요약→CTA 레이아웃)은 위 위젯 트리가 실현(체크 원·제목·요약·버튼 존재를 `_pumpDone`이 함께 확인).
Run → Expected: PASS.

- [ ] **Step 8: 2단계 상담봇 시트 `DeptBotSheet` (BOOK-BOT) — 모드 계약 + UI 스텁** — `dept_bot_sheet.dart`

```dart
// ⚠️ 대화 엔진은 ai-chatbot 플랜 소유. 여기선 시트 UI + 모드 계약을 세운다.
//    제한 모드: 행동형 도구 전부 금지, 유일한 출구는 ○○과로 계속하기, 119 안전 안내만 예외(결정 E4).
class DeptBotSheet extends ConsumerWidget {
  const DeptBotSheet({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sel = ref.watch(bookingProvider);
    final suggested = ref.watch(deptBotSuggestionProvider);  // 엔진(4단계)이 좁혀준 진료과. 스텁=null.
    return Padding(padding: MediaQuery.of(context).viewInsets, child: Column(mainAxisSize: MainAxisSize.min, children: [
      Row(children: [
        const Text('AI 상담봇', style: TextStyle(fontWeight: FontWeight.w800)),   // BOOK-BOT-02 용어(챗봇 아님)
        const Spacer(),
        IconButton(icon: const Icon(Icons.cancel), iconSize: 40,                  // BOOK-BOT-03 원형 X(쓸어내림도 됨)
          onPressed: () => Navigator.of(context).pop()),
      ]),
      const Expanded(child: _BotConversation()),   // 정보성 안내 + 진료과 추천만(BOOK-BOT-01·07 계약). 엔진은 4단계.
      if (suggested != null)
        Column(children: [
          ActionButton(label: '${suggested.name}로 계속하기',                     // BOOK-BOT-04·05
            onPressed: () {
              ref.read(bookingProvider.notifier).selectDepartment(suggested);    // NAV-BOOK-07 → 3단계, 그 과 선택
              Navigator.of(context).pop();
            }),
          Text('예약을 계속 진행 중입니다 · ${sel.target?.relation ?? '본인'} (${sel.target?.name ?? ''})',
            style: const TextStyle(fontSize: 12, color: Color(0xFF5D7183))),      // BOOK-BOT-04 회색 보조
        ]),
    ]));
  }
}
```
테스트(`dept_bot_step_test.dart`):

```dart
testWidgets('[BOOK-BOT-02] 제목은 "AI 상담봇"(챗봇 아님)', (t) async {
  await _pumpSheet(t);
  expect(find.text('AI 상담봇'), findsOneWidget);
  expect(find.textContaining('챗봇'), findsNothing);
});
testWidgets('[BOOK-BOT-03] 오른쪽 위 원형 X(40px)로 닫는다', (t) async {
  await _pumpSheet(t);
  final btn = t.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.cancel));
  expect(btn.iconSize, 40);
});
testWidgets('[BOOK-BOT-04][BOOK-BOT-05] 과가 정해지면 ○○과로 계속하기 + 진행 중 보조 문구', (t) async {
  final c = await _pumpSheet(t, suggested: const Department('d1', '내과'), target: const BookingTarget('me','김순자',null));
  expect(find.text('내과로 계속하기'), findsOneWidget);
  expect(find.textContaining('예약을 계속 진행 중입니다'), findsOneWidget);
  await t.tap(find.text('내과로 계속하기')); await t.pumpAndSettle();
  expect(c.read(bookingProvider).department!.id, 'd1');   // NAV-BOOK-07 그 과 선택된 채 3단계
  expect(c.read(bookingProvider).step, 2);
});
testWidgets('[BOOK-BOT-06] 그냥 닫으면 아무것도 고르지 않은 2단계 그대로', (t) async {
  final c = await _pumpSheet(t, suggested: null);
  await t.tap(find.widgetWithIcon(IconButton, Icons.cancel)); await t.pumpAndSettle();
  expect(c.read(bookingProvider).department, isNull);
});
testWidgets('[BOOK-BOT-01] 시트는 겹침(화면을 떠나지 않는다) — 아래에서 올라온다', (t) async {
  await _pumpSheetOverDept(t);
  expect(find.byType(DeptStep), findsOneWidget);          // 뒤에 2단계가 살아 있다
  expect(find.byType(DeptBotSheet), findsOneWidget);
});
```
> `BOOK-BOT-07`(예약 중 상담은 **행동형 도구 전부 금지**·유일 출구 `○○과로 계속하기`)·`BOOK-BOT-08`(같은 엔진 제한 모드지만 **119·응급실 안전 안내는 항상 작동**)은 **모드 계약**이라 시트가 예약제안·취소·문진 카드 위젯을 **띄우지 않는 구조**로 실현하고, 실제 엔진 강제는 `ai-chatbot` 플랜이 이 시트에 주입할 때 계약을 따른다(주석·`deptBotSuggestionProvider`가 「진료과 추천만」 반환 타입으로 계약 고정).
Run → Expected: PASS.

- [ ] **Step 9: 셸에 5~8단계 끼우기 + 전체 테스트 + 커밋**

`booking_wizard.dart`의 `switch(step)`에서 T19 `_LaterStepPlaceholder`를 교체:

```dart
4 => const TimeStep(),
5 => const WhyStep(),
6 => const ConfStep(),
7 => const DoneStep(),
```
그리고 위 Step 7의 `PopScope` 완료 화면 분기(`step>=7 → 홈`)를 반영.

```bash
cd patient_app && flutter test test/features/booking/
git add patient_app/lib/features/booking/ patient_app/test/features/booking/
git commit -m "feat: 환자앱 Task 20 — 예약 마법사 5~8단계 66규칙(TIME/WHY/CONF/DONE·RACE·TODAY·HOLD·BOT)"
```

> 📌 **규칙 커버리지(66)**: `BOOK-TIME-01~08`(8) · `BOOK-WHY-01~06`(6) · `BOOK-CONF-01~09`(9 · 04b·04c·04d·04e 포함) · `BOOK-DONE-01~07`(7 · 01b·01c 포함) · `BOOK-RACE-01~09`(9) · `BOOK-TODAY-01~13`(13) · `BOOK-HOLD-01~06`(6) · `BOOK-BOT-01~08`(8). 개별 ID로 test에 심음(축약 없음).
> ⭐ **예약 마법사 완결**: T19(셸+1~4단계) + T20(5~8단계+신청)로 8단계 예약 흐름이 끝난다. `NAV-BOOK-11~20`의 화면 본체가 여기서 실체화(T19가 전이만 담고 커버리지 반영은 완료). `submit()`이 T5 `create_booking`(멱등 `request_id`)을 호출하고 409는 `BOOK-RACE`로 5단계 복귀.
> 📌 **값 없는/근거·서버 규칙 실현 지도**: `BOOK-TODAY-02·03·09·11`·`BOOK-TIME-08`·`BOOK-DATE-08·09`=T4 `list_bookable_slots` 서버 판정(앱 소비) · `BOOK-TODAY-05·06·07·08·10·12`=정책 근거(`01`·`13` 동작이 실현) · `BOOK-HOLD-02·04·05·06`=홀드 없음 근거(`submit`이 신청 때만 book) · `BOOK-CONF-04c·04d`=신청/확정 안 나눔 근거(`04b`) · `BOOK-WHY-06`=문진 초기값 비동기화(T5·T23 구조) · `BOOK-BOT-07·08`=모드 계약(시트가 행동 도구 안 띄움).
> 📌 **T20이 T19 파일을 확장한 곳**(경계): `booking_controller.dart`에 `requestId`·`slotId`·`reason`·`createdAppointmentId`·`raceMessage`·`selectSlot`·`setReason`·`finishTo`·`raceBackToTime` 추가, `booking_wizard.dart` `switch`·`PopScope` 완료 분기. T19 전이 계약(`goToStep`·`_step` 의미)은 그대로.
> ⚠️ **4단계(챗봇) 인계**: `DeptBotSheet`의 대화 엔진·`deptBotSuggestionProvider`는 `ai-chatbot` 플랜이 채운다. 제한 모드 계약(`BOOK-BOT-07·08` = 행동 도구 금지·119 예외, 결정 E4)을 그 플랜에서 반드시 지킬 것 — 원장 `HANDOVERS.md`에 등록 대상.

> ▶ **다음 = Task 21 본문 작성** — 예약 상세·상태 화면(`APPT-*`·`NAV-APPT-*` 일부, 묶음 4 「상세·변경·취소」 135규칙 중 T21 몫). 📌 재사용: T15·17 카드 위젯·`resolveCardState` · T8 `get_appointment_detail` · T16 홈에서 진입. ⚠️ `writing-plans` 먼저 + 완전 ID. ⚠️ **완전 ID로 남 태스크 규칙 인용 금지**(coverage 미리 셈 — T19 교훈).
