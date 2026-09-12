import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_data.dart'; // homeAppointmentsProvider

/// LIST-ROLE-04: 목록에 담는 '앞으로 갈 예약' 5상태. 진료완료·취소·부도는 여기 없다(#75는 서버가 아니라 이 화면 필터).
const upcomingStatuses = {'예약신청', '예약확정', '도착', '진료대기', '진료중'};

/// LIST-ROLE-04·05·06 + 갭 #75: 서버(list_my_appointments)는 홈을 위해 진료완료를 계속 담으므로
/// 목록 화면에서 5상태만 남긴다(서버를 건드리면 홈의 CARD-DONE-06이 깨진다).
List<AppointmentView> filterUpcoming(List<AppointmentView> all) =>
    all.where((a) => upcomingStatuses.contains(a.status)).toList();

/// LIST-ROLE-08·09: 자르지 않는다(건수 제한·20건 이어받기 없음). 서버가 준 순서
/// (가까운 날·시각·본인→가족→이름)를 보존한다. 조회·캐시·오프라인은 홈 provider를 그대로 재사용한다.
final upcomingListProvider = Provider<AsyncValue<List<AppointmentView>>>((ref) =>
    ref.watch(homeAppointmentsProvider).whenData((v) => filterUpcoming(v ?? const [])));

/// LIST-REFRESH-02 seam: 보는 동안 활성 예약이 있으면 실시간 갱신을 구독한다(대기실에서 아무것도
/// 안 눌러도 「확인 중」→확정이 저절로 바뀜). 실제 배선(Supabase realtime)은 배포 몫이라 기본은 no-op —
/// 화면이 활성 유무를 [setActive]로 알리고, 이벤트가 오면 [events]가 틱을 흘려 화면이 재조회한다.
/// 홈이 이 seam을 아직 안 만들어 여기서 신설한다(T30 is_self·T24 문진필드 소급과 같은 성격).
abstract class UpcomingRealtime {
  Stream<void> get events;
  void setActive(bool active); // true=구독, false=해제(바뀔 것이 없으면 연결을 붙잡지 않는다)
}

class _NoopRealtime implements UpcomingRealtime {
  @override
  Stream<void> get events => const Stream<void>.empty();
  @override
  void setActive(bool active) {}
}

final upcomingRealtimeProvider = Provider<UpcomingRealtime>((ref) => _NoopRealtime());

/// LIST-REFRESH-04: 갱신 결과가 내가 보던 것과 다른가(보던 예약이 취소·완료로 목록에서 빠졌나) →
/// 그러면 T11 OFF-BACK-02(내가 보던 것이 바뀜) 공용 규칙을 탄다. 목록은 다시 그리기만, 상세 진입 시 안내.
bool offBackApplies({required List<String> before, required List<String> after}) {
  final now = after.toSet();
  return before.any((id) => !now.contains(id));
}

class DateSection {
  final DateTime date;
  final List<AppointmentView> items;
  const DateSection(this.date, this.items);
}

/// LIST-LIST-01·04·05: 서버 정렬을 보존한 채 '날짜가 바뀌는 자리'에서만 새 섹션을 연다(오늘도 예외 없음).
List<DateSection> groupByDate(List<AppointmentView> items) {
  final out = <DateSection>[];
  for (final a in items) {
    final d = a.slotStart == null
        ? DateTime(9999)
        : DateTime(a.slotStart!.year, a.slotStart!.month, a.slotStart!.day);
    if (out.isEmpty || out.last.date != d) {
      out.add(DateSection(d, [a]));
    } else {
      out.last.items.add(a);
    }
  }
  return out;
}
