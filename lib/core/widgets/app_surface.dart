import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Soft elevated surface (cards, panels) — prefer over raw [Card] defaults.
class AppSurfaces {
  AppSurfaces._();

  static List<BoxShadow> softShadow = [
    BoxShadow(
      color: Colors.black.withValues(alpha: 0.05),
      blurRadius: 1,
      offset: const Offset(0, 1),
    ),
    BoxShadow(
      color: Colors.black.withValues(alpha: 0.06),
      blurRadius: 8,
      offset: const Offset(0, 4),
    ),
    BoxShadow(
      color: Colors.black.withValues(alpha: 0.04),
      blurRadius: 20,
      offset: const Offset(0, 10),
    ),
  ];

  static BoxDecoration card({Color? color, double radius = 18}) {
    return BoxDecoration(
      color: color ?? AppColors.surface,
      borderRadius: BorderRadius.circular(radius),
      boxShadow: softShadow,
    );
  }
}
