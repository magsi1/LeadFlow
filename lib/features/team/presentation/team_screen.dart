import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app_state/providers.dart';

class TeamScreen extends ConsumerWidget {
  const TeamScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appStateProvider);
    final notifier = ref.read(appStateProvider.notifier);
    final leads = state.leads;
    final sales = state.team.where((e) => e.role.name == 'salesperson').toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Team Management', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 12),
        for (final s in sales)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(s.fullName, style: Theme.of(context).textTheme.titleMedium),
                  Text(s.email),
                  const SizedBox(height: 8),
                  Text('Leads assigned: ${leads.where((l) => l.assignedTo == s.id).length}'),
                  Text('Closed won: ${leads.where((l) => l.assignedTo == s.id && l.status.name == 'closedWon').length}'),
                  const SizedBox(height: 6),
                  OutlinedButton(
                    onPressed: () async {
                      final selectedLead = await showDialog<String>(
                        context: context,
                        builder: (_) => SimpleDialog(
                          title: const Text('Assign lead to salesperson'),
                          children: [
                            ...leads.map(
                              (l) => SimpleDialogOption(
                                onPressed: () => Navigator.pop(context, l.id),
                                child: Text('${l.customerName} (${l.city})'),
                              ),
                            ),
                          ],
                        ),
                      );
                      if (selectedLead == null) return;
                      final lead = leads.firstWhere((l) => l.id == selectedLead);
                      await notifier.assignLead(lead, s.id);
                    },
                    child: const Text('Assign lead'),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
