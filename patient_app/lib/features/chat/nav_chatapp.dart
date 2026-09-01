/// 상담 화면 사이 이동 목적지(NAV-CHATAPP-*). 마감후(05·06·07)·취소반려(08)의 도착 「화면 본체」는
/// Task 13이 실체화하고, 여기서는 목적지 이름/라우트만 확정한다(라우트 등록은 core/router.dart).
String navChatApp(String from) => switch (from) {
      'tab' => '/chat', // 01 AI 상담 탭 → 독립 상담방(FAB 아님)
      'book_step2_unknown' => 'dept_bot_sheet', // 02 겹침 시트(T20)
      'bookconf_success' => 'ccard_bookdone', // 03 같은 흐름 완료 카드
      'slot_race' => 'ccard_time_latest', // 04 최신 후보(처음부터 아님)
      'appt_late_cancel' => '/appointments/:id/lateflow', // 05 (T13 화면)
      'lateflow_link' => 'lateflow_chat', // 06 즉시 기록(T13)
      'lateflow_continue' => 'lateflow_chat_resume', // 07 같은 예약 맥락(새 티켓 없음)
      'cancel_reject_push' => '/appointments/:id', // 08 확인 전 안내(T13)
      'staff_reply_push' => '/chat/room/:id', // 09 해당 상담방(T10 딥링크)
      'history_icon' => '/chat', // 10 이전 상담 목록
      _ => '/chat',
    };
