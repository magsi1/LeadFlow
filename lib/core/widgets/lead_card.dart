import 'package:flutter/material.dart';

import '../../data/models/lead.dart';
import '../utils/formatters.dart';

class LeadCard extends StatelessWidget {
  const LeadCard({
    super.key,
    required this.lead,
    required this.assignedName,
    this.onTap,
  });

  final Lead lead;
  final String assignedName;
  final VoidCallback? onTap;

  Color _tempColor(BuildContext context) {
    return switch (lead.temperature) {
      LeadTemperature.hot => Colors.redAccent,
      LeadTemperature.warm => Colors.orange,
      LeadTemperature.cold => Colors.blueGrey,
    };
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tempColor = _tempColor(context);
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      lead.customerName,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: tempColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      lead.temperature.name.toUpperCase(),
                      style: TextStyle(color: tempColor, fontWeight: FontWeight.w700, fontSize: 11),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _tag(context, Icons.phone_outlined, lead.phone),
                  _tag(context, Icons.location_on_outlined, lead.city),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                '${lead.source} • ${lead.productInterest}',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey.shade800, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Status: ${lead.status.name}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey.shade700, fontWeight: FontWeight.w600),
                    ),
                  ),
                  Icon(Icons.person_outline, size: 16, color: cs.primary),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      assignedName,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: cs.primary.withValues(alpha: 0.07),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  'Next follow-up: ${Formatters.dateTime(lead.nextFollowUpAt)}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tag(BuildContext context, IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.grey.shade700),
          const SizedBox(width: 6),
          Text(
            text,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
