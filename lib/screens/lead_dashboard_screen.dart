import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart' hide TextDirection;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/theme/app_colors.dart';
import '../core/widgets/app_surface.dart';
import '../data/models/dashboard_lead.dart';
import '../data/services/supabase_dashboard_service.dart';
import '../services/whatsapp_service.dart';
import 'pipeline_screen.dart';

// --- Data helpers (shared with other screens) ---

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

/// Maps any [DashboardLead.status] to pipeline stage for counts / chart / tabs.
String _pipelineStageForUi(String status) {
  final s = status.toLowerCase().trim();
  if (s == 'new' ||
      s == 'contacted' ||
      s == 'follow_up' ||
      s == 'closed') {
    return s;
  }
  if (s == 'hot') return 'follow_up';
  if (s == 'warm') return 'contacted';
  if (s == 'cold') return 'new';
  return 'new';
}

Color _temperatureFg(String status) {
  switch (_temperatureBucketFromStatus(status)) {
    case 'hot':
      return AppColors.hot;
    case 'warm':
      return AppColors.warm;
    case 'cold':
    default:
      return AppColors.cold;
  }
}

Color _temperatureBg(String status) {
  switch (_temperatureBucketFromStatus(status)) {
    case 'hot':
      return AppColors.hotBg;
    case 'warm':
      return AppColors.warmBg;
    case 'cold':
    default:
      return AppColors.coldBg;
  }
}

Color _pipelineStageFg(String stage) {
  switch (stage) {
    case 'new':
      return AppColors.statusNew;
    case 'contacted':
      return AppColors.pipelineContacted;
    case 'follow_up':
      return AppColors.pipelineFollowUp;
    case 'closed':
      return AppColors.closed;
    default:
      return AppColors.textSecondary;
  }
}

Color _pipelineStageBg(String stage) {
  switch (stage) {
    case 'new':
      return AppColors.newBg;
    case 'contacted':
      return const Color(0xFFECFDF5);
    case 'follow_up':
      return const Color(0xFFFFFBEB);
    case 'closed':
      return AppColors.primaryLight;
    default:
      return AppColors.surfaceMuted;
  }
}

String _pipelineStageLabel(String stage) {
  switch (stage) {
    case 'new':
      return 'NEW';
    case 'contacted':
      return 'CONTACTED';
    case 'follow_up':
      return 'FOLLOW-UP';
    case 'closed':
      return 'CLOSED';
    default:
      return stage.toUpperCase();
  }
}

Map<String, int> _pipelineCounts(List<DashboardLead> leads) {
  var n = 0, c = 0, f = 0, cl = 0;
  for (final l in leads) {
    switch (_pipelineStageForUi(l.status)) {
      case 'new':
        n++;
        break;
      case 'contacted':
        c++;
        break;
      case 'follow_up':
        f++;
        break;
      case 'closed':
        cl++;
        break;
    }
  }
  return {'new': n, 'contacted': c, 'follow_up': f, 'closed': cl};
}

double _contactedOrBeyondRatio(List<DashboardLead> leads) {
  if (leads.isEmpty) return 0;
  final m = _pipelineCounts(leads);
  final beyond =
      (m['contacted'] ?? 0) + (m['follow_up'] ?? 0) + (m['closed'] ?? 0);
  return beyond / leads.length;
}

String _safeText(String? value, {String empty = '—'}) {
  if (value == null) return empty;
  final t = value.trim();
  return t.isEmpty ? empty : t;
}

