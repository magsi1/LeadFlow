import 'package:flutter/material.dart';

class LeadsHeader extends StatelessWidget {
  const LeadsHeader({
    super.key,
    required this.searchController,
    required this.onSearchChanged,
    required this.onFilterTap,
    required this.onAddTap,
    this.onExportTap,
    required this.isDesktop,
  });

  final TextEditingController searchController;
  final ValueChanged<String> onSearchChanged;
  final VoidCallback onFilterTap;
  final VoidCallback onAddTap;
  final VoidCallback? onExportTap;
  final bool isDesktop;

  @override
  Widget build(BuildContext context) {
    final actionButtons = [
      OutlinedButton.icon(
        onPressed: onFilterTap,
        icon: const Icon(Icons.filter_alt_outlined),
        label: const Text('Filters'),
      ),
      if (onExportTap != null)
        OutlinedButton.icon(
          onPressed: onExportTap,
          icon: const Icon(Icons.ios_share_outlined),
          label: const Text('Export'),
        ),
      FilledButton.icon(
        onPressed: onAddTap,
        icon: const Icon(Icons.add),
        label: const Text('Add Lead'),
      ),
    ];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Leads', style: Theme.of(context).textTheme.headlineSmall),
                      const SizedBox(height: 4),
                      Text(
                        'Track, prioritize and convert your incoming leads faster.',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey.shade700),
                      ),
                    ],
                  ),
                ),
                if (isDesktop) ...[
                  const SizedBox(width: 12),
                  ...actionButtons
                      .map((e) => Padding(
                            padding: const EdgeInsets.only(left: 8),
                            child: e,
                          )),
                ],
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: searchController,
                    onChanged: onSearchChanged,
                    decoration: const InputDecoration(
                      hintText: 'Search by name, phone, city, source...',
                      prefixIcon: Icon(Icons.search),
                    ),
                  ),
                ),
              ],
            ),
            if (!isDesktop) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: actionButtons,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
