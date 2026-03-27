import 'package:flutter/material.dart';

import '../data/models/dashboard_lead.dart';
import '../data/services/supabase_dashboard_service.dart';
import '../services/whatsapp_service.dart';

// --- Helpers (production-ready; no "stage" — only "status") ---

/// Counts leads matching [status].
///
/// For `'hot'`, `'warm'`, and `'cold'`, matches the **temperature bucket** derived
/// from each lead's [DashboardLead.status] (supports both temperature strings and
/// pipeline values like `new`, `contacted`, `follow_up`).
/// For any other [status], matches [DashboardLead.status] exactly (case-insensitive).
int countByStatus(List<DashboardLead> leads, String status) {
  final key = status.toLowerCase().trim();
  const buckets = {'hot', 'warm', 'cold'};
  if (buckets.contains(key)) {
    return leads
        .where((l) => _temperatureBucketFromStatus(l.status) == key)
        .length;
  }
  return leads.where((l) => l.status.toLowerCase().trim() == key).length;
}

/// Maps DB/UI `status` to hot | warm | cold for summary cards and colors.
String _temperatureBucketFromStatus(String status) {
  final s = status.toLowerCase().trim();
  if (s == 'hot' || s == 'follow_up') return 'hot';
  if (s == 'warm' || s == 'contacted') return 'warm';
  if (s == 'cold' || s == 'new' || s == 'closed') return 'cold';
  if (s.contains('hot')) return 'hot';
  if (s.contains('warm')) return 'warm';
  if (s.contains('cold')) return 'cold';
  return 'warm';
}

/// Badge / accent color for a lead's [status] (temperature bucket).
Color statusColor(String status) {
  switch (_temperatureBucketFromStatus(status)) {
    case 'hot':
      return const Color(0xFFE53935);
    case 'warm':
      return const Color(0xFFFF9800);
    case 'cold':
    default:
      return const Color(0xFF1E88E5);
  }
}

String _statusBadgeLabel(String status) {
  switch (_temperatureBucketFromStatus(status)) {
    case 'hot':
      return 'Hot';
    case 'warm':
      return 'Warm';
    case 'cold':
    default:
      return 'Cold';
  }
}

String _safeText(String? value, {String empty = '—'}) {
  if (value == null) return empty;
  final t = value.trim();
  return t.isEmpty ? empty : t;
}

/// Digits only — strips `+`, spaces, etc. (same normalization as [WhatsAppService]).
String _whatsappDigitsOnly(String raw) {
  return raw.replaceAll(RegExp(r'\D'), '');
}

Future<void> _openWhatsAppForLead(
  BuildContext context,
  String rawPhone,
  String leadName,
) async {
  if (_whatsappDigitsOnly(rawPhone).isEmpty) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('No phone number available')),
    );
    return;
  }

  final name = leadName.trim().isEmpty ? 'there' : leadName.trim();
  final message =
      'Hi $name, I saw your interest. How can I help you today?';

  try {
    final result = await WhatsAppService.sendWhatsAppMessage(
      phone: rawPhone,
      message: message,
    );
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Message sent (${result.statusCode})')),
    );
  } on WhatsAppConfigException catch (e) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('WhatsApp not configured: $e')),
    );
  } on WhatsAppApiException catch (e) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('WhatsApp API error: $e')),
    );
  } catch (e) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Could not send: $e')),
    );
  }
}

/// Small label for `follow_up` rows: scheduled time or [Sent].
String? _followUpScheduleLabel(DashboardLead lead) {
  if (lead.status.toLowerCase().trim() != 'follow_up') return null;
  if (lead.followUpSent) return 'Sent';
  if (lead.followUpTime == null) return 'Follow-up in 30 min';
  final diff = lead.followUpTime!.difference(DateTime.now());
  if (diff.isNegative) return 'Follow-up due';
  final m = diff.inMinutes;
  if (m >= 29 && m <= 31) return 'Follow-up in 30 min';
  if (m < 1) return 'Follow-up in <1 min';
  return 'Follow-up in ~$m min';
}

