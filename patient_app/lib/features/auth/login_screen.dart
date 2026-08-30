import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/tokens.dart';
import '../../widgets/action_button.dart';
import 'auth_repo.dart';

/// AUTH-LOGIN-02 — 사용자는 숫자만 치고 앱이 010-XXXX-XXXX로 하이픈을 넣는다.
class PhoneHyphenFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue _, TextEditingValue next) {
    final d = next.text.replaceAll(RegExp(r'\D'), '');
    final b = StringBuffer();
    for (var i = 0; i < d.length && i < 11; i++) {
      if (i == 3 || i == 7) b.write('-');
      b.write(d[i]);
    }
    final s = b.toString();
    return TextEditingValue(text: s, selection: TextSelection.collapsed(offset: s.length));
  }
}

class LoginController {
  LoginController(this.repo);
  final AuthRepo repo;

  /// null=성공, 아니면 화면에 붙일 한 문장(AUTH-LOGIN-05). 숫자만 뽑아 넘긴다.
  Future<String?> submit(String phone, String password) =>
      repo.signInWithPassword(phone.replaceAll(RegExp(r'\D'), ''), password);
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.controller,
    required this.onSuccess,
    required this.onForgot,
    required this.onPhoneChanged,
    this.prefillPhone, // NAV-AUTH-06: 갈림길에서 넘어오면 번호가 채워진 채로 온다
  });
  final LoginController controller;
  final VoidCallback onSuccess;
  final VoidCallback onForgot;
  final VoidCallback onPhoneChanged;
  final String? prefillPhone;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late final TextEditingController _phone = TextEditingController(
      text: widget.prefillPhone == null ? '' : _hyphen(widget.prefillPhone!));
  final _pw = TextEditingController();
  bool _obscure = true, _busy = false;
  String? _error;

  static String _hyphen(String d) => PhoneHyphenFormatter()
      .formatEditUpdate(TextEditingValue.empty, TextEditingValue(text: d))
      .text;

  @override
  void dispose() {
    _phone.dispose();
    _pw.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final err = await widget.controller.submit(_phone.text, _pw.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
    });
    if (err == null) widget.onSuccess(); // AUTH-LOGIN-09
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('로그인')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(
          key: const Key('login-phone'),
          controller: _phone,
          keyboardType: TextInputType.phone, // AUTH-LOGIN-02
          inputFormatters: [PhoneHyphenFormatter()],
          style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]), // 고정폭 숫자
          decoration: const InputDecoration(labelText: '전화번호'),
        ),
        TextField(
          key: const Key('login-password'),
          controller: _pw,
          obscureText: _obscure, // AUTH-LOGIN-03
          decoration: InputDecoration(
            labelText: '비밀번호',
            suffixIcon: IconButton(
                icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
                onPressed: () => setState(() => _obscure = !_obscure)),
          ),
        ),
        const SizedBox(height: 16),
        // AUTH-LOGIN-05: 실패 문구는 버튼 위 붙박이(ERR-POS-01).
        if (_error != null) ...[
          Text(_error!, style: const TextStyle(color: AppTokens.warn)),
          const SizedBox(height: 8)
        ],
        ActionButton(label: '로그인', busyLabel: '로그인 중…', busy: _busy, onPressed: _submit),
        const SizedBox(height: 12),
        // AUTH-LOGIN-07: 버튼 아래 가운데.
        Center(
            child: TextButton(
                onPressed: widget.onForgot, child: const Text('비밀번호를 잊으셨나요?'))),
        // AUTH-LOGIN-08: 그 아래 한 줄 더.
        Center(
            child: TextButton(
                onPressed: widget.onPhoneChanged,
                child: const Text('전화번호가 바뀌어 로그인할 수 없나요? ›'))),
      ]),
    );
  }
}
