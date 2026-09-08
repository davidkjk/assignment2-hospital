/// 법률문서 매니페스트 — 서버 consent 항목키(terms/privacy/sensitive/ads)와 1:1.
/// 버전은 백엔드 consent_service.DOCUMENT_VERSIONS와 반드시 일치(test_legal_version_sync가 강제).
class LegalDoc {
  final String key;
  final String title;
  final String version;
  final String effectiveDate;
  final String assetPath;
  const LegalDoc({
    required this.key,
    required this.title,
    required this.version,
    required this.effectiveDate,
    required this.assetPath,
  });
}

const Map<String, LegalDoc> legalDocs = {
  'terms': LegalDoc(
      key: 'terms',
      title: '서비스 이용약관',
      version: 'v1.0',
      effectiveDate: '2026-09-11',
      assetPath: 'assets/legal/terms.md'),
  'privacy': LegalDoc(
      key: 'privacy',
      title: '개인정보 수집·이용 동의',
      version: 'v1.0',
      effectiveDate: '2026-09-11',
      assetPath: 'assets/legal/privacy.md'),
  'sensitive': LegalDoc(
      key: 'sensitive',
      title: '민감정보(건강정보) 처리 동의',
      version: 'v1.0',
      effectiveDate: '2026-09-11',
      assetPath: 'assets/legal/sensitive.md'),
  'ads': LegalDoc(
      key: 'ads',
      title: '광고성 정보 수신 동의',
      version: 'v1.0',
      effectiveDate: '2026-09-11',
      assetPath: 'assets/legal/ads.md'),
};
