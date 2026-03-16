import 'package:flutter/material.dart';

import '../../../core/utils/formatters.dart';
import '../../../data/models/lead.dart';
import 'lead_status_chip.dart';

class LeadTableRow extends StatelessWidget {
  const LeadTableRow({
    super.key,
    required this.lead,
    required this.assignedName,
    required this.onView,
    required this.onEdit,
    required this.onFollowUp,
    required this.onStatusChange,
    required this.onOpenPanel,
  });

  final Lead lead;
  final String assignedName;
  final VoidCallback onView;
  final VoidCallback onEdit;
  final VoidCallback onFollowUp;
  final ValueChanged<LeadStatus> onStatusChange;
  final VoidCallback onOpenPanel;

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
    return InkWell(
      onTap: onOpenPanel,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            Expanded(
              flex: 3,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    lead.customerName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 2),
                  Text(lead.phone, style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
            Expanded(flex: 2, child: Text(lead.source, overflow: TextOverflow.ellipsis)),
            Expanded(flex: 2, child: Text(lead.city, overflow: TextOverflow.ellipsis)),
            Expanded(
              flex: 3,
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  LeadStatusChip(label: lead.status.name, color: _statusColor(), compact: true),
                  LeadStatusChip(label: lead.temperature.name.toUpperCase(), color: _tempColor(), compact: true),
                ],
              ),
            ),
            Expanded(flex: 2, child: Text(assignedName, overflow: TextOverflow.ellipsis)),
            Expanded(
              flex: 2,
              child: Text(
                Formatters.date(lead.nextFollowUpAt),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            SizedBox(
              width: 170,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  IconButton(onPressed: onView, icon: const Icon(Icons.visibility_outlined, size: 19), tooltip: 'View'),
                  IconButton(onPressed: onEdit, icon: const Icon(Icons.edit_outlined, size: 19), tooltip: 'Edit'),
                  IconButton(onPressed: onFollowUp, icon: const Icon(Icons.alarm_add_outlined, size: 19), tooltip: 'Mark follow-up'),
                  PopupMenuButton<LeadStatus>(
                    tooltip: 'Change status',
                    icon: const Icon(Icons.sync_alt_rounded, size: 19),
                    onSelected: onStatusChange,
                    itemBuilder: (_) => LeadStatus.values
                        .map((s) => PopupMenuItem<LeadStatus>(value: s, child: Text(s.name)))
                        .toList(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
