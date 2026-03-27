import 'dart:async';
import 'dart:convert';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/lead_service.dart';
import '../services/user_service.dart';
import 'widgets/lead_dashboard_helpers.dart';

final Uri _kLeadFollowUpWebhook = Uri.parse(
  'https://magsideveloper.app.n8n.cloud/webhook/lead-followup',
);

/// Sends lead data to n8n when a lead is moved to the Follow-up pipeline stage.
Future<void> triggerFollowUp({
  required String name,
  required String phone,
}) async {
  final safeName = name.trim().isEmpty ? 'there' : name.trim();
  final body = jsonEncode(<String, dynamic>{
    'name': name,
    'phone': phone,
    'message': 'Hi $safeName, just following up regarding your inquiry.',
  });
  try {
    final response = await http.post(
      _kLeadFollowUpWebhook,
      headers: const <String, String>{'Content-Type': 'application/json'},
      body: body,
    );
    // ignore: avoid_print
    print(
      'triggerFollowUp: status=${response.statusCode} body=${response.body}',
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      // ignore: avoid_print
      print(
        'triggerFollowUp: non-success HTTP ${response.statusCode}',
      );
    }
  } catch (e, st) {
    // ignore: avoid_print
    print('triggerFollowUp: error $e');
    // ignore: avoid_print
    print('triggerFollowUp: stack $st');
  }
}

String _intelligenceStatusFromRow(Map<String, dynamic> row) {
  final s = (row['status'] ?? 'warm').toString().trim().toLowerCase();
  if (s == 'hot' || s == 'warm' || s == 'cold') return s;
  return 'warm';
}

Widget buildStatusBadge(String status) {
  Color color;
  switch (status.toLowerCase()) {
    case 'hot':
      color = Colors.red;
      break;
    case 'warm':
      color = Colors.orange;
      break;
    case 'cold':
      color = Colors.blue;
      break;
    default:
      color = Colors.grey;
  }
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.2),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Text(
      status.toUpperCase(),
      style: TextStyle(color: color, fontWeight: FontWeight.bold),
    ),
  );
}

class PipelineLead {
  PipelineLead({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    required this.stage,
    required this.notes,
    this.lastMessagePreview = '',
    this.followUpAt,
    this.assignedTo,
    this.score = 50,
    this.intelligenceStatus = 'warm',
  });

  final String id;
  final String name;
  final String email;
  final String phone;
  final String stage;
  final String notes;
  /// Latest inquiry / message from `leads.message` (MVP column).
  final String lastMessagePreview;
  final DateTime? followUpAt;
  final String? assignedTo;
  /// Lead intelligence score (0–100), from `leads.score`.
  final int score;
  /// Hot / warm / cold from `leads.status` (intelligence).
  final String intelligenceStatus;

  factory PipelineLead.fromRow(Map<String, dynamic> row) {
    final stage = pipelineBucketFromLeadMap(row);
    return PipelineLead(
      id: (row['id'] ?? '').toString(),
      name: (row['name'] ?? '').toString(),
      email: (row['email'] ?? '').toString(),
      phone: (row['phone'] ?? '').toString(),
      stage: stage, 
      notes: (row['notes'] ?? '').toString(),
      lastMessagePreview: (row['message'] ?? '').toString().trim(),
      followUpAt: DateTime.tryParse(
        (row['next_followup'] ?? row['follow_up_at'] ?? '').toString(),
      ),
      assignedTo: row['assigned_to']?.toString(),
      score: (row['score'] as num?)?.toInt() ?? 50,
      intelligenceStatus: _intelligenceStatusFromRow(row),
    );
  }

  PipelineLead copyWith({
    String? stage,
    String? assignedTo,
    String? notes,
    String? lastMessagePreview,
    DateTime? followUpAt,
    int? score,
    String? intelligenceStatus,
  }) {
    return PipelineLead(
      id: id,
      name: name,
      email: email,
      phone: phone,
      stage: stage ?? this.stage,
      notes: notes ?? this.notes,
      lastMessagePreview: lastMessagePreview ?? this.lastMessagePreview,
      followUpAt: followUpAt ?? this.followUpAt,
      assignedTo: assignedTo ?? this.assignedTo,
      score: score ?? this.score,
      intelligenceStatus: intelligenceStatus ?? this.intelligenceStatus,
    );
  }
}

const List<String> _whatsAppTemplates = <String>[
  'Hi {name}, just following up',
  'Hello {name}, are you still interested?',
  'Reminder: Let’s connect today',
];

String _pipelineColumnTitle(String stage) {
  switch (stage) {
    case 'new':
      return 'New Leads';
    case 'contacted':
      return 'Contacted';
    case 'follow_up':
      return 'Follow-up';
    case 'closed':
      return 'Closed';
    default:
      return stage;
  }
}

Color _pipelineStageAccent(String stage) {
  switch (stage) {
    case 'new':
      return Colors.blue.shade700;
    case 'contacted':
      return Colors.teal.shade700;
    case 'follow_up':
      return Colors.orange.shade800;
    case 'closed':
      return Colors.green.shade700;
    default:
      return Colors.grey.shade600;
  }
}

String _pipelineStageShortLabel(String stage) {
  switch (stage) {
    case 'new':
      return 'New';
    case 'contacted':
      return 'Contacted';
    case 'follow_up':
      return 'Follow-up';
    case 'closed':
      return 'Closed';
    default:
      return stage;
  }
}

/// Maps legacy bucket names to pipeline [stage] for dropdowns.
String normalizePipelineStageForUi(String raw) {
  final v = raw.trim().toLowerCase();
  if (v == 'new' ||
      v == 'contacted' ||
      v == 'follow_up' ||
      v == 'closed') {
    return v;
  }
  if (v == 'cold') return 'new';
  if (v == 'warm') return 'contacted';
  if (v == 'hot') return 'follow_up';
  return 'new';
}

/// Digits-only international phone for API payloads; skips empty / invalid input.
String? _phoneDigitsForBulk(String phone) {
  final digits = phone.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) return null;
  if (digits.startsWith('00')) return digits.substring(2);
  if (digits.startsWith('0')) return '92${digits.substring(1)}';
  if (digits.startsWith('92')) return digits;
  return digits;
}

String _normalizeWhatsAppPhone(String phone) {
  final digits = phone.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) return '923001234567';

  // Prefer international format without '+' (e.g., 923001234567).
  if (digits.startsWith('00')) return digits.substring(2);
  if (digits.startsWith('0')) return '92${digits.substring(1)}';
  if (digits.startsWith('92')) return digits;
  return digits;
}

Future<void> openWhatsApp(String phone, String name) async {
  final safeName = name.trim().isEmpty ? 'there' : name.trim();
  await openWhatsAppWithMessage(
    phone,
    'Hi $safeName, I’m contacting you regarding your inquiry.',
  );
}

Future<void> openWhatsAppWithMessage(String phone, String messageText) async {
  final normalizedPhone = _normalizeWhatsAppPhone(phone);
  final message = Uri.encodeComponent(messageText.trim());

  final url = 'https://wa.me/$normalizedPhone?text=$message';
  final uri = Uri.parse(url);

  if (await canLaunchUrl(uri)) {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  } else {
    throw 'Could not open WhatsApp';
  }
}

Future<void> openPhoneCall(String phone) async {
  final normalizedPhone = _normalizeWhatsAppPhone(phone);
  final uri = Uri.parse('tel:$normalizedPhone');
  if (await canLaunchUrl(uri)) {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  } else {
    throw 'Could not open phone dialer';
  }
}

Future<DateTime?> pickFollowUpDateTime(
  BuildContext context, {
  DateTime? initial,
}) async {
  final now = DateTime.now();
  final initialDate = initial ?? now;
  final pickedDate = await showDatePicker(
    context: context,
    initialDate: initialDate,
    firstDate: now.subtract(const Duration(days: 365)),
    lastDate: now.add(const Duration(days: 3650)),
  );
  if (pickedDate == null || !context.mounted) return null;

  final pickedTime = await showTimePicker(
    context: context,
    initialTime: TimeOfDay.fromDateTime(initialDate),
  );
  if (pickedTime == null) return null;

  return DateTime(
    pickedDate.year,
    pickedDate.month,
    pickedDate.day,
    pickedTime.hour,
    pickedTime.minute,
  );
}

bool _isOverdueFollowUp(DateTime? dueAt) {
  if (dueAt == null) return false;
  return DateTime.now().isAfter(dueAt);
}

