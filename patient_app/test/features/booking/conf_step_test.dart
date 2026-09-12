import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/features/booking/booking_submit.dart';
import 'package:hospital_patient_app/features/booking/steps/conf_step.dart';
import 'package:hospital_patient_app/features/home/home_data.dart';
import 'package:hospital_patient_app/widgets/inline_error.dart';
import 'booking_test_support.dart';

// bookingSubmitProvider를 원하는 AsyncValue 상태로 고정하는 가짜.
class _FakeSubmit extends StateNotifier<AsyncValue<void>> implements BookingSubmit {
  _FakeSubmit(super.state);
  @override
  Future<void> submit() async {}
}

Future<void> pumpConf(WidgetTester t,
    {AsyncValue<void> submitting = const AsyncData(null)}) async {
  await pumpBooking(
    t,
    const ConfStep(),
    overrides: [
      hospitalInfoProvider
          .overrideWith((ref) async => const HospitalInfo(address: '서울 강남', phone: '02-1')),
      bookingSubmitProvider.overrideWith((ref) => _FakeSubmit(submitting)),
    ],
    target: kSelf,
    department: kInternal,
    doctor: kDocPhoto,
    date: DateTime(2026, 8, 20),
    advance: (ctl) {
      ctl.selectSlot('s1', DateTime(2026, 8, 20, 9));
      ctl.setReason('감기 기운');
    },
  );
  await t.pumpAndSettle();
}

void main() {
  testWidgets('[BOOK-CONF-02] 전 항목을 한 번에 보여준다(방문이유 한 줄만 아님)', (t) async {
    await pumpConf(t);
    for (final v in ['김순자', '내과', '김의사', '감기 기운', '서울 강남']) {
      expect(find.textContaining(v), findsWidgets, reason: v);
    }
  });

  testWidgets('[BOOK-CONF-03] 항목별 [고치기] 버튼이 없다', (t) async {
    await pumpConf(t);
    expect(find.text('고치기'), findsNothing);
  });

  testWidgets('[BOOK-CONF-04b] 신청 버튼은 예약 신청하기 하나(즉시확정/확인후로 안 나눔)', (t) async {
    await pumpConf(t);
    expect(find.text('예약 신청하기'), findsOneWidget);
    expect(find.text('예약하기'), findsNothing);
  });

  testWidgets('[BOOK-CONF-04e] 병원 확인 안내 문장을 미리 보여준다', (t) async {
    await pumpConf(t);
    expect(find.text('병원 확인 후 확정되는 경우 알림으로 알려드립니다'), findsOneWidget);
  });

  testWidgets('[BOOK-CONF-05] 신청 중에는 글자를 유지한 진행형이 된다', (t) async {
    await pumpConf(t, submitting: const AsyncLoading());
    expect(find.text('예약 신청 중…'), findsOneWidget);
  });

  testWidgets('[BOOK-CONF-09] 실패는 버튼 바로 위 붙박이 오류(새 [다시 시도] 안 만듦)', (t) async {
    await pumpConf(t,
        submitting: AsyncError(ApiException('일시적 오류입니다.'), StackTrace.current));
    expect(find.byType(InlineError), findsOneWidget);
    expect(find.text('다시 시도'), findsNothing);
  });
}
