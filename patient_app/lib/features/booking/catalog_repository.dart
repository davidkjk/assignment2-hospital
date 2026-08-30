import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/providers.dart'; // apiClientProvider

class Department {
  final String id, name;
  const Department(this.id, this.name);
  factory Department.fromJson(Map<String, dynamic> j) =>
      Department(j['id'] as String, j['name'] as String);
}

class Doctor {
  final String id, name;
  final String? specialty, photoUrl; // 갭 #7 — null이면 화면이 회색 원(BOOK-DOC-05)
  final String scheduleSummary; // 갭 #9 — 서버가 만든 "월·수·금 오전"
  const Doctor(this.id, this.name, this.specialty, this.photoUrl, this.scheduleSummary);
  factory Doctor.fromJson(Map<String, dynamic> j) => Doctor(
        j['id'] as String,
        j['name'] as String,
        j['specialty'] as String?,
        j['photo_url'] as String?,
        (j['schedule_summary'] as String?) ?? '진료시간 문의',
      );
}

class Slot {
  final String id;
  final DateTime startTime; // 그날의 시각(HH:mm)만 의미 — 날짜는 4단계 date로 안다
  const Slot(this.id, this.startTime);
  // 서버 list_bookable_slots: {id, start_time: "HH:MM:SS"}. 날짜와 합쳐 DateTime으로.
  factory Slot.fromJson(Map<String, dynamic> j, DateTime date) {
    final parts = (j['start_time'] as String).split(':');
    return Slot(
      j['id'] as String,
      DateTime(date.year, date.month, date.day, int.parse(parts[0]), int.parse(parts[1])),
    );
  }
}

class CatalogRepository {
  CatalogRepository(this._api);
  final ApiClient _api;

  Future<List<Department>> departments() => _api.get(
        '/catalog/departments',
        (j) => (j as List).map((e) => Department.fromJson(e as Map<String, dynamic>)).toList(),
      );
  Future<List<Doctor>> doctors(String deptId) => _api.get(
        '/catalog/departments/$deptId/doctors',
        (j) => (j as List).map((e) => Doctor.fromJson(e as Map<String, dynamic>)).toList(),
      );
  Future<List<DateTime>> dates(String doctorId) => _api.get(
        '/catalog/doctors/$doctorId/dates',
        (j) => (j as List).map((d) => DateTime.parse(d as String)).toList(),
      );
  // T4 list_bookable_slots — 당일 30분·마감·8주를 서버가 이미 거른다. 앱은 목록만 그린다.
  Future<List<Slot>> slots(String doctorId, DateTime date) {
    final ymd =
        '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    return _api.get(
      '/catalog/doctors/$doctorId/slots',
      (j) => (j as List).map((e) => Slot.fromJson(e as Map<String, dynamic>, date)).toList(),
      query: {'target_date': ymd},
    );
  }
}

final catalogRepositoryProvider = Provider((ref) => CatalogRepository(ref.read(apiClientProvider)));

// 단계별 조회 — 앞 선택이 바뀌면 자동 무효화되도록 family로.
final departmentsProvider =
    FutureProvider.autoDispose((ref) => ref.read(catalogRepositoryProvider).departments());
final doctorsProvider = FutureProvider.autoDispose.family<List<Doctor>, String>(
    (ref, deptId) => ref.read(catalogRepositoryProvider).doctors(deptId));
final availableDatesProvider = FutureProvider.autoDispose.family<List<DateTime>, String>(
    (ref, doctorId) => ref.read(catalogRepositoryProvider).dates(doctorId));
