import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../chat/chat_models.dart';
import '../booking_controller.dart'; // bookingProvider (예약 대상 맥락)
import '../catalog_repository.dart'; // Department
import 'dept_guide_repository.dart';

/// 예약 마법사 2단계 "어느 과인지 모르겠어요" 시트의 대화 상태(제한모드, 결정 E4).
/// 일반 상담방과 달리 세션·스레드가 없다 — 이력을 들고 서버에 매번 넘겨 진료과만 추천받는다.
class DeptBotState {
  final List<ChatFeedItem> items; // 말풍선(환자/봇). 첫 진입은 봇 인사 한 줄.
  final bool sending; // 봇 응답 대기(상담봇이 입력 중)
  final bool errored; // 마지막 전송 실패 — 자유 입력은 유지, [다시 시도] 노출
  final Department? suggested; // 추천 진료과(있으면 "○○과로 계속하기"). 한 번 잡히면 유지.
  const DeptBotState({
    this.items = const [],
    this.sending = false,
    this.errored = false,
    this.suggested,
  });

  DeptBotState copyWith({
    List<ChatFeedItem>? items,
    bool? sending,
    bool? errored,
    Department? suggested,
  }) =>
      DeptBotState(
        items: items ?? this.items,
        sending: sending ?? this.sending,
        errored: errored ?? this.errored,
        suggested: suggested ?? this.suggested, // null로 되돌리지 않는다(추천은 sticky)
      );
}

class DeptBotController extends StateNotifier<DeptBotState> {
  // ⚠️ 레포를 지연 해석한다(생성 시점에 apiClientProvider→Supabase.instance를 건드리지 않게).
  //    시트가 열리기만 하고 전송을 안 하면 네트워크·Supabase를 절대 만지지 않는다(위젯 테스트 안전).
  final DeptGuideRepositoryLike Function() _repoOf;
  final String relation;
  final List<String> _history = []; // 성공한 이전 환자 발화들(서버 무상태 계약)
  int _seq = 0;

  // 빈 대화로 시작한다 — 첫 인사는 시트가 '가운데 안내문'으로 그린다(봇 말풍선 아님).
  //   봇 말풍선엔 "AI 상담봇" 라벨이 붙는데, 시트 헤더 제목도 "AI 상담봇"이라 첫 화면에 둘이 겹치면
  //   BOOK-BOT-02(제목 유일)와 충돌한다 — 그래서 인사는 말풍선으로 만들지 않는다.
  DeptBotController(this._repoOf, {this.relation = '본인'}) : super(const DeptBotState());

  ChatFeedItem _mk(String sender, String content) => ChatFeedItem(
        id: '$sender-${_seq++}',
        messageType: 'text',
        senderType: sender,
        content: content,
        createdAt: DateTime.now(),
      );

  Future<void> send(String text) async {
    final t = text.trim();
    if (t.isEmpty || state.sending) return;
    // 낙관적 환자 말풍선 + "상담봇이 입력 중". 실패해도 원문 말풍선은 남긴다.
    state = state.copyWith(items: [...state.items, _mk('patient', t)], sending: true, errored: false);
    try {
      final res = await _repoOf().guide(message: t, history: List.of(_history), relation: relation);
      _history.add(t); // 성공한 발화만 이력에 누적
      state = state.copyWith(
        items: [...state.items, _mk('bot', res.reply)],
        sending: false,
        suggested: res.suggested, // null이면 copyWith가 기존 추천을 유지(sticky)
      );
    } catch (_) {
      // 막다른 길 금지: 시트를 닫지 않고 오류 표시 + 자유 입력 유지. 마지막 발화로 다시 시도 가능.
      state = state.copyWith(sending: false, errored: true);
    }
  }

  /// [다시 시도] — 마지막 환자 발화를 그대로 재전송(중복 말풍선 없이).
  Future<void> retryLast() async {
    final lastPatient = state.items.lastWhere(
      (i) => i.senderType == 'patient',
      orElse: () => _mk('patient', ''),
    );
    final content = lastPatient.content ?? '';
    if (content.isEmpty || state.sending) return;
    state = state.copyWith(sending: true, errored: false);
    try {
      final res = await _repoOf().guide(message: content, history: List.of(_history), relation: relation);
      _history.add(content);
      state = state.copyWith(
        items: [...state.items, _mk('bot', res.reply)],
        sending: false,
        suggested: res.suggested,
      );
    } catch (_) {
      state = state.copyWith(sending: false, errored: true);
    }
  }
}

/// 시트가 열릴 때마다 새 대화(autoDispose) — 닫았다 다시 열면 처음부터. 대상 관계는 bookingProvider에서.
final deptBotControllerProvider =
    StateNotifierProvider.autoDispose<DeptBotController, DeptBotState>((ref) {
  final relation = ref.read(bookingProvider).target?.relation ?? '본인';
  // 레포는 전송 시점에만 해석(지연) — 시트를 열기만 하면 Supabase/네트워크를 안 건드린다.
  return DeptBotController(() => ref.read(deptGuideRepositoryProvider), relation: relation);
});
