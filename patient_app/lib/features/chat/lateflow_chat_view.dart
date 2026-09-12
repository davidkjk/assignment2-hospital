import 'package:flutter/material.dart';
import '../../widgets/patient_app_bar.dart';
import 'widgets/chat_safety_banner.dart';

/// 예약 맥락 상담방(LATEFLOW-CHAT). 이미 팝업 시점에 기록됐으므로(RECORD) 이 화면은 중복 생성·추가
/// 선택을 하지 않고 봇이 설명만 한다(CONTEXT). 환자 노출 문구는 `상담(직원 확인)으로 연결됐습니다`·
/// `아직 예약은 유지되고 있습니다`만 쓰고 `접수/등록/요청` 표현은 쓰지 않는다(KEEP·FORBID).
/// 맥락 조회 중/실패는 확인 안 된 예약 정보를 먼저 만들지 않는다(LOAD·ERR).
class LateFlowChatView extends StatelessWidget {
  final String appointmentId, reason;
  final bool contextLoaded, loadError, alreadyLinked;
  const LateFlowChatView({
    super.key,
    required this.appointmentId,
    required this.reason,
    this.contextLoaded = false,
    this.loadError = false,
    this.alreadyLinked = false,
  });

  @override
  Widget build(BuildContext context) {
    if (loadError) {
      return Scaffold(
        appBar: const PatientAppBar(title: 'AI 상담봇'),
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('예약 정보를 불러오지 못했어요'),
            TextButton(onPressed: () {}, child: const Text('다시 시도')),
          ]),
        ),
      );
    }
    if (!contextLoaded && !alreadyLinked) {
      return const Scaffold(body: Center(child: CircularProgressIndicator())); // LOAD
    }
    return const Scaffold(
      appBar: PatientAppBar(title: 'AI 상담봇'),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ChatSafetyBanner(),
          Padding(
            padding: EdgeInsets.all(16),
            child: Text('상담(직원 확인)으로 연결됐습니다'), // KEEP (금지 문구 안 씀 — FORBID)
          ),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: Text('아직 예약은 유지되고 있습니다'),
          ),
        ],
      ),
    );
  }
}
