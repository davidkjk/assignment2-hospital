import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/legal/legal_documents.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('[LEGAL-DOC] 4개 동의문서가 서버 항목키와 1:1이고 v1.0/2026-09-11', () {
    expect(legalDocs.keys.toSet(), {'terms', 'privacy', 'sensitive', 'ads'});
    for (final d in legalDocs.values) {
      expect(d.version, 'v1.0');
      expect(d.effectiveDate, '2026-09-11');
    }
  });

  test('[LEGAL-DOC] 각 assetPath가 실제로 로드된다', () async {
    for (final d in legalDocs.values) {
      final body = await rootBundle.loadString(d.assetPath);
      expect(body.trim(), isNotEmpty);
    }
  });
}