String _initials(String name) {
  final parts =
      name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) {
    return parts[0].substring(0, math.min(2, parts[0].length)).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

String _userInitials() {
  final u = Supabase.instance.client.auth.currentUser;
  final meta = u?.userMetadata;
  final name = (meta?['full_name'] ?? meta?['name'] ?? '').toString().trim();
  if (name.isNotEmpty) return _initials(name);
  final email = u?.email ?? '';
  if (email.isEmpty) return 'U';
  final local = email.split('@').first;
  return local.length >= 2
      ? local.substring(0, 2).toUpperCase()
      : local.toUpperCase();
}

String _defaultSourceLabel() => 'WHATSAPP';

String _digitsOnly(String raw) => raw.replaceAll(RegExp(r'\D'), '');

Future<void> _openWhatsAppForLead(
  BuildContext context,
  String rawPhone,
  String leadName,
) async {
  if (_digitsOnly(rawPhone).isEmpty) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'No phone number available',
          style: GoogleFonts.inter(
            fontSize: 14,
            color: AppColors.textPrimary,
          ),
        ),
      ),
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
      SnackBar(
        content: Text(
          'Message sent (${result.statusCode})',
          style: GoogleFonts.inter(
            fontSize: 14,
            color: AppColors.textPrimary,
          ),
        ),
      ),
    );
  } on WhatsAppConfigException catch (e) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'WhatsApp not configured: $e',
          style: GoogleFonts.inter(
            fontSize: 14,
            color: AppColors.textPrimary,
          ),
        ),
      ),
    );
  } on WhatsAppApiException catch (e) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'WhatsApp API error: $e',
          style: GoogleFonts.inter(
            fontSize: 14,
            color: AppColors.textPrimary,
          ),
        ),
      ),
    );
  } catch (e) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Could not send: $e',
          style: GoogleFonts.inter(
            fontSize: 14,
            color: AppColors.textPrimary,
          ),
        ),
      ),
    );
  }
}

List<DashboardLead> _mockLeads() {
  final now = DateTime.now();
  return <DashboardLead>[
    DashboardLead(
      id: 'mock-1',
      name: 'Alex Rivera',
      phone: '+1 555 0101',
      status: 'contacted',
      createdAt: now,
    ),
    DashboardLead(
      id: 'mock-2',
      name: 'Sam Chen',
      phone: '+1 555 0102',
      status: 'new',
      createdAt: now.subtract(const Duration(minutes: 12)),
    ),
    DashboardLead(
      id: 'mock-3',
      name: 'Jordan Lee',
      phone: '+1 555 0103',
      status: 'closed',
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
      name: 'Casey',
      phone: '+1 555 0105',
      status: 'new',
      createdAt: now.subtract(const Duration(days: 1)),
    ),
  ];
}

