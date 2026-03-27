import 'package:flutter/material.dart';

/// Consistent layout rhythm (Google-style SaaS spacing).
abstract final class AppSpacing {
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 20;
  static const double xl = 24;

  static const EdgeInsets pagePadding = EdgeInsets.symmetric(
    horizontal: xl,
    vertical: lg,
  );

  static const EdgeInsets cardPadding = EdgeInsets.all(md);
}
