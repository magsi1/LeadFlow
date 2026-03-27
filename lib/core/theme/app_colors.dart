import 'package:flutter/material.dart';

/// LeadFlow SaaS palette — use everywhere for badges, charts, and accents.
abstract final class AppColors {
  static const Color primary = Color(0xFF6366F1);
  static const Color primaryLight = Color(0xFFE0E7FF);
  static const Color primaryDark = Color(0xFF4F46E5);

  static const Color background = Color(0xFFF8FAFC);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceMuted = Color(0xFFF1F5F9);

  static const Color border = Color(0xFFE2E8F0);
  static const Color divider = Color(0xFFE2E8F0);

  static const Color textPrimary = Color(0xFF0F172A);
  static const Color textSecondary = Color(0xFF64748B);
  static const Color textMuted = Color(0xFF94A3B8);

  /// Status / temperature (unified)
  static const Color statusNew = Color(0xFF8B5CF6);
  static const Color hot = Color(0xFFEF4444);
  static const Color warm = Color(0xFFF59E0B);
  static const Color cold = Color(0xFF3B82F6);
  static const Color closed = Color(0xFF10B981);

  static const Color hotBg = Color(0xFFFEF2F2);
  static const Color warmBg = Color(0xFFFFF7ED);
  static const Color coldBg = Color(0xFFEFF6FF);
  static const Color newBg = Color(0xFFF5F3FF);
  static const Color closedBg = Color(0xFFECFDF5);

  /// Pipeline column accents (charts + kanban headers)
  static const Color pipelineNew = statusNew;
  static const Color pipelineContacted = Color(0xFF6366F1);
  static const Color pipelineFollowUp = Color(0xFFEF4444);
  static const Color pipelineClosed = closed;
}