bool _isTodayFollowUp(DateTime? dueAt) {
  if (dueAt == null) return false;
  if (_isOverdueFollowUp(dueAt)) return false;
  final now = DateTime.now();
  return now.year == dueAt.year &&
      now.month == dueAt.month &&
      now.day == dueAt.day;
}

/// Minimum width per pipeline column so kanban cards keep room for name + email.
const double _kKanbanMinColumnWidth = 300;

class PipelineScreen extends StatefulWidget {
  const PipelineScreen({super.key});

  @override
  State<PipelineScreen> createState() => _PipelineScreenState();
}

class _PipelineScreenState extends State<PipelineScreen> {
  List<Map<String, dynamic>> users = [];
  bool _refreshing = false;

  late Future<List<PipelineLead>> _leadsFuture;
  List<PipelineLead> _cachedLeads = <PipelineLead>[];

  String searchQuery = '';
  String selectedFilter = 'all';
  String selectedFollowUpFilter = 'all';
  final TextEditingController searchController = TextEditingController();
  final ScrollController _bodyScrollController = ScrollController();
  final GlobalKey _kanbanSectionKey = GlobalKey();
  bool _autoScrolledToOverdueKanban = false;
  bool _overdueScrollPending = false;
  bool _bulkHotMessaging = false;

  Future<List<PipelineLead>> _fetchLeads() async {
    final rows = await LeadService.fetchLeadsOnce();
    final leads = rows
        .map((e) => PipelineLead.fromRow(Map<String, dynamic>.from(e)))
        .toList();
    leads.sort((a, b) {
      final dueA = a.followUpAt;
      final dueB = b.followUpAt;
      if (dueA == null) return 1;
      if (dueB == null) return -1;
      return dueA.compareTo(dueB);
    });
    return leads;
  }

  @override
  void initState() {
    super.initState();
    _leadsFuture = _fetchLeads();
    unawaited(
      UserService.upsertCurrentUserFromSession().then((_) {
        if (mounted) {
          return loadUsers();
        }
      }),
    );
  }

  @override
  void dispose() {
    searchController.dispose();
    _bodyScrollController.dispose();
    super.dispose();
  }

