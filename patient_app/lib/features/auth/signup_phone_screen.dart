import 'package:flutter/material.dart';
import '../../widgets/patient_app_bar.dart';
import 'package:go_router/go_router.dart';
import '../../core/phone_cooldown.dart';
import '../../core/button_sizes.dart';
import '../../core/tokens.dart';
import '../../widgets/action_button.dart';
import '../../widgets/field_error.dart';
import 'signup_flow.dart';

/// Supabase Auth phone OTP 발송의 얇은 인터페이스(테스트에서 Fake로 대체).
abstract class AuthOtpSender {
  Future<void> sendSignupOtp(String phone); // supabase.auth.signInWithOtp(phone, shouldCreateUser: true)
}

enum PhoneSendResult { sent, alreadySent }

class SignupPhoneController {
  final AuthOtpSender sender;
  final PhoneCooldownStore cooldown;
  SignupPhoneController(this.sender, this.cooldown);

  /// AUTH-PHONE-03·04 — 쿨다운이 남았으면 새로 보내지 않고(BTN-COOL-07) 그대로 ②로,
  /// 아니면 발송하고 번호에 쿨다운을 건다.
  Future<PhoneSendResult> submit(String phone, DateTime now) async {
    if (cooldown.remainingSeconds(phone, now) > 0) return PhoneSendResult.alreadySent;
    await sender.sendSignupOtp(phone);
    await cooldown.start(phone, now);
    return PhoneSendResult.sent;
  }
}

String? validatePhone(String v) {
  final digits = v.replaceAll(RegExp(r'\D'), '');
  if (!RegExp(r'^010\d{8}$').hasMatch(digits)) return '전화번호를 정확히 입력해주세요';
  return null;
}

class SignupPhoneScreen extends StatefulWidget {
  final SignupPhoneController controller;
  const SignupPhoneScreen({super.key, required this.controller});
  @override
  State<SignupPhoneScreen> createState() => _SignupPhoneScreenState();
}

class _SignupPhoneScreenState extends State<SignupPhoneScreen> {
  final _form = FieldErrorController();
  final _phone = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.validateAll()) return; // AUTH-PHONE-02: 버튼 누를 때 전체 검사(ERR-FLD-04)
    setState(() => _busy = true);
    final digits = _phone.text.replaceAll(RegExp(r'\D'), '');
    final r = await widget.controller.submit(digits, DateTime.now());
    if (!mounted) return;
    setState(() => _busy = false);
    // AUTH-PHONE-04: 쿨다운이 남았으면 「방금 인증번호를 보내드렸습니다」와 함께 ②로.
    context.go('/signup/otp',
        extra: {'phone': digits, 'alreadySent': r == PhoneSendResult.alreadySent});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const PatientAppBar(title: '회원가입'),
      body: Column(children: [
        const SignupProgress(step: 2),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('전화번호를 입력해 주세요',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              // AUTH-PHONE-01: 번호를 정확히 넣을 이유를 준다.
              const Text('문자로 인증번호를 보내드립니다',
                  style: TextStyle(color: AppTokens.grayPending, fontSize: 14, height: 1.5)),
              const Text('병원에서 연락드릴 때도 이 번호를 씁니다',
                  style: TextStyle(color: AppTokens.grayPending, fontSize: 14, height: 1.5)),
              const SizedBox(height: 28),
              FieldTextInput(
                  label: '전화번호', controller: _phone, form: _form, validate: validatePhone),
            ]),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          child: ActionButton(
            label: '인증번호 받기',
            busyLabel: '인증번호 보내는 중…', // AUTH-PHONE-03 = BTN-BUSY-01
            style: AppButtonSize.cta, // 데모 PhoneStep: size=lg h-12 text-base
            busy: _busy,
            onPressed: _submit,
          ),
        ),
      ]),
    );
  }
}
