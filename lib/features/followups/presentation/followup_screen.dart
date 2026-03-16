import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/route_paths.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../data/models/follow_up.dart';
import '../../app_state/providers.dart';

class FollowUpScreen extends ConsumerWidget {
  const FollowUpScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appStateProvider);
    final now = DateTime.now();
    final myId = state.currentUser?.id;
    final isAdmin = state.isAdmin;

    final followUps = state.followUps.where((f) => isAdmin || f.assignedTo == myId).toList();
    final dueToday = followUps
        .where((f) => !f.completed && f.dueAt.year == now.year && f.dueAt.month == now.month && f.dueAt.day == now.day)
        .toList();
    final overdue = followUps.where((f) => !f.completed && f.dueAt.isBefore(now)).toList();
    final upcoming = followUps.where((f) => !f.completed && f.dueAt.isAfter(now)).toList();
    final completed = followUps.where((f) => f.completed).toList();

    return DefaultTabController(
      length: 4,
      child: Column(
        children: [
          const TabBar(tabs: [
            Tab(text: 'Due Today'),
            Tab(text: 'Overdue'),
            Tab(text: 'Upcoming'),
            Tab(text: 'Completed'),
          ]),
          Expanded(
            child: TabBarView(
              children: [
                _list(context, ref, dueToday),
                _list(context, ref, overdue),
                _list(context, ref, upcoming),
                _list(context, ref, completed, isCompletedTab: true),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _list(BuildContext context, WidgetRef ref, List<FollowUp> items, {bool isCompletedTab = false}) {
    final state = ref.watch(appStateProvider);
    if (items.isEmpty) {
      return const EmptyState(title: 'No follow-ups', subtitle: 'Follow-up tasks will appear here.');
    }
    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: items.length,
      itemBuilder: (_, i) {
        final f = items[i];
        final lead = state.leads.firstWhere((l) => l.id == f.leadId);
        final staff = state.team.firstWhere((u) => u.id == f.assignedTo, orElse: () => state.team.first).fullName;
        return Card(
          child: ListTile(
            title: Text(lead.customerName),
            subtitle: Text('${lead.phone}\n$staff • ${lead.status.name}\nDue: ${Formatters.dateTime(f.dueAt)}'),
            isThreeLine: true,
            trailing: isCompletedTab
                ? const Icon(Icons.check_circle, color: Colors.green)
                : PopupMenuButton<String>(
                    onSelected: (v) async {
                      if (v == 'done') {
                        await ref.read(appStateProvider.notifier).completeFollowUp(f);
                      } else if (v == 'open') {
                        if (context.mounted) context.push('${RoutePaths.leadDetails}/${lead.id}');
                      }
                    },
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'done', child: Text('Mark Done')),
                      PopupMenuItem(value: 'open', child: Text('Open Lead')),
                    ],
                  ),
          ),
        );
      },
    );
  }
}