  void _scheduleScrollToKanbanIfOverdue(List<PipelineLead> leads) {
    final overdueCount = leads.where((l) {
      final d = l.followUpAt;
      return d != null && DateTime.now().isAfter(d);
    }).length;
    if (overdueCount == 0) {
      _autoScrolledToOverdueKanban = false;
      _overdueScrollPending = false;
      return;
    }
    if (_autoScrolledToOverdueKanban || _overdueScrollPending) return;
    _overdueScrollPending = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _overdueScrollPending = false;
      if (!mounted) return;
      _autoScrolledToOverdueKanban = true;
      final ctx = _kanbanSectionKey.currentContext;
      if (ctx == null) return;
      Scrollable.ensureVisible(
        ctx,
        duration: const Duration(milliseconds: 420),
        curve: Curves.easeOutCubic,
        alignment: 0.05,
      );
    });
  }

  Future<void> loadUsers() async {
    try {
      final list = await UserService.fetchUsers();
      if (!mounted) return;
      setState(() {
        users = list;
      });
    } catch (e) {
      // Directory sync is best-effort; pipeline still works without assignee data.
    }
  }

  Future<void> refreshLeads() async {
    if (_refreshing) return;
    setState(() => _refreshing = true);
    try {
      final next = _fetchLeads();
      setState(() {
        _autoScrolledToOverdueKanban = false;
        _overdueScrollPending = false;
        _leadsFuture = next;
      });
      final list = await next;
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Refreshed — ${list.length} lead(s)')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Refresh failed: $e')),
      );
    } finally {
      if (mounted) {
        setState(() => _refreshing = false);
      }
    }
  }

  Future<void> moveLead(PipelineLead lead, String newStage) async {
    if (lead.stage == newStage) return;

    final supabase = Supabase.instance.client;
    final user = supabase.auth.currentUser;
    if (user == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to move leads')),
      );
      return;
    }

    final previous = List<PipelineLead>.from(_cachedLeads);
    if (previous.isEmpty) {
      try {
        await supabase.from('leads').update(<String, dynamic>{
          'stage': newStage,
          if (newStage.trim().toLowerCase() == 'follow_up' &&
              lead.stage.trim().toLowerCase() != 'follow_up') ...<String, dynamic>{
            'follow_up_time': DateTime.now()
                .add(const Duration(minutes: 30))
                .toIso8601String(),
            'follow_up_sent': false,
          },
        }).eq('id', lead.id).eq('assigned_to', user.id);
        final entersFollowUp = newStage.trim().toLowerCase() == 'follow_up' &&
            lead.stage.trim().toLowerCase() != 'follow_up';
        if (entersFollowUp) {
          unawaited(triggerFollowUp(name: lead.name, phone: lead.phone));
        }
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not move lead: $e')),
        );
      }
      return;
    }

    final optimistic = previous
        .map(
          (l) => l.id == lead.id ? l.copyWith(stage: newStage) : l,
        )
        .toList();

    setState(() {
      _cachedLeads = optimistic;
      _leadsFuture = Future<List<PipelineLead>>.value(optimistic);
    });

    try {
      await supabase.from('leads').update(<String, dynamic>{
        'stage': newStage,
        if (newStage.trim().toLowerCase() == 'follow_up' &&
            lead.stage.trim().toLowerCase() != 'follow_up') ...<String, dynamic>{
          'follow_up_time': DateTime.now()
              .add(const Duration(minutes: 30))
              .toIso8601String(),
          'follow_up_sent': false,
        },
      }).eq('id', lead.id).eq('assigned_to', user.id);
      final entersFollowUp = newStage.trim().toLowerCase() == 'follow_up' &&
          lead.stage.trim().toLowerCase() != 'follow_up';
      if (entersFollowUp) {
        unawaited(triggerFollowUp(name: lead.name, phone: lead.phone));
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _cachedLeads = previous;
        _leadsFuture = Future<List<PipelineLead>>.value(previous);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not move lead: $e')),
      );
    }
  }

  Future<void> _onLeadContactTracked(PipelineLead lead) async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) return;
    final nowIso = DateTime.now().toIso8601String();
    try {
      await Supabase.instance.client.from('leads').update(<String, dynamic>{
        'last_contacted': nowIso,
      }).eq('id', lead.id).eq('assigned_to', user.id);
      await LeadService.updateLeadScore(<String, dynamic>{
        'id': lead.id,
        'score': lead.score,
        'last_contacted': nowIso,
      });
      final list = await _fetchLeads();
      if (!mounted) return;
      setState(() {
        _cachedLeads = list;
        _leadsFuture = Future<List<PipelineLead>>.value(list);
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not update lead: $e')),
      );
    }
  }

  Future<void> _deleteLead(PipelineLead lead) async {
    final previous = List<PipelineLead>.from(_cachedLeads);

    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete Lead'),
        content: const Text(
          'Are you sure you want to delete this lead?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () async {
              final supabase = Supabase.instance.client;
              final user = supabase.auth.currentUser;
              if (user == null) {
                if (!context.mounted) return;
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Sign in to delete leads')),
                );
                return;
              }

              final optimistic =
                  previous.where((l) => l.id != lead.id).toList();
              if (optimistic.isNotEmpty || previous.isNotEmpty) {
                setState(() {
                  _cachedLeads = optimistic;
                  _leadsFuture = Future<List<PipelineLead>>.value(optimistic);
                });
              }

              final messenger = ScaffoldMessenger.of(context);
              final navigator = Navigator.of(context);

              try {
                await supabase.from('leads').delete().eq('id', lead.id);
                if (!mounted) return;
                navigator.pop();
                messenger.showSnackBar(
                  const SnackBar(content: Text('Lead deleted')),
                );
              } catch (e) {
                if (!mounted) return;
                setState(() {
                  _cachedLeads = previous;
                  _leadsFuture = Future<List<PipelineLead>>.value(previous);
                });
                navigator.pop();
                messenger.showSnackBar(
                  SnackBar(content: Text('Error deleting lead: $e')),
                );
              }
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  Future<void> _editLead(PipelineLead lead) async {
    final draft = await showDialog<_LeadDraft>(
      context: context,
      builder: (_) => EditLeadDialog(lead: lead),
    );

    if (draft == null || !mounted) return;

    final supabase = Supabase.instance.client;
    final user = supabase.auth.currentUser;
    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to edit leads')),
      );
      return;
    }

    final previous = List<PipelineLead>.from(_cachedLeads);

    final updatedLead = PipelineLead(
      id: lead.id,
      name: draft.name,
      email: draft.email,
      phone: lead.phone,
      stage: draft.status,
      notes: draft.notes,
      lastMessagePreview: lead.lastMessagePreview,
      followUpAt: draft.followUpAt,
      assignedTo: lead.assignedTo,
      score: lead.score,
      intelligenceStatus: lead.intelligenceStatus,
    );

    if (previous.isNotEmpty) {
      final optimistic =
          previous.map((l) => l.id == lead.id ? updatedLead : l).toList();
      setState(() {
        _cachedLeads = optimistic;
        _leadsFuture = Future<List<PipelineLead>>.value(optimistic);
      });
    }

    try {
      await supabase.from('leads').update(<String, dynamic>{
        'name': draft.name,
        'email': draft.email,
        'stage': draft.status,
        'notes': draft.notes,
        'follow_up_at': draft.followUpAt?.toIso8601String(),
        if (draft.status.trim().toLowerCase() == 'follow_up' &&
            lead.stage.trim().toLowerCase() != 'follow_up') ...<String, dynamic>{
          'follow_up_time': DateTime.now()
              .add(const Duration(minutes: 30))
              .toIso8601String(),
          'follow_up_sent': false,
        },
      }).eq('id', lead.id).eq('assigned_to', user.id);

      final entersFollowUp = draft.status.trim().toLowerCase() == 'follow_up' &&
          lead.stage.trim().toLowerCase() != 'follow_up';
      if (entersFollowUp) {
        unawaited(triggerFollowUp(name: draft.name, phone: lead.phone));
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Lead updated successfully')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _cachedLeads = previous;
        _leadsFuture = Future<List<PipelineLead>>.value(previous);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not update lead: $e')),
      );
    }
  }

  Future<void> _setFollowUpTomorrow(PipelineLead lead) async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to set follow-up')),
      );
      return;
    }

    final now = DateTime.now();
    final tomorrow = DateTime(
      now.year,
      now.month,
      now.day,
      9,
      0,
    ).add(const Duration(days: 1));

    final previous = List<PipelineLead>.from(_cachedLeads);
    final optimistic = previous
        .map(
          (l) => l.id == lead.id ? l.copyWith(followUpAt: tomorrow) : l,
        )
        .toList();

    setState(() {
      _cachedLeads = optimistic;
      _leadsFuture = Future<List<PipelineLead>>.value(optimistic);
    });

    try {
      await Supabase.instance.client.from('leads').update(<String, dynamic>{
        'follow_up_at': tomorrow.toIso8601String(),
      }).eq('id', lead.id).eq('assigned_to', user.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Follow-up set for tomorrow')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _cachedLeads = previous;
        _leadsFuture = Future<List<PipelineLead>>.value(previous);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not set follow-up: $e')),
      );
    }
  }

  List<PipelineLead> _searchFilteredList(List<PipelineLead> source) {
    final q = searchQuery.trim().toLowerCase();
    if (q.isEmpty) {
      return source.where(_matchesFollowUpFilter).toList();
    }
    return source.where((lead) {
      final matchesSearch = lead.name.toLowerCase().contains(q) ||
          lead.phone.toLowerCase().contains(q) ||
          lead.email.toLowerCase().contains(q) ||
          lead.notes.toLowerCase().contains(q) ||
          lead.lastMessagePreview.toLowerCase().contains(q);
      return matchesSearch && _matchesFollowUpFilter(lead);
    }).toList();
  }

  bool _matchesFollowUpFilter(PipelineLead lead) {
    switch (selectedFollowUpFilter) {
      case 'today':
        return _isTodayFollowUp(lead.followUpAt);
      case 'overdue':
        return _isOverdueFollowUp(lead.followUpAt);
      case 'all':
      default:
        return true;
    }
  }

  String _emptyFilterSubtitle() {
    final q = searchQuery.trim();
    if (q.isNotEmpty) {
      return 'No leads match your search';
    }
    switch (selectedFollowUpFilter) {
      case 'overdue':
        return 'No overdue leads. Great job!';
      case 'today':
        return 'No follow-ups today';
      default:
        break;
    }
    switch (selectedFilter) {
      case 'new':
        return 'No leads in New Leads';
      case 'contacted':
        return 'No leads in Contacted';
      case 'follow_up':
        return 'No leads in Follow-up';
      case 'closed':
        return 'No closed leads in this view';
      default:
        return 'Try adjusting your filters';
    }
  }

  void _resetFiltersToAll() {
    setState(() {
      selectedFollowUpFilter = 'all';
      selectedFilter = 'all';
      searchQuery = '';
      searchController.clear();
    });
  }

  static final Uri _bulkHotMessageWebhook = Uri.parse(
    'https://magsideveloper.app.n8n.cloud/webhook/bulk-message',
  );

  /// Fetches assigned leads in `follow_up` stage, posts phones to n8n bulk webhook.
  Future<void> _messageHotLeadsViaN8n(BuildContext context) async {
    if (_bulkHotMessaging) return;
    final messenger = ScaffoldMessenger.of(context);

    setState(() => _bulkHotMessaging = true);
    if (!context.mounted) return;
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return PopScope(
          canPop: false,
          child: Center(
            child: Card(
              elevation: 4,
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const CircularProgressIndicator(),
                    const SizedBox(height: 14),
                    Text(
                      'Sending to follow-up leads…',
                      style: TextStyle(
                        color: Colors.grey.shade800,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );

    try {
      final supabase = Supabase.instance.client;
      final user = supabase.auth.currentUser;
      if (user == null) {
        messenger.showSnackBar(
          const SnackBar(content: Text('Sign in to send messages')),
        );
        return;
      }

      final response = await supabase
          .from('leads')
          .select()
          .eq('assigned_to', user.id)
          .eq('stage', 'follow_up');

      final rows = List<Map<String, dynamic>>.from(response as List<dynamic>);
      final phones = <String>[];
      for (final row in rows) {
        final p = _phoneDigitsForBulk((row['phone'] ?? '').toString());
        if (p != null) phones.add(p);
      }

      if (phones.isEmpty) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text('No follow-up leads with phone numbers to message'),
          ),
        );
        return;
      }

      final httpRes = await http.post(
        _bulkHotMessageWebhook,
        headers: const {'Content-Type': 'application/json'},
        body: jsonEncode(<String, dynamic>{'phones': phones}),
      );

      if (httpRes.statusCode < 200 || httpRes.statusCode >= 300) {
        throw Exception('HTTP ${httpRes.statusCode}: ${httpRes.body}');
      }

      if (!context.mounted) return;
      messenger.showSnackBar(
        const SnackBar(content: Text('Messages sent to follow-up leads')),
      );
    } catch (e) {
      if (!context.mounted) return;
      messenger.showSnackBar(
        SnackBar(content: Text('Could not send messages: $e')),
      );
    } finally {
      if (mounted) {
        final nav = Navigator.of(context, rootNavigator: true);
        if (nav.canPop()) {
          nav.pop();
        }
        setState(() => _bulkHotMessaging = false);
      }
    }
  }

  /// Search + stage bucket; [source] is the full list from FutureBuilder.
  List<PipelineLead> getFilteredLeads(String stage, List<PipelineLead> source) {
    final q = searchQuery.trim().toLowerCase();
    final bucket = stage.trim().toLowerCase();
    return source.where((lead) {
      final matchesSearch = q.isEmpty ||
          lead.name.toLowerCase().contains(q) ||
          lead.phone.toLowerCase().contains(q) ||
          lead.email.toLowerCase().contains(q) ||
          lead.notes.toLowerCase().contains(q) ||
          lead.lastMessagePreview.toLowerCase().contains(q);

      final leadStage = lead.stage.trim().toLowerCase();
      return matchesSearch &&
          leadStage == bucket &&
          _matchesFollowUpFilter(lead);
    }).toList();
  }

  Map<String, dynamic> getAnalytics(List<PipelineLead> allLeads) {
    final scoped = _searchFilteredList(allLeads);
    final total = scoped.length;
    int countStage(String s) =>
        scoped.where((l) => l.stage.trim().toLowerCase() == s).length;
    final stageNew = countStage('new');
    final contacted = countStage('contacted');
    final followUp = countStage('follow_up');
    final closed = countStage('closed');
    final progressed = contacted + followUp + closed;
    final progress =
        total == 0 ? '0' : ((progressed / total) * 100).toStringAsFixed(1);

    return <String, dynamic>{
      'total': total,
      'stage_new': stageNew,
      'contacted': contacted,
      'follow_up': followUp,
      'closed': closed,
      'progress': progress,
    };
  }

  Widget buildKpiCard(String title, String value, Color color) {
    return Expanded(
      child: buildKpiCardFixed(title, value, color),
    );
  }

  Widget buildKpiCardFixed(String title, String value, Color color) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 6),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            title,
            style: TextStyle(
              color: Colors.grey.shade600,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget buildBarChart(Map<String, dynamic> stats) {
    final stageNew = (stats['stage_new'] as num).toDouble();
    final contacted = (stats['contacted'] as num).toDouble();
    final followUp = (stats['follow_up'] as num).toDouble();
    final closed = (stats['closed'] as num).toDouble();
    final maxY = [stageNew, contacted, followUp, closed, 1.0]
        .reduce((a, b) => a > b ? a : b);

    return SizedBox(
      width: double.infinity,
      height: 220,
      child: BarChart(
        BarChartData(
          alignment: BarChartAlignment.spaceAround,
          maxY: maxY,
          titlesData: const FlTitlesData(show: false),
          borderData: FlBorderData(show: false),
          gridData: const FlGridData(show: false),
          barGroups: [
            BarChartGroupData(
              x: 0,
              barRods: [
                BarChartRodData(
                  toY: stageNew,
                  color: Colors.blue.shade600,
                  width: 18,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(6),
                  ),
                ),
              ],
            ),
            BarChartGroupData(
              x: 1,
              barRods: [
                BarChartRodData(
                  toY: contacted,
                  color: Colors.teal.shade600,
                  width: 18,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(6),
                  ),
                ),
              ],
            ),
            BarChartGroupData(
              x: 2,
              barRods: [
                BarChartRodData(
                  toY: followUp,
                  color: Colors.orange.shade700,
                  width: 18,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(6),
                  ),
                ),
              ],
            ),
            BarChartGroupData(
              x: 3,
              barRods: [
                BarChartRodData(
                  toY: closed,
                  color: Colors.green.shade600,
                  width: 18,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(6),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget buildConversionBar(Map<String, dynamic> stats) {
    final value = double.parse(stats['progress'].toString()) / 100;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Progress (contacted or beyond)',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: Colors.grey.shade800,
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: value.clamp(0.0, 1.0),
              minHeight: 10,
              backgroundColor: Colors.grey.shade200,
              color: Colors.green.shade600,
            ),
          ),
        ),
      ],
    );
  }

  Future<void> showAddLeadDialog(BuildContext context) async {
    final nameController = TextEditingController();
    final emailController = TextEditingController();
    final phoneController = TextEditingController();
    final uid = Supabase.instance.client.auth.currentUser?.id;
    String? assigneeId = uid;

    await showDialog<void>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            final assigneeItems = users
                .map(
                  (u) => DropdownMenuItem<String>(
                    value: u['id']?.toString(),
                    child: Text(
                      (u['email'] ?? 'User').toString(),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                )
                .where((e) => e.value != null && e.value!.isNotEmpty)
                .toList();

            return AlertDialog(
              title: const Text('Add lead'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: nameController,
                      decoration: const InputDecoration(
                        labelText: 'Name',
                        hintText: 'Required',
                      ),
                      textCapitalization: TextCapitalization.words,
                      autofocus: true,
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: emailController,
                      decoration: const InputDecoration(
                        labelText: 'Email',
                        hintText: 'Optional',
                      ),
                      keyboardType: TextInputType.emailAddress,
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: phoneController,
                      decoration: const InputDecoration(
                        labelText: 'Phone',
                        hintText: 'Optional',
                      ),
                      keyboardType: TextInputType.phone,
                    ),
                    const SizedBox(height: 12),
                    InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Assign to',
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: assigneeId != null &&
                                  assigneeItems
                                      .any((e) => e.value == assigneeId)
                              ? assigneeId
                              : assigneeItems.isNotEmpty
                                  ? assigneeItems.first.value
                                  : null,
                          isExpanded: true,
                          items: assigneeItems,
                          onChanged: (v) {
                            setDialogState(() => assigneeId = v);
                          },
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: () async {
                    final name = nameController.text.trim();
                    if (name.isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Name is required')),
                      );
                      return;
                    }
                    if (uid == null || uid.isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Sign in to add leads'),
                        ),
                      );
                      return;
                    }
                    final email = emailController.text.trim();
                    final phone = phoneController.text.trim();

                    Navigator.of(ctx).pop();

                    try {
                      await LeadService.insertLead(
                        name: name,
                        email: email,
                        phone: phone,
                      );
                      if (!context.mounted) return;
                      setState(() {
                        _leadsFuture = _fetchLeads();
                      });
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Lead added')),
                      );
                    } catch (e) {
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Could not add lead: $e')),
                      );
                    }
                  },
                  child: const Text('Save'),
                ),
              ],
            );
          },
        );
      },
    );

    nameController.dispose();
    emailController.dispose();
    phoneController.dispose();
  }

  Future<void> showAddUserDialog(BuildContext context) async {
    final emailController = TextEditingController();

    await showDialog<void>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Add user'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Adds a row to the users table for assignment.',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: emailController,
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    hintText: 'name@company.com',
                  ),
                  keyboardType: TextInputType.emailAddress,
                  autofocus: true,
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                final email = emailController.text.trim();
                if (email.isEmpty || !email.contains('@')) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Enter a valid email (must contain @)'),
                    ),
                  );
                  return;
                }
                Navigator.of(ctx).pop();
                try {
                  await UserService.addTeamMemberEmail(email);
                  await loadUsers();
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('User added successfully'),
                    ),
                  );
                } catch (e) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Could not add user: $e'),
                    ),
                  );
                }
              },
              child: const Text('Add'),
            ),
          ],
        );
      },
    );

    emailController.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = Supabase.instance.client.auth.currentUser;

    return Scaffold(
      backgroundColor: const Color(0xFFF7F9FC),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      floatingActionButton: Padding(
        padding: const EdgeInsets.only(right: 24, bottom: 24),
        child: FloatingActionButton(
          backgroundColor: Colors.deepPurple.shade200,
          elevation: 6,
          onPressed: () async {
            final saved = await showDialog<bool>(
              context: context,
              builder: (_) => const AddLeadDialog(),
            );
            if (saved == true && mounted) {
              setState(() => _leadsFuture = _fetchLeads());
            }
          },
          child: const Icon(Icons.add, size: 28),
        ),
      ),
      appBar: AppBar(
        elevation: 0,
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        iconTheme: const IconThemeData(color: Colors.black87),
        actionsIconTheme: const IconThemeData(color: Colors.black87),
        title: const Text(
          'LeadFlow',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: Colors.black87,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_add_alt_1_outlined),
            tooltip: 'Add user',
            onPressed: () => showAddUserDialog(context),
          ),
          IconButton(
            tooltip: 'Refresh',
            onPressed: _refreshing
                ? null
                : () {
                    unawaited(refreshLeads());
                  },
            icon: _refreshing
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.refresh),
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.account_circle),
            onSelected: (value) async {
              if (value == 'logout') {
                await Supabase.instance.client.auth.signOut();
                if (!context.mounted) return;
                Navigator.of(context).pushNamedAndRemoveUntil(
                  '/login',
                  (route) => false,
                );
              }
            },
            itemBuilder: (context) => [
              PopupMenuItem<String>(
                value: 'email',
                enabled: false,
                child: Text(user?.email ?? 'No Email'),
              ),
              const PopupMenuItem<String>(
                value: 'logout',
                child: Text('Logout'),
              ),
            ],
          ),
        ],
      ),
      body: FutureBuilder<List<PipelineLead>>(
        future: _leadsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }
          final leads = snapshot.data ?? [];
          if (snapshot.hasData) {
            _cachedLeads = List<PipelineLead>.from(leads);
          }
          if (leads.isEmpty) {
            return const Center(
                child: Text('Start by adding your first lead 🚀'));
          }
          final stats = getAnalytics(leads);
          final overdueCount = leads.where((l) {
            final d = l.followUpAt;
            return d != null && DateTime.now().isAfter(d);
          }).length;
          final todayCount = leads.where((l) {
            final d = l.followUpAt;
            if (d == null) return false;
            return d.difference(DateTime.now()).inDays == 0;
          }).length;

          final String nextAction;
          var nextActionIsHotBulk = false;
          if (overdueCount > 0) {
            nextAction = '⚡ Clear overdue leads first';
          } else if (todayCount > 0) {
            nextAction = "📅 Complete today's follow-ups";
          } else {
            final followUpLeads = leads
                .where((l) => l.stage.trim().toLowerCase() == 'follow_up')
                .toList();
            if (followUpLeads.isNotEmpty) {
              final n = followUpLeads.length;
              nextAction = n == 1
                  ? '🔥 Message 1 follow-up lead'
                  : '🔥 Message $n follow-up leads';
              nextActionIsHotBulk = true;
            } else {
              nextAction = "✅ You're all caught up";
            }
          }

          _scheduleScrollToKanbanIfOverdue(leads);

          final showCTA = overdueCount > 0 || todayCount > 0;

          return SingleChildScrollView(
            controller: _bodyScrollController,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: Colors.orange.shade100,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Expanded(
                              child: Text(
                                '⚡ $overdueCount overdue • $todayCount follow-ups today',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            if (showCTA)
                              TextButton(
                                onPressed: () {
                                  setState(() {
                                    selectedFollowUpFilter =
                                        overdueCount > 0 ? 'overdue' : 'today';
                                  });
                                  WidgetsBinding.instance
                                      .addPostFrameCallback((_) {
                                    if (!mounted) return;
                                    final ctx =
                                        _kanbanSectionKey.currentContext;
                                    if (ctx == null) return;
                                    Scrollable.ensureVisible(
                                      ctx,
                                      duration:
                                          const Duration(milliseconds: 350),
                                      curve: Curves.easeOutCubic,
                                      alignment: 0.05,
                                    );
                                  });
                                },
                                child: Text(
                                  overdueCount > 0 ? 'Fix Now' : 'Start Now',
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        nextActionIsHotBulk
                            ? Material(
                                color: Colors.transparent,
                                child: InkWell(
                                  onTap: _bulkHotMessaging
                                      ? null
                                      : () => unawaited(
                                            _messageHotLeadsViaN8n(context),
                                          ),
                                  borderRadius: BorderRadius.circular(8),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 4,
                                    ),
                                    child: Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            nextAction,
                                            style: TextStyle(
                                              fontSize: 13,
                                              fontWeight: FontWeight.w500,
                                              color: Colors.deepPurple.shade800,
                                              decoration: TextDecoration.underline,
                                              decorationColor:
                                                  Colors.deepPurple.shade400,
                                            ),
                                          ),
                                        ),
                                        Icon(
                                          Icons.touch_app_outlined,
                                          size: 18,
                                          color: Colors.deepPurple.shade600,
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              )
                            : Text(
                                nextAction,
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                  color: Colors.grey.shade800,
                                ),
                              ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(0, 8, 0, 4),
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final narrow = constraints.maxWidth < 720;
                        if (narrow) {
                          return SizedBox(
                            height: 96,
                            child: ListView(
                              scrollDirection: Axis.horizontal,
                              children: [
                                SizedBox(
                                  width: 120,
                                  child: buildKpiCardFixed(
                                    'Total leads',
                                    '${stats['total']}',
                                    Colors.black87,
                                  ),
                                ),
                                SizedBox(
                                  width: 120,
                                  child: buildKpiCardFixed(
                                    'New',
                                    '${stats['stage_new']}',
                                    Colors.blue.shade700,
                                  ),
                                ),
                                SizedBox(
                                  width: 120,
                                  child: buildKpiCardFixed(
                                    'Contacted',
                                    '${stats['contacted']}',
                                    Colors.teal.shade700,
                                  ),
                                ),
                                SizedBox(
                                  width: 120,
                                  child: buildKpiCardFixed(
                                    'Follow-up',
                                    '${stats['follow_up']}',
                                    Colors.orange.shade800,
                                  ),
                                ),
                                SizedBox(
                                  width: 120,
                                  child: buildKpiCardFixed(
                                    'Closed',
                                    '${stats['closed']}',
                                    Colors.green.shade700,
                                  ),
                                ),
                                SizedBox(
                                  width: 120,
                                  child: buildKpiCardFixed(
                                    'Progress %',
                                    '${stats['progress']}%',
                                    Colors.green.shade700,
                                  ),
                                ),
                              ],
                            ),
                          );
                        }
                        return Row(
                          children: [
                            buildKpiCard(
                              'Total leads',
                              '${stats['total']}',
                              Colors.black87,
                            ),
                            buildKpiCard(
                              'New',
                              '${stats['stage_new']}',
                              Colors.blue.shade700,
                            ),
                            buildKpiCard(
                              'Contacted',
                              '${stats['contacted']}',
                              Colors.teal.shade700,
                            ),
                            buildKpiCard(
                              'Follow-up',
                              '${stats['follow_up']}',
                              Colors.orange.shade800,
                            ),
                            buildKpiCard(
                              'Closed',
                              '${stats['closed']}',
                              Colors.green.shade700,
                            ),
                            buildKpiCard(
                              'Progress %',
                              '${stats['progress']}%',
                              Colors.green.shade700,
                            ),
                          ],
                        );
                      },
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(14),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.05),
                                  blurRadius: 8,
                                  offset: const Offset(0, 2),
                                ),
                              ],
                            ),
                            child: buildBarChart(stats),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(14),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.05),
                                  blurRadius: 8,
                                  offset: const Offset(0, 2),
                                ),
                              ],
                            ),
                            child: buildConversionBar(stats),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          child: Container(
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(14),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.05),
                                  blurRadius: 8,
                                  offset: const Offset(0, 2),
                                ),
                              ],
                            ),
                            child: TextField(
                              controller: searchController,
                              onChanged: (value) {
                                setState(() {
                                  searchQuery = value;
                                });
                              },
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w500,
                                color: Colors.black87,
                              ),
                              decoration: InputDecoration(
                                hintText: 'Search leads...',
                                hintStyle: TextStyle(
                                  color: Colors.grey.shade500,
                                  fontWeight: FontWeight.w400,
                                ),
                                filled: true,
                                fillColor: Colors.white,
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  borderSide: BorderSide.none,
                                ),
                                enabledBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  borderSide: BorderSide.none,
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  borderSide: BorderSide.none,
                                ),
                                prefixIcon: Icon(
                                  Icons.search,
                                  color: Colors.grey.shade500,
                                ),
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 4,
                                  vertical: 14,
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.05),
                                blurRadius: 8,
                                offset: const Offset(0, 2),
                              ),
                            ],
                          ),
                          child: DropdownButtonHideUnderline(
                            child: DropdownButton<String>(
                              value: selectedFilter,
                              borderRadius: BorderRadius.circular(12),
                              items: const [
                                DropdownMenuItem(
                                  value: 'all',
                                  child: Text('All'),
                                ),
                                DropdownMenuItem(
                                  value: 'new',
                                  child: Text('New Leads'),
                                ),
                                DropdownMenuItem(
                                  value: 'contacted',
                                  child: Text('Contacted'),
                                ),
                                DropdownMenuItem(
                                  value: 'follow_up',
                                  child: Text('Follow-up'),
                                ),
                                DropdownMenuItem(
                                  value: 'closed',
                                  child: Text('Closed'),
                                ),
                              ],
                              onChanged: (value) {
                                if (value != null) {
                                  setState(() {
                                    selectedFilter = value;
                                  });
                                }
                              },
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.05),
                                blurRadius: 8,
                                offset: const Offset(0, 2),
                              ),
                            ],
                          ),
                          child: DropdownButtonHideUnderline(
                            child: DropdownButton<String>(
                              value: selectedFollowUpFilter,
                              borderRadius: BorderRadius.circular(12),
                              items: const [
                                DropdownMenuItem(
                                  value: 'all',
                                  child: Text('All follow-ups'),
                                ),
                                DropdownMenuItem(
                                  value: 'today',
                                  child: Text('Today'),
                                ),
                                DropdownMenuItem(
                                  value: 'overdue',
                                  child: Text('Overdue'),
                                ),
                              ],
                              onChanged: (value) {
                                if (value != null) {
                                  setState(() {
                                    selectedFollowUpFilter = value;
                                  });
                                }
                              },
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  KeyedSubtree(
                    key: _kanbanSectionKey,
                    child: SizedBox(
                      height: 560,
                      child: Builder(
                        builder: (context) {
                          final newLeads = getFilteredLeads('new', leads);
                          final contactedLeads =
                              getFilteredLeads('contacted', leads);
                          final followUpLeadsKanban =
                              getFilteredLeads('follow_up', leads);
                          final closedLeads =
                              getFilteredLeads('closed', leads);

                          final showNew = selectedFilter == 'all' ||
                              selectedFilter == 'new';
                          final showContacted = selectedFilter == 'all' ||
                              selectedFilter == 'contacted';
                          final showFollowUp = selectedFilter == 'all' ||
                              selectedFilter == 'follow_up';
                          final showClosed = selectedFilter == 'all' ||
                              selectedFilter == 'closed';

                          final hasVisibleNew =
                              showNew && newLeads.isNotEmpty;
                          final hasVisibleContacted =
                              showContacted && contactedLeads.isNotEmpty;
                          final hasVisibleFollowUp =
                              showFollowUp && followUpLeadsKanban.isNotEmpty;
                          final hasVisibleClosed =
                              showClosed && closedLeads.isNotEmpty;
                          final isFilteredEmpty = !hasVisibleNew &&
                              !hasVisibleContacted &&
                              !hasVisibleFollowUp &&
                              !hasVisibleClosed;

                          if (isFilteredEmpty) {
                            return Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.check_circle_outline,
                                    size: 48,
                                    color: Colors.grey.shade500,
                                  ),
                                  const SizedBox(height: 12),
                                  const Text(
                                    "You're all caught up 🎉",
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    _emptyFilterSubtitle(),
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      color: Colors.grey.shade600,
                                    ),
                                  ),
                                  const SizedBox(height: 16),
                                  ElevatedButton.icon(
                                    onPressed: _resetFiltersToAll,
                                    icon: const Icon(Icons.refresh),
                                    label: const Text('View all leads'),
                                  ),
                                ],
                              ),
                            );
                          }

                          var visibleColumnCount = 0;
                          if (showNew &&
                              (newLeads.isNotEmpty || searchQuery.isEmpty)) {
                            visibleColumnCount++;
                          }
                          if (showContacted &&
                              (contactedLeads.isNotEmpty ||
                                  searchQuery.isEmpty)) {
                            visibleColumnCount++;
                          }
                          if (showFollowUp &&
                              (followUpLeadsKanban.isNotEmpty ||
                                  searchQuery.isEmpty)) {
                            visibleColumnCount++;
                          }
                          if (showClosed &&
                              (closedLeads.isNotEmpty || searchQuery.isEmpty)) {
                            visibleColumnCount++;
                          }

                          return LayoutBuilder(
                            builder: (context, cons) {
                              final minTotal =
                                  _kKanbanMinColumnWidth * visibleColumnCount;
                              final useHorizontalScroll =
                                  cons.maxWidth < minTotal;

                              Widget wrapColumn(Widget column) {
                                if (useHorizontalScroll) {
                                  return SizedBox(
                                    width: _kKanbanMinColumnWidth,
                                    height: 560,
                                    child: column,
                                  );
                                }
                                return Expanded(child: column);
                              }

                              final rowChildren = <Widget>[
                                if (showNew &&
                                    (newLeads.isNotEmpty ||
                                        searchQuery.isEmpty))
                                  wrapColumn(
                                    _PipelineStageColumn(
                                      stage: 'new',
                                      title: _pipelineColumnTitle('new'),
                                      accent: _pipelineStageAccent('new'),
                                      leads: newLeads,
                                      onLeadDropped: (lead) {
                                        unawaited(moveLead(lead, 'new'));
                                      },
                                      onEditLead: _editLead,
                                      onDeleteLead: _deleteLead,
                                      onQuickFollowUp: _setFollowUpTomorrow,
                                      onLeadContactTracked: _onLeadContactTracked,
                                    ),
                                  ),
                                if (showContacted &&
                                    (contactedLeads.isNotEmpty ||
                                        searchQuery.isEmpty))
                                  wrapColumn(
                                    _PipelineStageColumn(
                                      stage: 'contacted',
                                      title: _pipelineColumnTitle('contacted'),
                                      accent:
                                          _pipelineStageAccent('contacted'),
                                      leads: contactedLeads,
                                      onLeadDropped: (lead) {
                                        unawaited(
                                          moveLead(lead, 'contacted'),
                                        );
                                      },
                                      onEditLead: _editLead,
                                      onDeleteLead: _deleteLead,
                                      onQuickFollowUp: _setFollowUpTomorrow,
                                      onLeadContactTracked: _onLeadContactTracked,
                                    ),
                                  ),
                                if (showFollowUp &&
                                    (followUpLeadsKanban.isNotEmpty ||
                                        searchQuery.isEmpty))
                                  wrapColumn(
                                    _PipelineStageColumn(
                                      stage: 'follow_up',
                                      title:
                                          _pipelineColumnTitle('follow_up'),
                                      accent:
                                          _pipelineStageAccent('follow_up'),
                                      leads: followUpLeadsKanban,
                                      onLeadDropped: (lead) {
                                        unawaited(
                                          moveLead(lead, 'follow_up'),
                                        );
                                      },
                                      onEditLead: _editLead,
                                      onDeleteLead: _deleteLead,
                                      onQuickFollowUp: _setFollowUpTomorrow,
                                      onLeadContactTracked: _onLeadContactTracked,
                                    ),
                                  ),
                                if (showClosed &&
                                    (closedLeads.isNotEmpty ||
                                        searchQuery.isEmpty))
                                  wrapColumn(
                                    _PipelineStageColumn(
                                      stage: 'closed',
                                      title: _pipelineColumnTitle('closed'),
                                      accent: _pipelineStageAccent('closed'),
                                      leads: closedLeads,
                                      onLeadDropped: (lead) {
                                        unawaited(moveLead(lead, 'closed'));
                                      },
                                      onEditLead: _editLead,
                                      onDeleteLead: _deleteLead,
                                      onQuickFollowUp: _setFollowUpTomorrow,
                                      onLeadContactTracked: _onLeadContactTracked,
                                    ),
                                  ),
                              ];

                              if (useHorizontalScroll) {
                                return SingleChildScrollView(
                                  scrollDirection: Axis.horizontal,
                                  child: Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: rowChildren,
                                  ),
                                );
                              }

                              return Row(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: rowChildren,
                              );
                            },
                          );
                        },
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _PipelineStageColumn extends StatelessWidget {
  const _PipelineStageColumn({
    required this.stage,
    required this.title,
    required this.accent,
    required this.leads,
    required this.onLeadDropped,
    required this.onEditLead,
    required this.onDeleteLead,
    required this.onQuickFollowUp,
    required this.onLeadContactTracked,
  });

  final String stage;
  final String title;
  final Color accent;
  final List<PipelineLead> leads;
  final void Function(PipelineLead lead) onLeadDropped;
  final Future<void> Function(PipelineLead lead) onEditLead;
  final Future<void> Function(PipelineLead lead) onDeleteLead;
  final Future<void> Function(PipelineLead lead) onQuickFollowUp;
  final Future<void> Function(PipelineLead lead) onLeadContactTracked;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(8),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 14, 12, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                    color: accent,
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '${leads.length}',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                      color: accent,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Expanded(
              child: DragTarget<PipelineLead>(
                onWillAcceptWithDetails: (_) => true,
                onAcceptWithDetails: (details) {
                  onLeadDropped(details.data);
                },
                builder: (context, candidateData, rejectedData) {
                  final isHovering = candidateData.isNotEmpty;

                  return SizedBox.expand(
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 220),
                      curve: Curves.easeOut,
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: isHovering
                            ? accent.withValues(alpha: 0.08)
                            : const Color(0xFFF7F9FC),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: isHovering
                              ? accent.withValues(alpha: 0.45)
                              : Colors.grey.shade200,
                          width: isHovering ? 1.5 : 1,
                        ),
                        boxShadow: isHovering
                            ? [
                                BoxShadow(
                                  color: accent.withValues(alpha: 0.12),
                                  blurRadius: 12,
                                  offset: const Offset(0, 2),
                                ),
                              ]
                            : null,
                      ),
                      child: leads.isEmpty
                          ? Center(
                              child: Text(
                                'Drop here',
                                style: TextStyle(
                                  color: isHovering
                                      ? accent
                                      : Colors.grey.shade500,
                                  fontWeight: FontWeight.w500,
                                  fontSize: 13,
                                ),
                              ),
                            )
                          : ListView.builder(
                              primary: false,
                              padding: const EdgeInsets.symmetric(
                                vertical: 4,
                              ),
                              physics: const AlwaysScrollableScrollPhysics(),
                              itemCount: leads.length,
                              itemBuilder: (context, index) {
                                return _PipelineKanbanCard(
                                  lead: leads[index],
                                  onEdit: onEditLead,
                                  onDelete: onDeleteLead,
                                  onQuickFollowUp: onQuickFollowUp,
                                  onLeadContactTracked: onLeadContactTracked,
                                );
                              },
                            ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PipelineKanbanCard extends StatefulWidget {
  const _PipelineKanbanCard({
    required this.lead,
    required this.onEdit,
    required this.onDelete,
    required this.onQuickFollowUp,
    required this.onLeadContactTracked,
  });

  final PipelineLead lead;
  final Future<void> Function(PipelineLead lead) onEdit;
  final Future<void> Function(PipelineLead lead) onDelete;
  final Future<void> Function(PipelineLead lead) onQuickFollowUp;
  final Future<void> Function(PipelineLead lead) onLeadContactTracked;

  @override
  State<_PipelineKanbanCard> createState() => _PipelineKanbanCardState();
}

class _PipelineKanbanCardState extends State<_PipelineKanbanCard> {
  bool _hovering = false;

  bool get _isOverdue => _isOverdueFollowUp(widget.lead.followUpAt);
  bool get _isToday => _isTodayFollowUp(widget.lead.followUpAt);

  Future<void> _openWhatsAppTemplatePicker() async {
    final messenger = ScaffoldMessenger.of(context);
    final selectedTemplate = await showModalBottomSheet<String>(
      context: context,
      builder: (sheetContext) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Text(
                'Choose WhatsApp Template',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: Colors.grey.shade800,
                ),
              ),
              const SizedBox(height: 8),
              for (final template in _whatsAppTemplates)
                ListTile(
                  title: Text(template),
                  onTap: () => Navigator.of(sheetContext).pop(template),
                ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );

    if (selectedTemplate == null) return;
    final safeName =
        widget.lead.name.trim().isEmpty ? 'there' : widget.lead.name.trim();
    final message = selectedTemplate.replaceAll('{name}', safeName);
    try {
      await openWhatsAppWithMessage(widget.lead.phone, message);
    } catch (_) {
      if (!mounted) return;
      messenger.showSnackBar(
        const SnackBar(content: Text('Could not open WhatsApp')),
      );
      return;
    }
    if (!mounted) return;
    await widget.onLeadContactTracked(widget.lead);
  }

  Widget _kanbanActionGrid(BuildContext context) {
    Widget iconBtn({
      required IconData icon,
      required Color? iconColor,
      required String tooltip,
      required VoidCallback onPressed,
    }) {
      return IconButton(
        tooltip: tooltip,
        padding: EdgeInsets.zero,
        visualDensity: VisualDensity.compact,
        constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
        icon: Icon(icon, color: iconColor, size: 20),
        onPressed: onPressed,
      );
    }

    final neutral = Colors.grey.shade800;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            iconBtn(
              icon: Icons.flash_on,
              iconColor: Colors.orange,
              tooltip: 'Follow-up now',
              onPressed: () async {
                final messenger = ScaffoldMessenger.of(context);
                try {
                  await openWhatsApp(widget.lead.phone, widget.lead.name);
                } catch (_) {
                  if (!mounted) return;
                  messenger.showSnackBar(
                    const SnackBar(content: Text('Could not open WhatsApp')),
                  );
                  return;
                }
                if (!mounted) return;
                await widget.onLeadContactTracked(widget.lead);
              },
            ),
            iconBtn(
              icon: Icons.chat,
              iconColor: Colors.green,
              tooltip: 'WhatsApp',
              onPressed: () => unawaited(_openWhatsAppTemplatePicker()),
            ),
            iconBtn(
              icon: Icons.call,
              iconColor: Colors.blue,
              tooltip: 'Call',
              onPressed: () async {
                final messenger = ScaffoldMessenger.of(context);
                try {
                  await openPhoneCall(widget.lead.phone);
                } catch (_) {
                  if (!mounted) return;
                  messenger.showSnackBar(
                    const SnackBar(content: Text('Could not open dialer')),
                  );
                  return;
                }
                if (!mounted) return;
                await widget.onLeadContactTracked(widget.lead);
              },
            ),
          ],
        ),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            iconBtn(
              icon: Icons.copy,
              iconColor: neutral,
              tooltip: 'Copy number',
              onPressed: () async {
                final messenger = ScaffoldMessenger.of(context);
                await Clipboard.setData(
                  ClipboardData(
                    text: _normalizeWhatsAppPhone(widget.lead.phone),
                  ),
                );
                if (!mounted) return;
                messenger.showSnackBar(
                  const SnackBar(content: Text('Number copied')),
                );
              },
            ),
            iconBtn(
              icon: Icons.edit_rounded,
              iconColor: neutral,
              tooltip: 'Edit',
              onPressed: () => unawaited(widget.onEdit(widget.lead)),
            ),
            iconBtn(
              icon: Icons.delete_outline_rounded,
              iconColor: neutral,
              tooltip: 'Delete',
              onPressed: () => unawaited(widget.onDelete(widget.lead)),
            ),
          ],
        ),
      ],
    );
  }

  List<Widget> _kanbanMetaExtras({
    required bool hasFollowUp,
    required Color followUpIconColor,
  }) {
    return [
      if (hasFollowUp)
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.access_time,
                size: 14,
                color: followUpIconColor,
              ),
              const SizedBox(width: 4),
              Text(
                _isOverdue
                    ? 'Overdue'
                    : _isToday
                        ? 'Today'
                        : 'Scheduled',
                style: TextStyle(
                  color: _isOverdue
                      ? Colors.red.shade700
                      : _isToday
                          ? Colors.orange.shade700
                          : Colors.grey.shade700,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      if (_isOverdue)
        Container(
          margin: const EdgeInsets.only(top: 4),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: Colors.red.shade50,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.red.shade200),
          ),
          child: Text(
            'Overdue',
            style: TextStyle(
              color: Colors.red.shade700,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      if (_isToday)
        Container(
          margin: const EdgeInsets.only(top: 4),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: Colors.orange.shade50,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.orange.shade200),
          ),
          child: Text(
            'Today',
            style: TextStyle(
              color: Colors.orange.shade700,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
    ];
  }

  Widget _buildCardInterior(
    BuildContext context, {
    required String title,
    required String stageKey,
    required Color accent,
    required String phone,
    required String preview,
    required bool hasFollowUp,
    required Color followUpIconColor,
    required String intelligenceStatus,
  }) {
    return Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: accent.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        _pipelineStageShortLabel(stageKey),
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: accent,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              buildStatusBadge(intelligenceStatus),
            ],
          ),
          if (phone.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              phone,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey.shade800,
              ),
            ),
          ],
          const SizedBox(height: 8),
          Text(
            preview.isEmpty ? 'No message preview yet' : preview,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 12,
              color: preview.isEmpty
                  ? Colors.grey.shade500
                  : Colors.grey.shade700,
              height: 1.35,
              fontStyle: preview.isEmpty ? FontStyle.italic : FontStyle.normal,
            ),
          ),
          ..._kanbanMetaExtras(
            hasFollowUp: hasFollowUp,
            followUpIconColor: followUpIconColor,
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: _kanbanActionGrid(context),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final stageKey = widget.lead.stage.trim().toLowerCase();
    final accent = _pipelineStageAccent(stageKey);
    final title = widget.lead.name.isEmpty ? 'No Name' : widget.lead.name;
    final phone = widget.lead.phone.trim();
    final preview = widget.lead.lastMessagePreview.trim();
    final hasFollowUp = widget.lead.followUpAt != null;
    final followUpIconColor = _isOverdue
        ? Colors.red
        : _isToday
            ? Colors.orange
            : Colors.grey;
    final borderSide = _isOverdue
        ? BorderSide(color: Colors.red.shade700, width: 2.2)
        : _isToday
            ? BorderSide(color: Colors.orange.shade600, width: 1.8)
            : BorderSide.none;

    final cardDecoration = BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.08),
          blurRadius: _hovering ? 14 : 10,
          offset: const Offset(0, 4),
        ),
      ],
      border: borderSide == BorderSide.none
          ? null
          : Border.fromBorderSide(borderSide),
    );

    final cardContent = AnimatedContainer(
      duration: const Duration(milliseconds: 140),
      transform: Matrix4.translationValues(0, _hovering ? -2 : 0, 0),
      child: Container(
        decoration: cardDecoration,
        clipBehavior: Clip.antiAlias,
        child: _buildCardInterior(
          context,
          title: title,
          stageKey: stageKey,
          accent: accent,
          phone: phone,
          preview: preview,
          hasFollowUp: hasFollowUp,
          followUpIconColor: followUpIconColor,
          intelligenceStatus: widget.lead.intelligenceStatus,
        ),
      ),
    );

    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Draggable<PipelineLead>(
              data: widget.lead,
              feedback: Material(
                elevation: 12,
                borderRadius: BorderRadius.circular(16),
                child: SizedBox(
                  width: 300,
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.15),
                          blurRadius: 12,
                          offset: const Offset(0, 6),
                        ),
                      ],
                      border: borderSide == BorderSide.none
                          ? null
                          : Border.fromBorderSide(borderSide),
                    ),
                    child: _buildCardInterior(
                      context,
                      title: title,
                      stageKey: stageKey,
                      accent: accent,
                      phone: phone,
                      preview: preview,
                      hasFollowUp: hasFollowUp,
                      followUpIconColor: followUpIconColor,
                      intelligenceStatus: widget.lead.intelligenceStatus,
                    ),
                  ),
                ),
              ),
              childWhenDragging: Opacity(
                opacity: 0.35,
                child: Icon(
                  Icons.drag_indicator_rounded,
                  color: Colors.grey.shade500,
                  size: 22,
                ),
              ),
              child: MouseRegion(
                cursor: SystemMouseCursors.grab,
                child: Padding(
                  padding: const EdgeInsets.only(top: 10, right: 4),
                  child: Icon(
                    Icons.drag_indicator_rounded,
                    color: Colors.grey.shade500,
                    size: 22,
                  ),
                ),
              ),
            ),
            Expanded(child: cardContent),
          ],
        ),
      ),
    );
  }
}

