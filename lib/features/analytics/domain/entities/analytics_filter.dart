enum AnalyticsRangePreset { today, last7Days, last30Days, thisMonth, custom }

class AnalyticsFilter {
  const AnalyticsFilter({
    this.rangePreset = AnalyticsRangePreset.last30Days,
    this.from,
    this.to,
    this.workspaceId,
    this.memberId,
    this.source,
    this.channel,
    this.status,
    this.city,
  });

  final AnalyticsRangePreset rangePreset;
  final DateTime? from;
  final DateTime? to;
  final String? workspaceId;
  final String? memberId;
  final String? source;
  final String? channel;
  final String? status;
  final String? city;

  ({DateTime from, DateTime to}) resolveRange(DateTime now) {
    switch (rangePreset) {
      case AnalyticsRangePreset.today:
        final start = DateTime(now.year, now.month, now.day);
        final end = DateTime(now.year, now.month, now.day, 23, 59, 59);
        return (from: start, to: end);
      case AnalyticsRangePreset.last7Days:
        return (from: now.subtract(const Duration(days: 6)), to: now);
      case AnalyticsRangePreset.last30Days:
        return (from: now.subtract(const Duration(days: 29)), to: now);
      case AnalyticsRangePreset.thisMonth:
        return (from: DateTime(now.year, now.month, 1), to: now);
      case AnalyticsRangePreset.custom:
        final start = from ?? now.subtract(const Duration(days: 29));
        final end = to ?? now;
        return (from: start, to: end);
    }
  }

  AnalyticsFilter copyWith({
    AnalyticsRangePreset? rangePreset,
    DateTime? from,
    DateTime? to,
    String? workspaceId,
    String? memberId,
    String? source,
    String? channel,
    String? status,
    String? city,
    bool clearMember = false,
    bool clearSource = false,
    bool clearChannel = false,
    bool clearStatus = false,
    bool clearCity = false,
  }) {
    return AnalyticsFilter(
      rangePreset: rangePreset ?? this.rangePreset,
      from: from ?? this.from,
      to: to ?? this.to,
      workspaceId: workspaceId ?? this.workspaceId,
      memberId: clearMember ? null : memberId ?? this.memberId,
      source: clearSource ? null : source ?? this.source,
      channel: clearChannel ? null : channel ?? this.channel,
      status: clearStatus ? null : status ?? this.status,
      city: clearCity ? null : city ?? this.city,
    );
  }
}
