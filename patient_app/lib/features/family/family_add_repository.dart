import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/providers.dart';

/// ㉯ 입력값 보존 그릇(NAV-FAM-10) — 정보 입력 화면에서 인증번호 화면으로 넘어가고, 뒤로 다녀와도
/// 값이 남아 있어야 한다(예약 마법사 BOOK-KEEP-01과 같은 처리). `requestId`는 재발송 때 갱신된다.
class LinkDraft {
  const LinkDraft({
    required this.name,
    required this.birthDate,
    required this.phone,
    required this.relation,
    required this.requestId,
  });
  final String name;
  final DateTime birthDate;
  final String phone;
  final String relation;
  final String requestId;

  LinkDraft copyWith({String? requestId}) => LinkDraft(
        name: name,
        birthDate: birthDate,
        phone: phone,
        relation: relation,
        requestId: requestId ?? this.requestId,
      );
}

// ⛔ autoDispose가 아니다 — 화면을 벗어나도 살아 있어야 「뒤로 = 값 유지」가 성립한다(BOOK-KEEP-01과 같은 처리).
final linkDraftProvider = StateProvider<LinkDraft?>((ref) => null);

/// FAM-NEW / FAM-LINK 계열의 서버 창구. 조회·목록은 T25 [FamilyRepository]가 맡고, 여기는
/// 「추가·연결」 세 창구만 얇게 감싼다. 판정(본인·이미 연결·상한·열거 방지·쿨다운)은 전부 서버 몫이라
/// 이 저장소는 흉내 내지 않는다 — request 응답에 「찾았는지」가 없다는 것이 갭 #58의 핵심이다.
class FamilyAddRepo {
  FamilyAddRepo(this._api);
  final ApiClient _api;

  /// ㉮ 새 가족 등록(인증 없음). phone은 비어 있으면 null 그대로 보낸다 — 보호자 번호를 복사하지
  /// 않는다(FAM-NEW-08·갭 #3). 응답의 새 환자 id를 돌려준다.
  Future<String> addNew({
    required String name,
    required DateTime birthDate,
    required String gender,
    required String relation,
    String? phone,
  }) =>
      _api.post<String>(
        '/family',
        {
          'name': name,
          'birth_date': _ymd(birthDate),
          'gender': gender,
          'relation': relation,
          'phone': phone, // null 그대로
        },
        (j) => (j as Map)['family_patient_id'] as String,
      );

  /// ㉯ 인증번호 요청. ⭐ 응답은 `request_id`뿐 — 후보를 찾았는지 여부는 담기지 않는다(갭 #58).
  Future<String> requestLink({
    required String name,
    required DateTime birthDate,
    required String phone,
    required String relation,
  }) =>
      _api.post<String>(
        '/family/link/request',
        {
          'name': name,
          'birth_date': _ymd(birthDate),
          'phone': phone,
          'relation': relation,
        },
        (j) => (j as Map)['request_id'] as String,
      );

  /// ㉯ 인증번호 확인 — 실제로 연결이 일어나는 곳. 연결된 가족 환자 id를 돌려준다.
  Future<String> confirmLink({
    required String requestId,
    required String code,
  }) =>
      _api.post<String>(
        '/family/link/confirm',
        {'request_id': requestId, 'code': code},
        (j) => (j as Map)['family_patient_id'] as String,
      );
}

/// yyyy-MM-dd (서버 date 형식).
String _ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

final familyAddRepoProvider = Provider((ref) => FamilyAddRepo(ref.read(apiClientProvider)));
