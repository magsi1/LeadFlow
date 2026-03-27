import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/router/route_paths.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/iterable_extensions.dart';
import '../../../core/utils/launch_actions.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../data/models/lead.dart';
import '../../app_state/providers.dart';

class LeadDetailsScreen extends ConsumerWidget {
  const LeadDetailsScreen({super.key, required this.leadId});

  final String leadId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appStateProvider);
    final notifier = ref.read(appStateProvider.notifier);
    final lead = state.leads.where((e) => e.id == leadId).cast<Lead?>().firstOrNull;
    if (lead == null) {
      return const Scaffold(body: EmptyState(title: 'Lead not found', subtitle: 'This lead may have been deleted.'));
    }
    final assigned = state.team.where((u) => u.id == lead.assignedTo).firstOrNull?.fullName ?? 'Unassigned';
    final timeline = state.activities.where((e) => e.leadId == lead.id).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

    return Scaffold(
      appBar: AppBar(
        title: Text(
          lead.customerName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          softWrap: false,
        ),
        actions: [
          IconButton(
            onPressed: () => context.push('${RoutePaths.addLead}?editId=${lead.id}'),
            icon: const Icon(Icons.edit_outlined),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    lead.customerName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    softWrap: false,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 6),
                  _EmailLine(lead: lead),
                  const SizedBox(height: 6),
                  Text('${lead.phone} • ${lead.city}'),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      OutlinedButton.icon(
                        onPressed: () => LaunchActions.call(lead.phone),
                        icon: const Icon(Icons.call_outlined),
                        label: const Text('Call'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () => LaunchActions.whatsapp(lead.phone),
                        icon: const Icon(Icons.message_outlined),
                        label: const Text('WhatsApp'),
                      ),
                      FilledButton.tonal(
                        onPressed: () async {
                          final note = await _askText(context, 'Add note');
                          if (note == null || note.trim().isEmpty) return;
                          await notifier.addNote(lead, note.trim());
                        },
                        child: const Text('Add Note'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          _section(
            context,
            'Lead Profile',
            [
              _tile('Email', lead.email.trim().isEmpty ? 'No Email' : lead.email.trim()),
              _tile('Source', lead.source),
              _tile('Product Interest', lead.productInterest),
              _tile('Budget', lead.budget),
              _tile('Status', lead.status.name),
              _tile('Temperature', lead.temperature.name),
              _tile('Assigned To', assigned),
              _tile('Address', lead.address),
              _tile('Inquiry', lead.inquiryText),
              _tile('Next Follow-up', Formatters.dateTime(lead.nextFollowUpAt)),
              _tile('Created', Formatters.dateTime(lead.createdAt)),
              _tile('Updated', Formatters.dateTime(lead.updatedAt)),
              _tile('Notes', lead.notesSummary),
            ],
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Quick Actions', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final s in LeadStatus.values)
                        ActionChip(
                          label: Text('Set ${s.name}'),
                          onPressed: () => notifier.changeLeadStatus(lead, s),
                        ),
                      ActionChip(
                        label: const Text('Schedule Follow-up'),
                        onPressed: () async {
                          final pickedDate = await showDatePicker(
                            context: context,
                            firstDate: DateTime.now().subtract(const Duration(days: 5)),
                            lastDate: DateTime.now().add(const Duration(days: 365)),
                            initialDate: DateTime.now(),
                          );
                          if (pickedDate == null) return;
                          final dateTime = DateTime(pickedDate.year, pickedDate.month, pickedDate.day, 11);
                          await notifier.scheduleFollowUp(lead, dateTime);
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          _section(
            context,
            'Activity Timeline',
            timeline
                .map((a) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.bolt),
                      title: Text(a.message),
                      subtitle: Text('${a.type} • ${Formatters.dateTime(a.createdAt)}'),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }

  Widget _section(BuildContext context, String title, List<Widget> children) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ...children,
        ]),
      ),
    );
  }

  Widget _tile(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 130, child: Text(k, style: const TextStyle(fontWeight: FontWeight.w600))),
          Expanded(child: Text(v)),
        ],
      ),
    );
  }

  Future<String?> _askText(BuildContext context, String title) async {
    final ctrl = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(title),
        content: TextField(controller: ctrl, decoration: const InputDecoration(hintText: 'Enter note')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, ctrl.text), child: const Text('Save')),
        ],
      ),
    );
  }
}

class _EmailLine extends StatelessWidget {
  const _EmailLine({required this.lead});

  final Lead lead;

  @override
  Widget build(BuildContext context) {
    final raw = lead.email.trim();
    final label = raw.isEmpty ? 'No Email' : raw;
    final canMail = raw.isNotEmpty && raw.contains('@');
    final style = Theme.of(context).textTheme.bodyMedium?.copyWith(
          fontWeight: FontWeight.w800,
          color: canMail ? Theme.of(context).colorScheme.primary : Colors.grey.shade700,
          decoration: canMail ? TextDecoration.underline : null,
        );
    return GestureDetector(
      onTap: canMail
          ? () async {
              final uri = Uri.parse('mailto:$raw');
              if (await canLaunchUrl(uri)) {
                await launchUrl(uri);
              }
            }
          : null,
      child: Text(label, style: style),
    );
  }
}
