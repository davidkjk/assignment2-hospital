import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/appointments/appointment_list_status.dart';
import 'package:hospital_patient_app/features/appointments/my_appointments_data.dart';

AppointmentView _v(String status,
        {DateTime? slot, DateTime? support, DateTime? changePrev, bool self = true, String name = '본인'}) =>
    AppointmentView.fromJson({
      'id': 'a',
      'status': status,
      'for_patient_name': name,
      'is_self': self,
      'department_name': '내과',
      'doctor_name': '이의사',
      'booking_code': 'A-1',
      'has_questionnaire': false,
      'slot_date': (slot ?? DateTime(2026, 9, 1, 10)).toIso8601String().substring(0, 10),
      'start_time': '${(slot ?? DateTime(2026, 9, 1, 10)).hour.toString().padLeft(2, '0')}:00',
      'support_requested_at': support?.toIso8601String(),
      'request_type': support == null ? null : '취소',
      'hospital_change_prev_time': changePrev?.toIso8601String(),
      'hospital_change_kind': changePrev == null ? null : 'time',
    });

void main() {
  final now = DateTime(2026, 9, 1, 9, 0); // 슬롯(10:00) 전 — 유예 안 지남
  final past = DateTime(2026, 9, 1, 11, 0); // 슬롯+30분 지남

  test('[LIST-ST-01] 예약확정 평상시는 글자 없음(레일 오른쪽 ›만)', () {
    final s = listStatusLabel(_v('예약확정'), now);
    expect(s.label, isNull);
    expect(s.tone, ListStatusTone.none);
  });
  test('[LIST-ST-02] 예약신청은 회색 「확인 중」', () {
    final s = listStatusLabel(_v('예약신청'), now);
    expect(s.label, '확인 중');
    expect(s.tone, ListStatusTone.gray);
  });
  test('[LIST-ST-03] 마감 후 취소 요청 중은 주의색 「상담 연결됨」', () {
    final s = listStatusLabel(_v('예약확정', support: now), now);
    expect(s.label, '상담 연결됨');
    expect(s.tone, ListStatusTone.attention);
  });
  test('[LIST-ST-05] 상태 글자에 「접수」·「등록」 같은 내부 처리 용어를 쓰지 않는다', () {
    for (final st in ['예약신청', '예약확정', '도착', '진료대기', '진료중']) {
      final s = listStatusLabel(_v(st, support: st == '예약확정' ? now : null), now);
      expect(s.label ?? '', isNot(anyOf(contains('요청 접수'), contains('요청 등록'))));
    }
  });
  test('[LIST-ST-06] 도착은 회색 「접수됨」', () {
    final s = listStatusLabel(_v('도착'), now);
    expect(s.label, '접수됨');
    expect(s.tone, ListStatusTone.gray);
  });
  test('[LIST-ST-07] 진료대기는 회색 「대기 중」', () {
    expect(listStatusLabel(_v('진료대기'), now).label, '대기 중');
  });
  test('[LIST-ST-08] 진료중은 회색 「진료 중」', () {
    expect(listStatusLabel(_v('진료중'), now).label, '진료 중');
  });
  test('[LIST-ST-09] 상태 글자에 순서·대기시간 숫자(N명·N분)를 넣지 않는다', () {
    for (final st in ['도착', '진료대기', '진료중']) {
      final s = listStatusLabel(_v(st), now);
      expect(s.label ?? '', isNot(anyOf(contains('명'), contains('분'))));
    }
  });
  test('[LIST-ST-12][LIST-ST-13] 예약확정이 슬롯+30분 지나면 주의색 「시간 지남」, 그 전엔 글자 없음', () {
    expect(listStatusLabel(_v('예약확정'), now).label, isNull); // 유예 전(ST-13)
    final late = listStatusLabel(_v('예약확정'), past);
    expect(late.label, '시간 지남');
    expect(late.tone, ListStatusTone.attention); // ST-12
  });
  test('[LIST-ST-16] 병원 사정으로 바뀐 예약은 주의색 「시간 변경됨」', () {
    final s = listStatusLabel(_v('예약확정', changePrev: DateTime(2026, 8, 20, 9)), now);
    expect(s.label, '시간 변경됨');
    expect(s.tone, ListStatusTone.attention);
  });
  test('[LIST-ST-22][LIST-ST-26] 예약신청인 채 시각이 지나면 「확정되지 않음」 하나만(겹쳐도 이름 있는 쪽)', () {
    final s = listStatusLabel(_v('예약신청'), past);
    expect(s.label, '확정되지 않음');
    expect(s.tone, ListStatusTone.attention); // '확인 중'+'시간 지남'을 겹쳐 쓰지 않는다
  });
  test('[LIST-ST-24] 회색=알려만 주는 것, 주의색=오늘 할 일이 남은 것', () {
    expect(listStatusLabel(_v('진료대기'), now).tone, ListStatusTone.gray);
    for (final s in [
      listStatusLabel(_v('예약확정', changePrev: DateTime(2026, 8, 20, 9)), now), // 시간 변경됨
      listStatusLabel(_v('예약확정', support: now), now), // 상담 연결됨
      listStatusLabel(_v('예약확정'), past), // 시간 지남
      listStatusLabel(_v('예약신청'), past), // 확정되지 않음
    ]) {
      expect(s.tone, ListStatusTone.attention);
    }
  });
  test('[LIST-ST-25] 상태를 색만으로 구분하지 않는다 — 주의색이면 반드시 글자가 함께 있다', () {
    final s = listStatusLabel(_v('예약확정'), past);
    expect(s.tone, ListStatusTone.attention);
    expect(s.label, isNotNull);
    expect(s.label, isNotEmpty);
  });
  test('[LIST-ST-10][LIST-ST-11] 대기 상태 글자에 대기시간 경고 문장도 순서 표현도 넣지 않는다', () {
    final s = listStatusLabel(_v('진료대기'), now);
    expect(s.label, '대기 중');
    expect(s.label!, isNot(anyOf(contains('변동'), contains('예상')))); // ST-10
    expect(s.label!, isNot(anyOf(contains('앞'), contains('순서')))); // ST-11
  });
  test('[LIST-ST-19] 3주 뒤 예약이 병원 사정으로 바뀌어도 목록엔 「시간 변경됨」이 뜬다(홈 밖이라 목록이 유일한 창구)', () {
    final far = DateTime(2026, 9, 22, 10); // 홈의 「가장 가까운 하루치」 밖
    final s = listStatusLabel(_v('예약확정', slot: far, changePrev: DateTime(2026, 9, 1, 9)), now);
    expect(s.label, '시간 변경됨');
  });
  test('[LIST-ST-23] 「확정되지 않음」은 이력의 HIST-ROW-09와 같은 말이다', () {
    expect(listStatusLabel(_v('예약신청'), past).label, '확정되지 않음');
  });
  test('[LIST-ROLE-04][LIST-ROLE-05][LIST-ROLE-06] 앞으로 갈 5상태만 목록에 남고 진료완료·취소됨·부도는 빠진다', () {
    for (final st in ['예약신청', '예약확정', '도착', '진료대기', '진료중']) {
      expect(upcomingStatuses.contains(st), isTrue);
    }
    for (final st in ['진료완료', '환자취소', '병원취소', '예약부도']) {
      expect(upcomingStatuses.contains(st), isFalse); // 끝난 즉시 빠진다(홈만 자정까지)
    }
  });
}
