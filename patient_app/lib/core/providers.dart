import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState; // 우리 AuthState와 이름 충돌
import '../features/auth/auth_state.dart';
import 'api_client.dart';
import 'env.dart';
import 'session_guard.dart';

final supabaseClientProvider = Provider<SupabaseClient>((ref) => Supabase.instance.client);

final apiClientProvider = Provider<ApiClient>((ref) {
  final supabase = ref.watch(supabaseClientProvider);
  return ApiClient(
    baseUrl: Env.apiBaseUrl,
    tokenProvider: () async => supabase.auth.currentSession?.accessToken,
    // 401 → session_guard가 오프라인/온라인을 갈라 로그아웃 or expiredOffline 처리(갭 #38).
    onUnauthorized: () => handleUnauthorized(ref),
  );
});

final authStateChangesProvider = StreamProvider<AuthState>((ref) {
  final supabase = ref.watch(supabaseClientProvider);
  return supabase.auth.onAuthStateChange.map((event) {
    final session = event.session;
    if (session == null) return const AuthState(status: AuthStatus.signedOut);
    return AuthState(status: AuthStatus.signedIn, userId: session.user.id);
  });
});
