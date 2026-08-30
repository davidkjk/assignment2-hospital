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
}

final catalogRepositoryProvider = Provider((ref) => CatalogRepository(ref.read(apiClientProvider)));

// 단계별 조회 — 앞 선택이 바뀌면 자동 무효화되도록 family로.
final departmentsProvider =
    FutureProvider.autoDispose((ref) => ref.read(catalogRepositoryProvider).departments());
final doctorsProvider = FutureProvider.autoDispose.family<List<Doctor>, String>(
    (ref, deptId) => ref.read(catalogRepositoryProvider).doctors(deptId));
final availableDatesProvider = FutureProvider.autoDispose.family<List<DateTime>, String>(
    (ref, doctorId) => ref.read(catalogRepositoryProvider).dates(doctorId));
