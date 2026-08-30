import 'package:flutter/material.dart';
import '../../core/tokens.dart';
import '../../widgets/app_icons.dart';

/// CARD-QNR — 홈 카드 아래 사전문진 한 줄. 카드 위 구분선(border-t) + 아이콘 + 문구 + `›`.
/// 색·아이콘이 「지금 할 일이 있나」를 말한다: 미작성/작성중=주의(딥틸), 완료=회색, 잠김·읽기전용=회색.
enum QnrRowState {
  todo, // CARD-QNR-01 미작성 — 작성하기
  inProgress, // 작성 중 (a/t) — 이어서 쓰기 (progress는 T24 소급)
  done, // CARD-QNR-02 작성완료 — 수정하기(회색, 급한 것 희석 방지)
  locked, // CARD-QNR-03 진료중 이후 — 자물쇠·내용 보기(숨기지 않는다)
  readonly, // CARD-QNR-04 진료완료·이력 — 눈·내가 작성한 사전문진 보기
}

class QuestionnaireRow extends StatelessWidget {
  const QuestionnaireRow({super.key, required this.state, this.answered, this.total, this.onTap});
  final QnrRowState state;
  final int? answered, total; // inProgress일 때만 (3/8)
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final (IconData icon, String text, bool attention) = switch (state) {
      QnrRowState.todo => (Icons.assignment_outlined, '사전문진 미작성 · 작성하기 ›', true),
      QnrRowState.inProgress => (
          Icons.assignment_outlined,
          '사전문진 작성 중${answered != null && total != null ? ' ($answered/$total)' : ''} · 이어서 쓰기 ›',
          true,
        ),
      QnrRowState.done => (Icons.assignment_turned_in_outlined, '사전문진 작성완료 · 수정하기 ›', false),
      QnrRowState.locked => (
          appIcon(AppIconKind.blocked),
          '진료가 시작되어 수정할 수 없습니다 · 내용 보기 ›',
          false,
        ),
      QnrRowState.readonly => (appIcon(AppIconKind.readonly), '내가 작성한 사전문진 보기 ›', false),
    };
    final color = attention ? AppTokens.primary : AppTokens.grayPending;

    return InkWell(
      onTap: onTap,
      child: Container(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: Color(0xFFE5EAED))),
        ),
        padding: const EdgeInsets.only(top: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: AppTokens.primary), // 데모: 문진 아이콘은 항상 딥틸
            const SizedBox(width: 8),
            Expanded(
              child: Text(text, style: TextStyle(color: color, fontSize: 15)),
            ),
          ],
        ),
      ),
    );
  }
}
