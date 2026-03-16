import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/stat_card.dart';
import '../../../data/models/lead.dart';
import '../../app_state/providers.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appStateProvider);
    final user = state.currentUser;
    if (user == null) {
      return const EmptyState(title: 'No session', subtitle: 'Please login to continue.');
    }

    final myLeads = state.leads.where((e) => e.assignedTo == user.id).toList();
    final viewLeads = state.isAdmin ? state.leads : myLeads;
    final now = DateTime.now();

    int todayNew = viewLeads.where((e) => e.createdAt.day == now.day && e.createdAt.month == now.month).length;
    int hot = viewLeads.where((e) => e.temperature == LeadTemperature.hot).length;
    int dueToday = viewLeads
        .where((e) =>
            e.nextFollowUpAt != null &&
            e.nextFollowUpAt!.day == now.day &&
            e.nextFollowUpAt!.month == now.month &&
            e.nextFollowUpAt!.year == now.year)
        .length;
    int overdue = viewLeads.where((e) => e.nextFollowUpAt != null && e.nextFollowUpAt!.isBefore(now)).length;
    int won = viewLeads.where((e) => e.status == LeadStatus.closedWon).length;
    int lost = viewLeads.where((e) => e.status == LeadStatus.closedLost).length;

    return RefreshIndicator(
      onRefresh: () => ref.read(appStateProvider.notifier).refreshData(),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Container(
                    height: 46,
                    width: 46,
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(Icons.insights_rounded, color: Theme.of(context).colorScheme.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          state.isAdmin ? 'Admin Dashboard' : 'My Dashboard',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Welcome back, ${user.fullName}',
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey.shade700),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          GridView.count(
            crossAxisCount: 2,
            childAspectRatio: 1.2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            children: [
              StatCard(title: state.isAdmin ? 'Total Leads' : 'My Leads', value: '${viewLeads.length}', icon: Icons.people),
              StatCard(title: 'New Today', value: '$todayNew', icon: Icons.new_releases_outlined),
              StatCard(title: 'Hot Leads', value: '$hot', icon: Icons.local_fire_department_outlined, color: Colors.redAccent),
              StatCard(title: 'Follow-ups Today', value: '$dueToday', icon: Icons.alarm),
              StatCard(title: 'Overdue', value: '$overdue', icon: Icons.warning_amber_rounded, color: Colors.orange),
              StatCard(title: 'Closed Won', value: '$won', icon: Icons.check_circle_outline, color: Colors.green),
              StatCard(title: 'Closed Lost', value: '$lost', icon: Icons.cancel_outlined, color: Colors.red),
            ],
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Recent Activity', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 10),
                  if (state.activities.isEmpty)
                    const EmptyState(
                      title: 'No activity yet',
                      subtitle: 'Activities will appear once leads are created or updated.',
                      icon: Icons.timeline_outlined,
                    )
                  else
                    ...state.activities.take(8).map(
                        (a) => ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          leading: Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Icon(Icons.timeline, size: 16, color: Theme.of(context).colorScheme.primary),
                          ),
                          title: Text(a.message),
                          subtitle: Text(
                            a.type.replaceAll('_', ' '),
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey.shade700),
                          ),
                        ),
                      ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
