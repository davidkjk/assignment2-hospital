import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/nav_chatapp.dart';

void main() {
  test('[NAV-CHATAPP-01] AI 상담 탭 → 독립 상담방(/chat), FAB 아님', () {
    expect(navChatApp('tab'), '/chat');
  });
  test('[NAV-CHATAPP-02] 예약 2단계 어느과 모르겠어요 → DeptBotSheet(겹침)', () {
    expect(navChatApp('book_step2_unknown'), 'dept_bot_sheet');
  });
  test('[NAV-CHATAPP-03] BOOKCONF 신청 성공 → BOOKDONE(같은 흐름)', () {
    expect(navChatApp('bookconf_success'), 'ccard_bookdone');
  });
  test('[NAV-CHATAPP-04] 슬롯 충돌 → 최신 CCARD-TIME(처음부터 아님)', () {
    expect(navChatApp('slot_race'), 'ccard_time_latest');
  });
  test('[NAV-CHATAPP-05] 예약 상세 마감 후 취소·변경 → LATEFLOW-POP(목적지, 화면은 T13)', () {
    expect(navChatApp('appt_late_cancel'), '/appointments/:id/lateflow');
  });
  test('[NAV-CHATAPP-06] LATEFLOW-POP 상담 연결 → LATEFLOW-CHAT(즉시 기록, 화면은 T13)', () {
    expect(navChatApp('lateflow_link'), 'lateflow_chat');
  });
  test('[NAV-CHATAPP-07] LATEFLOW-APPT 상담 이어가기 → 같은 예약 맥락 상담방(새 티켓 없음)', () {
    expect(navChatApp('lateflow_continue'), 'lateflow_chat_resume');
  });
  test('[NAV-CHATAPP-08] 취소 반려 푸시 → 예약 상세(확인 전 안내 유지)', () {
    expect(navChatApp('cancel_reject_push'), '/appointments/:id');
  });
  test('[NAV-CHATAPP-09] 직원 답변 푸시 → 해당 상담방(콜드스타트 뒤로는 목록)', () {
    expect(navChatApp('staff_reply_push'), '/chat/room/:id');
  });
  test('[NAV-CHATAPP-10] 상단 이전 상담 아이콘 → CHAT-HISTORY 목록(뒤로는 상담방)', () {
    expect(navChatApp('history_icon'), '/chat');
  });
}
