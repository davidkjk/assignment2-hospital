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
