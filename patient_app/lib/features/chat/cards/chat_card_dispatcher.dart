import 'package:flutter/material.dart';
import '../chat_models.dart';
import 'c_time_select_card.dart';
import 'c_book_confirm_card.dart';
import 'c_book_done_card.dart';
import 'c_qnr_card.dart';

/// 피드의 카드 아이템을 card_type으로 갈라 카드 위젯을 만든다(CCARD-*-SHOW). T10 cardBuilder 슬롯 값.
/// 제한모드(BOOKBOT-SHEET)면 행동형 카드(time_select·booking_*)를 렌더하지 않는다(CCARD-*-MODE·결정 E4).
/// T13이 cancel_confirm·cancel_done·cancel_reject 분기를 추가한다.
Widget buildChatCard(BuildContext ctx, ChatFeedItem item, {bool restricted = false}) {
  final type = item.cardType;
  const actionCards = {'time_select', 'booking_confirm', 'booking_done'};
  if (restricted && actionCards.contains(type)) return const SizedBox.shrink();
  final p = item.payload ?? const {};
  return switch (type) {
    'time_select' => CTimeSelectCard(payload: p, onPick: (_) {}),
    'booking_confirm' => CBookConfirmCard(payload: p, onSubmit: () {}),
    'booking_done' => CBookDoneCard(payload: p),
    'questionnaire' => CQnrCard(payload: p),
    _ => const SizedBox.shrink(), // cancel_* 는 T13, quick_replies 는 입력창 슬롯
  };
}
