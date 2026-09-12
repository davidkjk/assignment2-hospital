-- [보안 F-01] 직원 철회 가족접근을 환자가 되살리는 경로 봉인 (1/2 — RPC).
-- 정본: docs/security-audit-2026-09-04/ F-01(High, confirmed).
--
-- relink_family_link_self(00018:30-42)는 patient_owns만 검사하고 링크를 재활성하며 감사 트리오
-- (unlinked_at/by/reason)를 통째로 지웠다. 그래서 직원이 철회한 연결을 환자가 되살리고 철회
-- 증적까지 삭제할 수 있었다(High). 이 RPC는 앱 어디서도 호출하지 않는다(정상 재연결은
-- add_family_member 재활성 또는 OTP 창구). → authenticated 실행 권한을 회수해 봉인한다.
--
-- 나머지(add_family_member 재활성 로직: 자가해제만 허용·직원철회 거절·감사 append-only)는
-- backend/app/services/patient_family_service.py에서 처리한다(2/2 — 코드).
-- 권한 회수만·데이터 무변경·되돌림 가능(다시 grant 시 원복). ⚠️ 원격 미적용 — 배포 시 db push.

revoke execute on function relink_family_link_self(uuid) from authenticated;
revoke execute on function relink_family_link_self(uuid) from public;
