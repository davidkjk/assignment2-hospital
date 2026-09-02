import 'package:flutter/material.dart';
import '../../core/tokens.dart';
import '../../widgets/action_button.dart';
import '../../widgets/field_error.dart';
import 'auth_repo.dart';
import 'signup_phone_screen.dart'; // PhoneSendResult · validatePhone(재사용)

class PasswordFindController {
  PasswordFindController(this.repo);
  final AuthRepo repo;

  /// AUTH-PWFIND-03·04·05 — createUser:false로 최선 발송하고, 실패해도(미가입) 삼켜서
  /// 가입 여부를 드러내지 않고 그대로 인증 화면으로 넘어간다.
  Future<PhoneSendResult> submit(String phone, DateTime now) async {
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    try {
      await repo.sendOtp(digits, createUser: false);
    } catch (_) {
      // 미가입 번호 등 — 알리지 않는다(개인정보 열거 방지).
    }
    return PhoneSendResult.sent;
  }
}

class PasswordFindScreen extends StatefulWidget {
  const PasswordFindScreen({super.key, required this.controller, required this.onSent});
  final PasswordFindController controller;
  final void Function(String phone) onSent; // 인증 화면으로(번호 전달)
  @override
  State<PasswordFindScreen> createState() => _PasswordFindScreenState();
}

class _PasswordFindScreenState extends State<PasswordFindScreen> {
  final _form = FieldErrorController();
  final _phone = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.validateAll()) return;
    setState(() => _busy = true);
    final digits = _phone.text.replaceAll(RegExp(r'\D'), '');
    await widget.controller.submit(digits, DateTime.now());
    if (!mounted) return;
    setState(() => _busy = false);
    widget.onSent(digits); // NAV-AUTH-13: 미가입도 그대로 진행
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('비밀번호 찾기')),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 20, 20, 16), children: [
        const Text('비밀번호를 찾을 전화번호를 입력해 주세요',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        const Text('가입하신 전화번호로 인증번호를 보내드립니다',
            style: TextStyle(color: AppTokens.grayPending, fontSize: 14)),
        const SizedBox(height: 28),
        FieldTextInput(
            label: '전화번호', controller: _phone, form: _form, validate: validatePhone),
        const SizedBox(height: 28),
        ActionButton(
            label: '인증번호 받기', busyLabel: '인증번호 보내는 중…', busy: _busy, onPressed: _submit),
      ]),
    );
  }
}
