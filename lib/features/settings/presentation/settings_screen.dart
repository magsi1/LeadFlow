import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/route_paths.dart';
import '../../app_state/providers.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appStateProvider);
    final user = state.currentUser;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Settings', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 12),
        Card(
          child: ListTile(
            title: Text(user?.fullName ?? 'Unknown user'),
            subtitle: Text('${user?.email ?? ''}\nRole: ${user?.role.name ?? '-'}'),
            isThreeLine: true,
            leading: const CircleAvatar(child: Icon(Icons.person)),
          ),
        ),
        const SizedBox(height: 8),
        const Card(
          child: Column(
            children: [
              ListTile(
                leading: Icon(Icons.business_outlined),
                title: Text('Business Name'),
                subtitle: Text('LeadFlow Demo Business'),
              ),
              ListTile(
                leading: Icon(Icons.notifications_active_outlined),
                title: Text('Notification Preferences'),
                subtitle: Text('Follow-up reminders and lead assignment alerts'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        FilledButton.tonalIcon(
          onPressed: () async {
            final confirmed = await showDialog<bool>(
              context: context,
              builder: (_) => AlertDialog(
                title: const Text('Reset demo data'),
                content: const Text('This will restore original LeadFlow demo leads and activities. Continue?'),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
                  FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Reset')),
                ],
              ),
            );
            if (confirmed != true) return;
            await ref.read(appStateProvider.notifier).resetDemoData();
            if (!context.mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Demo data reset successfully.')),
            );
          },
          icon: const Icon(Icons.refresh_rounded),
          label: const Text('Reset Demo Data'),
        ),
        const SizedBox(height: 12),
        FilledButton.tonalIcon(
          onPressed: () async {
            await ref.read(appStateProvider.notifier).signOut();
            if (context.mounted) context.go(RoutePaths.login);
          },
          icon: const Icon(Icons.logout),
          label: const Text('Logout'),
        ),
      ],
    );
  }
}
