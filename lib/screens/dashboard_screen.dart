import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// CRM dashboard: hot / warm / cold summary cards + lead list from Supabase `leads`.
///
/// Expects columns: `phone`, `message`, `status` (or `stage`), `created_at`.
/// Uses Realtime stream filtered by `assigned_to` when signed in (RLS-aligned).
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late final StreamSubscription<AuthState> _authSub;

  static Stream<List<_LeadRow>> _leadsStreamForUser(String userId) {
    return Supabase.instance.client
        .from('leads')
        .stream(primaryKey: ['id'])
        .eq('assigned_to', userId)
        .order('created_at', ascending: false)
        .map((rows) {
          final list = rows
              .map(
                (e) => _LeadRow.fromMap(
                  Map<String, dynamic>.from(e as Map),
                ),
              )
              .toList();
          list.sort((a, b) {
            final da = a.createdAt;
            final db = b.createdAt;
            if (da == null && db == null) return 0;
            if (da == null) return 1;
            if (db == null) return -1;
            return db.compareTo(da);
          });
          return list;
        });
  }

  @override
  void initState() {
    super.initState();
    _authSub = Supabase.instance.client.auth.onAuthStateChange.listen((_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    unawaited(_authSub.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final user = Supabase.instance.client.auth.currentUser;

    return Scaffold(
      appBar: AppBar(
        title: const Text('LeadFlow'),
        centerTitle: false,
      ),
      body: user == null
          ? Center(
              child: Text(
                'Sign in to view leads',
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: cs.onSurfaceVariant,
                ),
              ),
            )
          : StreamBuilder<List<_LeadRow>>(
              key: ValueKey<String>(user.id),
              stream: _leadsStreamForUser(user.id),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.error_outline, size: 48, color: cs.error),
                          const SizedBox(height: 12),
                          Text(
                            'Could not load leads',
                            style: theme.textTheme.titleMedium,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '${snapshot.error}',
                            textAlign: TextAlign.center,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: cs.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                if (!snapshot.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }

                final leads = snapshot.data!;
                final hotCount = leads.where((l) => l.bucket == 'hot').length;
                final warmCount = leads.where((l) => l.bucket == 'warm').length;
                final coldCount = leads.where((l) => l.bucket == 'cold').length;

                return LayoutBuilder(
                  builder: (context, constraints) {
                    final maxW = constraints.maxWidth;
                    final horizontalPad = maxW > 1200
                        ? 32.0
                        : maxW > 600
                            ? 20.0
                            : 16.0;
                    final contentMax = maxW > 900 ? 960.0 : maxW;

                    return Align(
                      alignment: Alignment.topCenter,
                      child: ConstrainedBox(
                        constraints: BoxConstraints(maxWidth: contentMax),
                        child: ListView(
                          padding: EdgeInsets.fromLTRB(
                            horizontalPad,
                            16,
                            horizontalPad,
                            24,
                          ),
                          children: [
                            _SummaryCardsRow(
                              hotCount: hotCount,
                              warmCount: warmCount,
                              coldCount: coldCount,
                              maxWidth: maxW,
                            ),
                            const SizedBox(height: 20),
                            Text(
                              'Recent leads',
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 12),
                            if (leads.isEmpty)
                              Padding(
                                padding:
                                    const EdgeInsets.symmetric(vertical: 48),
                                child: Center(
                                  child: Text(
                                    'No leads yet',
                                    style: theme.textTheme.bodyLarge?.copyWith(
                                      color: cs.onSurfaceVariant,
                                    ),
                                  ),
                                ),
                              )
                            else
                              ...leads.map(
                                (lead) => Padding(
                                  padding: const EdgeInsets.only(bottom: 12),
                                  child: _LeadTile(lead: lead),
                                ),
                              ),
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
            ),
    );
  }
}

class _LeadRow {
  _LeadRow({
    required this.phone,
    required this.message,
    required this.status,
    required this.createdAt,
    required this.bucket,
  });

  final String phone;
  final String message;
  final String status;
  final DateTime? createdAt;
  final String bucket;

  static _LeadRow fromMap(Map<String, dynamic> map) {
    final phone = (map['phone'] ?? '').toString().trim();
    final message = (map['message'] ?? '').toString().trim();
    final raw =
        (map['status'] ?? map['stage'] ?? '').toString().toLowerCase().trim();
    final bucket = _normalizeBucket(raw);
    final createdAt = _parseDate(map['created_at']);

    return _LeadRow(
      phone: phone.isEmpty ? '—' : phone,
      message: message,
      status: raw.isEmpty ? bucket : raw,
      createdAt: createdAt,
      bucket: bucket,
    );
  }

  static DateTime? _parseDate(Object? value) {
    if (value == null) return null;
    if (value is DateTime) return value;
    return DateTime.tryParse(value.toString());
  }

  static String _normalizeBucket(String raw) {
    if (raw == 'hot' || raw == 'warm' || raw == 'cold') {
      return raw;
    }
    return 'cold';
  }
}

class _SummaryCardsRow extends StatelessWidget {
  const _SummaryCardsRow({
    required this.hotCount,
    required this.warmCount,
    required this.coldCount,
    required this.maxWidth,
  });

  final int hotCount;
  final int warmCount;
  final int coldCount;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    if (maxWidth >= 720) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: _StatCard(
              label: 'Hot Leads',
              count: hotCount,
              accent: Colors.red.shade400,
              icon: Icons.local_fire_department_outlined,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _StatCard(
              label: 'Warm Leads',
              count: warmCount,
              accent: Colors.orange.shade600,
              icon: Icons.wb_sunny_outlined,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _StatCard(
              label: 'Cold Leads',
              count: coldCount,
              accent: Colors.blue.shade600,
              icon: Icons.ac_unit,
            ),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _StatCard(
          label: 'Hot Leads',
          count: hotCount,
          accent: Colors.red.shade400,
          icon: Icons.local_fire_department_outlined,
        ),
        const SizedBox(height: 12),
        _StatCard(
          label: 'Warm Leads',
          count: warmCount,
          accent: Colors.orange.shade600,
          icon: Icons.wb_sunny_outlined,
        ),
        const SizedBox(height: 12),
        _StatCard(
          label: 'Cold Leads',
          count: coldCount,
          accent: Colors.blue.shade600,
          icon: Icons.ac_unit,
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.count,
    required this.accent,
    required this.icon,
  });

  final String label;
  final int count;
  final Color accent;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;

    return Material(
      elevation: 1,
      shadowColor: Colors.black26,
      color: cs.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: accent.withValues(alpha: 0.35),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: accent, size: 26),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: cs.onSurfaceVariant,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '$count',
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: accent,
                    ),
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

class _LeadTile extends StatelessWidget {
  const _LeadTile({required this.lead});

  final _LeadRow lead;

  Color _badgeColor(String bucket) {
    switch (bucket) {
      case 'hot':
        return Colors.red.shade400;
      case 'warm':
        return Colors.orange.shade600;
      case 'cold':
      default:
        return Colors.blue.shade600;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final badgeColor = _badgeColor(lead.bucket);
    final dateStr = lead.createdAt != null
        ? DateFormat.yMMMd().add_jm().format(lead.createdAt!.toLocal())
        : '—';

    return Material(
      elevation: 0.5,
      color: cs.surfaceContainerLow,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    lead.phone,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                _StatusBadge(
                  label: lead.status,
                  color: badgeColor,
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              lead.message.isEmpty ? 'No message' : lead.message,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: cs.onSurfaceVariant,
                height: 1.35,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              dateStr,
              style: theme.textTheme.bodySmall?.copyWith(
                color: cs.outline,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({
    required this.label,
    required this.color,
  });

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final display = label.isEmpty ? 'cold' : label;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Text(
        display.toUpperCase(),
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}