List<DashboardLead> _mockLeads() {
  final now = DateTime.now();
  return <DashboardLead>[
    DashboardLead(
      id: 'mock-1',
      name: 'Alex Rivera',
      phone: '+1 555 0101',
      status: 'hot',
      createdAt: now,
    ),
    DashboardLead(
      id: 'mock-2',
      name: 'Sam Chen',
      phone: '+1 555 0102',
      status: 'warm',
      createdAt: now.subtract(const Duration(minutes: 12)),
    ),
    DashboardLead(
      id: 'mock-3',
      name: 'Jordan Lee',
      phone: '+1 555 0103',
      status: 'cold',
      createdAt: now.subtract(const Duration(hours: 1)),
    ),
    DashboardLead(
      id: 'mock-4',
      name: 'Taylor Morgan',
      phone: '+1 555 0199',
      status: 'follow_up',
      createdAt: now.subtract(const Duration(hours: 2)),
      followUpTime: now.add(const Duration(minutes: 28)),
      followUpSent: false,
    ),
    DashboardLead(
      id: 'mock-5',
      name: '',
      phone: '+1 555 0105',
      status: 'new',
      createdAt: now.subtract(const Duration(days: 1)),
    ),
  ];
}

Future<List<DashboardLead>> fetchLeads() async {
  try {
    final list = await SupabaseDashboardService.fetchDashboardLeads();
    return list;
  } catch (_) {
    // API unavailable / not configured — use safe mock data so UI still runs.
    return _mockLeads();
  }
}

/// Dashboard: totals, temperature summary, recent leads — uses `status` only.
class LeadDashboardScreen extends StatefulWidget {
  const LeadDashboardScreen({super.key});

  @override
  State<LeadDashboardScreen> createState() => _LeadDashboardScreenState();
}

class _LeadDashboardScreenState extends State<LeadDashboardScreen> {
  late Future<List<DashboardLead>> _leadsFuture;

  @override
  void initState() {
    super.initState();
    _leadsFuture = fetchLeads();
  }

  void _reload() {
    final next = fetchLeads();
    setState(() => _leadsFuture = next);
  }

  Future<void> _refreshPull() async {
    final next = fetchLeads();
    setState(() => _leadsFuture = next);
    await next;
  }