Future<List<DashboardLead>> fetchLeads() async {
  try {
    return await SupabaseDashboardService.fetchDashboardLeads();
  } catch (_) {
    return _mockLeads();
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

class LeadDashboardScreen extends StatefulWidget {
  const LeadDashboardScreen({super.key});

  @override
  State<LeadDashboardScreen> createState() => _LeadDashboardScreenState();
}

class _LeadDashboardScreenState extends State<LeadDashboardScreen> {
  late Future<List<DashboardLead>> _leadsFuture;
  final TextEditingController _searchController = TextEditingController();

  /// 0 = All, 1 = New, 2 = Contacted, 3 = Follow-up, 4 = Closed
  int _pipelineTabIndex = 0;

  String _stageFilter = 'all';
  String _followFilter = 'all';

  @override
  void initState() {
    super.initState();
    _leadsFuture = fetchLeads();
    _searchController.addListener(_onSearchChanged);
  }

  void _onSearchChanged() => setState(() {});

  @override
  void dispose() {
    _searchController.removeListener(_onSearchChanged);
    _searchController.dispose();
    super.dispose();
  }

  void _reload() {
    setState(() => _leadsFuture = fetchLeads());
  }

  Future<void> _refreshPull() async {
    final next = fetchLeads();
    setState(() => _leadsFuture = next);
    await next;
  }

  void _onAddLead() {
    unawaited(
      Navigator.push<void>(
        context,
        MaterialPageRoute<void>(builder: (_) => const PipelineScreen()),
      ),
    );
  }

  List<DashboardLead> _applyFilters(List<DashboardLead> leads) {
    final q = _searchController.text.trim().toLowerCase();
    Iterable<DashboardLead> it = leads;

    if (q.isNotEmpty) {
      it = it.where((l) {
        final name = l.name.toLowerCase();
        final phone = l.phone.toLowerCase();
        return name.contains(q) || phone.contains(q);
      });
    }

    if (_pipelineTabIndex != 0) {
      const keys = ['', 'new', 'contacted', 'follow_up', 'closed'];
      final stage = keys[_pipelineTabIndex];
      it = it.where((l) => _pipelineStageForUi(l.status) == stage);
    }

    if (_stageFilter != 'all') {
      it = it.where((l) => _pipelineStageForUi(l.status) == _stageFilter);
    }

    if (_followFilter == 'needs_followup') {
      it = it.where(
        (l) =>
            _pipelineStageForUi(l.status) == 'follow_up' && !l.followUpSent,
      );
    }

    return it.toList();
  }

  List<DashboardLead> _sortedByRecent(List<DashboardLead> leads) {
    final copy = List<DashboardLead>.from(leads);
    copy.sort((a, b) {
      final ta = a.createdAt;
      final tb = b.createdAt;
      if (ta == null && tb == null) return 0;
      if (ta == null) return 1;
      if (tb == null) return -1;
      return tb.compareTo(ta);
    });
    return copy;
  }

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat.MMMd();

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        title: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(12),
              ),
              alignment: Alignment.center,
              child: Text(
                'LF',
                style: GoogleFonts.inter(
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                  color: Colors.white,
                  letterSpacing: -0.5,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              'LeadFlow',
              style: GoogleFonts.inter(
                fontWeight: FontWeight.w700,
                fontSize: 20,
                color: AppColors.textPrimary,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Account',
            onPressed: () {},
            icon: CircleAvatar(
              radius: 18,
              backgroundColor: AppColors.primary,
              child: Text(
                _userInitials(),
                style: GoogleFonts.inter(
                  fontWeight: FontWeight.w600,
                  fontSize: 12,
                  color: Colors.white,
                ),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Refresh',
            onPressed: _reload,
            icon: const Icon(Icons.refresh_rounded, color: AppColors.textSecondary),
          ),
          IconButton(
            tooltip: 'Add person',
            onPressed: _onAddLead,
            icon: const Icon(Icons.person_add_outlined, color: AppColors.textSecondary),
          ),
        ],
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, thickness: 1, color: AppColors.divider),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _onAddLead,
        backgroundColor: AppColors.primary,
        elevation: 4,
        icon: const Icon(Icons.add, color: Colors.white),
        label: Text(
          'Add Lead',
          style: GoogleFonts.inter(
            fontWeight: FontWeight.w600,
            fontSize: 14,
            color: Colors.white,
          ),
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      body: FutureBuilder<List<DashboardLead>>(
        future: _leadsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Something went wrong: ${snapshot.error}',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(color: Colors.red),
                ),
              ),
            );
          }

          final allLeads = snapshot.data ?? <DashboardLead>[];
          final pc = _pipelineCounts(allLeads);
          final newC = pc['new'] ?? 0;
          final contactedC = pc['contacted'] ?? 0;
          final followC = pc['follow_up'] ?? 0;
          final closedC = pc['closed'] ?? 0;
          final total = allLeads.length;
          final followUpCount = followC;
          final progressRatio = _contactedOrBeyondRatio(allLeads);

          final filtered = _applyFilters(allLeads);
          final displayLeads = _sortedByRecent(filtered);

          final bottomInset =
              88.0 + MediaQuery.paddingOf(context).bottom;

          return RefreshIndicator(
            onRefresh: _refreshPull,
            color: AppColors.primary,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverPadding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 16,
                  ),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate([
                      if (followUpCount > 0)
                        _FollowUpBanner(
                          count: followUpCount,
                          onSendNow: _onAddLead,
                        ),
                      _StatStrip(
                        total: total,
                        newCount: newC,
                        contactedCount: contactedC,
                        followUpCount: followC,
                        closedCount: closedC,
                        progressRatio: progressRatio,
                      ),
                      _PipelineOverviewSection(
                        counts: [newC, contactedC, followC, closedC],
                        progressRatio: progressRatio,
                      ),
                      SizedBox(
                        height: 44,
                        child: ListView(
                          scrollDirection: Axis.horizontal,
                          children: [
                            _PipelineTab(
                              label: 'All',
                              count: total,
                              active: _pipelineTabIndex == 0,
                              onTap: () =>
                                  setState(() => _pipelineTabIndex = 0),
                            ),
                            _PipelineTab(
                              label: 'New Leads',
                              count: newC,
                              active: _pipelineTabIndex == 1,
                              onTap: () =>
                                  setState(() => _pipelineTabIndex = 1),
                            ),
                            _PipelineTab(
                              label: 'Contacted',
                              count: contactedC,
                              active: _pipelineTabIndex == 2,
                              onTap: () =>
                                  setState(() => _pipelineTabIndex = 2),
                            ),
                            _PipelineTab(
                              label: 'Follow-up',
                              count: followC,
                              active: _pipelineTabIndex == 3,
                              onTap: () =>
                                  setState(() => _pipelineTabIndex = 3),
                            ),
                            _PipelineTab(
                              label: 'Closed',
                              count: closedC,
                              active: _pipelineTabIndex == 4,
                              onTap: () =>
                                  setState(() => _pipelineTabIndex = 4),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _searchController,
                              style: GoogleFonts.inter(
            fontSize: 14,
            color: AppColors.textPrimary,
          ),
                              decoration: InputDecoration(
                                hintText: 'Search leads...',
                                hintStyle: GoogleFonts.inter(
                                  color: AppColors.textMuted,
                                  fontSize: 14,
                                ),
                                prefixIcon: const Icon(
                                  Icons.search,
                                  color: AppColors.textMuted,
                                  size: 20,
                                ),
                                filled: true,
                                fillColor: AppColors.surface,
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  borderSide: const BorderSide(
                                    color: AppColors.divider,
                                  ),
                                ),
                                enabledBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  borderSide: const BorderSide(
                                    color: AppColors.divider,
                                  ),
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  borderSide: const BorderSide(
                                    color: AppColors.primary,
                                    width: 1.5,
                                  ),
                                ),
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 12,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          _FilterDropdown(
                            value: _stageFilter,
                            options: const [
                              _FilterOption('all', 'All'),
                              _FilterOption('new', 'New'),
                              _FilterOption('contacted', 'Contacted'),
                              _FilterOption('follow_up', 'Follow-up'),
                              _FilterOption('closed', 'Closed'),
                            ],
                            onChanged: (v) => setState(() => _stageFilter = v),
                          ),
                          const SizedBox(width: 8),
                          _FilterDropdown(
                            value: _followFilter,
                            options: const [
                              _FilterOption('all', 'All follow'),
                              _FilterOption(
                                'needs_followup',
                                'Needs follow-up',
                              ),
                            ],
                            onChanged: (v) => setState(() => _followFilter = v),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                    ]),
                  ),
                ),
                if (displayLeads.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Center(
                        child: Text(
                          'No leads match your filters.',
                          style: GoogleFonts.inter(
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ),
                    ),
                  )
                else
                  SliverPadding(
                    padding: EdgeInsets.fromLTRB(20, 0, 20, bottomInset),
                    sliver: SliverList.separated(
                      itemCount: displayLeads.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final lead = displayLeads[index];
                        final stage = _pipelineStageForUi(lead.status);
                        return _LeadCard(
                          lead: lead,
                          stage: stage,
                          sourceLabel: _defaultSourceLabel(),
                          formattedDate: lead.createdAt != null
                              ? dateFmt.format(lead.createdAt!.toLocal())
                              : '—',
                          onChat: () => _openWhatsAppForLead(
                            context,
                            lead.phone,
                            lead.name,
                          ),
                          onEdit: _onAddLead,
                          onDelete: () {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  'Manage or delete leads from the Pipeline screen.',
                                  style: GoogleFonts.inter(
            fontSize: 14,
            color: AppColors.textPrimary,
          ),
                                ),
                              ),
                            );
                          },
                        );
                      },
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _FollowUpBanner extends StatelessWidget {
  const _FollowUpBanner({
    required this.count,
    required this.onSendNow,
  });

  final int count;
  final VoidCallback onSendNow;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7ED),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFFFE0B2)),
        boxShadow: AppSurfaces.softShadow,
      ),
      child: Row(
        children: [
          const Icon(Icons.local_fire_department_rounded,
              color: AppColors.warm, size: 26),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'You have $count lead${count == 1 ? '' : 's'} pending follow-up',
              style: GoogleFonts.inter(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
                height: 1.35,
              ),
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: onSendNow,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.warm,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              textStyle: GoogleFonts.inter(
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
            child: const Text('Send Now'),
          ),
        ],
      ),
    );
  }
}

