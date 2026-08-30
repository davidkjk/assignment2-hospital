import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/phone_cooldown.dart';
import '../../core/tokens.dart';
import '../../widgets/cooldown_button.dart';
import '../../widgets/inline_error.dart';

enum OtpPurpose { signup, passwordFind, familyLink }

String _fmtPhone(String p) =>
    '${p.substring(0, 3)}-${p.substring(3, 7)}-${p.substring(7)}'; // 010-1111-5678
String _maskPhone(String p) =>
    '${p.substring(0, 3)}-****-${p.substring(7)}'; // AUTH-OTP-06

const _afterHint = {
  OtpPurpose.signup: '인증되면 기본정보 입력으로 넘어갑니다',
  OtpPurpose.passwordFind: '인증되면 새 비밀번호를 정하는 화면으로 넘어갑니다',
  OtpPurpose.familyLink: '인증되면 가족으로 연결됩니다',
};

class OtpScreen extends StatefulWidget {
  final String phone;
  final OtpPurpose purpose;
  final int validitySeconds; // AUTH-OTP-03 기본 300(5분). 테스트에서 짧게 준다.
  final PhoneCooldownStore cooldown;
  final Future<void> Function() onResend;
  final Future<String?> Function(String code) onVerify; // null=성공, 아니면 서버 오류 문구
  final VoidCallback onSuccess;

  const OtpScreen({
    super.key,
    required this.phone,
    required this.purpose,
    required this.cooldown,
    required this.onResend,
    required this.onVerify,
    required this.onSuccess,
    this.validitySeconds = 300,
  });

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  late final List<TextEditingController> _boxes;
  late final List<FocusNode> _nodes;
  Timer? _timer;
  late int _left;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _boxes = List.generate(6, (_) => TextEditingController());
    _nodes = List.generate(6, (_) => FocusNode());
    _left = widget.validitySeconds;
    _timer = Timer.periodic(const Duration(seconds: 1), (tm) {
      setState(() => _left = _left > 0 ? _left - 1 : 0);
      if (_left <= 0) tm.cancel(); // AUTH-OTP-02: 0이 되면 입력칸을 접고 재발송만 남긴다
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    for (final c in _boxes) {
      c.dispose();
    }
    for (final n in _nodes) {
      n.dispose();
    }
    super.dispose();
  }

  String get _code => _boxes.map((c) => c.text).join();

  Future<void> _verify() async {
    setState(() => _busy = true);
    final err = await widget.onVerify(_code);
    if (!mounted) return;
    if (err == null) {
      setState(() => _busy = false);
      widget.onSuccess();
      return;
    }
    // AUTH-OTP-09: 서버 문장을 버튼 위에 붙이고(ERR-MSG-01), 칸을 비우고 첫 칸에 커서.
    setState(() {
      _error = err;
      _busy = false;
      for (final c in _boxes) {
        c.clear();
      }
    });
    _nodes.first.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final shown =
        widget.purpose == OtpPurpose.signup ? _fmtPhone(widget.phone) : _maskPhone(widget.phone);
    final mm = _left ~/ 60, ss = _left % 60;
    return Scaffold(
      appBar: AppBar(title: const Text('인증번호 입력')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text('$shown 로 보냈습니다'), // AUTH-OTP-05·06
        const Text('연달아 누르면 마지막 문자만 유효합니다',
            style: TextStyle(fontSize: 13)), // AUTH-OTP-08
        Text(_afterHint[widget.purpose]!, style: const TextStyle(fontSize: 13)), // AUTH-OTP-10
        const SizedBox(height: 16),
        if (_left > 0) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: List.generate(
                6,
                (i) => SizedBox(
                      width: 44,
                      child: TextField(
                        controller: _boxes[i],
                        focusNode: _nodes[i],
                        keyboardType: TextInputType.number, // AUTH-OTP-01
                        maxLength: 1,
                        textAlign: TextAlign.center,
                        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                        decoration: const InputDecoration(counterText: ''),
                        onChanged: (v) {
                          if (v.isNotEmpty && i < 5) _nodes[i + 1].requestFocus();
                        },
                      ),
                    )),
          ),
          const SizedBox(height: 8),
          // AUTH-OTP-02: 남은 시간(주의색). 0이 되면 이 블록 자체가 사라진다.
          Text('남은 시간 $mm:${ss.toString().padLeft(2, '0')}',
              style: const TextStyle(color: AppTokens.warn)),
          const SizedBox(height: 16),
          if (_error != null) InlineError(_error), // AUTH-OTP-09(버튼 위 붙박이)
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppTokens.primary),
            onPressed: _busy ? null : _verify,
            child: Text(_busy ? '확인 중…' : '확인'),
          ),
        ],
        const SizedBox(height: 12),
        // AUTH-OTP-07: 재발송은 번호 기준 쿨다운(Task 12 CooldownButton).
        CooldownButton(
          phone: widget.phone,
          label: '인증번호 다시 받기',
          store: widget.cooldown,
          onSend: () async {
            await widget.onResend();
            return null;
          },
        ),
        // AUTH-OTP-11: 가족 연결만 막다른 길 링크.
        if (widget.purpose == OtpPurpose.familyLink)
          TextButton(onPressed: () {}, child: const Text('휴대폰이 없는 가족인가요?')),
        // AUTH-PWFIND-06 / NAV-AUTH-16: 비밀번호 찾기는 「문자가 오지 않나요?」 → 번호 변경 안내로 push(겹침).
        if (widget.purpose == OtpPurpose.passwordFind)
          TextButton(
              onPressed: () => Navigator.of(context).pushNamed('/phone-change'),
              child: const Text('문자가 오지 않나요?')),
      ]),
    );
  }
}