  List<DashboardLead> _recentFive(List<DashboardLead> leads) {
    final copy = List<DashboardLead>.from(leads);
    copy.sort((a, b) {
      final ta = a.createdAt;
      final tb = b.createdAt;
      if (ta == null && tb == null) return 0;
      if (ta == null) return 1;
      if (tb == null) return -1;
      return tb.compareTo(ta);
    });
    return copy.take(5).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0F172A),
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text(
          'Dashboard',
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 20),
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _reload,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: FutureBuilder<List<DashboardLead>>(
        future: _leadsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(),
            );
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Something went wrong: ${snapshot.error}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.red),
                ),
              ),
            );
          }

          final leads = snapshot.data ?? <DashboardLead>[];
          final recent = _recentFive(leads);
          final total = leads.length;
          final newCount = countByStatus(leads, 'new');
          final hotCount = countByStatus(leads, 'hot');
          final warmCount = countByStatus(leads, 'warm');
          final coldCount = countByStatus(leads, 'cold');

          return RefreshIndicator(
            onRefresh: _refreshPull,
            child: LayoutBuilder(
              builder: (context, constraints) {
                return SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: EdgeInsets.fromLTRB(
                    16,
                    16,
                    16,
                    16 + MediaQuery.paddingOf(context).bottom,
                  ),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minHeight: constraints.maxHeight),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 720),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              'Overview',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: const Color(0xFF0F172A),
                                  ),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: _MetricCard(
                                    title: 'Total leads',
                                    value: '$total',
                                    subtitle: 'In your pipeline',
                                    color: const Color(0xFF0F172A),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: _MetricCard(
                                    title: 'New',
                                    value: '$newCount',
                                    subtitle: 'Status: new',
                                    color: const Color(0xFF475569),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 28),
                            Text(
                              'Status summary',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: const Color(0xFF0F172A),
                                  ),
                            ),
                            const SizedBox(height: 12),
                            Builder(
                              builder: (context) {
                                final w = constraints.maxWidth;
                                final cols = w >= 560 ? 4 : 2;
                                return GridView.count(
                                  crossAxisCount: cols,
                                  shrinkWrap: true,
                                  physics: const NeverScrollableScrollPhysics(),
                                  mainAxisSpacing: 10,
                                  crossAxisSpacing: 10,
                                  childAspectRatio: cols == 4 ? 2.1 : 2.0,
                                  children: [
                                    _TemperatureCard(
                                      label: 'New',
                                      count: newCount,
                                      color: const Color(0xFF7C3AED),
                                    ),
                                    _TemperatureCard(
                                      label: 'Hot',
                                      count: hotCount,
                                      color: statusColor('hot'),
                                    ),
                                    _TemperatureCard(
                                      label: 'Warm',
                                      count: warmCount,
                                      color: statusColor('warm'),
                                    ),
                                    _TemperatureCard(
                                      label: 'Cold',
                                      count: coldCount,
                                      color: statusColor('cold'),
                                    ),
                                  ],
                                );
                              },
                            ),
                            const SizedBox(height: 28),
                            Text(
                              'Recent leads',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: const Color(0xFF0F172A),
                                  ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Last 5 by date',
                              style: TextStyle(
                                fontSize: 13,
                                color: Colors.grey.shade600,
                              ),
                            ),
                            const SizedBox(height: 12),
                            if (recent.isEmpty)
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: 32),
                                child: Text(
                                  'No leads yet',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(color: Colors.grey.shade600),
                                ),
                              )
                            else
                              ListView.builder(
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                itemCount: recent.length,
                                itemBuilder: (context, index) {
                                  final lead = recent[index];
                                  final name = _safeText(
                                    lead.name.isEmpty ? null : lead.name,
                                  );
                                  final phone = _safeText(
                                    lead.phone.isEmpty ? null : lead.phone,
                                  );
                                  final badgeColor = statusColor(lead.status);
                                  final badgeLabel =
                                      _statusBadgeLabel(lead.status);
                                  final followUpHint =
                                      _followUpScheduleLabel(lead);

                                  return Padding(
                                    padding: const EdgeInsets.only(bottom: 10),
                                    child: _RecentLeadRow(
                                      name: name,
                                      phone: phone,
                                      phoneRaw: lead.phone,
                                      leadNameRaw: lead.name,
                                      badgeLabel: badgeLabel,
                                      badgeColor: badgeColor,
                                      followUpHint: followUpHint,
                                    ),
                                  );
                                },
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.title,
    required this.value,
    required this.subtitle,
    required this.color,
  });

  final String title;
  final String value;
  final String subtitle;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Colors.grey.shade700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w800,
                color: color,
                height: 1.05,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey.shade500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TemperatureCard extends StatelessWidget {
  const _TemperatureCard({
    required this.label,
    required this.count,
    required this.color,
  });

  final String label;
  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: color,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              '$count',
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: Color(0xFF0F172A),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RecentLeadRow extends StatelessWidget {
  const _RecentLeadRow({
    required this.name,
    required this.phone,
    required this.phoneRaw,
    required this.leadNameRaw,
    required this.badgeLabel,
    required this.badgeColor,
    this.followUpHint,
  });

  final String name;
  final String phone;
  /// Unformatted value from [DashboardLead.phone] for `wa.me` (digits extracted on tap).
  final String phoneRaw;
  /// Raw name from [DashboardLead.name] for WhatsApp message personalization.
  final String leadNameRaw;
  final String badgeLabel;
  final Color badgeColor;
  /// e.g. `Follow-up in 30 min` / `Sent` when [DashboardLead.status] is `follow_up`.
  final String? followUpHint;

  @override
  Widget build(BuildContext context) {
    final hasPhone = _whatsappDigitsOnly(phoneRaw).isNotEmpty;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(left: 6, right: 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      phone,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.grey.shade600,
                      ),
                    ),
                    if (followUpHint != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        followUpHint!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: followUpHint == 'Sent'
                              ? const Color(0xFF16A34A)
                              : const Color(0xFF7C3AED),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: badgeColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                badgeLabel,
                style: TextStyle(
                  color: badgeColor,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
            ),
            IconButton(
              tooltip: 'Open WhatsApp',
              onPressed: hasPhone
                  ? () => _openWhatsAppForLead(
                        context,
                        phoneRaw,
                        leadNameRaw,
                      )
                  : null,
              icon: const Icon(
                Icons.chat_bubble_rounded,
                color: Color(0xFF25D366),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
