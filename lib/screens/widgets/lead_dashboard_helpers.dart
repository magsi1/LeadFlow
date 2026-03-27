import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';

/// Hot / warm / cold badge colors (unified SaaS palette).
Color colorForIntent(String intent) {
  switch (intent.toUpperCase()) {
    case 'HOT':
      return AppColors.hot;
    case 'WARM':
      return AppColors.warm;
    case 'COLD':
      return AppColors.cold;
    default:
      return AppColors.textMuted;
  }
}

/// Cycles pipeline stage for tap-to-advance UX (list screens).
String getNextStatus(String current) {
  switch (current.toLowerCase()) {
    case 'new':
      return 'contacted';
    case 'contacted':
      return 'follow_up';
    case 'follow_up':
      return 'closed';
    case 'closed':
      return 'new';
    default:
      return 'new';
  }
}

/// Pipeline column from Supabase row: prefers [stage], then legacy hot/warm/cold [intent].
/// [status] is lead intelligence (hot/warm/cold) and must not drive pipeline placement.
String pipelineBucketFromLeadMap(Map<String, dynamic> lead) {
  final rawStage = (lead['stage'] ?? '').toString().trim().toLowerCase();
  if (rawStage == 'new' ||
      rawStage == 'contacted' ||
      rawStage == 'follow_up' ||
      rawStage == 'closed') {
    return rawStage;
  }
  final intent = (lead['intent'] ?? '').toString().trim().toLowerCase();
  if (intent == 'hot') return 'follow_up';
  if (intent == 'warm') return 'contacted';
  if (intent == 'cold') return 'new';
  return 'new';
}
