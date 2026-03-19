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
    final notifier = ref.read(appStateProvider.notifier);
    final user = state.currentUser;
    final activeWorkspaceId = state.activeWorkspaceId;
    final activeWorkspace = state.activeWorkspace;
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
        if (state.workspaces.isNotEmpty)
          Card(
            child: ListTile(
              leading: const Icon(Icons.workspaces_outline),
              title: const Text('Active Workspace'),
              subtitle: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(activeWorkspace?.name ?? 'Unknown'),
                  if (state.workspaces.length > 1) const Text('Switch workspace'),
                ],
              ),
              trailing: state.workspaces.length > 1
                  ? DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: activeWorkspaceId,
                        items: state.workspaces
                            .map(
                              (w) => DropdownMenuItem<String>(
                                value: w.id,
                                child: Text(w.name),
                              ),
                            )
                            .toList(),
                        onChanged: (value) async {
                          if (value == null) return;
                          await notifier.switchWorkspace(value);
                        },
                      ),
                    )
                  : null,
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
        const SizedBox(height: 8),
        Card(
          child: ListTile(
            leading: const Icon(Icons.hub_outlined),
            title: const Text('Integrations'),
            subtitle: Text(
              state.canManageIntegrations
                  ? 'WhatsApp, Instagram, Facebook and webhook status'
                  : 'Admin-only access',
            ),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: state.canManageIntegrations ? () => context.push(RoutePaths.integrations) : null,
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
