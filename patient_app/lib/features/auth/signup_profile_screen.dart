import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/tokens.dart';

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
    return Scaffold(
      appBar: AppBar(title: const Text('기본정보 입력')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: '이름'),
            onChanged: (_) => setState(() {})),
        const SizedBox(height: 12),
        // AUTH-PROFILE-05: 생년월일은 날짜 선택기(자유 입력 아님).
        InkWell(
          key: const Key('birth'),
          onTap: () async {
            final d = await showDatePicker(
                context: context,
                firstDate: DateTime(1900),
                lastDate: DateTime.now(),
                initialDate: DateTime(1970));
            if (d != null) setState(() => _birth = d);
          },
          child: InputDecorator(
            decoration: const InputDecoration(labelText: '생년월일'),
            child: Text(_birth == null
                ? '날짜 선택'
                : '${_birth!.year}-${_birth!.month}-${_birth!.day}'),
          ),
        ),
        const SizedBox(height: 12),
        // AUTH-SIGNUP-06: 성별 + 왜 묻는지.
        const Text('성별'),
        const Text('(문진 문항 노출에 쓰입니다)',
            style: TextStyle(fontSize: 12, color: AppTokens.grayPending)),
        Row(children: [
          ChoiceChip(
              label: const Text('남'),
              selected: _gender == 'M',
              onSelected: (_) => setState(() => _gender = 'M')),
          const SizedBox(width: 8),
          ChoiceChip(
              label: const Text('여'),
              selected: _gender == 'F',
              onSelected: (_) => setState(() => _gender = 'F')),
        ]),
        const SizedBox(height: 16),
        // AUTH-PROFILE-01: 조건을 미리 보여주고 충족되면 ✓.
        Text('${passwordOk(_pw.text) ? '✓' : '·'} 8자 이상, 영문·숫자 함께'),
        TextField(
          key: const Key('pw'),
          controller: _pw,
          obscureText: _obscure,
          decoration: InputDecoration(
            labelText: '비밀번호',
            suffixIcon: IconButton(
                // AUTH-PROFILE-03: 눈 토글(기본 가림)
                icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
                onPressed: () => setState(() => _obscure = !_obscure)),
          ),
          onChanged: (_) => setState(() {}),
        ),
        // AUTH-PROFILE-03b: 확인 칸(눈을 안 눌러도 두 번 친 것이 다르면 잡는다).
        TextField(
          key: const Key('pw-confirm'),
          controller: _pwConfirm,
          obscureText: _obscure2,
          decoration: InputDecoration(
            labelText: '비밀번호 확인',
            suffixIcon: IconButton(
                icon: Icon(_obscure2 ? Icons.visibility_off : Icons.visibility),
                onPressed: () => setState(() => _obscure2 = !_obscure2)),
          ),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 24),
        if (_error != null) ...[
          Text(_error!, style: const TextStyle(color: AppTokens.warn)),
          const SizedBox(height: 8)
        ],
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: AppTokens.primary),
          onPressed: (_canSubmit && !_busy) ? _submit : null, // AUTH-SIGNUP-06b
          child: Text(_busy ? '가입 중…' : '가입 완료'),
        ),
      ]),
    );
  }
}
