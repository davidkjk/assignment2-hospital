-- 챗봇 인계 확인 프롬프트 — 원래 사유 보존(2026-09-09, SUPPORT-HANDOFF-CONFIRM-ALL).
-- 번호 00099 = 다음 빈(꼬리 번호, 챗봇 밴드 소진). ⚠️ 처음 00098로 뒀다가 충돌 발견 후 00099로 정정:
--   다른 브랜치의 `00098_chat_messages_route_taken_needs_clarification`(커밋 ba1a7fb)이 이미 remote에
--   올라가 있어(migration list remote=00098 확인) 같은 번호면 db push가 이걸 건너뛴다. 대장의 "다음 빈=00098"은
--   타 브랜치 00098을 몰라 낡았던 것(브랜치별 대장 분기). remote 히스토리 실측으로 00099가 진짜 빈 번호.
--
-- 배경: 안전 감시(check_escalation — 의료판단·불만·불일치·반복·도움안됨)가 이제 즉시 자동 인계 대신
--   "직원에게 연결해 드릴까요?" 확인 프롬프트를 낸다(사용자 요청 "항상 물어보게"). 확인 프롬프트를 낸 턴과
--   환자가 [직원에게 연결하기] 칩을 누르는 턴이 서로 다른 요청이라, 원래 사유를 세션에 잠시 저장했다가
--   칩 클릭 턴에 읽어 티켓 사유로 쓴다(관리자 '직원 연결 현황' 통계가 의료판단/불만/불일치를 구분·요구사항 L67).
--   active_flow(00057)와 동일한 「세션에 다음 턴 상태를 못박는」 패턴.
--
-- ⚠️ 원격 미적용 — 로컬 테스트 DB에만 apply. 배포 시 supabase db push 별도 필요.
alter table ai_chat_sessions
  add column if not exists pending_handoff_reason text
    check (pending_handoff_reason in
      ('medical_judgment', 'data_mismatch', 'complaint', 'unhelpful', 'repeated', 'no_answer', 'staff_request'));
