import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/button_sizes.dart';
import '../../core/tokens.dart';
import '../../widgets/labeled_field.dart';
import 'signup_flow.dart';

const _termsVersion = '2026-08-01';

/// 비밀번호 설정 + 프로필 생성(Supabase updateUser + POST /patients). 테스트에서 Fake로 대체.
abstract class SignupProfileRepo {
  Future<void> setPassword(String pw);
  Future<void> createProfile({
    required String name,
    required String birthDate,
    required String gender,
    required bool adsAgreed,
    required String termsVersion,
  });
}

class SignupProfileController {
  final SignupProfileRepo repo;
  SignupProfileController(this.repo);

  /// AUTH-SIGNUP-07 / AUTH-PROFILE-08 — 성공이면 null, 실패면 서버 문장(버튼 위 오류).
  /// ①②(전화·인증)를 다시 시키지 않는다 — 인증은 이미 끝났고 세션이 있다.
  Future<String?> submit({
    required String password,
    required String name,
    required String birthDate,
    required String gender,
    required bool adsAgreed,
  }) async {
    try {
      await repo.setPassword(password);
      await repo.createProfile(
          name: name,
          birthDate: birthDate,
          gender: gender,
          adsAgreed: adsAgreed,
          termsVersion: _termsVersion);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }
}

bool passwordOk(String pw) =>
    pw.length >= 8 && RegExp(r'[A-Za-z]').hasMatch(pw) && RegExp(r'\d').hasMatch(pw);

class SignupProfileScreen extends StatefulWidget {
  final SignupProfileController controller;
  final bool adsAgreed; // consentProvider.ads에서 넘어온다
  final VoidCallback onDone;
  const SignupProfileScreen(
      {super.key, required this.controller, this.adsAgreed = false, required this.onDone});
  @override
  State<SignupProfileScreen> createState() => _SignupProfileScreenState();
}

class _SignupProfileScreenState extends State<SignupProfileScreen> {
  final _name = TextEditingController();
  final _pw = TextEditingController();
  final _pwConfirm = TextEditingController();
  DateTime? _birth;
  String? _gender; // AUTH-SIGNUP-06b·06d — null로 시작(미리 고르지 않는다)
  bool _obscure = true, _obscure2 = true, _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _pw.dispose();
    _pwConfirm.dispose();
    super.dispose();
  }

