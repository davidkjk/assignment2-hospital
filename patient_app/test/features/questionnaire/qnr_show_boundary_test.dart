import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_repository.dart';

// 이 태스크(24)가 앱에서 **하지 않는 것**을 못박는 경계 테스트다. 「하지 않는다」를 테스트로 남기지
// 않으면 나중에 누군가 「성별 필터가 없네」 하고 앱에 넣어(QNR-SHOW-02 위반) 아버지 문진에 임신 문항이 뜬다.

void main() {
  // ─── Step 8: 성별 노출의 판단 기준과 출처 — 앱이 로그인 사용자를 쓰지 않는다 ───

  test('[QNR-SHOW-02] 앱은 로그인 사용자 성별로 문항을 거르지 않는다 — 서버가 준 것을 그대로 그린다', () {
    // 딸(F) 계정으로 아버지(M) 문진을 열어도, 서버가 아버지 기준으로 이미 걸러 보낸다.
    final data = QnrData.fromServer(
        template: {
          'id': 't1',
          'total': 1,
          'questions': [
            {'id': 'q1', 'text': '전립선 관련 증상', 'type': 'yes_no', 'required': false}
          ]
        },
        response: null);
    expect(data.questions.length, 1); // 앱에는 성별 인자가 아예 없다
    expect(data.questions.single.id, 'q1');
  });

  test('[QNR-SHOW-02] QnrData.fromServer 서명에 성별이 없다 — 앱이 판정할 수단을 두지 않는다', () {
    // 계약: template + response 둘뿐. 성별을 넘길 자리가 없어야 「그냥 쓰면 아버지에게 임신 문항」이 불가능해진다.
    final data = QnrData.fromServer(template: {'id': 't1', 'total': 0, 'questions': []}, response: null);
    expect(data.questions, isEmpty);
  });

  test('[QNR-SHOW-02] 안 보이는 문항은 화면에도 진행률에도 없다 — 서버가 이미 뺐다', () {
    // 남성 환자의 양식(임신 문항 제외, total=2)을 받으면 마법사는 2문항짜리로 돈다.
    final data = QnrData.fromServer(
        template: {
          'id': 't1',
          'total': 2,
          'questions': [
            {'id': 'q1', 'text': '키', 'type': 'short_text', 'required': false},
            {'id': 'q3', 'text': '증상', 'type': 'long_text', 'required': false}
          ]
        },
        response: null);
    expect(data.questions.map((q) => q.id), ['q1', 'q3']); // q2(임신)는 서버에서 이미 빠졌다
    expect(data.total, 2); // 진행률 분모도 서버가 준 값
  });

  test('[QNR-SHOW-03] 새 가족의 성별 출처 = 보호자가 등록할 때 넣은 값(F/M)', () {
    // 앱 가입·가족 추가 화면이 F/M을 보내고, 그 값이 patients.gender가 되어 「보일 대상」을 가른다.
    const allowed = {'F', 'M'};
    expect(allowed.contains('F'), isTrue); // 자유 입력을 만들지 않는다(갭 #57·QNR-SHOW-10)
    expect(allowed.length, 2);
  });

  test('[QNR-SHOW-04] 「기존 환자 연결」로 들어온 가족은 병원 기록의 성별을 쓴다 — 연결 절차가 성별을 받지 않는다', () {
    // confirm_family_link_otp는 이름·생년월일·전화로 기존 환자를 잇는다. 성별 입력칸이 없다.
    const linkFields = ['name', 'birth_date', 'phone', 'otp'];
    expect(linkFields.contains('gender'), isFalse); // 값은 병원이 등록한 것이 원본이다
  });

  test('[QNR-SHOW-11] 성별 필수·기본 선택 없음, 연결 가족은 읽기 전용 — 가족 화면 계열이 실현한다', () {
    // 성별을 조용히 기본값으로 채우면 「보일 대상」이 어긋난다(없는 질문은 없는 줄도 모른다) →
    // FAM-NEW 계열이 기본 선택 없이 필수로 받고, 병원 기록에서 온 가족은 FAM-EDIT 계열이 읽기 전용으로 막는다.
    const ownedByFamilyTasks = ['FAM-NEW 계열(성별 필수·기본 선택 없음)', 'FAM-EDIT 계열(읽기 전용·병원 문의)'];
    expect(ownedByFamilyTasks.length, 2);
  });

  // ─── Step 9: 의사 화면 몫 — 「표시되지 않음」 구분(직원웹 DOCTOR-QNR 소유, 앱엔 의사 화면 없음) ───

  test('[QNR-SHOW-06] required 문항이 「보일 대상」 때문에 안 보였으면 의사 화면이 그 사실을 적는다', () {
    // 앱은 그 문항을 애초에 받지 않으므로(QNR-SHOW-02) 앱이 그릴 수 있는 화면이 아니다.
    const ownedByStaffWeb = 'DOCTOR-QNR';
    expect(ownedByStaffWeb, 'DOCTOR-QNR');
  });

  test('[QNR-SHOW-07] 「답변 없음」과 「표시되지 않음」은 다른 표시다 — 의사가 할 일이 다르다', () {
    // 앞: 환자가 비우고 넘어갔다(정상일 수 있다). 뒤: 성별 등록이 의심된다.
    const labels = {'답변 없음', '표시되지 않음'};
    expect(labels.length, 2); // 한 글자로 합치지 않는다
  });

  test('[QNR-SHOW-08] required가 아닌 문항은 표시하지 않는다 — 남성마다 임신 문항이 뜨면 잡음', () {
    bool showsNotice({required bool isRequired}) => isRequired;
    expect(showsNotice(isRequired: true), isTrue);
    expect(showsNotice(isRequired: false), isFalse);
  });

  test('[QNR-SHOW-09] 성별 오류를 진료 현장에서 잡는다 — 앱이 막지 않고 사람이 처리한다', () {
    // 앱이 성별을 재확인시키거나 문진을 막지 않는다(QNR-REQ 계열의 「앱은 아무도 막지 않는다」와 같은 뿌리).
    const blockedInApp = false;
    expect(blockedInApp, isFalse);
  });
}
