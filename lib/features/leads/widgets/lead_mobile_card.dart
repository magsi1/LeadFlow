import 'package:flutter/material.dart';

import '../../../core/utils/formatters.dart';
import '../../../data/models/lead.dart';
import 'lead_status_chip.dart';

class LeadMobileCard extends StatelessWidget {
  const LeadMobileCard({
    super.key,
    required this.lead,
    required this.assignedName,
    required this.onView,
    required this.onEdit,
    required this.onFollowUp,
    required this.onStatusChange,
  });

  final Lead lead;
  final String assignedName;
  final VoidCallback onView;
  final VoidCallback onEdit;
  final VoidCallback onFollowUp;
  final ValueChanged<LeadStatus> onStatusChange;

  Color _statusColor() {
    return switch (lead.status) {
      LeadStatus.leadNew => Colors.indigo,
      LeadStatus.contacted => Colors.blue,
      LeadStatus.interested => Colors.green,
      LeadStatus.followUpNeeded => Colors.orange,
      LeadStatus.negotiation => Colors.deepPurple,
      LeadStatus.closedWon => Colors.teal,
      LeadStatus.closedLost => Colors.redAccent,
    };
  }

  Color _tempColor() {
    return switch (lead.temperature) {
      LeadTemperature.hot => Colors.redAccent,
      LeadTemperature.warm => Colors.orange,
      LeadTemperature.cold => Colors.blueGrey,
    };
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        lead.customerName,
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 4),
                      Text('${lead.phone} • ${lead.city}'),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                LeadStatusChip(label: lead.temperature.name.toUpperCase(), color: _tempColor()),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                LeadStatusChip(label: lead.status.name, color: _statusColor()),
                LeadStatusChip(label: lead.source, color: Colors.indigo),
              ],
            ),
            const SizedBox(height: 10),
            Text('Assigned: $assignedName'),
            const SizedBox(height: 4),
            Text('Follow-up: ${Formatters.dateTime(lead.nextFollowUpAt)}'),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(onPressed: onView, icon: const Icon(Icons.visibility_outlined), label: const Text('View')),
                OutlinedButton.icon(onPressed: onEdit, icon: const Icon(Icons.edit_outlined), label: const Text('Edit')),
                OutlinedButton.icon(
                  onPressed: onFollowUp,
                  icon: const Icon(Icons.alarm_add_outlined),
                  label: const Text('Follow-up'),
                ),
                PopupMenuButton<LeadStatus>(
                  onSelected: onStatusChange,
                  itemBuilder: (_) => LeadStatus.values
                      .map((s) => PopupMenuItem<LeadStatus>(value: s, child: Text(s.name)))
                      .toList(),
                  child: const Chip(
                    avatar: Icon(Icons.sync_alt_rounded, size: 16),
                    label: Text('Change Status'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
