import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/phone_cooldown.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/family/family_add_choice_screen.dart';
import 'package:hospital_patient_app/features/family/family_add_repository.dart';
import 'package:hospital_patient_app/features/family/family_link_form_screen.dart';
import 'package:hospital_patient_app/features/family/family_link_otp_page.dart';
import 'package:hospital_patient_app/features/family/family_list_screen.dart';
import 'package:hospital_patient_app/features/family/family_new_screen.dart';
import 'package:hospital_patient_app/features/family/family_repository.dart';

import 'harness.dart';

// ── 가짜 인메모리 보안 저장소(쿨다운 지속용) ──────────────────────────────────
class _MockStorage extends Mock implements FlutterSecureStorage {}

PhoneCooldownStore memCooldown() {
  final s = _MockStorage();
  final m = <String, String?>{};
  when(() => s.write(key: any(named: 'key'), value: any(named: 'value'))).thenAnswer(
      (i) async => m[i.namedArguments[#key] as String] = i.namedArguments[#value] as String?);
  when(() => s.read(key: any(named: 'key')))
      .thenAnswer((i) async => m[i.namedArguments[#key] as String]);
  when(() => s.delete(key: any(named: 'key')))
      .thenAnswer((i) async => m.remove(i.namedArguments[#key] as String));
  return PhoneCooldownStore(s);
}

// ── 가짜 추가·연결 저장소 ────────────────────────────────────────────────────
class AddCall {
  AddCall({required this.name, required this.gender, required this.relation, this.phone});
  final String name, gender, relation;
  final String? phone;
}

class LinkReqCall {
  LinkReqCall({required this.name, required this.phone, required this.relation});
  final String name, phone, relation;
}

class ConfirmCall {
  ConfirmCall({required this.requestId, required this.code});
  final String requestId, code;
}

/// FamilyAddRepo를 흉내 낸다 — 서버 판정은 fixture가 던지는 예외로 재현한다(앱은 판정하지 않는다).
class FakeFamilyAddRepo implements FamilyAddRepo {
  final List<AddCall> addCalls = [];
  final List<LinkReqCall> requestCalls = [];
  final List<ConfirmCall> confirmCalls = [];
  int otpCalls = 0; // ㉮가 인증 창구를 부르지 않는지 확인용(= requestCalls 길이의 별칭)

  ApiException? _failAdd;
  ApiException? _failRequest;
  ApiException? _failConfirm;
  bool _requestFindsNobody = false; // 서버가 200 + request_id만 주는 경우(열거 방지)
  Duration _delayAdd = Duration.zero;
  Duration _delayRequest = Duration.zero;

  void failAddWith(int status, String message) =>
      _failAdd = ApiException(message, statusCode: status);
  void failRequestWith(int status, String message, {int? retryAfter}) =>
      _failRequest = ApiException(message, statusCode: status, retryAfterSeconds: retryAfter);
  void failConfirmWith(int status, String message) =>
      _failConfirm = ApiException(message, statusCode: status);
  void nextRequestFindsNobody() => _requestFindsNobody = true;
  void delayAdd() => _delayAdd = const Duration(milliseconds: 300);
  void delayRequest() => _delayRequest = const Duration(milliseconds: 300);

  @override
  Future<String> addNew({
    required String name,
    required DateTime birthDate,
    required String gender,
    required String relation,
    String? phone,
  }) async {
    if (_delayAdd > Duration.zero) await Future<void>.delayed(_delayAdd);
    if (_failAdd != null) throw _failAdd!;
    addCalls.add(AddCall(name: name, gender: gender, relation: relation, phone: phone));
    return 'new-patient-id';
  }

  @override
  Future<String> requestLink({
    required String name,
    required DateTime birthDate,
    required String phone,
    required String relation,
  }) async {
    if (_delayRequest > Duration.zero) await Future<void>.delayed(_delayRequest);
    if (_failRequest != null) throw _failRequest!;
    otpCalls++;
    requestCalls.add(LinkReqCall(name: name, phone: phone, relation: relation));
    // 후보를 못 찾아도(_requestFindsNobody) 서버는 똑같이 request_id를 준다(갭 #58).
    return _requestFindsNobody ? 'req-phantom' : 'req-1';
  }

  @override
  Future<String> confirmLink({required String requestId, required String code}) async {
    if (_failConfirm != null) throw _failConfirm!;
    confirmCalls.add(ConfirmCall(requestId: requestId, code: code));
    return 'linked-patient-id';
  }
}

/// list() 호출 횟수를 세어 「목록 무효화 후 재조회」(FAM-NEW-16·FAM-LINK-21)를 확인한다.
class CountingFamilyRepo extends FakeFamilyRepo {
  CountingFamilyRepo(super.members);
  int listCallCount = 0;
  @override
  Future<List<FamilyMember>> list() {
    listCallCount++;
    return super.list();
  }
}

// ── 라우터 하네스 ────────────────────────────────────────────────────────────
class AddHarness {
  AddHarness({List<FamilyMember>? members, FakeFamilyAddRepo? addRepo, PhoneCooldownStore? cooldown})
      : listRepo = CountingFamilyRepo(members ?? [self(name: '김보호')]),
        addRepo = addRepo ?? FakeFamilyAddRepo(),
        cooldown = cooldown ?? memCooldown() {
    router = GoRouter(initialLocation: '/family', routes: [
      GoRoute(path: '/family', builder: (c, s) => const FamilyListScreen()),
      GoRoute(path: '/family/add', builder: (c, s) => const FamilyAddChoiceScreen()),
      GoRoute(path: '/family/add/new', builder: (c, s) => const FamilyNewScreen()),
      GoRoute(path: '/family/add/link', builder: (c, s) => const FamilyLinkFormScreen()),
      GoRoute(path: '/family/add/link/otp', builder: (c, s) => const FamilyLinkOtpPage()),
      GoRoute(
          path: '/settings/hospital',
          builder: (c, s) => const Scaffold(body: Text('hospital-guide'))),
    ]);
    // ⚠️ 명령형 push 뒤 currentConfiguration.uri 는 베이스에 남는다(go_router 14.x). 최상단 매치의
    // matchedLocation 을 읽어 실제 화면 위치를 잡는다.
    router.routerDelegate.addListener(() {
      lastRoute = router.routerDelegate.currentConfiguration.last.matchedLocation;
    });
  }
  final CountingFamilyRepo listRepo;
  final FakeFamilyAddRepo addRepo;
  final PhoneCooldownStore cooldown;
  late final GoRouter router;
  String lastRoute = '/family';

  Widget widget() => ProviderScope(
        overrides: [
          familyRepositoryProvider.overrideWithValue(listRepo),
          familyAddRepoProvider.overrideWithValue(addRepo),
          phoneCooldownStoreProvider.overrideWithValue(cooldown),
        ],
        child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router),
      );
}

Future<void> sizeUp(WidgetTester t) async {
  await t.binding.setSurfaceSize(const Size(390, 2600));
  addTearDown(() => t.binding.setSurfaceSize(null));
}

/// /family에서 시작해 /family/add로 밀어 넣는다 — 뒤로 가면 /family가 되도록 스택을 쌓는다
/// (NAV-FAM-07). 10명 fixture로 부르면 목록 버튼을 거치지 않고 바로 진입해(예약 1단계 문 NAV-FAM-17
/// 재현) 화면 자신의 상한 가드를 시험한다(FAM-ADD-07).
Future<AddHarness> pumpChoice(WidgetTester t, {List<FamilyMember>? members}) async {
  await sizeUp(t);
  final h = AddHarness(members: members);
  await t.pumpWidget(h.widget());
  await t.pumpAndSettle();
  h.router.push('/family/add');
  await t.pumpAndSettle();
  return h;
}

Future<AddHarness> pumpNew(WidgetTester t, {FakeFamilyAddRepo? addRepo}) async {
  await sizeUp(t);
  final h = AddHarness(addRepo: addRepo);
  await t.pumpWidget(h.widget());
  await t.pumpAndSettle();
  h.router.push('/family/add/new');
  await t.pumpAndSettle();
  return h;
}

Future<AddHarness> pumpLinkForm(WidgetTester t, {FakeFamilyAddRepo? addRepo}) async {
  await sizeUp(t);
  final h = AddHarness(addRepo: addRepo);
  await t.pumpWidget(h.widget());
  await t.pumpAndSettle();
  h.router.push('/family/add/link');
  await t.pumpAndSettle();
  return h;
}
