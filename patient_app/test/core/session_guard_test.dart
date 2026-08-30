import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;
import 'package:hospital_patient_app/core/connectivity.dart';
import 'package:hospital_patient_app/core/providers.dart';
import 'package:hospital_patient_app/core/session_guard.dart';
import 'package:hospital_patient_app/features/auth/auth_state.dart';

class _MockSupabase extends Mock implements SupabaseClient {}

class _MockAuth extends Mock implements GoTrueClient {}

ProviderContainer _container({
  required bool online,
  required AuthStatus base,
  SupabaseClient? supabase,
  bool offlineExpired = false,
}) {
  final c = ProviderContainer(overrides: [
    connectivityProvider.overrideWith((ref) => Stream.value(online)),
    authStateChangesProvider.overrideWith((ref) => Stream.value(AuthState(status: base))),
    if (supabase != null) supabaseClientProvider.overrideWithValue(supabase),
  ]);
  if (offlineExpired) c.read(expiredOfflineProvider.notifier).state = true;
  return c;
}

// handleUnauthorized(Ref)에 넘길 Ref를 컨테이너에서 캡처한다(ProviderContainer 자체는 Ref가 아니다).
Ref _refOf(ProviderContainer c) {
  late Ref captured;
  c.read(Provider<int>((ref) {
    captured = ref;
    return 0;
  }));
  return captured;
}

Future<void> _warmUp(ProviderContainer c) async {
  await c.read(connectivityProvider.future);
  await c.read(authStateChangesProvider.future);
}

void main() {
  test('effectiveAuth: signedIn base → signedIn', () async {
    final c = _container(online: true, base: AuthStatus.signedIn);
    await _warmUp(c);
    expect(c.read(effectiveAuthProvider), AuthStatus.signedIn);
  });

  test('effectiveAuth: 오프라인 + 만료플래그 → expiredOffline (갭 #38·OFF-AUTH-01)', () async {
    final c = _container(online: false, base: AuthStatus.signedOut, offlineExpired: true);
    await _warmUp(c);
    expect(c.read(effectiveAuthProvider), AuthStatus.expiredOffline);
  });

  test('effectiveAuth: 온라인 로그아웃 → signedOut (NAV-GLOBAL-03)', () async {
    final c = _container(online: true, base: AuthStatus.signedOut);
    await _warmUp(c);
    expect(c.read(effectiveAuthProvider), AuthStatus.signedOut);
  });

  test('handleUnauthorized: 온라인이면 signOut 호출 + 플래그 해제 (NAV-GLOBAL-03)', () async {
    final supabase = _MockSupabase();
    final auth = _MockAuth();
    when(() => supabase.auth).thenReturn(auth);
    when(() => auth.signOut()).thenAnswer((_) async {});
    final c = _container(online: true, base: AuthStatus.signedIn, supabase: supabase);
    await _warmUp(c);

    await handleUnauthorized(_refOf(c));

    verify(() => auth.signOut()).called(1);
    expect(c.read(expiredOfflineProvider), isFalse);
  });

  test('handleUnauthorized: 오프라인이면 expiredOffline=true, signOut 안 함 (갭 #38)', () async {
    final supabase = _MockSupabase();
    final auth = _MockAuth();
    when(() => supabase.auth).thenReturn(auth);
    when(() => auth.signOut()).thenAnswer((_) async {});
    final c = _container(online: false, base: AuthStatus.signedOut, supabase: supabase);
    await _warmUp(c);

    await handleUnauthorized(_refOf(c));

    verifyNever(() => auth.signOut());
    expect(c.read(expiredOfflineProvider), isTrue);
  });
}