class _LeadDraft {
  const _LeadDraft({
    required this.name,
    required this.email,
    required this.status,
    required this.notes,
    this.followUpAt,
  });

  final String name;
  final String email;
  final String status;
  final String notes;
  final DateTime? followUpAt;
}

class EditLeadDialog extends StatefulWidget {
  const EditLeadDialog({super.key, required this.lead});

  final PipelineLead lead;

  @override
  State<EditLeadDialog> createState() => _EditLeadDialogState();
}

class _EditLeadDialogState extends State<EditLeadDialog> {
  final TextEditingController nameController = TextEditingController();
  final TextEditingController emailController = TextEditingController();
  final TextEditingController notesController = TextEditingController();
  late String selectedStatus;
  DateTime? _followUpAt;

  @override
  void initState() {
    super.initState();
    selectedStatus = normalizePipelineStageForUi(widget.lead.stage);
    nameController.text = widget.lead.name;
    emailController.text = widget.lead.email;
    notesController.text = widget.lead.notes;
    _followUpAt = widget.lead.followUpAt;
  }

  @override
  void dispose() {
    nameController.dispose();
    emailController.dispose();
    notesController.dispose();
    super.dispose();
  }

  void _submit() {
    final name = nameController.text.trim();
    final email = emailController.text.trim();
    final notes = notesController.text.trim();
    final status = selectedStatus.trim().toLowerCase();

    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Name is required')),
      );
      return;
    }

    Navigator.of(context).pop(
      _LeadDraft(
        name: name,
        email: email,
        status: status,
        notes: notes,
        followUpAt: _followUpAt,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Edit lead'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: const InputDecoration(
                labelText: 'Name',
                hintText: 'Required',
              ),
              textCapitalization: TextCapitalization.words,
              autofocus: true,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: emailController,
              decoration: const InputDecoration(
                labelText: 'Email',
                hintText: 'Optional',
              ),
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: notesController,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Notes',
                hintText: 'Optional',
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    _followUpAt == null
                        ? 'Follow-up: Not set'
                        : 'Follow-up: ${_followUpAt!.toLocal()}',
                    style: TextStyle(
                      color: Colors.grey.shade700,
                      fontSize: 12,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () async {
                    final picked = await pickFollowUpDateTime(
                      context,
                      initial: _followUpAt,
                    );
                    if (picked == null) return;
                    setState(() => _followUpAt = picked);
                  },
                  child: const Text('Set'),
                ),
                if (_followUpAt != null)
                  TextButton(
                    onPressed: () => setState(() => _followUpAt = null),
                    child: const Text('Clear'),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            InputDecorator(
              decoration: const InputDecoration(labelText: 'Stage'),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: selectedStatus,
                  isExpanded: true,
                  items: const [
                    DropdownMenuItem(
                      value: 'new',
                      child: Text('New Leads'),
                    ),
                    DropdownMenuItem(
                      value: 'contacted',
                      child: Text('Contacted'),
                    ),
                    DropdownMenuItem(
                      value: 'follow_up',
                      child: Text('Follow-up'),
                    ),
                    DropdownMenuItem(
                      value: 'closed',
                      child: Text('Closed'),
                    ),
                  ],
                  onChanged: (v) {
                    if (v == null) return;
                    setState(() => selectedStatus = v);
                  },
                ),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(null),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _submit,
          child: const Text('Save'),
        ),
      ],
    );
  }
}

