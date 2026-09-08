import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import '../../widgets/patient_app_bar.dart';
import '../../core/tokens.dart';
import 'legal_documents.dart';
import 'legal_markdown.dart';

/// 법률문서 전문 뷰어(CONSENT-DOC-*). 동의 체크와 무관 — 열람은 닫기만 한다("열람 ≠ 동의").
class LegalDocumentView extends StatelessWidget {
  const LegalDocumentView({super.key, required this.doc});
  final LegalDoc doc;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: PatientAppBar(title: doc.title),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
            child: Text('${doc.version} · ${doc.effectiveDate} 시행',
                style: const TextStyle(fontSize: 13, color: AppTokens.grayPending)),
          ),
          const Divider(height: 1),
          Expanded(
            child: FutureBuilder<String>(
              future: rootBundle.loadString(doc.assetPath),
              builder: (ctx, snap) {
                if (!snap.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }
                return SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
                  child: buildLegalMarkdown(snap.data!),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
