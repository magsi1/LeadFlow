import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/auth/supabase_auth_helpers.dart';
import '../../models/activity.dart';
import '../../models/follow_up.dart';
import '../../models/lead.dart';
import '../lead_repository.dart';
import 'supabase_leads_select.dart';

class SupabaseLeadRepository implements LeadRepository {
  SupabaseLeadRepository(this._client);

  /// Columns for list fetch — see [SupabaseLeadsSelect.columns].
  static const String _leadFetchColumns = SupabaseLeadsSelect.columns;

  final SupabaseClient _client;
  final StreamController<void> _changes = StreamController<void>.broadcast();
  RealtimeChannel? _channel;
  String? _workspaceIdCache;

  @override
  Stream<void> watchDataChanges() {
    _ensureRealtime();
    return _changes.stream;
  }

  void _ensureRealtime() {
    if (_channel != null) return;
    final channel = _client.channel('public:crm_data_changes');
    channel
      ..onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'leads',
        callback: (_) => _changes.add(null),
      )
      ..onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'follow_ups',
        callback: (_) => _changes.add(null),
      )
      ..onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'activities',
        callback: (_) => _changes.add(null),
      )
      ..subscribe();
    _channel = channel;
  }

  @override
  Future<void> addActivity(Activity activity) async {
    final workspaceId = await _resolveWorkspaceId();
    await _client.from('activities').upsert({
      'id': activity.id,
      'workspace_id': workspaceId,
      'lead_id': activity.leadId,
      'conversation_id': activity.metadata['conversationId']?.toString(),
      'actor_profile_id': activity.performedBy.isEmpty ? null : activity.performedBy,
      'type': activity.type,
      'description': activity.message,
      'metadata': activity.metadata,
      'created_at': activity.createdAt.toIso8601String(),
    });
  }

  @override
  Future<List<Activity>> fetchActivities() async {
    final rows = await _client.from('activities').select().order('created_at', ascending: false);
    return rows.map(_mapActivity).toList();
  }

  @override
  Future<List<FollowUp>> fetchFollowUps() async {
    final rows = await _client.from('follow_ups').select().order('due_at', ascending: true);
    return rows.map(_mapFollowUp).toList();
  }

  @override
  Future<List<Lead>> fetchLeads() async {
    logLeadsDbOp('select (crm repository)');
    final userId = _client.auth.currentUser?.id;
    if (userId == null) return <Lead>[];

    if (kDebugMode) {
      debugPrint('[LeadFlow] fetchLeads select: $_leadFetchColumns');
    }

    final rows = await _client
        .from('leads')
        .select(_leadFetchColumns)
        .eq('user_id', userId)
        .order('created_at', ascending: false);

    if (kDebugMode) {
      debugPrint('[LeadFlow] fetchLeads: ${rows.length} row(s)');
      if (rows.isNotEmpty) {
        final first = rows.first;
        final em = first['email'];
        debugPrint(
          '[LeadFlow] fetchLeads first row id=${first['id']} email=$em '
          '(type: ${em.runtimeType})',
        );
      }
    }

    return rows.map(_mapLead).toList();
  }

  @override
  Future<void> resetDemoData() async {
    // Supabase mode should never reset persisted CRM records.
  }

  @override
  Future<Lead> saveLead(Lead lead) async {
    final workspaceId = await _resolveWorkspaceId();
    logLeadsDbOp('upsert (crm repository)', extra: {'leadId': lead.id});
    final user = requireLoggedInUser();

    // ignore: avoid_print
    print('INSERT USER ID: ${user.id}');
    // ignore: avoid_print
    print('DEBUG USER: ${user.id}');
    final row = _toLeadRow(
      lead,
      workspaceId: workspaceId,
      userId: user.id,
    );
    // ignore: avoid_print
    print('UPSERT lead row user_id: ${row['user_id']}');

    try {
      await _client.from('leads').upsert(row);
    } catch (e) {
      // ignore: avoid_print
      print('SUPABASE ERROR: $e');
      rethrow;
    }
    return lead;
  }

  @override
  Future<void> saveFollowUp(FollowUp followUp) async {
    final workspaceId = await _resolveWorkspaceId();
    await _client.from('follow_ups').upsert({
      'id': followUp.id,
      'workspace_id': workspaceId,
      'lead_id': followUp.leadId,
      'assigned_to': followUp.assignedTo,
      'due_at': followUp.dueAt.toIso8601String(),
      'note': followUp.lastNote,
      'status': followUp.completed ? 'completed' : 'pending',
      'created_by': null,
      'created_at': DateTime.now().toIso8601String(),
    });
  }

  Map<String, dynamic> _toLeadRow(
    Lead lead, {
    required String userId,
    String? workspaceId,
  }) {
    return {
      'id': lead.id,
      'user_id': userId,
      'workspace_id': workspaceId,
      'name': lead.customerName,
      'phone': lead.phone,
      'email': lead.email.trim().isEmpty ? null : lead.email.trim(),
      'city': lead.city,
      'source_channel': _toSourceChannel(lead.source),
      'status': lead.temperature.name,
      'assigned_to': lead.assignedTo,
      'notes': lead.notesSummary,
      'created_at': lead.createdAt.toIso8601String(),
      'updated_at': lead.updatedAt.toIso8601String(),
      'next_follow_up_at': lead.nextFollowUpAt?.toIso8601String(),
      'next_followup': lead.nextFollowUpAt?.toIso8601String(),
      'conversation_id': lead.sourceMetadata['conversationId']?.toString(),
      'priority': _toLeadStatus(lead.status),
      'last_contacted': lead.lastContacted?.toIso8601String(),
      'created_by': lead.createdBy.isEmpty ? null : lead.createdBy,
      'score': lead.score,
      'score_category': lead.scoreCategory.name.toUpperCase(),
      'deal_value': lead.dealValue,
      'deal_status': lead.dealStatus.name,
    };
  }

  Future<String?> _resolveWorkspaceId() async {
    if (_workspaceIdCache != null && _workspaceIdCache!.isNotEmpty) {
      return _workspaceIdCache;
    }
    final userId = _client.auth.currentUser?.id;
    if (userId == null) return null;
    Map<String, dynamic>? row;
    try {
      row = await _client
          .from('workspace_members')
          .select('workspace_id')
          .eq('profile_id', userId)
          .eq('status', 'active')
          .order('created_at')
          .limit(1)
          .maybeSingle();
    } catch (_) {
      try {
        row = await _client
            .from('workspace_members')
            .select('workspace_id')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at')
            .limit(1)
            .maybeSingle();
      } catch (_) {
        try {
          row = await _client
              .from('workspace_members')
              .select('workspace_id')
              .eq('profile_id', userId)
              .order('created_at')
              .limit(1)
              .maybeSingle();
        } catch (_) {
          row = await _client
              .from('workspace_members')
              .select('workspace_id')
              .eq('user_id', userId)
              .order('created_at')
              .limit(1)
              .maybeSingle();
        }
      }
    }
    final workspaceId = row?['workspace_id']?.toString();
    _workspaceIdCache = workspaceId;
    return workspaceId;
  }

  /// Null-safe: DB may return null before migration or for legacy rows.
  static String _parseEmail(Object? value) {
    if (value == null) return '';
    final s = value.toString().trim();
    return s;
  }

  Lead _mapLead(Map<String, dynamic> row) {
    final raw = (row['status'] ?? '').toString().toLowerCase().trim();
    final LeadTemperature temp;
    final LeadStatus deal;
    if (raw == 'hot' || raw == 'warm' || raw == 'cold') {
      temp = LeadTemperature.values.firstWhere(
        (e) => e.name == raw,
        orElse: () => LeadTemperature.warm,
      );
      deal = Lead.leadStatusFromStorage(row['priority']?.toString());
    } else {
      deal = _fromLeadStatus(row['status']?.toString());
      final tempRaw = (row['priority'] ?? 'warm').toString().toLowerCase();
      temp = LeadTemperature.values.firstWhere(
        (e) => e.name == tempRaw,
        orElse: () => LeadTemperature.warm,
      );
    }
    final nextFu = DateTime.tryParse(row['next_followup']?.toString() ?? '') ??
        DateTime.tryParse(row['next_follow_up_at']?.toString() ?? '');
    return Lead(
      id: row['id']?.toString() ?? '',
      businessId: '',
      customerName: row['name']?.toString() ?? '',
      phone: row['phone']?.toString() ?? '',
      email: _parseEmail(row['email']),
      alternatePhone: null,
      city: row['city']?.toString() ?? '',
      address: '',
      source: row['source']?.toString() ??
          row['source_channel']?.toString() ??
          'Other',
      productInterest: '',
      budget: '',
      inquiryText: '',
      status: deal,
      temperature: temp,
      assignedTo: row['assigned_to']?.toString() ?? '',
      createdBy: row['created_by']?.toString() ?? '',
      createdAt: DateTime.tryParse(row['created_at']?.toString() ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(row['updated_at']?.toString() ?? '') ?? DateTime.now(),
      nextFollowUpAt: nextFu,
      lastContacted: DateTime.tryParse(row['last_contacted']?.toString() ?? ''),
      notesSummary: row['notes']?.toString() ?? '',
      sourceMetadata: {
        if (row['conversation_id'] != null) 'conversationId': row['conversation_id'].toString(),
      },
      score: (row['score'] as num?)?.toInt() ?? 0,
      scoreCategory: LeadScoreCategory.values.firstWhere(
        (e) => e.name == (row['score_category']?.toString() ?? 'cold').toLowerCase(),
        orElse: () => LeadScoreCategory.cold,
      ),
      dealValue: (row['deal_value'] as num?)?.toDouble() ?? 0,
      dealStatus: DealStatus.values.firstWhere(
        (e) => e.name == (row['deal_status']?.toString() ?? 'open').toLowerCase(),
        orElse: () => DealStatus.open,
      ),
      isArchived: false,
      isDeleted: false,
    );
  }

  FollowUp _mapFollowUp(Map<String, dynamic> row) {
    final status = row['status']?.toString() ?? 'pending';
    return FollowUp(
      id: row['id']?.toString() ?? '',
      leadId: row['lead_id']?.toString() ?? '',
      assignedTo: row['assigned_to']?.toString() ?? '',
      dueAt: DateTime.tryParse(row['due_at']?.toString() ?? '') ?? DateTime.now(),
      completed: status == 'completed',
      lastNote: row['note']?.toString() ?? '',
    );
  }

  Activity _mapActivity(Map<String, dynamic> row) {
    return Activity(
      id: row['id']?.toString() ?? '',
      leadId: row['lead_id']?.toString() ?? '',
      type: row['type']?.toString() ?? '',
      message: row['description']?.toString() ?? '',
      performedBy: row['actor_profile_id']?.toString() ?? '',
      createdAt: DateTime.tryParse(row['created_at']?.toString() ?? '') ?? DateTime.now(),
      metadata: (row['metadata'] as Map<String, dynamic>?) ?? const {},
    );
  }

  String _toSourceChannel(String source) {
    final s = source.toLowerCase();
    if (s.contains('whatsapp')) return 'whatsapp';
    if (s.contains('instagram')) return 'instagram';
    if (s.contains('facebook')) return 'facebook';
    if (s.contains('manual')) return 'manual';
    return 'other';
  }

  String _toLeadStatus(LeadStatus status) {
    return switch (status) {
      LeadStatus.leadNew => 'new',
      LeadStatus.contacted => 'contacted',
      LeadStatus.interested || LeadStatus.negotiation => 'qualified',
      LeadStatus.followUpNeeded => 'proposal_sent',
      LeadStatus.closedWon => 'won',
      LeadStatus.closedLost => 'lost',
    };
  }

  LeadStatus _fromLeadStatus(String? status) {
    return switch (status) {
      'new' => LeadStatus.leadNew,
      'contacted' => LeadStatus.contacted,
      'qualified' => LeadStatus.interested,
      'proposal_sent' => LeadStatus.followUpNeeded,
      'won' => LeadStatus.closedWon,
      'lost' => LeadStatus.closedLost,
      _ => LeadStatus.leadNew,
    };
  }
}
