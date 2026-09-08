import re
from pathlib import Path

from app.services import consent_service


def test_app_manifest_versions_match_backend():
    # 앱 legal_documents.dart의 key:version 이 백엔드 DOCUMENT_VERSIONS와 정확히 일치(드리프트 방지).
    dart = (Path(__file__).resolve().parents[2]
            / 'patient_app/lib/features/legal/legal_documents.dart').read_text(encoding='utf-8')
    # LegalDoc(key: 'terms', ... version: 'v1.0', ...) 블록마다 key·version 추출
    pairs = dict(re.findall(r"key:\s*'(\w+)',.*?version:\s*'([^']+)'", dart, re.DOTALL))
    assert pairs == consent_service.DOCUMENT_VERSIONS, (
        f"앱 매니페스트({pairs})와 서버 DOCUMENT_VERSIONS"
        f"({consent_service.DOCUMENT_VERSIONS})가 어긋납니다")
