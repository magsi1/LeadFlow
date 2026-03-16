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
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
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
                      color: _tempColor(context).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      lead.temperature.name.toUpperCase(),
                      style: TextStyle(color: _tempColor(context), fontWeight: FontWeight.w600, fontSize: 12),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text('${lead.phone}  •  ${lead.city}'),
              const SizedBox(height: 6),
              Text('${lead.source} • ${lead.productInterest}'),
              const SizedBox(height: 6),
              Text('Status: ${lead.status.name}'),
              const SizedBox(height: 6),
              Text('Assigned: $assignedName'),
              const SizedBox(height: 6),
              Text('Next follow-up: ${Formatters.dateTime(lead.nextFollowUpAt)}'),
            ],
          ),
        ),
      ),
    );
  }
}
