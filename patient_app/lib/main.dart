import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'app.dart';
import 'core/env.dart';
import 'firebase_options.dart';

/// 앱이 백그라운드/종료 상태일 때 도착한 메시지 핸들러(별도 아이솔레이트).
/// 서버는 알림형(notification) 메시지를 보내므로 OS가 트레이에 자동 표시한다 — 여기선 별도 처리 없음.
/// 등록만 해두면 flutter_local_notifications·firebase_messaging이 경고 없이 동작한다.
@pragma('vm:entry-point')
Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);
  await Supabase.initialize(url: Env.supabaseUrl, publishableKey: Env.supabaseAnonKey);
  runApp(const ProviderScope(child: PatientApp()));
}
