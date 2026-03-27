import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../core/auth/supabase_auth_helpers.dart';
import '../../../../services/lead_service.dart';
import '../../../../data/repositories/supabase/supabase_leads_select.dart';
import '../../../../data/models/activity.dart';
import '../../../../data/models/app_user.dart';
import '../../../../data/models/follow_up.dart';
import '../../../../data/models/lead.dart';
import '../../../../shared/models/channel_type.dart';
import '../../../inbox/domain/entities/conversation.dart';
import '../../../inbox/domain/entities/unified_message.dart';
import '../../domain/entities/analytics_dataset.dart';
import '../../domain/entities/analytics_filter.dart';
import '../../domain/repositories/analytics_repository.dart';

class SupabaseAnalyticsRepository implements AnalyticsRepository {
  SupabaseAnalyticsRepository(this._client);
  final SupabaseClient _client;

  @override
  Future<AnalyticsDataset> fetchDataset(AnalyticsFilter filter) async {
    final workspaceId = filter.workspaceId ?? await _resolveWorkspaceId();

    final userId = _client.auth.currentUser?.id;
    logLeadsDbOp('select (analytics_dataset)', extra: {
      'workspaceId': workspaceId ?? '(any)',
    });
    List<Map<String, dynamic>> leadsRows;
    if (userId == null) {
      leadsRows = const [];
    } else {
      await LeadService.claimUnassignedLeadsForCurrentUser();
      if (workspaceId == null) {
        final raw = await _client
            .from('leads')
            .select(SupabaseLeadsSelect.columns)
            .eq('assigned_to', userId);
        leadsRows = List<Map<String, dynamic>>.from(raw);
      } else {
        final raw = await _client
            .from('leads')
            .select(SupabaseLeadsSelect.columns)
            .eq('assigned_to', userId)
            .eq('workspace_id', workspaceId);
        leadsRows = List<Map<String, dynamic>>.from(raw);
      }
    }

    final followUpsQuery = _client.from('follow_ups').select();
    final followUpsRows = workspaceId == null
        ? await followUpsQuery
        : await followUpsQuery.eq('workspace_id', workspaceId);

    final activitiesQuery = _client.from('activities').select();
    final activitiesRows = workspaceId == null
        ? await activitiesQuery
        : await activitiesQuery.eq('workspace_id', workspaceId);

    final conversationsQuery = _client.from('conversations').select();
    final conversationsRows = workspaceId == null
        ? await conversationsQuery
        : await conversationsQuery.eq('workspace_id', workspaceId);

    final messagesQuery = _client.from('messages').select();
    final messagesRows = workspaceId == null
        ? await messagesQuery
        : await messagesQuery.inFilter(
            'conversation_id',
            conversationsRows.map((e) => e['id']?.toString() ?? '').where((e) => e.isNotEmpty).toList(),
          );

    late final List<dynamic> teamRows;
    if (workspaceId == null) {
      teamRows = await _client.from('salespeople').select('*, profiles:profile_id(*)');
    } else {
      try {
        teamRows = await _client
            .from('workspace_members')
            .select('*, profiles:profile_id(*)')
            .eq('workspace_id', workspaceId)
            .eq('status', 'active');
      } catch (_) {
        try {
          teamRows = await _client
              .from('workspace_members')
              .select('*')
              .eq('workspace_id', workspaceId)
              .eq('status', 'active');
        } catch (_) {
          try {
            teamRows = await _client
                .from('workspace_members')
                .select('*, profiles:profile_id(*)')
                .eq('workspace_id', workspaceId);
          } catch (_) {
            teamRows = await _client
                .from('workspace_members')
                .select('*')
                .eq('workspace_id', workspaceId);
          }
        }
      }
    }

    return AnalyticsDataset(
      leads: leadsRows.whereType<Map<String, dynamic>>().map(_mapLead).toList(),
      followUps: followUpsRows.whereType<Map<String, dynamic>>().map(_mapFollowUp).toList(),
      activities: activitiesRows.whereType<Map<String, dynamic>>().map(_mapActivity).toList(),
      conversations: conversationsRows.whereType<Map<String, dynamic>>().map(_mapConversation).toList(),
      messages: messagesRows.whereType<Map<String, dynamic>>().map(_mapMessage).toList(),
      team: teamRows.whereType<Map<String, dynamic>>().map(_mapUser).toList(),
    );
  }

  static String _parseLeadEmail(Object? value) {
    if (value == null) return '';
    return value.toString().trim();
  }

