import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/stat_card.dart';
import '../../analytics/domain/entities/analytics_filter.dart';
import '../../analytics/presentation/providers.dart';
import '../../app_state/providers.dart';

class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final appState = ref.watch(appStateProvider);
    final analytics = ref.watch(analyticsSnapshotProvider);
    final filter = ref.watch(analyticsFilterProvider);

    void setRange(AnalyticsRangePreset preset) {
      ref.read(analyticsFilterProvider.notifier).state = filter.copyWith(rangePreset: preset);
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Reports & Insights', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            ChoiceChip(
              label: const Text('Today'),
              selected: filter.rangePreset == AnalyticsRangePreset.today,
              onSelected: (_) => setRange(AnalyticsRangePreset.today),
            ),
            ChoiceChip(
              label: const Text('Last 7 Days'),
              selected: filter.rangePreset == AnalyticsRangePreset.last7Days,
              onSelected: (_) => setRange(AnalyticsRangePreset.last7Days),
            ),
            ChoiceChip(
              label: const Text('Last 30 Days'),
              selected: filter.rangePreset == AnalyticsRangePreset.last30Days,
              onSelected: (_) => setRange(AnalyticsRangePreset.last30Days),
            ),
            ChoiceChip(
              label: const Text('This Month'),
              selected: filter.rangePreset == AnalyticsRangePreset.thisMonth,
              onSelected: (_) => setRange(AnalyticsRangePreset.thisMonth),
            ),
          ],
        ),
        const SizedBox(height: 10),
        if (appState.canManageTeam)
          Row(
            children: [
              const Text('Member:'),
              const SizedBox(width: 8),
              DropdownButton<String?>(
                value: filter.memberId,
                items: [
                  const DropdownMenuItem<String?>(value: null, child: Text('All')),
                  ...appState.team.map(
                    (m) => DropdownMenuItem<String?>(
                      value: m.id,
                      child: Text(m.fullName),
                    ),
                  ),
                ],
                onChanged: (value) {
                  ref.read(analyticsFilterProvider.notifier).state = filter.copyWith(
                        memberId: value,
                        clearMember: value == null,
                      );
                },
              ),
            ],
          ),
        if (analytics.isLoading) ...[
          const SizedBox(height: 8),
          const LinearProgressIndicator(),
        ],
        if (analytics.hasError) ...[
          const SizedBox(height: 8),
          Text(
            'Failed to load analytics: ${analytics.error}',
            style: const TextStyle(color: Colors.red),
          ),
        ],
        const SizedBox(height: 12),
        if (analytics.hasValue) ...[
          Row(
            children: [
              Expanded(
                child: StatCard(
                  title: 'Won',
                  value: '${analytics.value!.kpis.wonLeads}',
                  color: Colors.green,
                  icon: Icons.check_circle,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: StatCard(
                  title: 'Lost',
                  value: '${analytics.value!.kpis.lostLeads}',
                  color: Colors.red,
                  icon: Icons.cancel,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _table(
            context,
            'Funnel',
            {
              for (final f in analytics.value!.funnel) f.stage: f.count,
            },
          ),
          const SizedBox(height: 12),
          _table(
            context,
            'Source / Channel',
            {
              for (final s in analytics.value!.sources)
                '${s.source} (${(s.conversionRate * 100).toStringAsFixed(0)}%)': s.total,
            },
          ),
          const SizedBox(height: 12),
          _table(
            context,
            'Team Performance (Won / Assigned)',
            {
              for (final m in analytics.value!.teamPerformance)
                m.memberName: m.assignedLeads == 0
                    ? 0
                    : ((m.wonLeads / m.assignedLeads) * 100).round(),
            },
          ),
          const SizedBox(height: 12),
          _table(
            context,
            'Follow-up Discipline',
            {
              'Due Today': analytics.value!.followUpDiscipline.dueToday,
              'Overdue': analytics.value!.followUpDiscipline.overdue,
              'Completed On-time': analytics.value!.followUpDiscipline.completedOnTime,
              'Completed Late': analytics.value!.followUpDiscipline.completedLate,
            },
          ),
          const SizedBox(height: 12),
          _table(
            context,
            'Trend (Leads Created)',
            {
              for (final t in analytics.value!.trends) t.label: t.leadsCreated,
            },
          ),
        ],
      ],
    );
  }

  Widget _table(BuildContext context, String title, Map<String, int> rows) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 10),
            ...rows.entries.map(
              (e) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [Text(e.key), Text('${e.value}')],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
