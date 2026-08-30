import 'package:flutter/material.dart';
import 'core/router.dart';
import 'core/theme.dart';

class PatientApp extends StatelessWidget {
  const PatientApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: '병원 앱',
      theme: AppTheme.theme,
      routerConfig: appRouter,
    );
  }
}