class _StatStrip extends StatefulWidget {
  const _StatStrip({
    required this.total,
    required this.newCount,
    required this.contactedCount,
    required this.followUpCount,
    required this.closedCount,
    required this.progressRatio,
  });

  final int total;
  final int newCount;
  final int contactedCount;
  final int followUpCount;
  final int closedCount;
  final double progressRatio;

  @override
  State<_StatStrip> createState() => _StatStripState();
}

class _StatStripState extends State<_StatStrip> {
  final List<bool> _visible = List<bool>.filled(6, false);

  @override
  void initState() {
    super.initState();
    for (var i = 0; i < 6; i++) {
      final idx = i;
      unawaited(
        Future<void>.delayed(Duration(milliseconds: idx * 80), () {
          if (mounted) setState(() => _visible[idx] = true);
        }),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final pct = (widget.progressRatio * 100).clamp(0.0, 100.0);

    final items = <Widget>[
      _StatCard(
        label: 'TOTAL LEADS',
        value: '${widget.total}',
        valueColor: AppColors.textPrimary,
      ),
      _StatCard(
        label: 'NEW',
        value: '${widget.newCount}',
        valueColor: AppColors.statusNew,
      ),
      _StatCard(
        label: 'CONTACTED',
        value: '${widget.contactedCount}',
        valueColor: AppColors.pipelineContacted,
      ),
      _StatCard(
        label: 'FOLLOW-UP',
        value: '${widget.followUpCount}',
        valueColor: AppColors.pipelineFollowUp,
      ),
      _StatCard(
        label: 'CLOSED',
        value: '${widget.closedCount}',
        valueColor: AppColors.closed,
      ),
      _ProgressStatCard(progress: widget.progressRatio, percentLabel: pct),
    ];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < items.length; i++)
            Padding(
              padding: EdgeInsets.only(right: i == items.length - 1 ? 0 : 12),
              child: AnimatedOpacity(
                opacity: _visible[i] ? 1 : 0,
                duration: const Duration(milliseconds: 320),
                curve: Curves.easeOut,
                child: AnimatedSlide(
                  offset: _visible[i] ? Offset.zero : const Offset(0, 0.08),
                  duration: const Duration(milliseconds: 320),
                  curve: Curves.easeOutCubic,
                  child: items[i],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.valueColor,
  });

  final String label;
  final String value;
  final Color valueColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 130,
      padding: const EdgeInsets.all(16),
      decoration: AppSurfaces.card(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: GoogleFonts.inter(
            fontSize: 11,
            fontWeight: FontWeight.w500,
            letterSpacing: 0.5,
            color: AppColors.textMuted,
          ),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: GoogleFonts.inter(
            fontSize: 28,
            fontWeight: FontWeight.w700,
            color: valueColor,
          ),
          ),
        ],
      ),
    );
  }
}

