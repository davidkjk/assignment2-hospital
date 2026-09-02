import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/connectivity.dart';
import '../../core/tokens.dart';
import '../../core/wait_format.dart';
import '../../widgets/empty_state.dart';
import '../home/appointment_view.dart';
import '../home/home_data.dart';
import 'brightness.dart';

/// QR-SWIPE-02 — QR이 살아 있는 예약(확정·시간 지남)만 접수 QR을 갖는다. 확인 중·취소·완료는 제외.
bool hasLiveQr(AppointmentView v, DateTime now) {
  final s = resolveCardState(v, now);
  return (s == AppointmentCardState.confirmed || s == AppointmentCardState.late) &&
      (v.bookingCode != null && v.bookingCode!.isNotEmpty);
}

/// 라우터 진입점 — 홈 예약 목록에서 :id 위치를 찾아 전체화면을 연다(NAV-HOME-02·03·04).
class QrRoute extends ConsumerWidget {
  const QrRoute({super.key, required this.appointmentId});
  final String appointmentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(homeAppointmentsProvider);
    return async.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, __) => Scaffold(
          body: Center(child: EmptyState.error(onRetry: () => ref.invalidate(homeAppointmentsProvider)))),
      data: (list) {
        final views = list ?? const <AppointmentView>[];
        final idx = views.indexWhere((v) => v.id == appointmentId);
        return QrFullscreen(views: views, initialIndex: idx < 0 ? 0 : idx);
      },
    );
  }
}

/// 라우터가 쓰는 전체화면(ConsumerWidget) — 연결 상태·밝기 컨트롤러를 배선하고 순수 뷰에 넘긴다.
class QrFullscreen extends ConsumerWidget {
  const QrFullscreen({super.key, required this.views, this.initialIndex = 0});
  final List<AppointmentView> views;
  final int initialIndex;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(connectivityProvider).valueOrNull ?? true;
    return QrFullscreenView(
      views: views,
      initialIndex: initialIndex,
      brightness: ScreenBrightnessController(),
      online: online,
    );
  }
}

/// 순수 뷰 — providers 없이 테스트한다(밝기는 스파이 주입).
class QrFullscreenView extends StatefulWidget {
  const QrFullscreenView({
    super.key,
    required this.views,
    this.initialIndex = 0,
    required this.brightness,
    this.online = true,
  });
  final List<AppointmentView> views;
  final int initialIndex;
  final BrightnessController brightness;
  final bool online;

  @override
  State<QrFullscreenView> createState() => _QrFullscreenViewState();
}

class _QrFullscreenViewState extends State<QrFullscreenView> {
  late final List<AppointmentView> _qr; // QR 있는 예약만
  late int _index;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _qr = widget.views.where((v) => hasLiveQr(v, now)).toList();
    // initialIndex는 원본 목록 기준 — 걸러낸 목록에서 같은 예약 위치를 찾는다.
    final target = widget.initialIndex >= 0 && widget.initialIndex < widget.views.length
        ? widget.views[widget.initialIndex].id
        : null;
    final found = _qr.indexWhere((v) => v.id == target);
    _index = found >= 0 ? found : 0;
    widget.brightness.max(); // QR-BRIGHT-01: 들어오면 밝기 최대
  }

  @override
  void dispose() {
    widget.brightness.restore(); // QR-BRIGHT-02: 떠나면 원래대로
    super.dispose();
  }

  void _go(int delta) {
    final next = _index + delta;
    if (next < 0 || next >= _qr.length) return;
    setState(() => _index = next);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTokens.background,
      body: SafeArea(
        child: Stack(
          children: [
            if (!widget.online)
              // QR-OFF-02: 오프라인이어도 QR은 그대로(클라이언트 생성) + 상단 띠로 접수 직원이 한 번 더 확인.
              const Align(alignment: Alignment.topCenter, child: _OfflineNotice()),
            Positioned(
              right: 16,
              top: 16,
              // 데모: rounded-full bg-card p-2 shadow-sm + X h-5(20).
              child: _CircleCardButton(
                icon: Icons.close,
                tooltip: '닫기',
                // 홈에서 go('/qr/:id')로 들어오면 스택이 대체돼 pop할 곳이 없다 →
                // 돌아갈 곳이 있으면 pop, 없으면 홈으로(닫기가 먹통이던 것 해소).
                onPressed: () => context.canPop() ? context.pop() : context.go('/home'),
              ),
            ),
            if (_qr.isEmpty)
              const Center(
                child: Text('표시할 접수 QR이 없습니다',
                    style: TextStyle(color: AppTokens.grayPending)))
            else
              _body(_qr[_index]),
          ],
        ),
      ),
    );
  }

  Widget _body(AppointmentView v) {
    return GestureDetector(
      onHorizontalDragEnd: (d) {
        final vel = d.primaryVelocity ?? 0;
        if (vel < -200) _go(1); // 왼쪽으로 밀면 다음
        if (vel > 200) _go(-1); // 오른쪽으로 밀면 이전
      },
      child: Column(
        children: [
          Expanded(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('${v.forPatientName}님',
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    const Text('병원 접수 데스크에 보여주세요',
                        style: TextStyle(color: AppTokens.grayPending)),
                    const SizedBox(height: 24),
                    _QrCard(view: v),
                    const SizedBox(height: 24),
                    Text('${v.departmentName} · ${v.doctorName} 선생님',
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    if (v.slotStart != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(_dateTime(v.slotStart!),
                            style: const TextStyle(color: AppTokens.grayPending)),
                      ),
                  ],
                ),
              ),
            ),
          ),
          if (_qr.length > 1) _pager(),
        ],
      ),
    );
  }

  Widget _pager() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 24, top: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // 데모: rounded-full bg-card p-2 shadow-sm disabled:opacity-30 + Chevron h-5.
          _CircleCardButton(
            icon: Icons.chevron_left,
            tooltip: '이전 예약',
            onPressed: _index == 0 ? null : () => _go(-1),
          ),
          const SizedBox(width: 16),
          Text('${_index + 1} / ${_qr.length}',
              style: const TextStyle(fontWeight: FontWeight.w600, color: AppTokens.grayPending)),
          const SizedBox(width: 16),
          _CircleCardButton(
            icon: Icons.chevron_right,
            tooltip: '다음 예약',
            onPressed: _index == _qr.length - 1 ? null : () => _go(1),
          ),
        ],
      ),
    );
  }

  static String _dateTime(DateTime t) => '${t.month}월 ${t.day}일 ${formatKoreanTime(t)}';
}

