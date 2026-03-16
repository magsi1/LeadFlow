import 'package:flutter/material.dart';

import '../../../core/utils/formatters.dart';
import '../../../data/models/lead.dart';

class RecentLeadTile extends StatelessWidget {
  const RecentLeadTile({
    super.key,
    required this.lead,
    required this.assigneeName,
    this.onTap,
  });

  final Lead lead;
  final String assigneeName;
  final VoidCallback? onTap;

  Color _temperatureColor() {
    return switch (lead.temperature) {
      LeadTemperature.hot => Colors.redAccent,
      LeadTemperature.warm => Colors.orange,
      LeadTemperature.cold => Colors.blueGrey,
    };
  }

  @override
  Widget build(BuildContext context) {
    final tone = _temperatureColor();
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Ink(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey.shade200),
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: tone.withValues(alpha: 0.14),
              child: Text(
                lead.customerName.isNotEmpty ? lead.customerName[0].toUpperCase() : '?',
                style: TextStyle(color: tone, fontWeight: FontWeight.w700),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
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
                  Text(
                    '${lead.source} • ${lead.city}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey.shade700),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Follow-up: ${Formatters.date(lead.nextFollowUpAt)}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey.shade700),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: tone.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    lead.temperature.name.toUpperCase(),
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: tone),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  assigneeName,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
