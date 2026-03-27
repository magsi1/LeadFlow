import '../data/models/lead.dart';

/// Recomputes [score] and [temperature] / [scoreCategory] from engagement rules.
///
/// - Contact within the last 24 hours: +10
/// - No contact in the last 3+ days (or never): -10
/// - Bands: ≥70 hot, 40–69 warm, below 40 cold
Lead updateLeadScore(Lead lead, {DateTime? now}) {
  final t = now ?? DateTime.now();
  var score = lead.score;
  final lc = lead.lastContacted;

  if (lc != null && t.difference(lc) < const Duration(days: 1)) {
    score += 10;
  }
  if (lc == null || t.difference(lc) > const Duration(days: 3)) {
    score -= 10;
  }
  score = score.clamp(0, 100);

  final LeadTemperature temp;
  final LeadScoreCategory cat;
  if (score >= 70) {
    temp = LeadTemperature.hot;
    cat = LeadScoreCategory.hot;
  } else if (score >= 40) {
    temp = LeadTemperature.warm;
    cat = LeadScoreCategory.warm;
  } else {
    temp = LeadTemperature.cold;
    cat = LeadScoreCategory.cold;
  }

  return lead.copyWith(
    score: score,
    temperature: temp,
    scoreCategory: cat,
    updatedAt: t,
  );
}
