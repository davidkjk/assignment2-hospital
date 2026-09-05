# 코드 리뷰 보고서 — 2026-09-04

## 결론

**Request changes**

`HANDOFF-chatbot.md`의 현재 Task ⑦ 작업은 리뷰 대상에서 제외했다.

- 제외 커밋: `a441752`, `5f8b39d`
- 제외 기능: `/chat/attribute`, `/chat/cards/revalidate`, `/chat/cards/execute` 및 직접 배선·테스트
- 검토 범위: `origin/merge/design-integration` 이후의 나머지 변경과 현재 작업트리

## 발견 사항

### 1. Critical — 실제 전화번호와 고정 비밀번호 노출

`supabase/seed_demo_patient.sh:38-39`가 실제 개인 전화번호와 고정 공유 비밀번호를 기본값으로 사용한다. 같은 파일의 75-83행은 기존 계정도 해당 비밀번호로 재설정하고 전화 인증 완료 상태로 만든다. `supabase/demo_accounts.md:47-51`에는 로그인 방법까지 기록돼 있다.

저장소 접근자는 인증 완료 계정으로 로그인할 수 있으며, 해당 전화번호 소유자가 같은 Supabase 프로젝트에서 정상 가입하려 할 때 계정 충돌 또는 탈취 문제가 생길 수 있다. 전화번호는 커밋 메시지에도 남아 있다.

권고:

- 실제 번호를 코드·문서 기본값에서 제거하고 배포 환경변수로만 주입한다.
- 공유 고정 비밀번호 대신 환경별 무작위 비밀 또는 OTP/수동 프로비저닝을 사용한다.
- 원격 계정의 현재 비밀번호를 즉시 회전한다.
- 필요하면 Git 이력에 남은 개인정보도 별도로 정리한다.

### 2. Required — 데모 시드가 대상 DB 전체의 알림 설정을 변경

`supabase/seed_demo_patient.sql:308`은 조건 없이 모든 `hospital_settings` 행의 SMS를 끈다. 315-323행은 대상 DB의 모든 환자와 13개 알림 유형을 조합해 `notification_preferences.enabled=false`로 덮어쓴다.

`seed_demo_patient.sh`는 임의의 원격 DB URL을 입력받으므로, 운영 또는 공유 DB를 잘못 지정하면 실제 환자의 알림을 전부 중단시킬 수 있다.

권고:

- 고정된 데모 환자 UUID와 데모 병원 행으로 변경 범위를 제한한다.
- 허용된 Supabase project ref를 검증한다.
- 전역 변경에는 별도의 명시적 플래그와 확인 절차를 둔다.
- 전용 데모 프로젝트가 아니라면 전역 알림 비활성화를 제거한다.

### 3. Required — 검증되지 않은 의료 지침이 자동 승인됨

신규 `supabase/seed_kb_bulk.sql:33-45,117`에는 금식, 약물 복용·중단 등 환자 상태와 검사 프로토콜에 따라 달라질 수 있는 지침이 포함돼 있다. 이 자료들은 `is_restricted=false`이며, 134-136행에서 모두 `approved` 상태로 직접 등록된다.

권고:

- 임상 검수 전에는 `draft` 또는 제한 자료로 저장한다.
- 각 문서에 근거 출처, 적용 병원, 프로토콜 버전과 검수자를 기록한다.
- 약물 중단·복용 안내는 일괄 문장 대신 담당 의료진 확인으로 연결한다.

### 4. Required — Android 최소 터치 영역보다 작은 AppBar 버튼

`patient_app/lib/widgets/patient_app_bar.dart:40-48`은 뒤로가기 또는 닫기 버튼이 있을 때 `leadingWidth`를 44로 고정한다. iOS 기준에는 맞을 수 있지만 Android 권장 최소 터치 영역 48dp보다 작다.

권고:

- 버튼 영역은 최소 48dp로 유지한다.
- 제목과 아이콘의 시각적 간격은 `titleSpacing`, 내부 패딩 또는 별도 title layout으로 조정한다.
- 공통 위젯에 실제 터치 영역 크기를 검증하는 위젯 테스트를 추가한다.

### 5. Required — 공통 AppBar 변경 후 골든 테스트 미갱신

`patient_app/test/features/settings/settings_golden_test.dart`의 5개 화면이 모두 실패한다.

- settings home: 5.40%
- notifications: 3.18%
- hospital: 3.52%
- password: 2.53%
- withdraw: 2.77%

권고:

- 생성된 diff 이미지를 시각 검수한다.
- 의도한 변경이면 전체 영향 화면의 골든 기준을 갱신한다.
- 의도하지 않은 차이는 `PatientAppBar` 또는 화면별 패딩을 수정한다.

### 6. Required — 릴리즈 빌드 의존 이미지가 Git에 없음

`patient_app/pubspec.yaml:42`가 `assets/icon/app_icon_foreground.png`를 참조하고 `patient_app/scripts/build_release.sh:39-42`가 아이콘 생성기를 실행한다. 그러나 이 파일은 현재 untracked 상태다.

깨끗한 체크아웃에서는 adaptive icon 생성 단계가 실패할 수 있으므로 해당 파일을 의도적으로 커밋하거나 참조를 제거해야 한다.

### 7. Required — 환자 이름 변경이 취소 이력에 반영되지 않음

`supabase/seed_demo_patient.sql:111`의 본인 이름은 새 이름으로 변경됐지만 184행의 `cancelled_by_name`은 이전 이름 `김가온`으로 남아 있다. 예약 취소 이력에 잘못된 행위자 이름이 표시된다.

## 검증 결과

- `flutter analyze lib test`: 통과
- `flutter test --concurrency=1 test/features/settings/settings_home_test.dart`: 5개 통과
- `flutter test --concurrency=1 test/features/settings/settings_golden_test.dart`: 5개 실패
- 프런트엔드 `npm run build`: 통과
- `python3 -m compileall -q backend/app`: 통과
- `git diff --check`: 통과
- 백엔드 pytest: `HANDOFF-chatbot.md`에 기록된 공용 DB 초기화 위험 때문에 실행하지 않음

전체 테스트를 병렬로 실행했을 때 자원 경합으로 여러 타임아웃이 발생해 해당 결과는 결함 판단에 사용하지 않았다. 위 결과는 변경 지점을 직렬로 다시 검증한 결과다.

## 권장 후속 작업

1. 실제 전화번호·공유 비밀번호 제거 및 원격 계정 자격 증명 회전
2. 데모 시드의 전역 DB 변경을 데모 데이터 범위로 제한
3. 의료 KB를 draft/restricted로 전환하고 임상 검수 절차 추가
4. `PatientAppBar` 터치 영역 수정
5. 골든 이미지 검수·갱신
6. adaptive icon foreground 파일 추적 여부 확정
7. 취소 이력의 이전 환자 이름 수정

후속 수정은 진행 중인 Task ⑦과 섞지 않고 별도 세션에서 수행하는 것을 권장한다. 첫 세션은 1·2·7번의 시드 보안·데이터 정합성만 다루고, 두 번째 세션에서 4·5·6번의 환자 앱 UI·릴리즈 자산을 처리하는 편이 충돌과 검증 범위를 줄일 수 있다. 의료 KB는 임상 정책 결정이 필요하므로 별도 작업으로 분리한다.
