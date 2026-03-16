import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/stat_card.dart';
import '../../app_state/providers.dart';

class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final leads = ref.watch(appStateProvider).leads;
    final bySource = <String, int>{};
    final byStatus = <String, int>{};
    final byStaff = <String, int>{};
    int won = 0;
    int lost = 0;
    for (final l in leads) {
      bySource[l.source] = (bySource[l.source] ?? 0) + 1;
      byStatus[l.status.name] = (byStatus[l.status.name] ?? 0) + 1;
      byStaff[l.assignedTo] = (byStaff[l.assignedTo] ?? 0) + 1;
      if (l.status.name == 'closedWon') won++;
      if (l.status.name == 'closedLost') lost++;
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Reports & Insights', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: StatCard(title: 'Closed Won', value: '$won', color: Colors.green, icon: Icons.check_circle)),
            const SizedBox(width: 10),
            Expanded(child: StatCard(title: 'Closed Lost', value: '$lost', color: Colors.red, icon: Icons.cancel)),
          ],
        ),
        const SizedBox(height: 12),
        _table(context, 'Leads by Source', bySource),
        const SizedBox(height: 12),
        _table(context, 'Leads by Status', byStatus),
        const SizedBox(height: 12),
        _table(context, 'Leads by Staff (UserId)', byStaff),
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
