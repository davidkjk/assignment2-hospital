import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/providers.dart';
import '../family/family_repository.dart'; // FamilyMember·familyListProvider

/// 지나간 예약 줄 4종. HIST-ROLE-03. (앞으로 갈 예약 5종은 홈·예약 탭 몫 — 여기 안 온다.)
enum VisitStatus { done, cancelled, noShow, unconfirmed }

VisitStatus visitStatusFromServer(String s) => switch (s) {
      '진료완료' => VisitStatus.done,
      '취소됨' => VisitStatus.cancelled,
      '방문하지않음' => VisitStatus.noShow,
      _ => VisitStatus.unconfirmed, // '확정되지않음'
    };

/// 이력 한 줄. 서버가 안 보내는 것(증상·진단)은 담을 칸조차 없다(HIST-ROLE-06).
class VisitHistoryEntry {
  final String id;
  final VisitStatus status;
  final DateTime? slotDate;
  final String departmentName, doctorName;
  final String? patientVisibleNotes; // 진료완료 줄만 값이 있다(HIST-NOTE — 렌더는 T27b)
  final bool hasQuestionnaire; // 갭 #24 — 문진 문이 있는지(펼침 렌더는 T27b)
  final String? cancelledBy; // 'hospital' | 'patient' | null
  final String? cancelledByRelation, cancelledByName;
  final DateTime? cancelledAt;
  final bool isSelf; // account_patient_id == for_patient_id
  VisitHistoryEntry({
    required this.id,
    required this.status,
    this.slotDate,
    required this.departmentName,
    required this.doctorName,
    this.patientVisibleNotes,
    required this.hasQuestionnaire,
    this.cancelledBy,
    this.cancelledByRelation,
    this.cancelledByName,
    this.cancelledAt,
    required this.isSelf,
  });

  factory VisitHistoryEntry.fromJson(Map<String, dynamic> j) => VisitHistoryEntry(
        id: j['id'] as String,
        status: visitStatusFromServer(j['visit_status'] as String),
        slotDate: j['slot_date'] == null ? null : DateTime.parse(j['slot_date'] as String),
        departmentName: j['department_name'] as String,
        doctorName: j['doctor_name'] as String,
        patientVisibleNotes: j['patient_visible_notes'] as String?,
        hasQuestionnaire: j['has_questionnaire'] == true,
        cancelledBy: j['cancelled_by'] as String?,
        cancelledByRelation: j['cancelled_by_relation'] as String?,
        cancelledByName: j['cancelled_by_name'] as String?,
        cancelledAt: j['cancelled_at'] == null ? null : DateTime.parse(j['cancelled_at'] as String),
        isSelf: j['is_self'] == true,
      );
}

class HistoryPage {
  final List<VisitHistoryEntry> items;
  final String? nextCursor;
  const HistoryPage(this.items, this.nextCursor);
}

class HistoryRepository {
  HistoryRepository(this._api);
  final ApiClient _api;

  Future<HistoryPage> list(String forPatientId, {String? cursor}) => _api.get<HistoryPage>(
        '/my/history', // GET /my/history(T10)
        (j) {
          final m = (j as Map).cast<String, dynamic>();
          return HistoryPage(
            [for (final r in (m['items'] as List)) VisitHistoryEntry.fromJson((r as Map).cast<String, dynamic>())],
            m['next_cursor'] as String?,
          );
        },
        query: {'for_patient_id': forPatientId, if (cursor != null) 'cursor': cursor},
      );
}

final historyRepositoryProvider = Provider((ref) => HistoryRepository(ref.read(apiClientProvider)));

/// 이력 칩 = 가족 목록 그대로(본인 먼저·이름순·해제자 제외는 familyListProvider가 이미 함).
final historyChipsProvider = FutureProvider<List<FamilyMember>>((ref) => ref.watch(familyListProvider.future));

/// 선택된 칩의 patient id. null이면 진입 기본 = 본인(HIST-WHO-03).
final selectedHistoryPatientProvider = StateProvider<String?>((ref) => null);

/// 이력 페이지 상태 — 첫 조회·이어받기·재조회. 화면이 스크롤 끝에서 loadMore를 부른다.
class HistoryState {
  final List<VisitHistoryEntry> items;
  final String? next; // 다음 페이지 커서(null=처음부터 모두 보여드렸습니다)
  final bool loadingMore; // 이어받는 중(HIST-LIST-17)
  final bool appendError; // 이어받기 실패 — 기존 줄은 유지(HIST-LIST-19)
  const HistoryState({this.items = const [], this.next, this.loadingMore = false, this.appendError = false});

  HistoryState copyWith({List<VisitHistoryEntry>? items, String? next, bool? loadingMore, bool? appendError}) =>
      HistoryState(
        items: items ?? this.items,
        next: next ?? this.next,
        loadingMore: loadingMore ?? this.loadingMore,
        appendError: appendError ?? this.appendError,
      );
}

/// 선택된 환자가 바뀌면 build가 다시 돌아 첫 페이지를 새로 받는다(HIST-LIST-11 재진입 근거).
class HistoryNotifier extends AsyncNotifier<HistoryState> {
  String? _pid; // 이번 로드의 대상 환자(loadMore가 같은 사람으로 이어받도록)

  @override
  Future<HistoryState> build() async {
    final selected = ref.watch(selectedHistoryPatientProvider);
    final chips = await ref.watch(historyChipsProvider.future);
    final selfId = chips.firstWhere((m) => m.isSelf).id;
    _pid = selected ?? selfId; // HIST-WHO-03: 기본 본인
    final page = await ref.read(historyRepositoryProvider).list(_pid!);
    return HistoryState(items: page.items, next: page.nextCursor);
  }

  Future<void> loadMore() async {
    final cur = state.valueOrNull;
    if (cur == null || cur.next == null || cur.loadingMore) return; // 끝났거나 이미 받는 중
    state = AsyncData(cur.copyWith(loadingMore: true, appendError: false));
    try {
      final page = await ref.read(historyRepositoryProvider).list(_pid!, cursor: cur.next);
      state = AsyncData(HistoryState(items: [...cur.items, ...page.items], next: page.nextCursor));
    } catch (_) {
      // HIST-LIST-19: 이미 받은 줄은 지우지 않는다 — 맨 아래 [다시 시도]만 띄운다.
      state = AsyncData(HistoryState(items: cur.items, next: cur.next, appendError: true));
    }
  }

  Future<void> reload() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(build);
  }
}

final historyProvider = AsyncNotifierProvider<HistoryNotifier, HistoryState>(HistoryNotifier.new);
