import 'package:flutter/material.dart';
import '../../core/sensitive_reauth.dart';
import '../../core/tokens.dart';
import '../../widgets/action_button.dart';
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
  });
  final ReauthController controller;
  final SensitiveReauthGuard guard;
  final VoidCallback onPassed; // 원래 가려던 민감 화면으로
  final VoidCallback onForgot; // 비밀번호 찾기(막다른 길 방지)
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
      appBar: AppBar(title: const Text('본인 확인')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('민감한 정보를 열기 전에 비밀번호를 한 번 더 확인합니다'),
        const SizedBox(height: 16),
        TextField(
          key: const Key('reauth-password'),
          controller: _pw,
          obscureText: _obscure, // AUTH-REAUTH-01·03
          decoration: InputDecoration(
            labelText: '비밀번호',
            suffixIcon: IconButton(
                icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
                onPressed: () => setState(() => _obscure = !_obscure)),
          ),
        ),
        const SizedBox(height: 16),
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
