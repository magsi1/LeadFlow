import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app_state/providers.dart';
import '../../../data/models/app_user.dart';

class TeamScreen extends ConsumerWidget {
  const TeamScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appStateProvider);
    final notifier = ref.read(appStateProvider.notifier);
    final leads = state.leads;
    final members = state.team;
    final workspace = state.activeWorkspace;

    Future<void> inviteMember() async {
      final emailCtrl = TextEditingController();
      UserRole selectedRole = UserRole.salesperson;
      final shouldCreate = await showDialog<bool>(
        context: context,
        builder: (_) => StatefulBuilder(
          builder: (context, setModalState) => AlertDialog(
            title: const Text('Invite Member'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Email'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<UserRole>(
                  initialValue: selectedRole,
                  decoration: const InputDecoration(labelText: 'Role'),
                  items: const [
                    DropdownMenuItem(value: UserRole.admin, child: Text('Admin')),
                    DropdownMenuItem(value: UserRole.manager, child: Text('Manager')),
                    DropdownMenuItem(value: UserRole.salesperson, child: Text('Sales')),
                  ],
                  onChanged: (value) {
                    if (value == null) return;
                    setModalState(() => selectedRole = value);
                  },
                ),
              ],
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
              FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Create Invite')),
            ],
          ),
        ),
      );
      if (shouldCreate != true) return;
      final email = emailCtrl.text.trim();
      if (email.isEmpty) return;
      await notifier.inviteWorkspaceMember(email: email, role: selectedRole);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Invitation created for $email')),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Team Management', style: Theme.of(context).textTheme.headlineSmall),
        if (workspace != null) ...[
          const SizedBox(height: 4),
          Text(
            'Workspace: ${workspace.name}',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
        const SizedBox(height: 12),
        if (state.canManageTeam)
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton.icon(
              onPressed: inviteMember,
              icon: const Icon(Icons.person_add_alt_1_outlined),
              label: const Text('Invite member'),
            ),
          ),
        const SizedBox(height: 12),
        if (state.assignmentRules.isNotEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Assignment Rules', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  ...state.assignmentRules.take(4).map(
                        (rule) => ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(rule.name),
                          subtitle: Text('Type: ${rule.type.name}'),
                          trailing: Chip(
                            visualDensity: VisualDensity.compact,
                            label: Text(rule.isActive ? 'Active' : 'Disabled'),
                          ),
                        ),
                      ),
                ],
              ),
            ),
          ),
        if (state.assignmentRules.isNotEmpty) const SizedBox(height: 12),
        for (final member in members)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(member.fullName, style: Theme.of(context).textTheme.titleMedium),
                            Text(member.email),
                          ],
                        ),
                      ),
                      Chip(
                        label: Text(member.role.name),
                        visualDensity: VisualDensity.compact,
                      ),
                      const SizedBox(width: 8),
                      Chip(
                        label: Text(member.membershipStatus ?? (member.isActive ? 'active' : 'disabled')),
                        visualDensity: VisualDensity.compact,
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text('Leads assigned: ${leads.where((l) => l.assignedTo == member.id).length}'),
                  Text(
                    'Closed won: ${leads.where((l) => l.assignedTo == member.id && l.status.name == 'closedWon').length}',
                  ),
                  if (member.assignmentCapacity != null) Text('Capacity: ${member.assignmentCapacity}'),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (member.role == UserRole.salesperson)
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
                            await notifier.assignLead(lead, member.id);
                          },
                          child: const Text('Assign lead'),
                        ),
                      if (state.canManageTeam) ...[
                        PopupMenuButton<UserRole>(
                          tooltip: 'Change role',
                          onSelected: (role) => notifier.changeWorkspaceMemberRole(
                            profileId: member.id,
                            role: role,
                          ),
                          itemBuilder: (_) => const [
                            PopupMenuItem(value: UserRole.admin, child: Text('Admin')),
                            PopupMenuItem(value: UserRole.manager, child: Text('Manager')),
                            PopupMenuItem(value: UserRole.salesperson, child: Text('Sales')),
                          ],
                          child: const Chip(
                            avatar: Icon(Icons.manage_accounts_outlined, size: 16),
                            label: Text('Role'),
                          ),
                        ),
                        PopupMenuButton<String>(
                          tooltip: 'Member status',
                          onSelected: (status) => notifier.changeWorkspaceMemberStatus(
                            profileId: member.id,
                            status: status,
                          ),
                          itemBuilder: (_) => const [
                            PopupMenuItem(value: 'active', child: Text('Active')),
                            PopupMenuItem(value: 'disabled', child: Text('Disabled')),
                          ],
                          child: const Chip(
                            avatar: Icon(Icons.toggle_on_outlined, size: 16),
                            label: Text('Status'),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
