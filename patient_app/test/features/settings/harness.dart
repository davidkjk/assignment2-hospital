import 'dart:async';

import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/features/settings/hospital_hours_format.dart';
import 'package:hospital_patient_app/features/settings/hospital_info_repository.dart';
import 'package:hospital_patient_app/features/settings/notification_prefs_repository.dart';

/// 6토글 키(화면 _groups와 일치 — 서버 TOGGLE_GROUPS의 그룹 키).
const kToggleKeys = [
  'appt_change', 'appt_status', 'appt_reminder', 'questionnaire', 'visit_note', 'support_reply',
];

/// 6토글 전부 켜짐(서버 기본).
final Map<String, bool> allOn = {for (final g in kToggleKeys) g: true};

class FakeNotificationPrefsRepo implements NotificationPrefsRepository {
  FakeNotificationPrefsRepo(this.prefs);
  Map<String, bool> prefs;
  Map<String, dynamic>? lastPatch;
  bool failNextPatch = false;
  Completer<void>? _hold;

  void hold() => _hold = Completer<void>();
  void release() {
    _hold?.complete();
    _hold = null;
  }

  @override
  Future<Map<String, bool>> getPrefs() async => Map.of(prefs);

  @override
  Future<Map<String, bool>> setPref(String group, bool enabled) async {
    lastPatch = {'group': group, 'enabled': enabled};
    if (_hold != null) await _hold!.future;
    if (failNextPatch) {
      failNextPatch = false;
      throw ApiException('저장 실패');
    }
    prefs = {...prefs, group: enabled}; // 서버는 갱신된 6키를 준다
    return Map.of(prefs);
  }
}

class FakeLinkLauncher implements LinkLauncher {
  FakeLinkLauncher({this.canLaunch = true});
  bool canLaunch;
  final List<String> launched = [];

  @override
  Future<bool> open(Uri uri) async {
    if (!canLaunch) return false;
    launched.add(uri.toString());
    return true;
  }
}

HospitalHours sampleHours() => HospitalHours(weekdays: [
      for (var wd = 0; wd <= 4; wd++)
        Day(wd, open: '09:00', close: '18:00', lunchStart: '12:30', lunchEnd: '14:00'),
      const Day(5, open: '09:00', close: '13:00'),
      const Day(6, isClosed: true),
    ], closures: [
      const Closure('2026-08-21', '창립기념일'),
    ]);
