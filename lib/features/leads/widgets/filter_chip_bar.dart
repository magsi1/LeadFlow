import 'package:flutter/material.dart';

class LeadsFilterChipData {
  const LeadsFilterChipData({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
    this.color,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;
  final Color? color;
}

class FilterChipBar extends StatelessWidget {
  const FilterChipBar({super.key, required this.items});

  final List<LeadsFilterChipData> items;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: items.map((item) {
          final tone = item.color ?? cs.primary;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: InkWell(
              borderRadius: BorderRadius.circular(999),
              onTap: item.onTap,
              child: Ink(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: item.selected ? tone.withValues(alpha: 0.16) : Colors.white,
                  border: Border.all(
                    color: item.selected ? tone.withValues(alpha: 0.6) : Colors.grey.shade300,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      item.label,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: item.selected ? tone : Colors.grey.shade800,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(999),
                        color: item.selected ? tone.withValues(alpha: 0.2) : Colors.grey.shade200,
                      ),
                      child: Text(
                        '${item.count}',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: item.selected ? tone : Colors.grey.shade700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