  Lead _mapLead(Map<String, dynamic> row) {
    final status = row['status']?.toString();
    return Lead(
      id: row['id']?.toString() ?? '',
      businessId: row['workspace_id']?.toString() ?? '',
      customerName: row['name']?.toString() ?? '',
      phone: row['phone']?.toString() ?? '',
      email: _parseLeadEmail(row['email']),
      city: row['city']?.toString() ?? '',
      address: '',
      source: row['source_channel']?.toString() ?? 'Other',
      productInterest: '',
      budget: '',
      inquiryText: '',
      status: switch (status) {
        'contacted' => LeadStatus.contacted,
        'qualified' => LeadStatus.interested,
        'proposal_sent' => LeadStatus.followUpNeeded,
        'won' => LeadStatus.closedWon,
        'lost' => LeadStatus.closedLost,
        _ => LeadStatus.leadNew,
      },
      temperature: LeadTemperature.values.firstWhere(
        (e) => e.name == row['priority']?.toString(),
        orElse: () => LeadTemperature.warm,
      ),
      assignedTo: row['assigned_to']?.toString() ?? '',
      createdBy: row['created_by']?.toString() ?? '',
      createdAt: DateTime.tryParse(row['created_at']?.toString() ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(row['updated_at']?.toString() ?? '') ?? DateTime.now(),
      nextFollowUpAt: DateTime.tryParse(row['next_follow_up_at']?.toString() ?? ''),
      notesSummary: row['notes']?.toString() ?? '',
      isArchived: false,
      isDeleted: false,
      sourceMetadata: {
        if (row['conversation_id'] != null) 'conversationId': row['conversation_id'].toString(),
      },
    );
  }

  FollowUp _mapFollowUp(Map<String, dynamic> row) {
    return FollowUp(
      id: row['id']?.toString() ?? '',
      leadId: row['lead_id']?.toString() ?? '',
      assignedTo: row['assigned_to']?.toString() ?? '',
      dueAt: DateTime.tryParse(row['due_at']?.toString() ?? '') ?? DateTime.now(),
      completed: row['status']?.toString() == 'completed',
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

  Conversation _mapConversation(Map<String, dynamic> row) {
    final channel = ChannelType.values.firstWhere(
      (e) => e.name == row['channel']?.toString(),
      orElse: () => ChannelType.whatsapp,
    );
    return Conversation(
      id: row['id']?.toString() ?? '',
      channel: channel,
      externalConversationId: row['external_conversation_id']?.toString() ?? '',
      externalUserId: row['external_user_id']?.toString() ?? '',
      customerName: row['customer_name']?.toString() ?? '',
      customerHandle: row['customer_handle']?.toString(),
      customerPhone: row['customer_phone']?.toString(),
      lastMessagePreview: row['last_message_preview']?.toString() ?? '',
      lastMessageAt: DateTime.tryParse(row['last_message_at']?.toString() ?? '') ?? DateTime.now(),
      unreadCount: (row['unread_count'] as num?)?.toInt() ?? 0,
      assignedTo: row['assigned_to']?.toString(),
      leadId: row['lead_id']?.toString(),
      stage: _stageFromStatus(row['status']?.toString()),
      intent: _intentFromPriority(row['priority']?.toString()),
      sourceMetadata: {
        if (row['city'] != null) 'city': row['city'].toString(),
      },
    );
  }

  UnifiedMessage _mapMessage(Map<String, dynamic> row) {
    return UnifiedMessage(
      id: row['id']?.toString() ?? '',
      conversationId: row['conversation_id']?.toString() ?? '',
      channel: ChannelType.values.firstWhere(
        (e) => e.name == row['channel']?.toString(),
        orElse: () => ChannelType.whatsapp,
      ),
      externalMessageId: row['external_message_id']?.toString() ?? row['id']?.toString() ?? '',
      externalUserId: row['external_user_id']?.toString() ?? '',
      senderName: row['sender_name']?.toString() ?? '',
      text: row['body']?.toString() ?? '',
      createdAt: DateTime.tryParse(row['sent_at']?.toString() ?? '') ?? DateTime.now(),
      direction: row['direction']?.toString() == 'outbound' ? 'outgoing' : 'incoming',
      status: row['status']?.toString() ?? 'sent',
    );
  }

  AppUser _mapUser(Map<String, dynamic> row) {
    final profile = (row['profiles'] as Map<String, dynamic>?) ?? const {};
    final roleRaw = row['role']?.toString() ?? profile['role']?.toString();
    return AppUser(
      id: row['profile_id']?.toString() ?? row['user_id']?.toString() ?? profile['id']?.toString() ?? '',
      fullName: row['display_name']?.toString() ?? profile['full_name']?.toString() ?? '',
      email: profile['email']?.toString() ?? '',
      phone: profile['phone']?.toString() ?? '',
      role: switch (roleRaw) {
        'owner' => UserRole.owner,
        'admin' => UserRole.admin,
        'manager' => UserRole.manager,
        _ => UserRole.salesperson,
      },
      businessId: '',
      isActive: row['status']?.toString() != 'disabled',
      createdAt: DateTime.tryParse(row['created_at']?.toString() ?? '') ?? DateTime.now(),
      workspaceId: row['workspace_id']?.toString(),
      membershipStatus: row['status']?.toString(),
      assignmentCapacity: (row['assignment_capacity'] as num?)?.toInt(),
    );
  }

  InboxLeadStage _stageFromStatus(String? status) {
    return switch (status) {
      'pending' => InboxLeadStage.followUp,
      'closed' => InboxLeadStage.closed,
      _ => InboxLeadStage.leadNew,
    };
  }

  BuyingIntent _intentFromPriority(String? priority) {
    return switch (priority) {
      'hot' => BuyingIntent.high,
      'cold' => BuyingIntent.low,
      _ => BuyingIntent.medium,
    };
  }

  Future<String?> _resolveWorkspaceId() async {
    final uid = _client.auth.currentUser?.id;
    if (uid == null) return null;
    Map<String, dynamic>? row;
    try {
      row = await _client
          .from('workspace_members')
          .select('workspace_id')
          .eq('profile_id', uid)
          .eq('status', 'active')
          .order('created_at')
          .limit(1)
          .maybeSingle();
    } catch (_) {
      try {
        row = await _client
            .from('workspace_members')
            .select('workspace_id')
            .eq('user_id', uid)
            .eq('status', 'active')
            .order('created_at')
            .limit(1)
            .maybeSingle();
      } catch (_) {
        try {
          row = await _client
              .from('workspace_members')
              .select('workspace_id')
              .eq('profile_id', uid)
              .order('created_at')
              .limit(1)
              .maybeSingle();
        } catch (_) {
          row = await _client
              .from('workspace_members')
              .select('workspace_id')
              .eq('user_id', uid)
              .order('created_at')
              .limit(1)
              .maybeSingle();
        }
      }
    }
    return row?['workspace_id']?.toString();
  }
}
