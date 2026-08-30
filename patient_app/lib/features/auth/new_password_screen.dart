import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/api_client.dart';
import '../../core/tokens.dart';
import '../../widgets/labeled_field.dart';

/// 서버 경유 재설정(Step 3 `POST /patients/me/password-reset`)의 얇은 인터페이스.
abstract class PasswordResetRepo {
  Future<void> reset(String name, String password); // 실패 시 ApiException(서버 문장)
}

class NewPasswordController {
  final PasswordResetRepo repo;
  NewPasswordController(this.repo);

  /// AUTH-PWNEW-17 — [비밀번호 바꾸기]를 누를 때 서버가 한 번만 판정한다. 성공이면 null, 실패면 서버 문장.
  Future<String?> submit(String name, String password) async {
    try {
      await repo.reset(name, password);
      return null;
    } on ApiException catch (e) {
      return e.message; // '등록된 이름과 다릅니다' 등(AUTH-PWNEW-11)
    }
  }
}

bool _pwOk(String pw) =>
    pw.length >= 8 && RegExp(r'[A-Za-z]').hasMatch(pw) && RegExp(r'\d').hasMatch(pw);

class NewPasswordScreen extends StatefulWidget {
  final NewPasswordController controller;
  final VoidCallback onDone; // 보통 '/login'으로 이동
  const NewPasswordScreen({super.key, required this.controller, required this.onDone});
  @override
  State<NewPasswordScreen> createState() => _NewPasswordScreenState();
}

class _NewPasswordScreenState extends State<NewPasswordScreen> {
  final _name = TextEditingController();
  final _pw = TextEditingController();
  final _pw2 = TextEditingController();
  bool _o1 = true, _o2 = true, _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _pw.dispose();
    _pw2.dispose();
    super.dispose();
  }

  bool get _match => _pw.text.isNotEmpty && _pw.text == _pw2.text;

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final err = await widget.controller.submit(_name.text, _pw.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
    });
    if (err == null) widget.onDone(); // AUTH-PWNEW-04: 로그인 화면으로
  }

  Widget _cond(bool ok, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 2),
        child: Row(children: [
          Text(ok ? '✓' : '·',
              style: TextStyle(
                  color: ok ? AppTokens.primary : AppTokens.grayPending,
                  fontWeight: FontWeight.bold)),
          const SizedBox(width: 8),
          Text(text, style: const TextStyle(color: AppTokens.grayPending, fontSize: 13)),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final canSubmit = _name.text.trim().isNotEmpty && _pwOk(_pw.text) && _match;
    return Scaffold(
      appBar: AppBar(title: const Text('새 비밀번호')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('새 비밀번호를 정해 주세요',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 20),
        // AUTH-PWNEW-08: 이름 칸을 새 비밀번호 '위에' 둔다.
        LabeledField(
          label: '등록하신 이름',
          fieldKey: const Key('name'),
          controller: _name,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 16),
        LabeledField(
          label: '새 비밀번호',
          fieldKey: const Key('newpw'),
          controller: _pw,
          obscureText: _o1,
          onChanged: (_) => setState(() {}), // 화면 조건 표시용 — 서버는 부르지 않는다(AUTH-PWNEW-17)
          suffixIcon: IconButton(
              icon: Icon(_o1 ? Icons.visibility_off : Icons.visibility,
                  color: AppTokens.grayPending),
              onPressed: () => setState(() => _o1 = !_o1)),
        ),
        const SizedBox(height: 16),
        LabeledField(
          label: '한 번 더 입력',
          fieldKey: const Key('newpw-confirm'),
          controller: _pw2,
          obscureText: _o2,
          onChanged: (_) => setState(() {}),
          suffixIcon: IconButton(
              icon: Icon(_o2 ? Icons.visibility_off : Icons.visibility,
                  color: AppTokens.grayPending),
              onPressed: () => setState(() => _o2 = !_o2)),
        ),
        const SizedBox(height: 14),
        // AUTH-PWNEW-02·03: 조건 — 앞 셋은 ✓(차단), 마지막은 ·(권고).
        _cond(_pwOk(_pw.text), '8자 이상'),
        _cond(RegExp(r'[A-Za-z]').hasMatch(_pw.text) && RegExp(r'\d').hasMatch(_pw.text),
            '영문과 숫자를 함께'),
        _cond(_match, '두 칸이 서로 같음'),
        // 권고(차단 아님) — '· '를 같은 위젯에 붙여 둔다(테스트가 「· 전화번호…」를 한 위젯으로 찾는다).
        const Padding(
          padding: EdgeInsets.only(top: 2),
          child: Text('· 전화번호·생년월일은 피해주세요',
              style: TextStyle(color: AppTokens.grayPending, fontSize: 13)),
        ),
        const SizedBox(height: 20),
        if (_error != null) ...[
          Text(_error!, style: const TextStyle(color: AppTokens.warn)),
          const SizedBox(height: 8)
        ],
        FilledButton(
          onPressed: (canSubmit && !_busy) ? _submit : null,
          child: Text(_busy ? '바꾸는 중…' : '비밀번호 바꾸기'),
        ),
        const SizedBox(height: 12),
        // AUTH-PWNEW-12: 오타·개명으로 진짜 환자가 잠기지 않게 병원 안내 출구.
        TextButton(
            onPressed: () => context.go('/phone-change'),
            child: const Text('이름이 기억나지 않거나 맞지 않나요? ›')),
        // AUTH-PWNEW-06: 기억난 사람이 굳이 바꾸지 않아도 되게.
        TextButton(
            onPressed: () => context.go('/login'),
            child: const Text('비밀번호가 기억나셨나요? › 로그인하기')),
      ]),
      ),
    );
  }
}
