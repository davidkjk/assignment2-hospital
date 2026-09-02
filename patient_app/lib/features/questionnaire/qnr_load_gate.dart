import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../widgets/empty_state.dart';
import 'questionnaire_controller.dart';

/// 문진 첫 로드 상태를 네 화면(entry·wizard·resume·confirm)이 같은 규칙으로 처리한다.
///
/// - 로드 실패([error])면 스피너에 가두지 않고 [다시 시도](ERR-RETRY-02·EMPTY-ERR-01)를 준다.
///   [다시 시도]는 provider를 invalidate해 컨트롤러를 새로 만들고 _load를 다시 돌린다 —
///   StateNotifierProvider.family가 autoDispose가 아니라, 한 번 실패한 컨트롤러가 그대로 남아
///   데이터를 고쳐도 앱을 껐다 켜기 전엔 스피너가 안 풀리던 회귀를 닫는다.
/// - 아직 로딩 중이면 스피너.
/// - 준비됐으면 null → 호출한 화면이 본문을 그린다.
Widget? qnrLoadGate(WidgetRef ref, QnrState st, String appointmentId) {
  if (st.error != null) {
    return Scaffold(
      appBar: AppBar(title: const Text('사전문진')), // 막다른 길 방지 — 나가는 문(뒤로)이 있어야 한다
      body: EmptyState.error(
        onRetry: () => ref.invalidate(questionnaireProvider(appointmentId)),
      ),
    );
  }
  if (st.loading) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
  return null;
}