/// 데모 QR 화면의 원형 카드 버튼(닫기·페이저 공용): `rounded-full bg-card p-2 shadow-sm`.
/// 아이콘 h-5(20), 옅은 그림자, 비활성이면 opacity-30(데모 disabled:opacity-30). 스와이프로도
/// 넘길 수 있으므로 버튼은 보조 컨트롤 — 데모 크기(20+p2=36)를 그대로 따른다.
class _CircleCardButton extends StatelessWidget {
  const _CircleCardButton({required this.icon, this.tooltip, required this.onPressed});
  final IconData icon;
  final String? tooltip;
  final VoidCallback? onPressed; // null이면 비활성

  @override
  Widget build(BuildContext context) {
    Widget btn = DecoratedBox(
      decoration: const BoxDecoration(
        color: AppTokens.surface, // bg-card
        shape: BoxShape.circle,
        boxShadow: [BoxShadow(color: Color(0x0D000000), blurRadius: 2, offset: Offset(0, 1))], // shadow-sm
      ),
      child: Material(
        color: Colors.transparent,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onPressed,
          child: Padding(
            padding: const EdgeInsets.all(8), // p-2
            child: Icon(icon, size: 20, color: AppTokens.onSurface), // h-5
          ),
        ),
      ),
    );
    if (onPressed == null) btn = Opacity(opacity: 0.3, child: btn); // disabled:opacity-30
    return tooltip != null ? Tooltip(message: tooltip!, child: btn) : btn;
  }
}

/// 흰 QR 카드 — 실제 스캔되는 QR(QR-OK-02: data=booking_code) + 안 될 때용 예약번호.
class _QrCard extends StatelessWidget {
  const _QrCard({required this.view});
  final AppointmentView view;

  @override
  Widget build(BuildContext context) {
    final code = view.bookingCode ?? view.id;
    return Container(
      width: 280,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppTokens.surface,
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(color: Color(0x1A102D32), blurRadius: 16, offset: Offset(0, 4)),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          QrImageView(
            key: ValueKey('qr-$code'), // QR-OK-02 검증용(data는 private) — 코드가 QR을 결정함을 노출
            data: code, // QR-OK-02: booking_code (UUID 아님)
            version: QrVersions.auto,
            size: 216,
            gapless: true,
            eyeStyle: const QrEyeStyle(
                eyeShape: QrEyeShape.square, color: Color(0xFF0F172A)),
            dataModuleStyle: const QrDataModuleStyle(
                dataModuleShape: QrDataModuleShape.square, color: Color(0xFF0F172A)),
          ),
          if (view.bookingCode != null) ...[
            const SizedBox(height: 20),
            const Divider(height: 1),
            const SizedBox(height: 16),
            const Text('예약번호 (QR이 안 될 때)',
                style: TextStyle(fontSize: 12, color: AppTokens.grayPending)),
            const SizedBox(height: 2),
            Text(view.bookingCode!,
                style: const TextStyle(
                    fontSize: 24, fontWeight: FontWeight.bold, letterSpacing: 4)),
          ],
        ],
      ),
    );
  }
}

class _OfflineNotice extends StatelessWidget {
  const _OfflineNotice();
  @override
  Widget build(BuildContext context) {
    return const Material(
      color: AppTokens.offlineBannerBg,
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: SizedBox(
          width: double.infinity,
          child: Text('인터넷 연결 없음 · 접수용 QR은 그대로 사용할 수 있습니다',
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w600, color: AppTokens.warn)),
        ),
      ),
    );
  }
}
