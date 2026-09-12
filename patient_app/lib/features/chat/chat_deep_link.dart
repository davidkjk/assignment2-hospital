import '../notifications/notification_view.dart';

/// 직원 답변 푸시(support_answered)의 도착지(CHAT-HISTORY-DEEP-01·02). thread가 있으면 그 방,
/// 없으면 이전 상담 목록(/chat) — 콜드스타트 뒤로가기 도착지이기도 하다(DEEP-02).
/// 대상 오류(방 없음·권한 없음)는 방을 열 때 확인해 다른 방을 열지 않는다(DEEP-03, 화면에서 처리).
String resolveChatDeepLink(NotificationView n) =>
    n.chatThreadId != null ? '/chat/room/${n.chatThreadId}' : '/chat';
