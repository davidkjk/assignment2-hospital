import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import '../../core/sensitive_reauth.dart';
import '../../core/tokens.dart';
import '../../widgets/action_button.dart';
import '../../widgets/labeled_field.dart';
import 'auth_repo.dart';

class ReauthController {
  ReauthController(this.repo);
  final AuthRepo repo;
  Future<String?> submit(String password) => repo.reauthenticate(password); // AUTH-REAUTH-01
}

class ReauthScreen extends StatefulWidget {
  const ReauthScreen({
    super.key,
    required this.controller,
    required this.guard,
    required this.onPassed,
    required this.onForgot,
    required this.onCancel,
  });
  final ReauthController controller;
  final SensitiveReauthGuard guard;
  final VoidCallback onPassed; // 원래 가려던 민감 화면으로
  final VoidCallback onForgot; // 비밀번호 찾기(막다른 길 방지)
  final VoidCallback onCancel; // ⭐ 그냥 나가기 → 홈. 이 화면은 redirect로 들어와 탭바·뒤로가기가
  // 없다(셸 밖). [확인]·[비밀번호 찾기]만으론 「설정을 잘못 눌렀다」·「지금은 안 할래」가 갇힌다.
  @override
  State<ReauthScreen> createState() => _ReauthScreenState();
}

class _ReauthScreenState extends State<ReauthScreen> {
  final _pw = TextEditingController();
  bool _obscure = true, _busy = false;
  String? _error;

  @override
  void dispose() {
    _pw.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final err = await widget.controller.submit(_pw.text);
    if (!mounted) return;
    if (err == null) {
      widget.guard.markPassed(); // AUTH-REAUTH-04: 통과 시각 기록 → 5분간 다시 안 묻는다
      widget.onPassed();
      return;
    }
    setState(() {
      _busy = false;
      _error = err;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        // 셸 밖·redirect 진입이라 탭바도 뒤로가기도 없다 → 막다른 길 방지로 나가는 문(닫기 → 홈)을 둔다.
        // 데모 ScreenHeader처럼 아이콘↔제목을 촘촘히(gap-2≈8) 붙인다: Material 기본(leading 56 + titleSpacing 16)은
        // X와 제목이 너무 벌어져 보인다(2026-09-02 사용자 지적) → leadingWidth를 클릭타깃(44)로, titleSpacing 0.
        leadingWidth: 44,
        titleSpacing: 0,
        leading: IconButton(
            icon: const Icon(AppIcons.close),
            tooltip: '닫기',
            onPressed: widget.onCancel),
        title: const Text('본인 확인'),
      ),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 20, 20, 16), children: [
        const Text('민감한 정보를 열기 전에\n비밀번호를 한 번 더 확인합니다',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, height: 1.4)),
        const SizedBox(height: 24),
        LabeledField(
          label: '비밀번호',
          fieldKey: const Key('reauth-password'),
          controller: _pw,
          obscureText: _obscure, // AUTH-REAUTH-01·03
          suffixIcon: IconButton(
              icon: Icon(_obscure ? AppIcons.visibility_off : AppIcons.visibility,
                  color: AppTokens.grayPending),
              onPressed: () => setState(() => _obscure = !_obscure)),
        ),
        const SizedBox(height: 24),
        if (_error != null) ...[
          Text(_error!, style: const TextStyle(color: AppTokens.warn)),
          const SizedBox(height: 8)
        ],
        ActionButton(label: '확인', busyLabel: '확인 중…', busy: _busy, onPressed: _submit),
        const SizedBox(height: 12),
        // AUTH-REAUTH-02: 막다른 길 방지 — 이 화면에도 둔다.
        Center(
            child: TextButton(
                onPressed: widget.onForgot, child: const Text('비밀번호를 잊으셨나요?'))),
      ]),
    );
  }
}
