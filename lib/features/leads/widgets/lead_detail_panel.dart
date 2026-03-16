import 'package:flutter/material.dart';

import '../../../core/utils/formatters.dart';
import '../../../data/models/lead.dart';
import 'lead_status_chip.dart';

class LeadDetailPanel extends StatelessWidget {
  const LeadDetailPanel({
    super.key,
    required this.lead,
    required this.assignedName,
    required this.onView,
    required this.onEdit,
  });

  final Lead lead;
  final String assignedName;
  final VoidCallback onView;
  final VoidCallback onEdit;

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
    Widget infoRow(String label, String value) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 118,
              child: Text(
                label,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
              ),
            ),
            Expanded(child: Text(value)),
          ],
        ),
      );
    }

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 480),
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      lead.customerName,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                  IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
                ],
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  LeadStatusChip(label: lead.status.name, color: _statusColor()),
                  LeadStatusChip(label: lead.temperature.name.toUpperCase(), color: _tempColor()),
                ],
              ),
              const SizedBox(height: 12),
              infoRow('Phone', lead.phone),
              infoRow('City', lead.city),
              infoRow('Source', lead.source),
              infoRow('Assigned To', assignedName),
              infoRow('Follow-up', Formatters.dateTime(lead.nextFollowUpAt)),
              infoRow('Interest', lead.productInterest),
              infoRow('Notes', lead.notesSummary.isEmpty ? '-' : lead.notesSummary),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: onEdit,
                      icon: const Icon(Icons.edit_outlined),
                      label: const Text('Edit'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: onView,
                      icon: const Icon(Icons.visibility_outlined),
                      label: const Text('Full View'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
