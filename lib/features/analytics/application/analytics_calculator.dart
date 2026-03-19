import '../../../../data/models/app_user.dart';
import '../../../../data/models/follow_up.dart';
import '../../../../data/models/lead.dart';
import '../../inbox/domain/entities/conversation.dart';
import '../../inbox/domain/entities/unified_message.dart';
import '../domain/entities/analytics_dataset.dart';
import '../domain/entities/analytics_filter.dart';
import '../domain/entities/analytics_snapshot.dart';
import '../domain/entities/follow_up_discipline_metric.dart';
import '../domain/entities/funnel_stage_metric.dart';
import '../domain/entities/source_metric.dart';
import '../domain/entities/team_performance_metric.dart';
import '../domain/entities/trend_point.dart';
import '../domain/entities/workspace_kpi_summary.dart';

class AnalyticsCalculator {
  static AnalyticsSnapshot build({
    required AnalyticsDataset dataset,
    required AnalyticsFilter filter,
    required AppUser? viewer,
  }) {
    final now = DateTime.now();
    final range = filter.resolveRange(now);
    final from = range.from;
    final to = range.to;

    final scopedLeads = dataset.leads.where((l) {
      if (viewer?.role == UserRole.salesperson && l.assignedTo != viewer!.id) return false;
      if (l.createdAt.isBefore(from) || l.createdAt.isAfter(to)) return false;
      if (filter.memberId != null && filter.memberId!.isNotEmpty && l.assignedTo != filter.memberId) return false;
      if (filter.source != null && filter.source!.isNotEmpty && l.source.toLowerCase() != filter.source!.toLowerCase()) {
        return false;
      }
      if (filter.status != null && filter.status!.isNotEmpty && l.status.name != filter.status) return false;
      if (filter.city != null && filter.city!.isNotEmpty && l.city.toLowerCase() != filter.city!.toLowerCase()) {
        return false;
      }
      return true;
    }).toList();

    final scopedConversations = dataset.conversations.where((c) {
      if (viewer?.role == UserRole.salesperson && c.assignedTo != viewer!.id) return false;
      if (c.lastMessageAt.isBefore(from) || c.lastMessageAt.isAfter(to)) return false;
      if (filter.channel != null && filter.channel!.isNotEmpty && c.channel.name != filter.channel) return false;
      if (filter.memberId != null && filter.memberId!.isNotEmpty && c.assignedTo != filter.memberId) return false;
      return true;
    }).toList();

    final scopedFollowUps = dataset.followUps.where((f) {
      if (viewer?.role == UserRole.salesperson && f.assignedTo != viewer!.id) return false;
      if (f.dueAt.isBefore(from) || f.dueAt.isAfter(to)) return false;
      if (filter.memberId != null && filter.memberId!.isNotEmpty && f.assignedTo != filter.memberId) return false;
      return true;
    }).toList();

    final scopedMessages = dataset.messages.where((m) {
      if (m.createdAt.isBefore(from) || m.createdAt.isAfter(to)) return false;
      if (filter.channel != null && filter.channel!.isNotEmpty && m.channel.name != filter.channel) return false;
      return true;
    }).toList();

    final wonLeads = scopedLeads.where((l) => l.status == LeadStatus.closedWon).length;
    final lostLeads = scopedLeads.where((l) => l.status == LeadStatus.closedLost).length;
    final convertedLeads = wonLeads;
    final todayStart = DateTime(now.year, now.month, now.day);
    final weekStart = now.subtract(Duration(days: now.weekday - 1));
    final followUpsDueToday = scopedFollowUps.where((f) => _sameDay(f.dueAt, now) && !f.completed).length;
    final overdueFollowUps = scopedFollowUps.where((f) => f.dueAt.isBefore(now) && !f.completed).length;

    final firstResponseMinutes = _avgFirstResponseMinutes(scopedMessages);
    final avgToConversionHours = _avgTimeToConversionHours(scopedLeads);

    final kpis = WorkspaceKpiSummary(
      totalLeads: scopedLeads.length,
      newToday: scopedLeads.where((l) => l.createdAt.isAfter(todayStart)).length,
      newThisWeek: scopedLeads.where((l) => l.createdAt.isAfter(weekStart)).length,
      openConversations: scopedConversations.where((c) => c.stage.name != 'closed').length,
      followUpsDueToday: followUpsDueToday,
      overdueFollowUps: overdueFollowUps,
      convertedLeads: convertedLeads,
      wonLeads: wonLeads,
      lostLeads: lostLeads,
      conversionRate: scopedLeads.isEmpty ? 0 : wonLeads / scopedLeads.length,
      avgFirstResponseMinutes: firstResponseMinutes,
      avgTimeToConversionHours: avgToConversionHours,
    );

    final funnel = <FunnelStageMetric>[
      FunnelStageMetric(stage: 'New', count: scopedLeads.where((l) => l.status == LeadStatus.leadNew).length),
      FunnelStageMetric(stage: 'Contacted', count: scopedLeads.where((l) => l.status == LeadStatus.contacted).length),
      FunnelStageMetric(
        stage: 'Qualified',
        count: scopedLeads.where((l) => l.status == LeadStatus.interested || l.status == LeadStatus.negotiation).length,
      ),
      FunnelStageMetric(
        stage: 'Follow-up',
        count: scopedLeads.where((l) => l.status == LeadStatus.followUpNeeded).length,
      ),
      FunnelStageMetric(stage: 'Won', count: wonLeads),
      FunnelStageMetric(stage: 'Lost', count: lostLeads),
    ];

    final sourceMap = <String, List<Lead>>{};
    for (final lead in scopedLeads) {
      sourceMap.putIfAbsent(lead.source, () => []).add(lead);
    }
    final sources = sourceMap.entries
        .map(
          (e) => SourceMetric(
            source: e.key,
            total: e.value.length,
            won: e.value.where((l) => l.status == LeadStatus.closedWon).length,
          ),
        )
        .toList()
      ..sort((a, b) => b.total.compareTo(a.total));

    final followUpDiscipline = FollowUpDisciplineMetric(
      dueToday: followUpsDueToday,
      overdue: overdueFollowUps,
      completedOnTime: scopedFollowUps.where((f) => f.completed && !f.dueAt.isBefore(now)).length,
      completedLate: scopedFollowUps.where((f) => f.completed && f.dueAt.isBefore(now)).length,
      missedOrCancelled: 0,
    );

    final teamPerformance = _buildTeamPerformance(
      team: dataset.team,
      leads: scopedLeads,
      followUps: scopedFollowUps,
      conversations: scopedConversations,
      messages: scopedMessages,
      viewer: viewer,
    );

    final trends = _buildDailyTrends(
      leads: scopedLeads,
      followUps: scopedFollowUps,
      messages: scopedMessages,
      from: from,
      to: to,
    );

    return AnalyticsSnapshot(
      kpis: kpis,
      funnel: funnel,
      sources: sources,
      trends: trends,
      teamPerformance: teamPerformance,
      followUpDiscipline: followUpDiscipline,
    );
  }

