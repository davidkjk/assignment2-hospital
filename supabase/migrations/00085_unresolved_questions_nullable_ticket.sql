-- ⭐ WEBCHAT-NOANS(no_answer 칩) — 미해결 질문을 티켓 없이도 기록.
--
-- 배경: 봇이 답을 못 찾으면(RAG no_answer) 예전엔 자동으로 직원 인계 티켓을 만들고 그 티켓에 매달아
--   미해결 질문을 기록했다(unresolved_questions.ticket_id NOT NULL). 이 자동 인계를 폐기하고(결정 2026-09-04,
--   brainstorming) 봇 안내 말풍선 + FAQ 칩 + [직원에게 연결] 콜백 칩으로 바꾸면서, 인계는 사용자가 칩을 눌러야
--   시작한다. 그런데 「직원 인계는 한 번 더 용기가 필요」 — 인계할 때만 기록하면 조용히 포기한 다수(가장 큰
--   KB 구멍)를 놓친다. 그래서 결정 B: 모든 no_answer를 기록한다(티켓 없이도, 질문+임베딩).
--
-- 수정: ticket_id의 NOT NULL을 푼다(nullable). FK(support_tickets)는 그대로 — 인계로 티켓이 생기면 링크,
--   조용히 포기했으면 null. 임베딩이 있어 관리자단 클러스터링은 그대로 동작(잡음 아님). 되돌림 가능·데이터 무변경.
-- ⚠️ 챗봇 밴드(00053–00059) 소진 + 00060–00069 배포 밴드라 오버플로 규율대로 꼬리 번호 00085(대장 정본).
--    ⚠️ 원격 미적용 — 로컬만 apply, 배포 시 db push(MIGRATION-LEDGER 갱신은 main에서).

alter table unresolved_questions alter column ticket_id drop not null;
