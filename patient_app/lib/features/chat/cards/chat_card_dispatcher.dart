import 'package:flutter/material.dart';
import '../chat_models.dart';
import 'c_time_select_card.dart';
import 'c_book_confirm_card.dart';
import 'c_book_done_card.dart';
import 'c_cancel_confirm_card.dart';
import 'c_cancel_done_card.dart';
import 'c_cancel_reject_card.dart';
import 'c_qnr_card.dart';

/// 피드의 카드 아이템을 card_type으로 갈라 카드 위젯을 만든다(CCARD-*-SHOW). T10 cardBuilder 슬롯 값.
/// 제한모드(BOOKBOT-SHEET)면 행동형 카드(time_select·booking_*·cancel_*)를 렌더하지 않는다
/// (CCARD-*-MODE·결정 E4 — 예약 중 상담은 취소 카드도 금지).
Widget buildChatCard(BuildContext ctx, ChatFeedItem item, {bool restricted = false}) {
  final type = item.cardType;
  const actionCards = {
    'time_select', 'booking_confirm', 'booking_done',
    'cancel_confirm', 'cancel_done', 'cancel_reject',
  };
  if (restricted && actionCards.contains(type)) return const SizedBox.shrink();
  final p = item.payload ?? const {};
  return switch (type) {
    'time_select' => CTimeSelectCard(payload: p, onPick: (_) {}),
    'booking_confirm' => CBookConfirmCard(payload: p, onSubmit: () {}),
    'booking_done' => CBookDoneCard(payload: p),
    'questionnaire' => CQnrCard(payload: p),
    'cancel_confirm' => CCancelConfirmCard(payload: p, onConfirm: () {}, onNo: () {}),
    'cancel_done' => CCancelDoneCard(payload: p),
    'cancel_reject' => CCancelRejectCard(payload: p, onAck: () {}, onReinquire: () {}),
    _ => const SizedBox.shrink(), // quick_replies 는 입력창 슬롯(카드 아님)
  };
}