  static List<TeamPerformanceMetric> _buildTeamPerformance({
    required List<AppUser> team,
    required List<Lead> leads,
    required List<FollowUp> followUps,
    required List<Conversation> conversations,
    required List<UnifiedMessage> messages,
    required AppUser? viewer,
  }) {
    final visibleTeam = viewer?.role == UserRole.salesperson ? team.where((u) => u.id == viewer!.id) : team;
    return visibleTeam.map((member) {
      final assigned = leads.where((l) => l.assignedTo == member.id).toList();
      final contacted = assigned
          .where((l) => l.status != LeadStatus.leadNew)
          .length;
      final qualified = assigned
          .where((l) => l.status == LeadStatus.interested || l.status == LeadStatus.negotiation)
          .length;
      final won = assigned.where((l) => l.status == LeadStatus.closedWon).length;
      final lost = assigned.where((l) => l.status == LeadStatus.closedLost).length;
      final memberFollowups = followUps.where((f) => f.assignedTo == member.id).toList();
      final memberConversations = conversations.where((c) => c.assignedTo == member.id).toList();
      final convIds = memberConversations.map((e) => e.id).toSet();
      final outMessages = messages
          .where((m) => m.direction == 'outgoing' && convIds.contains(m.conversationId))
          .length;
      return TeamPerformanceMetric(
        memberId: member.id,
        memberName: member.fullName,
        assignedLeads: assigned.length,
        contactedLeads: contacted,
        qualifiedLeads: qualified,
        wonLeads: won,
        lostLeads: lost,
        followUpsCompleted: memberFollowups.where((f) => f.completed).length,
        overdueFollowUps: memberFollowups.where((f) => !f.completed && f.dueAt.isBefore(DateTime.now())).length,
        conversationsHandled: memberConversations.length,
        responseActivityCount: outMessages,
      );
    }).toList()
      ..sort((a, b) => b.wonLeads.compareTo(a.wonLeads));
  }

