# 환자앱 실기기(아이폰 iOS 26.5) 손검수 체크리스트 — 2026-09-05

> **검수 조건**: 실제 아이폰(김준기의 iPhone)에 **릴리스 빌드** 설치, **클라우드 연결**(Railway API + Supabase). 데모계정 `010-7601-7654`/`demo1234`(김바이).
> **진행 규칙(사용자 2026-09-05)**: 먼저 **전 항목 기록 완료**(이 문서) → 그다음 **하나씩 체크하며 수정**, 절대 빠뜨리지 말 것. 각 항목 수정 시 근거로 **규칙문서 `docs/design/screen-behaviors.md` + 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md` + 데모 `demo/src/routes/patient/**`** 를 대조한다.
> **상태**: ☐ 미착수 · ▶ 수정중 · ✅ 완료 · 🔎 조사필요 · ⏸ 큰통합/보류 · ❓ 사용자확인대기
> **결정 완료(2026-09-05)**: #6=본인 QR 축소형 · #18=본인 버튼 "정보 안내" 라벨 · #2=아이폰만 아이콘 로고 키움(안드로이드 현행 유지).

---

## A. 사전문진 (가장 심각 — 막다른 길 포함)
- [x] **#31(=#1) ⭐막다른길** ✅코드(폰검증대기) — 본문 `Expanded+SingleChildScrollView`, 푸터 스크롤 밖 고정(키보드 위 항상 노출), 빈영역 탭 `FocusScope.unfocus`. `questionnaire_wizard.dart`.
- [x] **#28** ✅코드(폰검증대기) — `_next()` 시작에 `FocusScope.unfocus()` + 푸터 고정으로 첫 탭 반응. `questionnaire_wizard.dart`.
- [x] **#4** ✅코드(폰검증대기) — `from=confirm` 전달(`router.dart`), 저장 후 확인 복귀 + [이전] 숨김 + 버튼 "확인으로 돌아가기"(데모 returnToReview). `questionnaire_wizard.dart`.
- [~] **#29** 🔎 #28의 부작용으로 판단(버튼 무반응→뒤로 나갔다 재진입→자동저장 초안 때문에 ResumeScreen). ResumeScreen 자체는 정상(진입 전용). **#28 수정 후 폰에서 재현 확인 필요.**
- [ ] **#30** 🔎 장문칸 "ㅇㅇ" = 이전 강제종료 때 autosave 초안(코드버그 아님 추정). 폰 재확인.
- [x] **#25** ✅코드(폰검증대기) — 점선 박스 → 진료과 카드 계열 버튼형(연한 틴트+실선 테두리+화살표). 데모 점선(BOOK-DEPT-02)에서 갈림. `dept_step.dart`.
- [x] **#27** ✅코드(폰검증대기) — 요약 칩을 알약(StadiumBorder·컴팩트·13px)으로. 데모엔 없는 Flutter 전용. `booking_wizard.dart`.

## B. 네비게이션 / 탈출 (막다른 길·일관성)
- [x] **#5** ✅코드(폰검증대기) — 홈 히어로 QR 진입을 `go`→`push`로(예약상세와 동일). X=`canPop?pop:go('/home')`. `appointment_card.dart`. (원인=홈만 go라 스택 대체돼 X 먹통)
- [x] **#10** ✅코드(폰검증대기) — 새비번 화면의 안내 진입을 `go`→`push`로(로그인 진입과 일치, 뒤로가기 생김). `new_password_screen.dart`.
- [x] **#12** ✅코드(폰검증대기) — 알림 탭 목적지를 `go`→`push`로(뒤로가기가 알림함 복귀). `notification_gone_dialog.dart`.

## C. 홈 / 카드 레이아웃
- [x] **#32** ✅코드(폰검증대기) — 원인=데모 액션 버튼(size=sm, h-8)인데 Flutter 아웃라인 버튼이 탭영역(48dp)만큼 레이아웃이 부풀어 카드 하단이 데모보다 떠 보였다(데모 Card 패딩 자체는 충실 일치). `DetailButtonBar`와 같은 tapPad 보정 기법을 홈 카드 액션 영역에 적용(버튼 있으면 하단 여백·버튼 앞 간격에서 tapPad만큼 뺌) — 탭영역은 유지, 데모 간격과 맞춤. `appointment_card.dart`(`_hasActions`·`actionPad`). 골든 재생성.
- [x] **#6** ✅코드(폰검증대기) — 홈 히어로 QR 아이콘 하드코딩 → **본인 QR 축소형**(실제 QR, data=예약번호, 모듈색 전체화면과 통일). 누르면 전체화면(기존 onTap 유지). 데모는 QrCode 아이콘이지만 실기기 접수 편의 위해 의도적 갈림(#6 결정). `card_bodies_b.dart` `QrPreviewBody`. 규칙 `CARD-OK-01b` 뒤집힘(테스트·골든 갱신).
- [x] **#37** ✅코드(폰검증대기) — 홈 브랜드바 height 48 고정(다른 탭 PatientAppBar 48과 통일). `home_screen.dart`.
- [x] **#15** ✅코드(폰검증대기) — 예약 탭 하단 「+ 새 예약하기」는 이미 배경 패널·그림자 없음(FilledButton M3 elevation 0). 하단 여백 16→8로 줄여 탭바에 더 붙임. `appointment_list_cta.dart`.
- [x] **#16** ✅코드(폰검증대기) — 예약상세 하단 버튼바에서 **흰 패널+상단 테두리 제거**(배경 제거, #15와 같은 깨끗한 형식) + 위로 뜨는 옅은 그림자(탭바와 같은 0 -1px 10px rgba(0,0,0,.05))로만 본문과 가름 + 하단 여백 축소. base 버튼 tapPad 보정 유지. `detail_sections.dart` `DetailButtonBar`. 데모 border-t에서 의도적 갈림(사용자 요청).

## D. 알림함
- [x] **#13** ✅코드(폰검증대기) — 본문색 `muted`(#F2F2F2 배경토큰, 거의 안 보임)→`onSurface`(진함) + 전문 표시(maxLines 제한 제거). `notification_inbox.dart`.
- [x] **#14** ✅코드(#13에 포함) — 병원안내는 여는 화면 없는 순수 공지(클릭 안 되는 게 맞음). 전문·진한색으로 인라인 열람 가능. **사용자에게 "클릭 안 됨=정상" 안내함.**

## E. 로그인 / OTP
- [x] **#7** ✅코드(폰검증대기) — 전역 `hintStyle` `grayPending`(#454545)→`grayDone`(#A3AFB8 옅은 회색). 전 입력칸 플레이스홀더 공통. `theme.dart`.
- [x] **#8** ✅코드(폰검증대기) — maxLength:1 제거(자동채우기 6자리 분배)+autofillHints oneTimeCode+삭제 시 이전칸 이동. `otp_screen.dart`.
- [x] **#9** ✅코드(폰검증대기) — Navigator.pushNamed(go_router서 무반응)→context.push. `otp_screen.dart`.

## F. 가족
- [x] **#18** ✅코드(폰검증대기) — 본인 카드만 라벨 "정보 안내"·보기 아이콘(가족은 "정보 수정"). 진입 시 잠긴 신원 안내. `family_list_screen.dart`.
- [x] **#20** ✅코드(폰검증대기) — 취소 확인창 안쪽 정보박스 `width: double.infinity`(팝업 폭에 맞춤). `cancel_flow.dart`. (변경 확인창도 같은 패턴이면 폰에서 확인)
- [x] **#21** ✅코드(폰검증대기) — `BirthDateInputFormatter`(숫자만→YYYY-MM-DD 자동) 신규·수정 둘 다 + 키보드 number. `family_form_bits.dart`·`family_new_screen.dart`·`family_edit_screen.dart`.
- [x] **#22** ✅코드(⚠️백엔드 재배포 후 반영) — 서버 order-by `p.name`→`p.birth_date asc, p.name`(본인 맨위 유지, 나이 많은 순). `backend/app/services/patient_family_service.py:93`. 규칙 FAM-LIST-02 갱신 필요.

## G. 이력
- [x] **#23** ✅코드(폰검증대기) — QnrTable이 스텁(항상 "불러오는 중")이었음 → questionnaireProvider로 문항–답변 실제 로드·렌더(로딩/오류/빈상태 분기). `detail_sections.dart`.
- [x] **#24** ✅코드(폰검증대기) — done/문진 둘 다 없으면 빈 펼침 → 상태별 안내문("방문하지 않은 예약이에요…"). `history_row_detail.dart`.
- [x] **#34** ✅**완료(백엔드+프론트, 2026-09-07)** — 이력 칩 맨 앞에 **「전체」(전원 이력) 칩** + 서버 병합. 백엔드 `/my/history`가 `for_patient_id` 옵셔널이 돼(`d4d1b4d`), 생략하면 서버가 본인+활성가족을 **한 번에 병합**(소유자 이름 `owner_name`·키셋 페이지네이션). 프론트도 **서버 모드로 재배선**해 예전 클라이언트 병합(멤버당 limit 50·무한스크롤 없음·많으면 잘림)을 걷어냈다 — 이제 「전체」도 무한스크롤·상한 없음. 소유자 라벨은 「전체」 조회(`includeOwner`)에서만 담아 단일 뷰엔 안 뜬다(HIST-WHO-12). `history_repository.dart`(`kAllHistoryPatientId`·`list(null)`)·`history_screen.dart`(전체 칩·소유자 라벨). 테스트 `history_all_server_mode_test.dart` 4건. 폰검증대기(칩 순서·라벨 화면).

## H. 기타 표시/기능
- [x] **#17** ✅코드(폰검증대기) — 주소 `SelectableText`(길게눌러 iOS 복사) + 지도 열기는 "지도 앱으로 길 찾기" 링크로 분리. `detail_sections.dart`. (가온빌딩=가짜 데모 주소, 납품 시 실주소)
- [x] **#19** ✅코드(폰검증대기) — 문진 접기 헤더를 제목("사전문진 작성완료")/부제("수정 가능"·"조회만") 2단으로 → 줄바꿈 잘림 해소. `detail_sections.dart`.
- [ ] **#2** 앱 아이콘 로고 **아이폰만 키움**(안드로이드 원형마스크 잘림 우려로 현행 유지). [결정]
- [x] **#36** ✅코드(폰검증대기) — AI 상담 탭 헤더에 chat_bubble 아이콘(다른 탭과 통일). `chat_history_view.dart`.

## I. 조사 필요 (백엔드/클라우드) — 워커 조사 완료(보고서 `backend-qa-investigation-2026-09-05.md`)
- [x] **#33 ⭐** ✅원인확정+코드수정(`8d8afb5`, ⚠️배포대기) — Supabase 풀러가 `server_settings` timezone을 버려 세션 UTC → `current_date` UTC경계. fix=`pool.py` setup 콜백 `SET TIME ZONE 'Asia/Seoul'`(라이브 검증). **Railway 재배포 필요.**
- [x] **#11** ✅판정: 버그 아님 — 비번변경 코드 정상(GoTrue/Admin 반영). "옛 비번 통함"=**재시드가 비번을 demo1234로 되돌리는 착시**(`seed_demo_patient.sh:133`). 조치=비번변경 검증 후 재시드 금지(운영 주의).
- [x] **#35** ✅원인확정(가설과 다름) — LLM키 아님(라이브 정상 작동). 진짜 원인=**원격 `kb_chunks=0`**(문서27·청크0, 재임베딩 미실행). 조치=**사용자가 원격 재임베딩 배치 실행**(보고서에 스크립트). ⚠️사용자 액션.
- [~] **#3** ⚠️**리전 원인 단정 정정** — 아침 측정(~230ms)·옛 "region ams"로 암스테르담이라 봤으나 **사용자 대시보드엔 Singapore로 표시**. API region=null·코디 맥 측정은 edge=ord1(시카고)라 확정 불가. **이미 SG면 원인은 리전 아님 → 다음 세션 폰서 직접 재측정·재조사**(후보: 화면당 순차 API 多·인증 오버헤드·pool.py SET TZ 매 acquire 왕복).

> ⚠️ **I그룹 라이브 반영 대기(사용자 결정/실행)**: #33 Railway 재배포 · #35 원격 재임베딩 배치 · #3 Railway 리전 이전 · #11 재시드 타이밍 주의(코드 무변경).

## J. 큰 통합 / 보류
- [ ] **#26** ⏸ 진료과 추천 AI 시트가 **실제 상담봇 대화 불가**(스텁·대본형, 4단계 챗봇 엔진 앱 미연결). #35와 연동해 결정.

## K. 확인 대기
- [ ] **전화번호 변경(음성 불명확)** ❓ "전화번호 바꾸기 하면 바꾸기가 완료된다"의 의도 재확인.

---

## 즉답 사실 기록
- **#17 가온빌딩 = 가짜 데모 주소**(`seed_demo.sql:479`). 실재 아님.
- **#18 본인 신원 수정 불가 = 설계**(`canEditIdentity`).
- **#35 앱 AI상담 = 스텁 아님**(chat_repository가 `/chat/*` 실호출). 답 없음은 LLM키 문제 유력.

## L. 재검수 중 추가 findings (2026-09-05, 수정앱 재설치 후)
- [x] **#38** ✅코드(⚠️백엔드 재배포 후 반영) — 알림설정에 "광고성 정보 수신 동의" 토글 신설(`ads_consent_repository.dart`+`notification_settings_screen.dart`). 백엔드 `/patient/me`에 `ads_consent` 추가(`patient_profile_service.py`), PATCH `/patient/me/ads-consent` 재사용. 가입 동의(consent_screen)와 별개로 사후 켜기 가능.
- [x] **#39** ✅코드(폰검증대기) — 설정 헤더에 톱니 아이콘(`PatientAppBar icon: AppIcons.settings`). 2차화면 관례에서 예외(사용자 요청). `settings_home_screen.dart`.
- [x] **#40 ⭐** ✅코드(폰검증대기) — 회원가입 진입 불가였음: 랜딩 화면(로그인+회원가입 버튼, AUTH-LAND-01)이 완성돼 있으나 라우터 미등록·앱이 /login 직행이라 가입 입구가 가려짐 → /landing 라우트 등록+signedOut 리다이렉트를 /landing로+초기위치 /landing. `router.dart`. (로그인 화면에 가입링크 없는 건 설계상 정상)
- [x] **#34** ✅완료(백엔드+프론트, 2026-09-07) — 서버 「전체」 병합 모드로 재배선, 클라 병합·무한스크롤 제한 제거(C절 #34 참고).
- [~] **#3(리전)** ⚠️사용자 대시보드=Singapore로 확인됨(코디 CLI/측정으론 확정 불가·정정). 이미 SG면 느림 원인 재조사 필요(위 #3).
- [~] **#41** 알림 토글 저장/페이지 전환 느림(release 빌드 문제 아님, 매 토글=서버 PATCH 왕복). #3과 동일 원인 → **#3 재조사와 함께**(리전이 이미 SG일 수 있어 다른 원인 가능).

## M. 세션25 findings (2026-09-05, 커밋 `b91d3c5`)
- [x] **#42 랜딩 브랜딩** ✅코드(폰검증대기) — 랜딩 병원명 `○○의원`→`가온병원`(직원웹 `shell/brand.ts`·데모 `Login.tsx`와 동일, `kHospitalName` 재사용). 로고·Do Hyeon 워드마크 서체는 이미 일치했고 이름만 어긋나 있었음. `landing_screen.dart`.
- [x] **#43 로그인 막다른 길** ✅코드(폰검증대기) — 랜딩→로그인/회원가입/비번찾기 진입이 `go`(스택 대체)라 로그인에서 회원가입으로 **돌아갈 뒤로 버튼이 없었다**(사용자 지적). `push`로 바꿔 로그인 헤더에 뒤로 버튼 생김→랜딩(가입 입구) 복귀 가능. 로그인 화면에 별도 가입 버튼은 두지 않음(설계상 정상, #40). `landing_screen.dart`.
- [x] **#44 로그인 헤더 아이콘** ✅코드(폰검증대기) — `PatientAppBar(icon: AppIcons.lock)`(인증 관문 화면). 헤더 아이콘 관례=최상위/섹션 루트 화면만(나의예약·가족·이력·AI상담·설정+로그인). **드릴다운(2차) 화면 전체에 넣는 건 미채택**(관례 깨짐·번잡). `login_screen.dart`.
- [x] **#45 ⭐ 앱 재시작 로그인 유지** ✅코드(⚠️재빌드/재설치 후 반영) — "앱 끄면 로그인 풀림"의 진짜 원인: 세션은 원래 저장·자동복원(supabase_flutter)되나 ①초기 위치 `/landing` 고정 ②`signedIn`을 홈으로 보내는 규칙 부재 ③`refreshListenable` 부재로 세션 복원 이벤트에 redirect 재평가 안 됨. → `computeRedirect`에 `signedIn+프로필완료+/landing→/home` + `onAuthStateChange`를 refreshListenable로 배선. `router.dart`. **현재 폰에 깔린 빌드엔 미포함 — 재빌드해야 검증 가능.**
  - 📌 **테스트플라이트 관계**: TestFlight=release 빌드(현 `flutter run --release`와 동일 최적화)라 **속도는 빨라지지 않는다**(느림 원인=백엔드 리전·화면당 순차 API, #3/#41). 로그인 유지도 TestFlight가 고치는 게 아니라 이 코드 수정이 고침 → 이 수정 포함한 새 빌드를 올려야 반영.
