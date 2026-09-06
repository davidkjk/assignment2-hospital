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
- [ ] **#32** 🔎 홈 히어로 카드 "사전문진 작성하기" 아래 **하단 여백 과다** → 축소. (액션 버튼 영역과 겹쳐 보여 폰에서 직접 확인 후 수정 — 재빌드 후 재검토)
- [ ] **#6** 홈 히어로 QR 그림 하드코딩 → **본인 QR 축소형으로 교체**(누르면 전체화면). [결정]
- [x] **#37** ✅코드(폰검증대기) — 홈 브랜드바 height 48 고정(다른 탭 PatientAppBar 48과 통일). `home_screen.dart`.
- [ ] **#15** 예약 탭 하단 「새 예약하기」: **배경 제거 + 그림자 옅게 + 탭바에 더 가까이**.
- [ ] **#16** 예약상세 하단 2버튼(상담채팅 연결·병원 전화): **배경 제거 + #15와 동일 형식 + 그림자 + 탭바 가까이**.

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
- [ ] **#34** 이력 가족 필터칩에 **"전체"(전원 이력) 칩** 추가.

## H. 기타 표시/기능
- [x] **#17** ✅코드(폰검증대기) — 주소 `SelectableText`(길게눌러 iOS 복사) + 지도 열기는 "지도 앱으로 길 찾기" 링크로 분리. `detail_sections.dart`. (가온빌딩=가짜 데모 주소, 납품 시 실주소)
- [x] **#19** ✅코드(폰검증대기) — 문진 접기 헤더를 제목("사전문진 작성완료")/부제("수정 가능"·"조회만") 2단으로 → 줄바꿈 잘림 해소. `detail_sections.dart`.
- [ ] **#2** 앱 아이콘 로고 **아이폰만 키움**(안드로이드 원형마스크 잘림 우려로 현행 유지). [결정]
- [x] **#36** ✅코드(폰검증대기) — AI 상담 탭 헤더에 chat_bubble 아이콘(다른 탭과 통일). `chat_history_view.dart`.

## I. 조사 필요 (백엔드/클라우드) — 워커 조사 완료(보고서 `backend-qa-investigation-2026-09-05.md`)
- [x] **#33 ⭐** ✅원인확정+코드수정(`8d8afb5`, ⚠️배포대기) — Supabase 풀러가 `server_settings` timezone을 버려 세션 UTC → `current_date` UTC경계. fix=`pool.py` setup 콜백 `SET TIME ZONE 'Asia/Seoul'`(라이브 검증). **Railway 재배포 필요.**
- [x] **#11** ✅판정: 버그 아님 — 비번변경 코드 정상(GoTrue/Admin 반영). "옛 비번 통함"=**재시드가 비번을 demo1234로 되돌리는 착시**(`seed_demo_patient.sh:133`). 조치=비번변경 검증 후 재시드 금지(운영 주의).
- [x] **#35** ✅원인확정(가설과 다름) — LLM키 아님(라이브 정상 작동). 진짜 원인=**원격 `kb_chunks=0`**(문서27·청크0, 재임베딩 미실행). 조치=**사용자가 원격 재임베딩 배치 실행**(보고서에 스크립트). ⚠️사용자 액션.
- [x] **#3** ✅원인확정 — Railway 컴퓨트(암스테르담)↔DB(서울) 대륙간 왕복 ~230ms/쿼리. 조치=**Railway 리전 아시아(싱가포르) 이전**(인프라, 사용자/코디). ⚠️사용자 액션.

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
- [ ] **#34** 이력 "전체"(전원 이력) 칩 — 멤버별 조회 병합 필요, 다음 라운드.
- [ ] **#3(리전)** ⚠️CLI 차단(프로덕션 변경 auto-mode 거부) → **사용자가 Railway 대시보드 api 서비스 Region=Singapore로 변경+재배포**(진행 중). cron은 선택(앱 속도 무관).
