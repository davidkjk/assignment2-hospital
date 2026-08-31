import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/tokens.dart';
import 'package:hospital_patient_app/features/appointment/appointment_detail.dart';
import 'package:hospital_patient_app/features/appointment/detail_sections.dart';
import 'package:hospital_patient_app/features/home/status_badge.dart';
import 'package:hospital_patient_app/widgets/inline_error.dart';
import 'package:hospital_patient_app/widgets/offline_banner.dart';

import 'harness.dart';

void main() {
  // 지도·전화 seam을 관찰용으로 갈아끼운다(실제 앱 실행 대신 무엇을 열려 했는지 기록).
  String? lastMap, lastTel;
  final origMap = openMapQuery, origTel = openTel;
  setUp(() {
    lastMap = null;
    lastTel = null;
    openMapQuery = (q) => lastMap = q;
    openTel = (p) => lastTel = p;
  });
  tearDown(() {
    openMapQuery = origMap;
    openTel = origTel;
  });

  // ── 머리(APPT-HEAD) ────────────────────────────────────────────────────────
  testWidgets('[APPT-HEAD-01] 일시를 크게 + 상태 배지', (t) async {
    await pumpDetail(t, detail: detail(status: '예약확정', slot: DateTime(2026, 8, 5, 14, 30)));
    expect(find.textContaining('8월 5일'), findsOneWidget);
    expect(find.byType(StatusBadge), findsOneWidget);
  });

  testWidgets('[APPT-HEAD-02] 취소된 예약은 옅은 회색 머리', (t) async {
    await pumpDetail(t, detail: detail(status: '환자취소'));
    final box = t.widget<Container>(find.byKey(const Key('detail_header')));
    expect(box.color, AppTokens.grayDone);
  });

  testWidgets('[APPT-HEAD-03] 가족 예약이면 대상자를 화면 맨 위에', (t) async {
    await pumpDetail(t, detail: detail(relation: '어머니', forName: '박영자', isSelf: false));
    expect(find.text('어머니 박영자 님'), findsOneWidget);
  });

  testWidgets('[APPT-HEAD-04] 확정 전에는 신청 용어(예약 용어 아님)', (t) async {
    // 확정 전(예약신청)은 취소 버튼이 '신청 취소'다. 확정 후 '예약 취소'는 [APPT-BTN-03]가 검증한다.
    await pumpDetail(t, detail: detail(status: '예약신청'));
    expect(find.text('신청 취소'), findsOneWidget);
    expect(find.text('예약 취소'), findsNothing);
  });

  testWidgets('[APPT-HEAD-05] 예약신청이면 확인 중 안내 한 줄', (t) async {
    await pumpDetail(t, detail: detail(status: '예약신청'));
    expect(find.text('병원이 확인하는 중입니다. 확정되면 알림을 보내드립니다.'), findsOneWidget);
  });

  testWidgets('[APPT-HEAD-06] 소요 시간 약속 문구를 쓰지 않는다', (t) async {
    await pumpDetail(t, detail: detail(status: '예약확정'));
    expect(find.textContaining('걸립니다'), findsNothing);
    expect(find.textContaining('소요'), findsNothing);
  });

  // ── 정보 표(APPT-INFO) ─────────────────────────────────────────────────────
  testWidgets('[APPT-INFO-01] 진료과·담당의사·장소·방문이유 네 줄', (t) async {
    await pumpDetail(t,
        detail: detail(dept: '정형외과', doctor: '김의사', address: '서울 강남', reason: '무릎 통증'));
    for (final v in ['정형외과', '김의사', '서울 강남', '무릎 통증']) {
      expect(find.textContaining(v), findsWidgets);
    }
  });

  testWidgets('[APPT-INFO-02] 방문이유가 비면 그 줄을 감춘다(빈 줄 안 남김)', (t) async {
    await pumpDetail(t, detail: detail(reason: ''));
    expect(find.text('방문이유'), findsNothing);
    expect(find.textContaining('입력하지 않'), findsNothing);
  });

  testWidgets('[APPT-INFO-03] 방문이유는 예약할 때 쓴 문장 그대로(갭 #49)', (t) async {
    await pumpDetail(t, detail: detail(reason: '오른쪽 무릎이 아파요'));
    expect(find.text('오른쪽 무릎이 아파요'), findsOneWidget);
  });

  testWidgets('[APPT-INFO-04][NAV-APPT-19] 장소 주소를 누르면 지도 앱', (t) async {
    await pumpDetail(t, detail: detail(address: '서울 강남'));
    await t.tap(find.text('서울 강남'));
    await t.pump();
    expect(lastMap, '서울 강남');
  });

  testWidgets('[APPT-INFO-05][NAV-APPT-18] 전화번호는 테두리 상자, 누르면 전화 앱', (t) async {
    await pumpDetail(t, detail: detail(phone: '02-123-4567'));
    expect(find.byType(OutlinedButton), findsWidgets); // 테두리 상자
    await t.tap(find.text('02-123-4567'));
    await t.pump();
    expect(lastTel, '02-123-4567');
  });

  // ── QR(APPT-QR) ────────────────────────────────────────────────────────────
  testWidgets('[APPT-QR-01][NAV-APPT-05] 확정 예약은 접수 QR, 누르면 전체화면 QR', (t) async {
    final h = await pumpDetail(t, detail: detail(status: '예약확정'));
    expect(find.byKey(const Key('detail_qr')), findsOneWidget);
    await t.tap(find.text('QR 보기'));
    await t.pumpAndSettle();
    expect(h.lastRoute, contains('/qr/'));
  });

  testWidgets('[APPT-QR-02] 예약신청은 점선 빈칸 + 안내', (t) async {
    await pumpDetail(t, detail: detail(status: '예약신청'));
    expect(find.text('확정되면 여기에 접수용 QR이 나타납니다'), findsOneWidget);
    expect(find.byKey(const Key('detail_qr')), findsNothing);
  });

  testWidgets('[APPT-QR-03] 도착 이후에는 QR을 감춘다', (t) async {
    await pumpDetail(t, detail: detail(status: '도착'));
    expect(find.byKey(const Key('detail_qr')), findsNothing);
  });

  testWidgets('[APPT-QR-04] 취소·완료 예약은 QR을 감춘다', (t) async {
    await pumpDetail(t, detail: detail(status: '환자취소'));
    expect(find.byKey(const Key('detail_qr')), findsNothing);
    await pumpDetail(t, detail: detail(status: '진료완료'));
    expect(find.byKey(const Key('detail_qr')), findsNothing);
  });

  testWidgets('[APPT-QR-05] 시간 지남(당일)에는 QR을 유지한다', (t) async {
    await pumpDetail(t,
        detail: detail(status: '예약확정', slot: DateTime.now().subtract(const Duration(minutes: 40))));
    expect(find.byKey(const Key('detail_qr')), findsOneWidget); // 늦게라도 접수할 길
  });

  testWidgets('[APPT-QR-06] 오프라인이면 보관본으로 QR을 그린다', (t) async {
    await pumpDetail(t, detail: detail(status: '예약확정'), online: false);
    expect(find.byKey(const Key('detail_qr')), findsOneWidget);
  });

  // ── 사전문진(APPT-QNR) ─────────────────────────────────────────────────────
  testWidgets('[APPT-QNR-02][NAV-APPT-06] 미작성 줄 → 문진 화면', (t) async {
    final h = await pumpDetail(t, detail: detail(qnr: 'none'));
    expect(find.text('사전문진 미작성 · 작성하기 ›'), findsOneWidget);
    await t.tap(find.text('사전문진 미작성 · 작성하기 ›'));
    await t.pumpAndSettle();
    expect(h.lastRoute, contains('/questionnaire/'));
  });

  testWidgets('[APPT-QNR-03][APPT-QNR-04][APPT-QNR-01] 작성완료 줄을 펼치면 문항-답변 표 + 수정하기', (t) async {
    await pumpDetail(t, detail: detail(qnr: 'writable'));
    await t.tap(find.textContaining('작성완료'));
    await t.pumpAndSettle();
    expect(find.text('문진 답변을 불러오는 중입니다'), findsOneWidget); // 펼침 표(내용은 T23·24)
    expect(find.text('수정하기'), findsOneWidget);
  });

  testWidgets('[APPT-QNR-05][APPT-QNR-07] 진료중 이후는 자물쇠·읽기전용·수정 없음', (t) async {
    await pumpDetail(t, detail: detail(status: '진료중', qnr: 'readonly'));
    expect(find.byIcon(Icons.lock), findsOneWidget);
    await t.tap(find.textContaining('작성완료'));
    await t.pumpAndSettle();
    expect(find.text('진료가 시작되어 수정할 수 없습니다'), findsOneWidget);
    expect(find.text('수정하기'), findsNothing);
  });

  testWidgets('[APPT-QNR-06] 취소된 예약도 문진을 읽기전용으로 볼 수 있다(안 지움)', (t) async {
    await pumpDetail(t, detail: detail(status: '환자취소', qnr: 'readonly'));
    await t.tap(find.textContaining('작성완료'));
    await t.pumpAndSettle();
    expect(find.text('문진 답변을 불러오는 중입니다'), findsOneWidget);
  });

  testWidgets('[APPT-QNR-08] 접힌 상태에서 답변 미리보기를 보이지 않는다', (t) async {
    await pumpDetail(t, detail: detail(qnr: 'writable'));
    expect(find.text('문진 답변을 불러오는 중입니다'), findsNothing); // 펼치기 전엔 표 없음
  });

  // ── 하단 버튼 바(APPT-BTN) ─────────────────────────────────────────────────
  testWidgets('[APPT-BTN-03] 예약확정은 변경·취소 두 버튼', (t) async {
    await pumpDetail(t, detail: detail(status: '예약확정'), online: true);
    expect(find.text('예약 변경'), findsOneWidget);
    expect(find.text('예약 취소'), findsOneWidget);
  });

  testWidgets('[APPT-BTN-02] 취소 버튼은 회색 테두리(변경보다 시각 우선순위 낮음)', (t) async {
    await pumpDetail(t, detail: detail(status: '예약확정'), online: true);
    expect(find.byType(OutlinedActionButton), findsOneWidget);
  });

  testWidgets('[APPT-BTN-04][APPT-BTN-05][NAV-APPT-20] 도착 이후는 버튼 없이 접수처 안내', (t) async {
    await pumpDetail(t, detail: detail(status: '진료대기'), online: true);
    expect(find.text('접수가 끝난 예약입니다. 변경·취소는 접수처에 말씀해 주세요'), findsOneWidget);
  });

  testWidgets('[APPT-BTN-06] 도착 이후 회색 비활성 버튼을 두지 않는다', (t) async {
    await pumpDetail(t, detail: detail(status: '진료중'), online: true);
    expect(find.text('예약 변경'), findsNothing);
    expect(find.text('예약 취소'), findsNothing); // 「기다리면 풀리나」 오해 방지
  });

  testWidgets('[APPT-BTN-07][NAV-APPT-17] 완료·취소는 새로 예약하기 → 1단계', (t) async {
    final h = await pumpDetail(t, detail: detail(status: '진료완료'), online: true);
    await t.tap(find.text('새로 예약하기'));
    await t.pumpAndSettle();
    expect(h.lastRoute, '/booking');
  });

  testWidgets('[APPT-BTN-08] 시간 지남 당일은 상담 채팅·병원 전화', (t) async {
    await pumpDetail(t,
        detail: detail(status: '예약확정', slot: DateTime.now().subtract(const Duration(minutes: 40))),
        online: true);
    expect(find.text('상담 채팅 연결'), findsOneWidget);
    expect(find.text('병원 전화'), findsWidgets); // 버튼 + 정보칸 둘 다 있을 수 있음
  });

  testWidgets('[APPT-BTN-09] 마감 후 취소를 이미 요청하면 상담 연결됨·다시 못 누름', (t) async {
    await pumpDetail(t,
        detail: detail(status: '예약확정', supportRequestedAt: DateTime.now()), online: true);
    expect(find.textContaining('상담 연결됨'), findsOneWidget);
    expect(find.text('예약 취소'), findsNothing);
  });

  testWidgets('[APPT-BTN-10] 오프라인이면 두 버튼 회색 + 이유', (t) async {
    await pumpDetail(t, detail: detail(status: '예약확정'), online: false);
    expect(find.text('인터넷이 연결되면 변경·취소하실 수 있습니다'), findsOneWidget);
  });

  testWidgets('[APPT-BTN-11] 처리 중에는 글자를 유지한 진행형', (t) async {
    await pumpDetail(t,
        detail: detail(status: '예약확정'), online: true, action: const AsyncLoading());
    expect(find.text('취소하는 중…'), findsOneWidget);
  });

  testWidgets('[APPT-BTN-12] 실패는 버튼 바로 위 붙박이 오류', (t) async {
    await pumpDetail(t,
        detail: detail(status: '예약확정'),
        online: true,
        action: AsyncError(ApiException('일시적 오류'), StackTrace.current));
    expect(find.byType(InlineError), findsOneWidget);
  });

  // ── 화면 이동(NAV-APPT) ────────────────────────────────────────────────────
  testWidgets('[APPT-BTN-01] 버튼 바는 화면 맨 아래에 고정', (t) async {
    await pumpDetail(t, detail: detail(status: '예약확정'));
    // 버튼 바(변경/취소)가 스크롤 본문 밖 하단에 있다 — DetailButtonBar가 Column 하단.
    expect(find.byType(DetailButtonBar), findsOneWidget);
  });

  testWidgets('[NAV-APPT-01][NAV-APPT-02][NAV-APPT-03][NAV-APPT-04] 진입 목적지는 예약 상세 화면', (t) async {
    // 홈 카드·나의 예약 줄·알림·푸시 딥링크가 모두 /appointments/:id로 온다 — 도착 화면이 준비돼 있다.
    await pumpDetail(t, detail: detail(status: '예약확정'));
    expect(find.byType(AppointmentDetailScreen), findsOneWidget);
    expect(find.text('예약 상세'), findsOneWidget);
  });

  testWidgets('[NAV-APPT-07] [예약 변경] → 변경 화면(Task 22)으로 라우팅', (t) async {
    final h = await pumpDetail(t, detail: detail(status: '예약확정'), online: true);
    await t.tap(find.text('예약 변경'));
    await t.pumpAndSettle();
    expect(h.lastRoute, contains('/change'));
  });

  testWidgets('[NAV-APPT-12] [예약 취소] → 취소 흐름 진입(Task 22)', (t) async {
    final h = await pumpDetail(t, detail: detail(status: '예약확정'), online: true);
    await t.tap(find.text('예약 취소'));
    await t.pumpAndSettle();
    expect(h.lastRoute, contains('/cancel'));
  });

  testWidgets(
      '[NAV-APPT-08][NAV-APPT-09][NAV-APPT-10][NAV-APPT-11][NAV-APPT-13][NAV-APPT-14][NAV-APPT-15][NAV-APPT-16][NAV-APPT-24] '
      '변경/취소 흐름 도착지가 준비돼 있다(본체는 Task 22)', (t) async {
    // T21은 상세 버튼이 여는 라우트/팝업 배선만 담고, 변경 마법사·취소 확인창·마감후 안내 본체는 Task 22가
    // 실체화한다. 여기서는 그 도착지(/change·/cancel)가 살아 있고, 취소 성공 뒤 다시 그릴 상세(/appointments/:id)가
    // 존재함을 보증한다(양방향 악수).
    final h = await pumpDetail(t, detail: detail(status: '예약확정'), online: true);
    await t.tap(find.text('예약 변경'));
    await t.pumpAndSettle();
    expect(find.text('stub-change'), findsOneWidget); // NAV-APPT-08~11 마법사 진입 도착지
    h.router.go('/appointments/a1'); // NAV-APPT-13 취소 성공 후 같은 상세로 되그림
    await t.pumpAndSettle();
    expect(find.byType(AppointmentDetailScreen), findsOneWidget);
  });

  testWidgets('[NAV-APPT-21] 상태가 실시간으로 바뀌어도 화면을 옮기지 않는다', (t) async {
    final h = await pumpDetail(t, detail: detail(status: '진료대기'));
    // provider가 새로고침돼도(실시간 상태 갱신) 같은 상세 화면에 머문다 — Navigator 호출 없음.
    final container =
        ProviderScope.containerOf(t.element(find.byType(AppointmentDetailScreen)));
    container.invalidate(appointmentDetailProvider('a1'));
    await t.pumpAndSettle();
    expect(find.byType(AppointmentDetailScreen), findsOneWidget);
    expect(h.lastRoute, '/appointments/a1');
  });

  testWidgets('[NAV-APPT-22] 오프라인이면 보관본으로 계속 보이고 오프라인 띠', (t) async {
    await pumpDetail(t, detail: detail(status: '예약확정'), online: false);
    expect(find.byType(DetailHeader), findsOneWidget); // 화면 안 옮김
    expect(find.byType(OfflineBanner), findsOneWidget); // 오프라인 띠(인터넷 연결 없음)
  });

  testWidgets('[NAV-APPT-23] 없는 예약은 안내 화면 + 목록 보기(이유 설명 안 함)', (t) async {
    await pumpDetail(t); // detail 미주입 → 없는 예약
    expect(find.text('찾을 수 없는 예약입니다'), findsOneWidget);
    expect(find.text('예약 목록 보기'), findsOneWidget);
    expect(find.textContaining('취소'), findsNothing); // 왜 없는지 설명 안 함(개인정보 열거 방지)
  });
}
