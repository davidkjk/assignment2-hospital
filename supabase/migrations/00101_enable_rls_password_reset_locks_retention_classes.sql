-- [SEC-RLS-01] public 스키마에 RLS가 빠진 두 표에 자물쇠를 켠다 (Supabase Advisor: rls_disabled_in_public, 2026-09-13).
--
-- 배경: 이 프로젝트의 표 50개 중 48개는 이미 RLS(행 단위 보안)가 켜져 있으나,
--   아래 둘만 CREATE TABLE 당시 `enable row level security`를 빠뜨렸다. public 스키마 표는
--   PostgREST를 통해 anon/authenticated 열쇠로 노출되므로, RLS가 없으면 프로젝트 URL + anon key만으로
--   누구나 읽기·수정·삭제가 가능하다(앱에 박혀 사실상 공개된 열쇠).
--
--   · password_reset_locks (00024) — 비밀번호 재설정 시도 전화번호 + 잠금 상태. 노출 시 전화번호 열거,
--     임의 번호 잠금 해제(무차별 대입 재개)·강제 잠금(DoS) 가능. 백엔드 password_reset_service.py 전용.
--   · retention_classes  (00056) — 데이터 보존·파기 정책 설정값(개인정보 아님). 백엔드/참조 전용.
--
-- 정책은 두지 않는다: RLS를 켜되 정책이 없으면 anon/authenticated는 전부 거부(deny-all)된다.
--   백엔드는 DATABASE_URL의 RLS 우회 역할(BYPASSRLS/연결 소유자, 운영 계약 C6-#9·pool.py)로 접속하므로
--   RLS의 영향을 받지 않아 정상 동작한다 — 나머지 48개 표와 완전히 동일한 패턴.
--   (force row level security는 쓰지 않는다 — 그러면 소유자/BYPASSRLS까지 강제돼 백엔드가 막힌다.)
--
-- 공격 경로(익명 열쇠)만 차단, 정상 경로(백엔드)는 무손. 되돌림 가능·데이터 무변경.
alter table password_reset_locks enable row level security;
alter table retention_classes    enable row level security;
