// #34 다음 라운드 — 이력 「전체」를 서버 병합 모드로 배선한다(백엔드 d4d1b4d).
// 프론트가 멤버별로 조회해 클라이언트에서 합치던 워크어라운드(멤버당 50건·무한스크롤 없음)를
// 걷어내고, for_patient_id를 생략해 서버가 한 번에 병합(본인+활성가족·소유자 이름·키셋 커서)한다.
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/providers.dart';
import 'package:hospital_patient_app/features/family/family_repository.dart';
import 'package:hospital_patient_app/features/history/history_repository.dart';

// 서버 /my/history 한 줄(fromJson이 요구하는 필드 + 전체 모드 소유자 라벨 owner_name).
Map<String, dynamic> _srow({String id = 'ap1', String? owner}) => {
      'id': id, 'visit_status': '진료완료', 'slot_date': '2026-02-10',
      'department_name': '내과', 'doctor_name': '이의사', 'patient_visible_notes': null,
      'has_questionnaire': false, 'is_self': true,
      'cancelled_by': null, 'cancelled_by_relation': null, 'cancelled_by_name': null, 'cancelled_at': null,
      if (owner != null) 'owner_name': owner,
    };

FamilyMember _fm(String id, String name, {bool self = false}) => FamilyMember(
      id: id, name: name, birthDate: '1990-01-01', gender: 'F', relation: self ? '본인' : '자녀',
      isSelf: self, canEditIdentity: true, hasVisitHistory: false, phoneBorrowed: false);

class _ChipsRepo implements FamilyRepository {
  _ChipsRepo(this.members);
  final List<FamilyMember> members;
  @override
  Future<List<FamilyMember>> list() async => members;
  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

void main() {
  HistoryRepository repo(MockClient mock) => HistoryRepository(
      ApiClient(baseUrl: 'http://x', tokenProvider: () async => 'tk', httpClient: mock));

  group('HistoryRepository — 서버 「전체」 모드(#34)', () {
    test('[HIST-WHO-11] 「전체」 조회는 for_patient_id 없이 서버에 요청한다(서버가 병합)', () async {
      Uri? sent;
      final r = repo(MockClient((req) async {
        sent = req.url;
        return http.Response.bytes(utf8.encode('{"items":[],"next_cursor":null}'), 200);
      }));
      await r.list(null); // null = 「전체」
      expect(sent!.queryParameters.containsKey('for_patient_id'), false);
    });

    test('[HIST-WHO-12] 「전체」 응답의 owner_name을 각 줄 소유자 라벨로 담는다', () async {
      final r = repo(MockClient((req) async => http.Response.bytes(
          utf8.encode(jsonEncode({'items': [_srow(owner: '이영자')], 'next_cursor': null})), 200)));
      final page = await r.list(null);
      expect(page.items.single.ownerName, '이영자');
    });

    test('[HIST-WHO-12] 단일 사람 조회는 for_patient_id를 싣고, 소유자 라벨은 담지 않는다(전체 뷰에만)', () async {
      Uri? sent;
      final r = repo(MockClient((req) async {
        sent = req.url;
        // 서버는 단일 뷰에도 owner_name을 내려주지만(항상 join), 단일 뷰는 라벨을 표시하지 않는다.
        return http.Response.bytes(
            utf8.encode(jsonEncode({'items': [_srow(owner: '김순자')], 'next_cursor': null})), 200);
      }));
      final page = await r.list('p1');
      expect(sent!.queryParameters['for_patient_id'], 'p1');
      expect(page.items.single.ownerName, null); // HIST-WHO-12: 단일 뷰엔 소유자 라벨 없음
    });
  });

  group('HistoryNotifier — 「전체」 = 서버 1회 병합(#34)', () {
    test('[HIST-WHO-11] 「전체」 선택 시 멤버별 N회가 아니라 서버에 한 번만 요청한다', () async {
      final calls = <Uri>[];
      final api = ApiClient(
          baseUrl: 'http://x',
          tokenProvider: () async => 'tk',
          httpClient: MockClient((req) async {
            calls.add(req.url);
            return http.Response.bytes(
                utf8.encode(jsonEncode({
                  'items': [_srow(id: 'a1', owner: '김순자'), _srow(id: 'a2', owner: '이영자')],
                  'next_cursor': '2026-01-01|apX',
                })),
                200);
          }));
      final container = ProviderContainer(overrides: [
        apiClientProvider.overrideWithValue(api),
        familyRepositoryProvider.overrideWithValue(
            _ChipsRepo([_fm('me', '김순자', self: true), _fm('mom', '이영자')])),
        selectedHistoryPatientProvider.overrideWith((ref) => kAllHistoryPatientId),
      ]);
      addTearDown(container.dispose);
      final state = await container.read(historyProvider.future);
      expect(calls.length, 1); // 멤버 2명이어도 서버 병합이라 1회
      expect(calls.single.queryParameters.containsKey('for_patient_id'), false);
      expect(state.next, '2026-01-01|apX'); // 서버 키셋 커서 유지 → 무한스크롤 살아남(클라 병합 한계 제거)
      expect(state.items.map((e) => e.ownerName), ['김순자', '이영자']);
    });
  });
}
