import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/family/family_edit_screen.dart';
import 'package:hospital_patient_app/features/family/family_list_screen.dart';
import 'package:hospital_patient_app/features/family/family_repository.dart';

/// 가족 화면 테스트용 가짜 리포지토리 — 서버 판정값은 fixture가 이미 싣고 온다.
class FakeFamilyRepo implements FamilyRepository {
  FakeFamilyRepo(this.members);
  List<FamilyMember> members;
  final List<Map<String, dynamic>> patchBodies = [];
  int unlinkCalls = 0;
  UpcomingBrief? blockUnlinkWith; // 설정되면 unlink가 서버 409(UnlinkBlocked)를 던진다
  Duration delay = Duration.zero;

  @override
  Future<List<FamilyMember>> list() async {
    if (delay > Duration.zero) await Future<void>.delayed(delay);
    return members;
  }

  @override
  Future<void> updateRelation(String id, String relation) async {
    patchBodies.add({'relation': relation});
  }

  @override
  Future<void> updateIdentity(String id,
      {required String name, required String birthDate, required String gender}) async {
    patchBodies.add({'name': name, 'birth_date': birthDate, 'gender': gender});
  }

  @override
  Future<void> unlink(String id) async {
    unlinkCalls++;
    if (delay > Duration.zero) await Future<void>.delayed(delay);
    if (blockUnlinkWith != null) throw UnlinkBlocked(blockUnlinkWith!);
    members = members.where((m) => m.id != id).toList();
  }
}

UpcomingBrief up({String id = 'a1', String date = '2026-09-01', String time = '14:00:00', String dept = '내과'}) =>
    UpcomingBrief(appointmentId: id, slotDate: date, startTime: time, departmentName: dept);

FamilyMember self({String id = 'me', String name = '김보호', bool canEdit = true, String? lock, String gender = 'F'}) =>
    FamilyMember(
        id: id, name: name, birthDate: '1948-04-12', gender: gender, relation: '본인', isSelf: true,
        canEditIdentity: canEdit, identityLockReason: lock, hasVisitHistory: lock == 'has_history',
        phone: null, phoneBorrowed: false);

FamilyMember fam({
  String id = 'p1', String name = '홍길동', String birth = '1950-01-01', String gender = 'M',
  String relation = '부모', bool canEdit = true, String? lock, UpcomingBrief? upcoming,
}) =>
    FamilyMember(
        id: id, name: name, birthDate: birth, gender: gender, relation: relation, isSelf: false,
        canEditIdentity: canEdit, identityLockReason: lock, hasVisitHistory: lock == 'has_history',
        phone: null, phoneBorrowed: false, upcoming: upcoming);

/// 라우터 + 현재 위치 캡처. 가족 라우트 + 목적지 자리표시자.
class FamilyHarness {
  FamilyHarness(this.repo, {String initial = '/family'}) {
    router = GoRouter(initialLocation: initial, routes: [
      GoRoute(path: '/family', builder: (c, s) => const FamilyListScreen()),
      GoRoute(
          path: '/family/:id/edit',
          builder: (c, s) => FamilyEditScreen(familyPatientId: s.pathParameters['id']!)),
      GoRoute(path: '/family/add', builder: (c, s) => const Scaffold(body: Text('add-choice'))),
      GoRoute(
          path: '/appointments/:id',
          builder: (c, s) => Scaffold(body: Text('appt ${s.pathParameters['id']}'))),
    ]);
    router.routerDelegate.addListener(() {
      lastRoute = router.routerDelegate.currentConfiguration.uri.toString();
    });
  }
  final FakeFamilyRepo repo;
  late final GoRouter router;
  String lastRoute = '/family';

  /// 현재 위치를 즉석에서 읽는다(push/go 직후 pumpAndSettle 뒤 호출).
  String get location => router.routerDelegate.currentConfiguration.uri.toString();

  Widget widget() => ProviderScope(
        overrides: [familyRepositoryProvider.overrideWithValue(repo)],
        child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router),
      );
}

Future<void> _sizeUp(WidgetTester t) async {
  // 위젯 동작 테스트는 키 큰 뷰포트로 — ListView 지연 빌드로 화면 밖 버튼이 안 만들어져
  // 탭이 빗나가는 것을 막는다(골든은 별도로 실제 크기 844를 쓴다).
  await t.binding.setSurfaceSize(const Size(390, 2200));
  addTearDown(() => t.binding.setSurfaceSize(null));
}

Future<FamilyHarness> pumpList(WidgetTester t, List<FamilyMember> members) async {
  await _sizeUp(t);
  final h = FamilyHarness(FakeFamilyRepo(members));
  await t.pumpWidget(h.widget());
  await t.pumpAndSettle();
  return h;
}

Future<FamilyHarness> pumpEdit(WidgetTester t, FamilyMember member, {List<FamilyMember>? all}) async {
  await _sizeUp(t);
  final h = FamilyHarness(FakeFamilyRepo(all ?? [member]), initial: '/family/${member.id}/edit');
  await t.pumpWidget(h.widget());
  await t.pumpAndSettle();
  return h;
}

/// 조회 실패(NAV-FAM-19)용 — list()가 던진다.
class _ThrowingRepo extends FakeFamilyRepo {
  _ThrowingRepo() : super([]);
  @override
  Future<List<FamilyMember>> list() async => throw Exception('조회 실패');
}

class FamilyHarnessError extends FamilyHarness {
  FamilyHarnessError() : super(_ThrowingRepo());
}
