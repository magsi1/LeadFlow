class SourceMetric {
  const SourceMetric({
    required this.source,
    required this.total,
    required this.won,
  });

  final String source;
  final int total;
  final int won;

  double get conversionRate => total == 0 ? 0 : won / total;
}
