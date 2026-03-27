import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart' hide TextDirection;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/models/dashboard_lead.dart';
import '../data/services/supabase_dashboard_service.dart';
import '../services/whatsapp_service.dart';
import 'pipeline_screen.dart';

// ---------------------------------------------------------------------------
// Design system — LeadFlow
// ---------------------------------------------------------------------------

abstract final class LeadFlowColors {
  static const Color bgBase = Color(0xFFF4F6FB);
  static const Color bgCard = Color(0xFFFFFFFF);
  static const Color bgCardAlt = Color(0xFFF9FAFD);

  static const Color primary = Color(0xFF4F46E5);
  static const Color primaryLight = Color(0xFFEEEDFD);

  static const Color hot = Color(0xFFEF4444);
  static const Color hotBg = Color(0xFFFEF2F2);
  static const Color warm = Color(0xFFF97316);
  static const Color warmBg = Color(0xFFFFF7ED);
  static const Color cold = Color(0xFF3B82F6);
  static const Color coldBg = Color(0xFFEFF6FF);
  static const Color stageNew = Color(0xFF8B5CF6);
  static const Color stageNewBg = Color(0xFFF5F3FF);

  static const Color contacted = Color(0xFF10B981);
  static const Color followUp = Color(0xFFF59E0B);
  static const Color closed = Color(0xFF6366F1);

  static const Color textPrimary = Color(0xFF0F172A);
  static const Color textSecondary = Color(0xFF64748B);
  static const Color textMuted = Color(0xFF94A3B8);

  static const Color divider = Color(0xFFE2E8F0);
}

abstract final class LeadFlowTextStyles {
  static TextStyle display(BuildContext context) =>
      GoogleFonts.plusJakartaSans(
        fontWeight: FontWeight.w700,
        color: LeadFlowColors.textPrimary,
      );

  static TextStyle body(BuildContext context) =>
      GoogleFonts.plusJakartaSans(
        fontWeight: FontWeight.w400,
        color: LeadFlowColors.textPrimary,
      );

  static TextStyle labelMuted(double size) => GoogleFonts.plusJakartaSans(
        fontWeight: FontWeight.w500,
        fontSize: size,
        letterSpacing: 0.5,
        color: LeadFlowColors.textMuted,
      );

  static TextStyle numbers(double size, {Color? color, FontWeight? w}) =>
      GoogleFonts.spaceGrotesk(
        fontWeight: w ?? FontWeight.w700,
        fontSize: size,
        color: color ?? LeadFlowColors.textPrimary,
      );
}

BoxDecoration leadFlowCardDecoration({Color? color}) {
  return BoxDecoration(
    color: color ?? LeadFlowColors.bgCard,
    borderRadius: BorderRadius.circular(16),
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
  );
}

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
      return LeadFlowColors.hot;
    case 'warm':
      return LeadFlowColors.warm;
    case 'cold':
    default:
      return LeadFlowColors.cold;
  }
}

Color _temperatureBg(String status) {
  switch (_temperatureBucketFromStatus(status)) {
    case 'hot':
      return LeadFlowColors.hotBg;
    case 'warm':
      return LeadFlowColors.warmBg;
    case 'cold':
    default:
      return LeadFlowColors.coldBg;
  }
}

Color _pipelineStageFg(String stage) {
  switch (stage) {
    case 'new':
      return LeadFlowColors.stageNew;
    case 'contacted':
      return LeadFlowColors.contacted;
    case 'follow_up':
      return LeadFlowColors.followUp;
    case 'closed':
      return LeadFlowColors.closed;
    default:
      return LeadFlowColors.textSecondary;
  }
}

