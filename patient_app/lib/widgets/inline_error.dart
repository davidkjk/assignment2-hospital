import 'package:flutter/material.dart';
import 'warn_text.dart';

/// 버튼 동작이 실패했을 때의 오류 문구. **화면은 떠 있고 내가 누른 버튼만 실패**한 경우에 쓴다
/// (조회 실패로 화면을 못 연 경우는 EmptyState). 실패한 버튼 바로 위에 붙인다(ERR-KIND-01·ERR-POS-01).
///
/// - `message`는 **서버가 준 한글 문장 그대로**(ERR-MSG-01·02) — 위젯이 다시 쓰거나 접두어를 붙이지 않는다.
/// - 모양은 Task 0 `WarnText`(좌측 4px 바·주의색·배경 없음, ERR-POS-01)를 그대로 쓴다.
/// - **스낵바·상단 띠가 아니라 인라인**이라 스스로 사라지지 않는다(ERR-POS-03). 오류가 사라지는 것은
///   오직 화면이 `message=null`로 바꿀 때다 — 입력을 고쳐(ERR-GONE-01)·버튼을 다시 눌러(ERR-GONE-02)
///   막힘이 풀렸을 때. 스크롤 등 무관한 조작에는 그대로 남는다(ERR-GONE-03).
/// - **재시도 버튼을 만들지 않는다**(ERR-RETRY-01·03) — 원래 버튼을 다시 누르면 되고, 원래 버튼의
///   글자도 바꾸지 않는다(ERR-RETRY-04, InlineError는 버튼과 독립된 위젯).
class InlineError extends StatefulWidget {
  final String? message; // null이면 아무것도 그리지 않는다(막힘이 풀림).
  const InlineError(this.message, {super.key});

  @override
  State<InlineError> createState() => _InlineErrorState();
}

class _InlineErrorState extends State<InlineError> {
  @override
  void didUpdateWidget(covariant InlineError old) {
    super.didUpdateWidget(old);
    // ERR-POS-02: 없던 오류가 생기면, 그 위치가 시야 밖일 수 있으니 화면을 그 자리로 자동 스크롤한다.
    if (old.message == null && widget.message != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          Scrollable.ensureVisible(context,
              duration: const Duration(milliseconds: 200), alignment: 0.5);
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.message == null) return const SizedBox.shrink();
    return WarnText(widget.message!); // ERR-POS-01: 좌측 4px 바·주의색·배경 없음
  }
}