  bool get _canSubmit =>
      _gender != null &&
      passwordOk(_pw.text) &&
      _pw.text == _pwConfirm.text &&
      _name.text.trim().isNotEmpty &&
      _birth != null;

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final err = await widget.controller.submit(
        password: _pw.text,
        name: _name.text.trim(),
        birthDate:
            '${_birth!.year}-${_birth!.month.toString().padLeft(2, '0')}-${_birth!.day.toString().padLeft(2, '0')}',
        gender: _gender!,
        adsAgreed: widget.adsAgreed);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
    });
    if (err == null) widget.onDone(); // AUTH-SIGNUP-07: 홈으로(축하 화면 없음)
  }

  @override
  Widget build(BuildContext context) {
    final pwValid = passwordOk(_pw.text);
    final mismatch = _pwConfirm.text.isNotEmpty && _pw.text != _pwConfirm.text;
    return Scaffold(
      appBar: AppBar(title: const Text('회원가입')),
      body: Column(children: [
        const SignupProgress(step: 4),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('비밀번호와 기본정보를 입력해 주세요',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 20),
            LabeledField(
              label: '비밀번호',
              fieldKey: const Key('pw'),
              controller: _pw,
              obscureText: _obscure,
              onChanged: (_) => setState(() {}),
              suffixIcon: IconButton(
                  // AUTH-PROFILE-03: 눈 토글(기본 가림)
                  icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility,
                      color: AppTokens.grayPending),
                  onPressed: () => setState(() => _obscure = !_obscure)),
            ),
            const SizedBox(height: 16),
            // AUTH-PROFILE-03b: 확인 칸(눈을 안 눌러도 두 번 친 것이 다르면 잡는다).
            LabeledField(
              label: '비밀번호 확인',
              fieldKey: const Key('pw-confirm'),
              controller: _pwConfirm,
              obscureText: _obscure2,
              onChanged: (_) => setState(() {}),
              suffixIcon: IconButton(
                  icon: Icon(_obscure2 ? Icons.visibility_off : Icons.visibility,
                      color: AppTokens.grayPending),
                  onPressed: () => setState(() => _obscure2 = !_obscure2)),
            ),
            const SizedBox(height: 10),
            // AUTH-PROFILE-01: 조건을 미리 보여주고 충족되면 ✓.
            Row(children: [
              Text(pwValid ? '✓' : '○',
                  style: TextStyle(
                      color: pwValid ? AppTokens.primary : AppTokens.grayPending,
                      fontWeight: FontWeight.bold)),
              const SizedBox(width: 8),
              const Text('8자 이상·영문/숫자 함께',
                  style: TextStyle(color: AppTokens.grayPending, fontSize: 13)),
            ]),
            if (mismatch)
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text('비밀번호가 일치하지 않습니다',
                    style: TextStyle(color: AppTokens.warn, fontSize: 13)),
              ),
            const SizedBox(height: 16),
            LabeledField(
              label: '이름',
              fieldKey: const Key('name'),
              controller: _name,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 16),
            // AUTH-PROFILE-05: 생년월일은 날짜 선택기(자유 입력 아님).
            const Text('생년월일',
                style: TextStyle(
                    fontSize: 14, fontWeight: FontWeight.w600, color: AppTokens.onSurface)),
            const SizedBox(height: 8),
            InkWell(
              key: const Key('birth'),
              borderRadius: BorderRadius.circular(10),
              onTap: () async {
                final d = await showDatePicker(
                    context: context,
                    firstDate: DateTime(1900),
                    lastDate: DateTime.now(),
                    initialDate: DateTime(1970));
                if (d != null) setState(() => _birth = d);
              },
              child: Container(
                height: 52,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                decoration: BoxDecoration(
                  color: AppTokens.surface,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppTokens.border),
                ),
                child: Row(children: [
                  Text(
                      _birth == null
                          ? '연도. 월. 일.'
                          : '${_birth!.year}-${_birth!.month.toString().padLeft(2, '0')}-${_birth!.day.toString().padLeft(2, '0')}',
                      style: TextStyle(
                          fontSize: 16,
                          color: _birth == null ? AppTokens.grayPending : AppTokens.onSurface)),
                  const Spacer(),
                  const Icon(Icons.calendar_today_outlined,
                      size: 20, color: AppTokens.grayPending),
                ]),
              ),
            ),
            const SizedBox(height: 16),
            // AUTH-SIGNUP-06: 성별 + 왜 묻는지.
            const Row(children: [
              Text('성별',
                  style: TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w600, color: AppTokens.onSurface)),
              SizedBox(width: 6),
              Text('(문진 문항 노출에 쓰입니다)',
                  style: TextStyle(fontSize: 12, color: AppTokens.grayPending)),
            ]),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: _genderChip('남', 'M')),
              const SizedBox(width: 10),
              Expanded(child: _genderChip('여', 'F')),
            ]),
            const SizedBox(height: 24),
            if (_error != null) ...[
              Text(_error!, style: const TextStyle(color: AppTokens.warn)),
              const SizedBox(height: 8)
            ],
          ]),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          child: FilledButton(
            style: AppButtonSize.cta, // 데모 ProfileStep: size=lg h-12 text-base
            onPressed: (_canSubmit && !_busy) ? _submit : null, // AUTH-SIGNUP-06b
            child: Text(_busy ? '가입 중…' : '가입 완료'),
          ),
        ),
      ]),
    );
  }

  /// 성별 선택 — 데모의 전폭 2열 토글.
  Widget _genderChip(String label, String value) => GenderOption(
        label: label,
        selected: _gender == value,
        onTap: () => setState(() => _gender = value),
      );
}

/// 성별 토글 한 칸(데모: 각진 전폭 버튼, 선택 시 딥틸 테두리·연한 배경).
/// 별도 위젯으로 둔 이유: 테스트가 선택된 칸 수를 이 타입으로 센다(AUTH-SIGNUP-06d).
class GenderOption extends StatelessWidget {
  const GenderOption(
      {super.key, required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        height: 48,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? AppTokens.primary.withValues(alpha: 0.10) : AppTokens.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
              color: selected ? AppTokens.primary : AppTokens.border,
              width: selected ? 1.5 : 1),
        ),
        child: Text(label,
            style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: selected ? AppTokens.primary : AppTokens.onSurface)),
      ),
    );
  }
}