Color _pipelineStageBg(String stage) {
  switch (stage) {
    case 'new':
      return LeadFlowColors.stageNewBg;
    case 'contacted':
      return const Color(0xFFECFDF5);
    case 'follow_up':
      return const Color(0xFFFFFBEB);
    case 'closed':
      return LeadFlowColors.primaryLight;
    default:
      return LeadFlowColors.bgCardAlt;
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
          style: LeadFlowTextStyles.body(context),
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
          style: LeadFlowTextStyles.body(context),
        ),
      ),
    );
  } on WhatsAppConfigException catch (e) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'WhatsApp not configured: $e',
          style: LeadFlowTextStyles.body(context),
        ),
      ),
    );
  } on WhatsAppApiException catch (e) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'WhatsApp API error: $e',
          style: LeadFlowTextStyles.body(context),
        ),
      ),
    );
  } catch (e) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Could not send: $e',
          style: LeadFlowTextStyles.body(context),
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
      backgroundColor: LeadFlowColors.bgBase,
      appBar: AppBar(
        backgroundColor: LeadFlowColors.bgBase,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        title: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: LeadFlowColors.primary,
                borderRadius: BorderRadius.circular(12),
              ),
              alignment: Alignment.center,
              child: Text(
                'LF',
                style: GoogleFonts.plusJakartaSans(
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
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w700,
                fontSize: 20,
                color: LeadFlowColors.textPrimary,
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
              backgroundColor: LeadFlowColors.primary,
              child: Text(
                _userInitials(),
                style: GoogleFonts.plusJakartaSans(
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
            icon: const Icon(Icons.refresh_rounded, color: LeadFlowColors.textSecondary),
          ),
          IconButton(
            tooltip: 'Add person',
            onPressed: _onAddLead,
            icon: const Icon(Icons.person_add_outlined, color: LeadFlowColors.textSecondary),
          ),
        ],
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, thickness: 1, color: LeadFlowColors.divider),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _onAddLead,
        backgroundColor: LeadFlowColors.primary,
        elevation: 4,
        icon: const Icon(Icons.add, color: Colors.white),
        label: Text(
          'Add Lead',
          style: GoogleFonts.plusJakartaSans(
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
                  style: GoogleFonts.plusJakartaSans(color: Colors.red),
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
            color: LeadFlowColors.primary,
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
                      if (followUpCount > 0) _FollowUpBanner(count: followUpCount),
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
                              style: LeadFlowTextStyles.body(context),
                              decoration: InputDecoration(
                                hintText: 'Search leads...',
                                hintStyle: GoogleFonts.plusJakartaSans(
                                  color: LeadFlowColors.textMuted,
                                  fontSize: 14,
                                ),
                                prefixIcon: const Icon(
                                  Icons.search,
                                  color: LeadFlowColors.textMuted,
                                  size: 20,
                                ),
                                filled: true,
                                fillColor: LeadFlowColors.bgCard,
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  borderSide: const BorderSide(
                                    color: LeadFlowColors.divider,
                                  ),
                                ),
                                enabledBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  borderSide: const BorderSide(
                                    color: LeadFlowColors.divider,
                                  ),
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  borderSide: const BorderSide(
                                    color: LeadFlowColors.primary,
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
                          style: GoogleFonts.plusJakartaSans(
                            color: LeadFlowColors.textSecondary,
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
                                  style: LeadFlowTextStyles.body(context),
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
  const _FollowUpBanner({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFFFF3E0), Color(0xFFFFF8F0)],
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFFFCC80), width: 1),
      ),
      child: Row(
        children: [
          const Text('🔥', style: TextStyle(fontSize: 18)),
          const SizedBox(width: 10),
          Expanded(
            child: RichText(
              text: TextSpan(
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  color: LeadFlowColors.textPrimary,
                ),
                children: [
                  const TextSpan(text: 'Message '),
                  TextSpan(
                    text: '$count',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  TextSpan(
                    text:
                        ' follow-up lead${count == 1 ? '' : 's'}',
                  ),
                ],
              ),
            ),
          ),
          const Icon(Icons.chevron_right, color: LeadFlowColors.warm),
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
        valueColor: LeadFlowColors.textPrimary,
      ),
      _StatCard(
        label: 'NEW',
        value: '${widget.newCount}',
        valueColor: LeadFlowColors.stageNew,
      ),
      _StatCard(
        label: 'CONTACTED',
        value: '${widget.contactedCount}',
        valueColor: LeadFlowColors.contacted,
      ),
      _StatCard(
        label: 'FOLLOW-UP',
        value: '${widget.followUpCount}',
        valueColor: LeadFlowColors.followUp,
      ),
      _StatCard(
        label: 'CLOSED',
        value: '${widget.closedCount}',
        valueColor: LeadFlowColors.closed,
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
      decoration: leadFlowCardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: LeadFlowTextStyles.labelMuted(11),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: LeadFlowTextStyles.numbers(28, color: valueColor),
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
      decoration: leadFlowCardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'PROGRESS',
            style: LeadFlowTextStyles.labelMuted(11),
          ),
          const SizedBox(height: 8),
          Text(
            '${percentLabel.toStringAsFixed(1)}%',
            style: LeadFlowTextStyles.numbers(28, color: LeadFlowColors.primary),
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
                  backgroundColor: LeadFlowColors.primaryLight,
                  valueColor: const AlwaysStoppedAnimation<Color>(
                    LeadFlowColors.primary,
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
      decoration: leadFlowCardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'Pipeline Overview',
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w600,
                  fontSize: 16,
                  color: LeadFlowColors.textPrimary,
                ),
              ),
              const Spacer(),
              Text(
                'This month',
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w400,
                  fontSize: 12,
                  color: LeadFlowColors.textMuted,
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
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  color: LeadFlowColors.textSecondary,
                  fontWeight: FontWeight.w400,
                ),
              ),
              const Spacer(),
              Text(
                '${pct.toStringAsFixed(1)}%',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: LeadFlowColors.primary,
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
                  backgroundColor: LeadFlowColors.primaryLight,
                  valueColor: const AlwaysStoppedAnimation<Color>(
                    LeadFlowColors.primary,
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
    LeadFlowColors.stageNew,
    LeadFlowColors.contacted,
    LeadFlowColors.followUp,
    LeadFlowColors.closed,
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
            color: LeadFlowColors.textPrimary,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(x + (barW - tp.width) / 2, top - 18));

      final bl = TextPainter(
        text: TextSpan(
          text: _labels[i],
          style: GoogleFonts.plusJakartaSans(
            fontSize: 10,
            fontWeight: FontWeight.w500,
            color: LeadFlowColors.textMuted,
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
          splashColor: LeadFlowColors.primaryLight,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: active ? LeadFlowColors.primary : LeadFlowColors.bgCardAlt,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                    color: active
                        ? Colors.white
                        : LeadFlowColors.textSecondary,
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: active
                        ? Colors.white.withValues(alpha: 0.25)
                        : LeadFlowColors.bgCard,
                    shape: BoxShape.circle,
                  ),
                  child: Text(
                    '$count',
                    style: GoogleFonts.spaceGrotesk(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: active
                          ? Colors.white
                          : LeadFlowColors.textSecondary,
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
          color: LeadFlowColors.bgCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: LeadFlowColors.divider),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              options.firstWhere((o) => o.value == value).label,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: LeadFlowColors.textSecondary,
              ),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.arrow_drop_down, color: LeadFlowColors.textMuted),
          ],
        ),
      ),
      itemBuilder: (context) => options
          .map(
            (o) => PopupMenuItem<String>(
              value: o.value,
              child: Text(
                o.label,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 13,
                  color: LeadFlowColors.textPrimary,
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
        splashColor: LeadFlowColors.primaryLight,
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
        color: LeadFlowColors.bgCardAlt,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: LeadFlowColors.divider),
      ),
      child: Text(
        label,
        style: GoogleFonts.plusJakartaSans(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.4,
          color: LeadFlowColors.textSecondary,
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
        style: GoogleFonts.plusJakartaSans(
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
        splashColor: LeadFlowColors.primaryLight,
        child: Ink(
          decoration: BoxDecoration(
            color: LeadFlowColors.bgCard,
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
                        style: GoogleFonts.plusJakartaSans(
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
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: LeadFlowColors.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            phone,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 13,
                              color: LeadFlowColors.textMuted,
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
                      color: LeadFlowColors.contacted,
                      onPressed: onChat,
                    ),
                    _IconBtn(
                      icon: Icons.edit_outlined,
                      color: LeadFlowColors.textMuted,
                      onPressed: onEdit,
                    ),
                    _IconBtn(
                      icon: Icons.delete_outline,
                      color: LeadFlowColors.hot,
                      onPressed: onDelete,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                const Divider(height: 1, color: LeadFlowColors.divider),
                const SizedBox(height: 12),
                Row(
                  children: [
                    _SourceChip(label: sourceLabel),
                    const SizedBox(width: 8),
                    const Spacer(),
                    Text(
                      formattedDate,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11,
                        color: LeadFlowColors.textMuted,
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
