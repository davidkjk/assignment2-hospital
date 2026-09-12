import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/providers.dart';

class UpcomingBrief {
  const UpcomingBrief({required this.appointmentId, required this.slotDate,
    required this.startTime, required this.departmentName});
  final String appointmentId, slotDate, startTime, departmentName;
  factory UpcomingBrief.fromJson(Map<String, dynamic> j) => UpcomingBrief(
    appointmentId: j['appointment_id'] as String, slotDate: j['slot_date'] as String,
    startTime: j['start_time'] as String, departmentName: j['department_name'] as String);
}

class FamilyMember {
  const FamilyMember({required this.id, required this.name, required this.birthDate,
    required this.gender, required this.relation, required this.isSelf,
    required this.canEditIdentity, this.identityLockReason, required this.hasVisitHistory,
    this.phone, required this.phoneBorrowed, this.upcoming});
  final String id, name, birthDate, gender, relation;
  final bool isSelf, canEditIdentity, hasVisitHistory, phoneBorrowed;
  final String? identityLockReason;   // 'linked' | 'has_history' | null (FAM-EDIT-05·08 문구 선택)
  final String? phone;
  final UpcomingBrief? upcoming;

  factory FamilyMember.fromJson(Map<String, dynamic> j) => FamilyMember(
    id: j['id'] as String, name: j['name'] as String, birthDate: j['birth_date'] as String,
    gender: j['gender'] as String, relation: j['relation'] as String,
    isSelf: j['is_self'] == true, canEditIdentity: j['can_edit_identity'] == true,
    identityLockReason: j['identity_lock_reason'] as String?,
    hasVisitHistory: j['has_visit_history'] == true,
    phone: j['phone'] as String?, phoneBorrowed: j['phone_borrowed'] == true,
    upcoming: j['upcoming'] == null
      ? null : UpcomingBrief.fromJson(Map<String, dynamic>.from(j['upcoming'] as Map)));
}

class UnlinkBlocked implements Exception {          // 409 + 예약 정보(FAM-UNLINK-03)
  const UnlinkBlocked(this.upcoming);
  final UpcomingBrief upcoming;
}

class FamilyRepository {
  FamilyRepository(this._api);
  final ApiClient _api;

  Future<List<FamilyMember>> list() => _api.get<List<FamilyMember>>(
    '/family',
    (j) => [for (final r in (j as List)) FamilyMember.fromJson((r as Map).cast<String, dynamic>())],
  );

  Future<void> updateRelation(String id, String relation) =>                    // FAM-EDIT-01
    _api.patch<void>('/family/$id', {'relation': relation}, (_) {});

  Future<void> updateIdentity(String id, {required String name,
    required String birthDate, required String gender}) =>
    _api.patch<void>('/family/$id',
      {'name': name, 'birth_date': birthDate, 'gender': gender}, (_) {});

  Future<void> unlink(String id) async {
    try {
      await _api.delete<void>('/family/$id', (_) {});
    } on ApiException catch (e) {
      if (e.statusCode == 409 && e.context != null) {                          // FAM-UNLINK-03
        throw UnlinkBlocked(UpcomingBrief.fromJson(e.context!));
      }
      rethrow;
    }
  }
}

final familyRepositoryProvider = Provider((ref) => FamilyRepository(ref.read(apiClientProvider)));
final familyListProvider = FutureProvider.autoDispose<List<FamilyMember>>(
  (ref) => ref.read(familyRepositoryProvider).list());
