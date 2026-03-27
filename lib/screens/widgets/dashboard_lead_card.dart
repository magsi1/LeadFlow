import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/widgets/app_surface.dart';
import 'lead_dashboard_helpers.dart';

/// Primary action pill — hover fill + pointer; [onTap] runs status cycle in parent.
class StatusBadge extends StatefulWidget {
  const StatusBadge({
    super.key,
    required this.label,
    required this.color,
    this.onTap,
  });

  final String label;
  final Color color;
  final VoidCallback? onTap;

  @override
  State<StatusBadge> createState() => _StatusBadgeState();
}

class _StatusBadgeState extends State<StatusBadge> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final interactive = widget.onTap != null;
    final bgAlpha = _hovering && interactive ? 0.26 : 0.15;

    final pill = AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      curve: Curves.easeInOut,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: widget.color.withValues(alpha: bgAlpha),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        widget.label.toUpperCase(),
        style: TextStyle(
          color: widget.color,
          fontWeight: FontWeight.bold,
          fontSize: 12,
        ),
      ),
    );

    if (!interactive) return pill;

    return Tooltip(
      message: 'Tap to cycle status',
      child: GestureDetector(
        onTap: widget.onTap,
        behavior: HitTestBehavior.opaque,
        child: MouseRegion(
          cursor: SystemMouseCursors.click,
          onEnter: (_) => setState(() => _hovering = true),
          onExit: (_) => setState(() => _hovering = false),
          child: pill,
        ),
      ),
    );
  }
}

/// CRM-style lead card: bold left bar, InkWell feedback, clear type scale.
class LeadCard extends StatefulWidget {
  const LeadCard({
    super.key,
    required this.lead,
    required this.lockActions,
    required this.onOpenDetails,
    required this.onLongPressSummary,
    required this.onEdit,
    required this.onDelete,
    required this.formatCreatedAt,
    required this.onCycleStatus,
  });

  final Map<String, dynamic> lead;
  final bool lockActions;
  final VoidCallback onOpenDetails;
  final VoidCallback onLongPressSummary;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final String Function(dynamic createdAt) formatCreatedAt;
  final VoidCallback onCycleStatus;

  @override
  State<LeadCard> createState() => _LeadCardState();
}

class _LeadCardState extends State<LeadCard> {
  bool isHovering = false;

  static const _radius = 18.0;

  static const _nameStyle = TextStyle(
    fontSize: 18,
    fontWeight: FontWeight.w700,
    color: AppColors.textPrimary,
  );

  @override
  Widget build(BuildContext context) {
    final lead = widget.lead;
    final name = (lead['name'] ?? 'Unnamed Lead').toString();
    final source = (lead['source'] ?? 'Unknown').toString();
    final intentRaw = (lead['intent'] ?? 'COLD').toString();
    final intent = intentRaw.toUpperCase();
    final message = (lead['message'] ?? '').toString();
    final createdAt = widget.formatCreatedAt(lead['created_at']);
    final statusColor = colorForIntent(intent);
    final autoReplied = lead['auto_replied'] == true;

    final locked = widget.lockActions;

    const messageStyle = TextStyle(
      fontSize: 14,
      height: 1.35,
      color: AppColors.textSecondary,
    );
    const dateStyle = TextStyle(
      fontSize: 12,
      color: AppColors.textMuted,
    );

    return MouseRegion(
      onEnter: (_) => setState(() => isHovering = true),
      onExit: (_) => setState(() => isHovering = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(_radius),
          border: Border.all(
            color: AppColors.border.withValues(alpha: 0.5),
          ),
          boxShadow: isHovering
              ? [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.12),
                    blurRadius: 18,
                    offset: const Offset(0, 8),
                  ),
                ]
              : AppSurfaces.softShadow,
        ),
        child: InkWell(
          onTap: widget.onOpenDetails,
          onLongPress: widget.onLongPressSummary,
          borderRadius: BorderRadius.circular(_radius),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(_radius),
              border: Border(
                left: BorderSide(
                  color: statusColor,
                  width: 5,
                ),
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Text(
                                name,
                                style: _nameStyle,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                softWrap: false,
                              ),
                            ),
                            const SizedBox(width: 8),
                            StatusBadge(
                              label: intent,
                              color: statusColor,
                              onTap: locked ? null : widget.onCycleStatus,
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 5,
                              ),
                              decoration: BoxDecoration(
                                color: autoReplied
                                    ? const Color(0x1A16A34A)
                                    : const Color(0x1AF59E0B),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                autoReplied ? 'AUTO REPLIED' : 'PENDING',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: autoReplied
                                      ? const Color(0xFF166534)
                                      : const Color(0xFF92400E),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            const Icon(
                              Icons.chat,
                              size: 14,
                              color: AppColors.textMuted,
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                source.toUpperCase(),
                                style: const TextStyle(
                                  color: AppColors.textSecondary,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          message.isEmpty ? 'No message' : message,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: messageStyle,
                        ),
                        const SizedBox(height: 6),
                        Text(
                          createdAt.isEmpty ? 'Date unavailable' : createdAt,
                          style: dateStyle,
                        ),
                      ],
                    ),
                  ),
                  Material(
                    color: Colors.transparent,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          tooltip: locked
                              ? 'Please wait…'
                              : 'Edit lead — change name, message, or intent',
                          onPressed: locked ? null : widget.onEdit,
                          icon: const Icon(
                            Icons.edit_outlined,
                            color: AppColors.textSecondary,
                          ),
                        ),
                        IconButton(
                          tooltip: locked
                              ? 'Please wait…'
                              : 'Delete lead — cannot be undone',
                          onPressed: locked ? null : widget.onDelete,
                          icon: const Icon(
                            Icons.delete_outline,
                            color: AppColors.hot,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
