import 'package:flutter/material.dart';

/// DISP-ICON-01/02/03 — 상태를 나타내는 공통 아이콘. 채움(Solid) 벡터만, 이모지 금지.
enum AppIconKind {
  blocked, // 원래 되던 것이 지금 막혔다(자물쇠)
  readonly, // 처음부터 보기만 하는 자리(눈)
}

IconData appIcon(AppIconKind kind) {
  switch (kind) {
    case AppIconKind.blocked:
      return Icons.lock;
    case AppIconKind.readonly:
      return Icons.visibility;
  }
}