  static List<TrendPoint> _buildDailyTrends({
    required List<Lead> leads,
    required List<FollowUp> followUps,
    required List<UnifiedMessage> messages,
    required DateTime from,
    required DateTime to,
  }) {
    final days = <DateTime>[];
    var cursor = DateTime(from.year, from.month, from.day);
    final end = DateTime(to.year, to.month, to.day);
    while (!cursor.isAfter(end)) {
      days.add(cursor);
      cursor = cursor.add(const Duration(days: 1));
    }
    return days.map((day) {
      final label = '${day.month}/${day.day}';
      final leadsCreated = leads.where((l) => _sameDay(l.createdAt, day)).length;
      final conversions = leads.where((l) => l.status == LeadStatus.closedWon && _sameDay(l.updatedAt, day)).length;
      final messagesReceived = messages.where((m) => m.direction == 'incoming' && _sameDay(m.createdAt, day)).length;
      final followUpsDue = followUps.where((f) => _sameDay(f.dueAt, day)).length;
      final followUpsCompleted = followUps.where((f) => f.completed && _sameDay(f.dueAt, day)).length;
      return TrendPoint(
        label: label,
        leadsCreated: leadsCreated,
        conversions: conversions,
        messagesReceived: messagesReceived,
        followUpsDue: followUpsDue,
        followUpsCompleted: followUpsCompleted,
      );
    }).toList();
  }

  static double? _avgFirstResponseMinutes(List<UnifiedMessage> messages) {
    final byConversation = <String, List<UnifiedMessage>>{};
    for (final m in messages) {
      byConversation.putIfAbsent(m.conversationId, () => []).add(m);
    }
    final values = <double>[];
    for (final items in byConversation.values) {
      items.sort((a, b) => a.createdAt.compareTo(b.createdAt));
      final firstInbound = items.where((m) => m.direction == 'incoming').firstOrNull;
      final firstOutbound = items.where((m) => m.direction == 'outgoing').firstOrNull;
      if (firstInbound == null || firstOutbound == null) continue;
      if (firstOutbound.createdAt.isBefore(firstInbound.createdAt)) continue;
      values.add(firstOutbound.createdAt.difference(firstInbound.createdAt).inMinutes.toDouble());
    }
    if (values.isEmpty) return null;
    final sum = values.fold<double>(0, (a, b) => a + b);
    return sum / values.length;
  }

  static double? _avgTimeToConversionHours(List<Lead> leads) {
    final won = leads.where((l) => l.status == LeadStatus.closedWon).toList();
    if (won.isEmpty) return null;
    final hours = won
        .map((l) => l.updatedAt.difference(l.createdAt).inMinutes / 60)
        .where((v) => v >= 0)
        .toList();
    if (hours.isEmpty) return null;
    final sum = hours.fold<double>(0, (a, b) => a + b);
    return sum / hours.length;
  }

  static bool _sameDay(DateTime a, DateTime b) {
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }
}

extension _FirstOrNullExt<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
