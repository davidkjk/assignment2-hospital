# 보안 감사 아키텍처 맵 — 2026-09-04

## 범위

- 대상: 저장소 전체의 실행 코드, Supabase 마이그레이션/RLS, 배포 설정, 클라이언트 인증 흐름
- 명시적 제외: `a441752`, `5f8b39d`, `/chat/attribute`, `/chat/cards/revalidate`, `/chat/cards/execute`와 그 직접 배선·테스트(Task ⑦)
- 중점: 인증, 역할 권한, 객체 소유권, RLS/SECURITY DEFINER, 비밀정보, 외부 입력에서 민감한 상태 변경까지의 공격 경로
- 기존 보안 감사 실행은 발견되지 않았다. 단일 실행의 탐색 편향을 줄이려면 수정 후 별도 재감사를 권장한다.

## 제품과 신뢰 모델

이 저장소는 병원 외래 운영 시스템이다. 직원용 React/Vite 웹, 환자용 Flutter 앱, 익명/인증 웹챗, FastAPI 백엔드, Supabase Auth/Postgres/Storage로 구성된다. Railway의 공개 백엔드와 Vercel 클라이언트가 Supabase와 외부 SMS/푸시 제공자를 사용한다.

주요 주체는 `anon`, 인증 환자, `doctor`, `receptionist`, `admin`, 백엔드 서비스 역할, SMS/푸시 제공자다. 보호 대상은 환자 식별정보, 가족 연결, 예약, 문진 및 진료기록, 연락처·기기 토큰, 동의 이력, 직원 계정과 감사 로그다.

## 신뢰 경계

1. 브라우저/앱 → FastAPI: Bearer JWT를 검증하고 직원/환자 문맥으로 투영한다.
2. 브라우저/앱 → Supabase Data API: `authenticated` 역할과 RLS가 최종 권한 경계다.
3. FastAPI → Postgres: `acquire_as()`는 호출자 claim과 `authenticated` 역할을 설정하지만, `get_pool()` 원시 연결은 서비스 역할로 RLS를 우회한다.
4. FastAPI → Supabase Admin: 환자 계정 연결·삭제와 비밀번호 작업에 서비스 역할 키를 사용한다.
5. SMS/푸시 제공자 → FastAPI: 배달 상태 콜백이 공개 인터넷에서 들어온다.
6. 운영자/CI → 시드·백업 스크립트: 원격 DB와 서비스 역할 키를 다룬다.

## 주요 입력 표면

- 직원 경로: `/staff`, `/appointments`, `/patients`, `/medical-records`, `/messages`, 관리 설정 및 감사 로그
- 환자 경로: `/patient`, `/family`, `/bookings`, `/my`, `/device-tokens`, `/notifications`, `/questionnaires`
- 공개 경로: `/health`, 직원 비밀번호 재설정 시작 경로, 제공자 상태 콜백, 익명 상담 경로
- DB 직접 경로: `authenticated`에 부여된 테이블 권한과 `SECURITY DEFINER` RPC
- 파일/콘텐츠: 의료 지식베이스 SQL, 의사 사진 Storage, 환경설정과 배포 스크립트

## 인증·권한·RLS 구조

- JWT: `backend/app/core/security.py`가 HS256 공유 비밀 또는 ES256 JWKS로 서명과 `aud=authenticated`를 확인한다.
- 직원 권한: FastAPI `require_role()`과 DB의 `private.current_staff_role()`/`private.is_active_staff()`가 역할을 제한한다.
- 환자 소유권: `private.current_patient_id()`와 `patient_owns()`가 본인 및 활성 가족 연결을 해석한다.
- RLS: 민감한 public 테이블 대부분에 활성화되어 있다. `password_reset_locks`와 `retention_classes`는 명시적 클라이언트 권한을 주지 않은 서버 내부 표다.
- 특권 경로: 서비스 역할 연결과 `SECURITY DEFINER` 함수는 RLS를 우회하므로 각 함수 내부의 호출자/소유권 검사가 필수다.

## 기존 리뷰와의 관계

다음 항목은 이미 `CODE_REVIEW_2026-09-04.md`에 충분히 기록되어 있어 이번 감사에서 재서술하지 않는다.

- [기존 리뷰 #1 — 실제 전화번호와 고정 비밀번호](../CODE_REVIEW_2026-09-04.md#1-critical--실제-전화번호와-고정-비밀번호-노출)
- [기존 리뷰 #2 — 데모 시드의 전역 알림 변경](../CODE_REVIEW_2026-09-04.md#2-required--데모-시드가-대상-db-전체의-알림-설정을-변경)
- [기존 리뷰 #3 — 검증되지 않은 의료 지침 자동 승인](../CODE_REVIEW_2026-09-04.md#3-required--검증되지-않은-의료-지침이-자동-승인됨)

## 비교 기준

MyChart/Epic, athenaOne, OpenEMR과 같은 환자 포털·의료 운영 시스템의 일반적인 경계를 기준으로 삼았다. 핵심 기준은 환자/가족의 명시적 소유권, 역할 분리, 진료·문진 기록의 무결성, 철회 가능한 동의, 감사 가능성, 제공자 웹훅 서명, 서버 자격증명의 클라이언트 격리다.

## 탐색 메모

- SQL은 매개변수 바인딩을 일관되게 사용하며 확인한 실행 경로에서 SQL injection을 찾지 못했다.
- 최근 50개 커밋의 Gitleaks 검사에서는 신규 비밀정보가 검출되지 않았다. 작업 트리의 실제 `.env` 파일은 ignore 규칙 적용과 Git 미추적 상태를 확인했다.
- 로컬 Supabase 동적 연결은 감사 중 안정적으로 응답하지 않아 RLS는 마이그레이션과 기존 테스트를 교차검증했다. 파서 동작에 의존하지 않는 로직 결함만 확정했다.
