class FollowUpDisciplineMetric {
  const FollowUpDisciplineMetric({
    required this.dueToday,
    required this.overdue,
    required this.completedOnTime,
    required this.completedLate,
    required this.missedOrCancelled,
  });

  final int dueToday;
  final int overdue;
  final int completedOnTime;
  final int completedLate;
  final int missedOrCancelled;

  int get totalTracked => dueToday + overdue + completedOnTime + completedLate + missedOrCancelled;

  double get completionRate {
    final completed = completedOnTime + completedLate;
    return totalTracked == 0 ? 0 : completed / totalTracked;
  }
}