class _ProgressStatCard extends StatelessWidget {
  const _ProgressStatCard({
    required this.progress,
    required this.percentLabel,
  });

  final double progress;
  final double percentLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 130,
      padding: const EdgeInsets.all(16),
      decoration: AppSurfaces.card(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'PROGRESS',
            style: GoogleFonts.inter(
            fontSize: 11,
            fontWeight: FontWeight.w500,
            letterSpacing: 0.5,
            color: AppColors.textMuted,
          ),
          ),
          const SizedBox(height: 8),
          Text(
            '${percentLabel.toStringAsFixed(1)}%',
            style: GoogleFonts.inter(
            fontSize: 28,
            fontWeight: FontWeight.w700,
            color: AppColors.primary,
          ),
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: TweenAnimationBuilder<double>(
              tween: Tween<double>(begin: 0, end: progress.clamp(0.0, 1.0)),
              duration: const Duration(milliseconds: 1200),
              curve: Curves.easeOutCubic,
              builder: (context, value, _) {
                return LinearProgressIndicator(
                  value: value,
                  minHeight: 6,
                  backgroundColor: AppColors.primaryLight,
                  valueColor: const AlwaysStoppedAnimation<Color>(
                    AppColors.primary,
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _PipelineOverviewSection extends StatelessWidget {
  const _PipelineOverviewSection({
    required this.counts,
    required this.progressRatio,
  });

  final List<int> counts;
  final double progressRatio;

  @override
  Widget build(BuildContext context) {
    final pct = (progressRatio * 100).clamp(0.0, 100.0);
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 20),
      padding: const EdgeInsets.all(20),
      decoration: AppSurfaces.card(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'Pipeline Overview',
                style: GoogleFonts.inter(
                  fontWeight: FontWeight.w600,
                  fontSize: 16,
                  color: AppColors.textPrimary,
                ),
              ),
              const Spacer(),
              Text(
                'This month',
                style: GoogleFonts.inter(
                  fontWeight: FontWeight.w400,
                  fontSize: 12,
                  color: AppColors.textMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          SizedBox(
            height: 140,
            child: _LeadBarChart(
              key: ValueKey<int>(Object.hashAll(counts)),
              counts: counts,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Text(
                'Contacted or beyond',
                style: GoogleFonts.inter(
                  fontSize: 12,
                  color: AppColors.textSecondary,
                  fontWeight: FontWeight.w400,
                ),
              ),
              const Spacer(),
              Text(
                '${pct.toStringAsFixed(1)}%',
                style: GoogleFonts.inter(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.primary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: TweenAnimationBuilder<double>(
              tween: Tween<double>(begin: 0, end: progressRatio.clamp(0.0, 1.0)),
              duration: const Duration(milliseconds: 1200),
              curve: Curves.easeOutCubic,
              builder: (context, value, _) {
                return LinearProgressIndicator(
                  value: value,
                  minHeight: 6,
                  backgroundColor: AppColors.primaryLight,
                  valueColor: const AlwaysStoppedAnimation<Color>(
                    AppColors.primary,
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _LeadBarChart extends StatefulWidget {
  const _LeadBarChart({super.key, required this.counts});

  final List<int> counts;

  @override
  State<_LeadBarChart> createState() => _LeadBarChartState();
}

class _LeadBarChartState extends State<_LeadBarChart>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _animation = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutCubic,
    );
    unawaited(_controller.forward());
  }

  @override
  void didUpdateWidget(covariant _LeadBarChart oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!listEquals(oldWidget.counts, widget.counts)) {
      _controller
        ..reset()
        ..forward();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) {
        return CustomPaint(
          painter: _LeadBarChartPainter(
            t: _animation.value,
            counts: widget.counts,
          ),
          child: const SizedBox.expand(),
        );
      },
    );
  }
}

class _LeadBarChartPainter extends CustomPainter {
  _LeadBarChartPainter({required this.t, required this.counts});

  final double t;
  final List<int> counts;

  static const _labels = ['New', 'Contacted', 'Follow-up', 'Closed'];
  static const _colors = [
    AppColors.statusNew,
    AppColors.pipelineContacted,
    AppColors.pipelineFollowUp,
    AppColors.closed,
  ];

  @override
  void paint(Canvas canvas, Size size) {
    if (counts.length != 4) return;
    final maxC = counts.reduce(math.max);
    const maxBar = 1;
    final denom = maxC <= 0 ? maxBar : maxC;
    const labelPad = 22.0;
    final chartH = size.height - labelPad - 18;
    const gap = 12.0;
    final barW = (size.width - gap * 3) / 4;

    for (var i = 0; i < 4; i++) {
      final x = i * (barW + gap);
      final h = (counts[i] / denom) * chartH * t;
      final top = size.height - labelPad - h;
      final r = RRect.fromRectAndCorners(
        Rect.fromLTWH(x, top, barW, h),
        topLeft: const Radius.circular(8),
        topRight: const Radius.circular(8),
      );
      final paint = Paint()..color = _colors[i];
      canvas.drawRRect(r, paint);

      final tp = TextPainter(
        text: TextSpan(
          text: '${counts[i]}',
          style: GoogleFonts.spaceGrotesk(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(x + (barW - tp.width) / 2, top - 18));

      final bl = TextPainter(
        text: TextSpan(
          text: _labels[i],
          style: GoogleFonts.inter(
            fontSize: 10,
            fontWeight: FontWeight.w500,
            color: AppColors.textMuted,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: barW + gap);
      bl.paint(
        canvas,
        Offset(x + (barW - bl.width) / 2, size.height - labelPad + 4),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _LeadBarChartPainter oldDelegate) {
    return oldDelegate.t != t || !listEquals(oldDelegate.counts, counts);
  }
}

class _PipelineTab extends StatelessWidget {
  const _PipelineTab({
    required this.label,
    required this.count,
    required this.active,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          splashColor: AppColors.primaryLight,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: active ? AppColors.primary : AppColors.surfaceMuted,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: GoogleFonts.inter(
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                    color: active
                        ? Colors.white
                        : AppColors.textSecondary,
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: active
                        ? Colors.white.withValues(alpha: 0.25)
                        : AppColors.surface,
                    shape: BoxShape.circle,
                  ),
                  child: Text(
                    '$count',
                    style: GoogleFonts.spaceGrotesk(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: active
                          ? Colors.white
                          : AppColors.textSecondary,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FilterOption {
  const _FilterOption(this.value, this.label);
  final String value;
  final String label;
}

class _FilterDropdown extends StatelessWidget {
  const _FilterDropdown({
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final String value;
  final List<_FilterOption> options;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      initialValue: value,
      onSelected: onChanged,
      offset: const Offset(0, 40),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.divider),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              options.firstWhere((o) => o.value == value).label,
              style: GoogleFonts.inter(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.arrow_drop_down, color: AppColors.textMuted),
          ],
        ),
      ),
      itemBuilder: (context) => options
          .map(
            (o) => PopupMenuItem<String>(
              value: o.value,
              child: Text(
                o.label,
                style: GoogleFonts.inter(
                  fontSize: 13,
                  color: AppColors.textPrimary,
                ),
              ),
            ),
          )
          .toList(),
    );
  }
}

class _IconBtn extends StatelessWidget {
  const _IconBtn({
    required this.icon,
    required this.color,
    required this.onPressed,
  });

  final IconData icon;
  final Color color;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onPressed,
        customBorder: const CircleBorder(),
        splashColor: AppColors.primaryLight,
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: Icon(icon, size: 20, color: color),
        ),
      ),
    );
  }
}

class _SourceChip extends StatelessWidget {
  const _SourceChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.divider),
      ),
      child: Text(
        label,
        style: GoogleFonts.inter(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.4,
          color: AppColors.textSecondary,
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.stage});

  final String stage;

  @override
  Widget build(BuildContext context) {
    final fg = _pipelineStageFg(stage);
    final bg = _pipelineStageBg(stage);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        _pipelineStageLabel(stage),
        style: GoogleFonts.inter(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
          color: fg,
        ),
      ),
    );
  }
}

class _LeadCard extends StatelessWidget {
  const _LeadCard({
    required this.lead,
    required this.stage,
    required this.sourceLabel,
    required this.formattedDate,
    required this.onChat,
    required this.onEdit,
    required this.onDelete,
  });

  final DashboardLead lead;
  final String stage;
  final String sourceLabel;
  final String formattedDate;
  final VoidCallback onChat;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final name = _safeText(lead.name.isEmpty ? null : lead.name);
    final phone = _safeText(lead.phone.isEmpty ? null : lead.phone);
    final borderColor = _temperatureFg(lead.status);
    final initials = _initials(name == '—' ? '?' : name);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {},
        borderRadius: BorderRadius.circular(16),
        splashColor: AppColors.primaryLight,
        child: Ink(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border(
              left: BorderSide(color: borderColor, width: 4),
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x08000000),
                blurRadius: 1,
                offset: Offset(0, 1),
              ),
              BoxShadow(
                color: Color(0x0A000000),
                blurRadius: 8,
                offset: Offset(0, 4),
              ),
              BoxShadow(
                color: Color(0x06000000),
                blurRadius: 20,
                offset: Offset(0, 10),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 22,
                      backgroundColor: _temperatureBg(lead.status),
                      child: Text(
                        initials,
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: _temperatureFg(lead.status),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            name,
                            style: GoogleFonts.inter(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            phone,
                            style: GoogleFonts.inter(
                              fontSize: 13,
                              color: AppColors.textMuted,
                              fontWeight: FontWeight.w400,
                            ),
                          ),
                        ],
                      ),
                    ),
                    _StatusBadge(stage: stage),
                    const SizedBox(width: 8),
                    _IconBtn(
                      icon: Icons.chat_bubble_outline,
                      color: AppColors.pipelineContacted,
                      onPressed: onChat,
                    ),
                    _IconBtn(
                      icon: Icons.edit_outlined,
                      color: AppColors.textMuted,
                      onPressed: onEdit,
                    ),
                    _IconBtn(
                      icon: Icons.delete_outline,
                      color: AppColors.hot,
                      onPressed: onDelete,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                const Divider(height: 1, color: AppColors.divider),
                const SizedBox(height: 12),
                Row(
                  children: [
                    _SourceChip(label: sourceLabel),
                    const SizedBox(width: 8),
                    const Spacer(),
                    Text(
                      formattedDate,
                      style: GoogleFonts.inter(
                        fontSize: 11,
                        color: AppColors.textMuted,
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