class AddLeadDialog extends StatefulWidget {
  const AddLeadDialog({super.key});

  @override
  State<AddLeadDialog> createState() => _AddLeadDialogState();
}

class _AddLeadDialogState extends State<AddLeadDialog> {
  final TextEditingController nameController = TextEditingController();
  final TextEditingController emailController = TextEditingController();
  final TextEditingController notesController = TextEditingController();
  DateTime? _followUpAt;
  bool _submitting = false;

  @override
  void dispose() {
    nameController.dispose();
    emailController.dispose();
    notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;
    setState(() => _submitting = true);

    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to add leads')),
      );
      setState(() => _submitting = false);
      return;
    }

    final name = nameController.text.trim();
    final email = emailController.text.trim();
    final notes = notesController.text.trim();

    if (name.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Name is required')),
      );
      if (mounted) setState(() => _submitting = false);
      return;
    }
    if (email.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Email is required')),
      );
      if (mounted) setState(() => _submitting = false);
      return;
    }

    try {
      await Supabase.instance.client.from('leads').insert({
        'name': name,
        'email': email,
        'status': 'warm',
        'priority': 'new',
        'stage': 'new',
        'score': 50,
        'user_id': user.id,
        'assigned_to': user.id,
        'created_at': DateTime.now().toIso8601String(),
        'notes': notes,
        'follow_up_at': _followUpAt?.toIso8601String(),
        'next_followup': _followUpAt?.toIso8601String(),
      });

      if (!mounted) return;

      nameController.clear();
      emailController.clear();
      notesController.clear();

      final messenger = ScaffoldMessenger.of(context);
      Navigator.of(context).pop(true);
      messenger.showSnackBar(
        const SnackBar(content: Text('Lead added successfully')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Error adding lead')),
      );
      setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Add lead'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: const InputDecoration(
                labelText: 'Name',
                hintText: 'Required',
              ),
              textCapitalization: TextCapitalization.words,
              autofocus: true,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: emailController,
              decoration: const InputDecoration(
                labelText: 'Email',
                hintText: 'Required',
              ),
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: notesController,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Notes',
                hintText: 'Optional',
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    _followUpAt == null
                        ? 'Follow-up: Not set'
                        : 'Follow-up: ${_followUpAt!.toLocal()}',
                    style: TextStyle(
                      color: Colors.grey.shade700,
                      fontSize: 12,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () async {
                    final picked = await pickFollowUpDateTime(
                      context,
                      initial: _followUpAt,
                    );
                    if (picked == null) return;
                    setState(() => _followUpAt = picked);
                  },
                  child: const Text('Set'),
                ),
                if (_followUpAt != null)
                  TextButton(
                    onPressed: () => setState(() => _followUpAt = null),
                    child: const Text('Clear'),
                  ),
              ],
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _submitting ? null : _submit,
          child: _submitting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Save'),
        ),
      ],
    );
  }
}
