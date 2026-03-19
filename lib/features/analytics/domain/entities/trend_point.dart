class TrendPoint {
  const TrendPoint({
    required this.label,
    required this.leadsCreated,
    required this.conversions,
    required this.messagesReceived,
    required this.followUpsDue,
    required this.followUpsCompleted,
  });

  final String label;
  final int leadsCreated;
  final int conversions;
  final int messagesReceived;
  final int followUpsDue;
  final int followUpsCompleted;
}
