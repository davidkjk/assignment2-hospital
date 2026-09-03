import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';

import '../../core/tokens.dart';
import '../appointment/detail_sections.dart' show QnrTable;
import 'history_repository.dart';

/// 병원 안내문 블록. 진료완료 줄에만 자리가 있다(HIST-NOTE-04).
class HospitalNoteBlock extends StatelessWidget {
  const HospitalNoteBlock({super.key, required this.notes});
  final String? notes;
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('병원 안내', style: TextStyle(fontWeight: FontWeight.w700)), // HIST-NOTE-01 제목
        const SizedBox(height: 4),
        (notes ?? '').isEmpty
            ? const Text('안내 없음', style: TextStyle(color: AppTokens.grayPending)) // HIST-NOTE-02·03
            : Text(notes!), // HIST-NOTE-05: 접지 않고 전부(더 보기 없음)
        // HIST-NOTE-06: 복사·공유 버튼을 두지 않는다(OS 기본 길게 눌러 복사만).
      ]);
}

/// 문진 줄 — 눈 아이콘, 눌러 펼치면 그때 저장된 문항–답변 표(읽기 전용). 요약 미리보기 없음.
class HistoryQnrLine extends StatefulWidget {
  const HistoryQnrLine(
      {super.key, required this.appointmentId, required this.status, required this.hasQuestionnaire});
  final String appointmentId;
  final VisitStatus status;
  final bool hasQuestionnaire;
  @override
  State<HistoryQnrLine> createState() => _HistoryQnrLineState();
}

class _HistoryQnrLineState extends State<HistoryQnrLine> {
  bool _open = false;
  @override
  Widget build(BuildContext context) {
    if (!widget.hasQuestionnaire) return const SizedBox.shrink(); // HIST-QNR-04: 미작성이면 줄 없음
    // 취소된 예약은 「작성했던」, 그 밖(완료·부도·미확정)은 「내가 작성한」(HIST-QNR-01·05).
    final label = widget.status == VisitStatus.cancelled ? '작성했던 사전문진' : '내가 작성한 사전문진';
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      InkWell(
        onTap: () => setState(() => _open = !_open),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(children: [
            const Icon(AppIcons.visibility, size: 18, color: AppTokens.grayPending), // HIST-QNR-01·02: 눈(자물쇠 아님)
            const SizedBox(width: 6),
            Text(label),
            Icon(_open ? AppIcons.expand_less : AppIcons.expand_more, size: 18, color: AppTokens.grayPending), // 데모 chevron
          ]),
        ),
      ),
      if (_open) QnrTable(widget.appointmentId), // HIST-QNR-03·09·10: 그 자리·읽기전용·그때 글자
    ]);
  }
}

/// 펼침 알맹이 — 안내문 블록 + 문진 줄을 status로 조합(T27a `historyDetailBuilder`가 이걸 돌려준다).
class HistoryRowDetail extends StatelessWidget {
  const HistoryRowDetail({super.key, required this.entry});
  final VisitHistoryEntry entry;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(72, 0, 16, 12), // 레일 폭만큼 들여씀
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (entry.status == VisitStatus.done) // HIST-NOTE-04: 완료 줄만 안내문 자리
            HospitalNoteBlock(notes: entry.patientVisibleNotes),
          if (entry.hasQuestionnaire) // HIST-QNR-04: 문진 있으면 줄, 없으면 아예 없음
            HistoryQnrLine(appointmentId: entry.id, status: entry.status, hasQuestionnaire: true),
        ]),
      );
}
