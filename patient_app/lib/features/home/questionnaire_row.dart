import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
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

/// 갭 #50: 홈 줄 상태는 서버 questionnaire_state(제출 여부)로 갈린다 — 행 존재(has_questionnaire)로 판정하지 않는다.
/// 진료 진입·종료가 먼저다(자물쇠·눈), 그 전엔 미작성/작성 중/작성완료 세 갈래.
QnrRowState resolveQnrRow(String state, {required bool inTreatment, required bool finished}) {
  if (finished) return QnrRowState.readonly; // CARD-QNR-04(눈)
  if (inTreatment) return QnrRowState.locked; // CARD-QNR-03(자물쇠)
  switch (state) {
    case '작성완료':
      return QnrRowState.done; // CARD-QNR-02(회색·수정하기)
    case '작성 중':
      return QnrRowState.inProgress; // ⭐ QNR-PROG-07 — 진행률 꼬리표
    default:
      return QnrRowState.todo; // CARD-QNR-01(주의색·작성하기)
  }
}

class QuestionnaireRow extends StatelessWidget {
  const QuestionnaireRow({super.key, required this.state, this.answered, this.total, this.onTap});
  final QnrRowState state;
  final int? answered, total; // inProgress일 때만 (3/8)
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    // 아이콘: 미작성/작성중/작성완료 = 청진기(데모 Stethoscope, fill) — Material엔 없어 SVG.
    //   잠김=자물쇠(DISP-ICON-01)·읽기전용=눈(DISP-ICON-02)은 Material 그대로.
    final (String text, bool attention) = switch (state) {
      QnrRowState.todo => ('사전문진 미작성 · 작성하기 ›', true),
      QnrRowState.inProgress => (
          '사전문진 작성 중${answered != null && total != null ? ' ($answered/$total)' : ''} · 이어서 쓰기 ›',
          true,
        ),
      QnrRowState.done => ('사전문진 작성완료 · 수정하기 ›', false),
      QnrRowState.locked => ('진료가 시작되어 수정할 수 없습니다 · 내용 보기 ›', false),
      QnrRowState.readonly => ('내가 작성한 사전문진 보기 ›', false),
    };
    final color = attention ? AppTokens.primary : AppTokens.grayPending;
    // 데모: 문진 아이콘은 항상 딥틸.
    final Widget iconWidget = switch (state) {
      QnrRowState.todo || QnrRowState.inProgress || QnrRowState.done => SvgPicture.asset(
          'assets/icons/stethoscope_fill.svg',
          width: 18,
          height: 18,
          colorFilter: const ColorFilter.mode(AppTokens.primary, BlendMode.srcIn),
        ),
      QnrRowState.locked =>
        Icon(appIcon(AppIconKind.blocked), size: 18, color: AppTokens.primary),
      QnrRowState.readonly =>
        Icon(appIcon(AppIconKind.readonly), size: 18, color: AppTokens.primary),
    };

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
            SizedBox(width: 18, height: 18, child: Center(child: iconWidget)),
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
