import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/providers.dart';
import '../../core/tokens.dart';
import '../../widgets/labeled_field.dart';

/// [SET-PW-13·14·15] 설정에서의 비밀번호 변경 창구. 재설정(이름 대조·서버 경유)과 다른 경로다 —
/// 진입 시 재인증을 이미 통과했으니 현재 비밀번호를 다시 묻지 않고, 성공 시 다른 기기 세션을 끊는다(#73).
abstract class SettingsAuthGateway {
  Future<void> updatePassword(String pw);
  Future<void> signOutOtherSessions();
}

class SupabaseSettingsAuthGateway implements SettingsAuthGateway {
  SupabaseSettingsAuthGateway(this.auth);
  final GoTrueClient auth;

  @override
  Future<void> updatePassword(String pw) => auth.updateUser(UserAttributes(password: pw));

  @override
  Future<void> signOutOtherSessions() => auth.signOut(scope: SignOutScope.others); // #73
}

final settingsAuthGatewayProvider = Provider<SettingsAuthGateway>(
    (ref) => SupabaseSettingsAuthGateway(ref.watch(supabaseClientProvider).auth));

class SettingsPasswordState {
  const SettingsPasswordState({this.busy = false, this.done = false, this.error});
  final bool busy, done;
  final String? error;
  SettingsPasswordState copyWith({bool? busy, bool? done, String? error}) =>
      SettingsPasswordState(busy: busy ?? this.busy, done: done ?? this.done, error: error);
}

class SettingsPasswordController extends StateNotifier<SettingsPasswordState> {
  SettingsPasswordController(this.auth) : super(const SettingsPasswordState());
  final SettingsAuthGateway auth;

  Future<void> submit(String pw, String confirm) async {
    state = state.copyWith(busy: true, error: null);
    try {
      await auth.updatePassword(pw);            // [SET-PW-13] 설정 변경 경로(이름 대조 없음)
      await auth.signOutOtherSessions();         // [SET-PW-14·15] #73 다른 기기만(현재 기기 유지)
      state = const SettingsPasswordState(done: true);
    } catch (_) {
      // [SET-PW-16] 서버가 거절하면 버튼 바로 위 붙박이 오류.
      state = state.copyWith(busy: false, error: '비밀번호를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }
}

final settingsPasswordControllerProvider =
    StateNotifierProvider<SettingsPasswordController, SettingsPasswordState>(
  (ref) => SettingsPasswordController(ref.watch(settingsAuthGatewayProvider)),
);

bool _pwOk(String pw) =>
    pw.length >= 8 && RegExp(r'[A-Za-z]').hasMatch(pw) && RegExp(r'\d').hasMatch(pw);

class SettingsPasswordScreen extends ConsumerStatefulWidget {
  const SettingsPasswordScreen({super.key, required this.onDone});
  final VoidCallback onDone; // 보통 '/settings' + '비밀번호를 바꿨습니다'

  @override
  ConsumerState<SettingsPasswordScreen> createState() => _SettingsPasswordScreenState();
}

class _SettingsPasswordScreenState extends ConsumerState<SettingsPasswordScreen> {
  final _pw = TextEditingController();
  final _pw2 = TextEditingController();
  bool _o1 = true, _o2 = true;

  @override
  void dispose() {
    _pw.dispose();
    _pw2.dispose();
    super.dispose();
  }

  bool get _match => _pw.text.isNotEmpty && _pw.text == _pw2.text;

  Widget _cond(bool ok, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 2),
        child: Row(children: [
          Text(ok ? '✓' : '·',
              style: TextStyle(
                  color: ok ? AppTokens.primary : AppTokens.grayPending, fontWeight: FontWeight.bold)),
          const SizedBox(width: 8),
          Text(text, style: const TextStyle(color: AppTokens.grayPending, fontSize: 13)),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(settingsPasswordControllerProvider);
    ref.listen(settingsPasswordControllerProvider, (_, s) {
      if (s.done) widget.onDone(); // [SET-PW-13][NAV-SET-14] 설정으로
    });
    final canSubmit = _pwOk(_pw.text) && _match && !state.busy;

    return Scaffold(
      appBar: AppBar(title: const Text('비밀번호 변경')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          // [SET-PW-02·03] 현재 비밀번호를 묻지 않고, 그 이유를 밝힌다.
          const Text('설정에 들어오실 때 본인 확인을 마쳤으니, 새 비밀번호만 입력하시면 됩니다.',
              style: TextStyle(fontSize: 14, height: 1.5, color: AppTokens.grayPending)),
          const SizedBox(height: 20),
          LabeledField(
            label: '새 비밀번호',
            fieldKey: const Key('newpw'),
            controller: _pw,
            obscureText: _o1,
            onChanged: (_) => setState(() {}),
            suffixIcon: IconButton(
                icon: Icon(_o1 ? Icons.visibility_off : Icons.visibility, color: AppTokens.grayPending),
                onPressed: () => setState(() => _o1 = !_o1)),
          ),
          const SizedBox(height: 16),
          LabeledField(
            label: '새 비밀번호 확인',
            fieldKey: const Key('newpw-confirm'),
            controller: _pw2,
            obscureText: _o2,
            onChanged: (_) => setState(() {}),
            suffixIcon: IconButton(
                icon: Icon(_o2 ? Icons.visibility_off : Icons.visibility, color: AppTokens.grayPending),
                onPressed: () => setState(() => _o2 = !_o2)),
          ),
          const SizedBox(height: 16),
          // 비밀번호 조건 3줄 — 데모대로 옅은 딥틸 박스로 묶는다(맨바닥 나열 → 한 덩어리, Task10).
          Container(
            decoration: BoxDecoration(
              color: const Color(0x0D0B6E70), // primary 5% (bg-primary/5) — 틴트 박스라 테두리·그림자 없이 평평하게
              borderRadius: BorderRadius.circular(12),
            ),
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _cond(_pwOk(_pw.text), '8자 이상'),
              _cond(RegExp(r'[A-Za-z]').hasMatch(_pw.text) && RegExp(r'\d').hasMatch(_pw.text),
                  '영문과 숫자를 함께'),
              _cond(_match, '두 칸이 서로 같음'),
            ]),
          ),
          const SizedBox(height: 20),
          if (state.error != null) ...[
            Text(state.error!, style: const TextStyle(color: AppTokens.warn)),
            const SizedBox(height: 8),
          ],
          FilledButton(
            onPressed: canSubmit
                ? () => ref.read(settingsPasswordControllerProvider.notifier).submit(_pw.text, _pw2.text)
                : null,
            child: Text(state.busy ? '바꾸는 중…' : '비밀번호 바꾸기'), // [SET-PW-12]
          ),
        ]),
      ),
    );
  }
}
