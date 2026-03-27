import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:async';

import '../../../../core/auth/supabase_auth_helpers.dart';
import '../../../../data/repositories/supabase/supabase_leads_select.dart';
import '../../../../core/config/app_config.dart';
import '../../../../core/network/backend_api_client.dart';
import '../../../../shared/models/channel_type.dart';
import '../../domain/entities/conversation.dart';
import '../../domain/entities/unified_message.dart';
import '../../domain/repositories/inbox_repository.dart';

class SupabaseInboxRepository implements InboxRepository {
  SupabaseInboxRepository(
    this._client, {
    BackendApiClient? backendApiClient,
  }) : _backendApiClient = backendApiClient;
  final SupabaseClient _client;
  final BackendApiClient? _backendApiClient;

  final StreamController<List<Conversation>> _conversationsStream = StreamController.broadcast();
  RealtimeChannel? _conversationsChannel;
  Timer? _conversationsPollTimer;
  final Map<String, StreamController<List<UnifiedMessage>>> _messageStreams = {};
  final Map<String, RealtimeChannel> _messageChannels = {};

  @override
  Future<void> assignConversation(String conversationId, String userId) async {
    await _client.from('conversations').update({
      'assigned_to': userId,
      'updated_at': DateTime.now().toIso8601String(),
    }).eq('id', conversationId);
  }

  @override
  Stream<List<Conversation>> watchConversations() async* {
    yield await fetchConversations();
    _ensureConversationWatch();
    yield* _conversationsStream.stream;
  }

  @override
  Future<List<Conversation>> fetchConversations() async {
    if (_shouldUseBackendInboxList && _backendApiClient != null) {
      final backendItems = await _fetchConversationsFromBackend();
      if (backendItems.isNotEmpty) {
        return _dedupeConversations(backendItems);
      }
    }

    final rows = await _client.from('conversations').select().order('last_message_at', ascending: false);
    if (rows.isNotEmpty) {
      return rows.map(_mapConversation).toList();
    }

    final userId = _client.auth.currentUser?.id;
    if (userId == null) return <Conversation>[];

    logLeadsDbOp('select (inbox fallback from leads)');
    final leadRows = await _client
        .from('leads')
        .select(SupabaseLeadsSelect.columns)
        .eq('user_id', userId)
        .order('created_at', ascending: false)
        .limit(200);
    return leadRows.map(_mapLeadAsConversation).toList();
  }

  @override
  Future<List<UnifiedMessage>> fetchMessages(String conversationId) async {
    final rows = await _client.from('messages').select().eq('conversation_id', conversationId).order('sent_at');
    return rows.map(_mapMessage).toList();
  }

  @override
  Stream<List<UnifiedMessage>> watchMessages(String conversationId) async* {
    yield await fetchMessages(conversationId);
    _ensureMessageWatch(conversationId);
    final ctrl = _messageStreams.putIfAbsent(conversationId, () => StreamController.broadcast());
    yield* ctrl.stream;
  }

  @override
  Future<void> linkLead(String conversationId, String leadId) async {
    await _client.from('conversations').update({
      'lead_id': leadId,
      'updated_at': DateTime.now().toIso8601String(),
    }).eq('id', conversationId);
  }

  @override
  Future<void> sendMessage({
    required String conversationId,
    required String text,
    String? clientMessageId,
  }) async {
    if (_shouldUseBackendSend && _backendApiClient != null) {
      final conversationRow = await _client
          .from('conversations')
          .select('workspace_id')
          .eq('id', conversationId)
          .maybeSingle();
      final workspaceId = conversationRow?['workspace_id']?.toString();
      final api = _backendApiClient;
      await api.post('/api/messages/send', body: {
        if (workspaceId != null) 'workspaceId': workspaceId,
        'conversationId': conversationId,
        'body': text,
        if (clientMessageId != null) 'clientMessageId': clientMessageId,
      });
      return;
    }

    final now = DateTime.now();
    final conversationRow = await _client
        .from('conversations')
        .select('workspace_id')
        .eq('id', conversationId)
        .maybeSingle();
    final workspaceId = conversationRow?['workspace_id']?.toString();
    await _client.from('messages').insert({
      'conversation_id': conversationId,
      'direction': 'outbound',
      'body': text,
      'sent_at': now.toIso8601String(),
      'sender_name': 'LeadFlow Agent',
      'message_type': 'text',
      'status': 'sent',
      'client_message_id': clientMessageId,
    });
    await _client.from('conversations').update({
      'last_message_preview': text,
      'last_message': text,
      'last_message_at': now.toIso8601String(),
      'unread_count': 0,
      'updated_at': now.toIso8601String(),
    }).eq('id', conversationId);

    await _client.from('activities').insert({
      'workspace_id': workspaceId,
      'conversation_id': conversationId,
      'type': 'message_sent',
      'description': text,
      'metadata': {'source': 'composer'},
    });
  }

  @override
  Future<void> retryMessage(String messageId) async {
    if (_shouldUseBackendSend && _backendApiClient != null) {
      final row = await _client
          .from('messages')
          .select('conversation_id, conversations:conversation_id(workspace_id)')
          .eq('id', messageId)
          .maybeSingle();
      final workspaceId = (row?['conversations'] as Map<String, dynamic>?)?['workspace_id']?.toString();
      final api = _backendApiClient;
      await api.post('/api/messages/$messageId/retry', body: {
        if (workspaceId != null) 'workspaceId': workspaceId,
      });
      return;
    }
    final row =
        await _client.from('messages').select().eq('id', messageId).maybeSingle();
    if (row == null) return;
    if (row['status']?.toString() != 'failed') return;
    final conversationId = row['conversation_id']?.toString();
    final body = row['body']?.toString();
    if (conversationId == null || body == null) return;
    await sendMessage(
      conversationId: conversationId,
      text: body,
      clientMessageId: 'retry_${DateTime.now().microsecondsSinceEpoch}',
    );
  }

  @override
  Future<void> updateConversationStage(String conversationId, InboxLeadStage stage) async {
    await _client.from('conversations').update({
      'status': _toConversationStatus(stage),
      'updated_at': DateTime.now().toIso8601String(),
    }).eq('id', conversationId);
  }

  @override
  Future<void> updateLeadStatus(String leadId, String status) async {
    final normalized = status.trim().toUpperCase();
    if (_shouldUseBackendInboxList && _backendApiClient != null) {
      final api = _backendApiClient;
      await api.patch('/leads/$leadId/status', body: {'status': normalized});
      return;
    }

    final userId = _client.auth.currentUser?.id;
    if (userId == null) return;

    logLeadsDbOp('update (inbox lead status)', extra: {'leadId': leadId});
    await _client.from('leads').update({
      'status': normalized,
      'updated_at': DateTime.now().toIso8601String(),
    }).eq('id', leadId).eq('user_id', userId);
  }

  Conversation _mapConversation(Map<String, dynamic> row) {
    final channelRaw = row['channel']?.toString() ?? row['platform']?.toString() ?? 'whatsapp';
    final channel = ChannelType.values.firstWhere(
      (e) => e.name == channelRaw,
      orElse: () => ChannelType.whatsapp,
    );
    final stage = InboxLeadStage.values.firstWhere(
      (e) => e.name == row['stage']?.toString(),
      orElse: () => _fromConversationStatus(row['status']?.toString()),
    );
    final intent = _fromPriority(row['priority']?.toString());
    return Conversation(
      id: row['id']?.toString() ?? '',
      channel: channel,
      externalConversationId: row['external_conversation_id']?.toString() ?? row['id']?.toString() ?? '',
      externalUserId: row['external_user_id']?.toString() ?? '',
      customerName: row['customer_name']?.toString() ?? 'Unknown',
      customerHandle: row['customer_handle']?.toString(),
      customerPhone: row['customer_phone']?.toString(),
      lastMessagePreview: row['last_message_preview']?.toString() ?? row['last_message']?.toString() ?? '',
      lastMessageAt: DateTime.tryParse(row['last_message_at']?.toString() ?? '') ?? DateTime.now(),
      unreadCount: (row['unread_count'] as num?)?.toInt() ?? 0,
      assignedTo: row['assigned_to']?.toString(),
      leadId: row['lead_id']?.toString(),
      stage: stage,
      intent: intent,
      sourceMetadata: {
        if (row['city'] != null) 'city': row['city'].toString(),
        if (row['status'] != null) 'leadStatus': row['status'].toString(),
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
      senderHandle: row['sender_handle']?.toString(),
      mediaType: row['message_type']?.toString(),
      direction: row['direction']?.toString() == 'outbound' ? 'outgoing' : 'incoming',
      status: row['status']?.toString() ?? 'sent',
      clientMessageId: row['client_message_id']?.toString(),
      errorCode: row['error_code']?.toString(),
      errorMessage: row['error_message']?.toString(),
      deliveredAt: DateTime.tryParse(row['delivered_at']?.toString() ?? ''),
      readAt: DateTime.tryParse(row['read_at']?.toString() ?? ''),
      failedAt: DateTime.tryParse(row['failed_at']?.toString() ?? ''),
    );
  }

  bool get _shouldUseBackendSend =>
      !AppConfig.demoModeEnabled &&
      AppConfig.backendBaseUrl.isNotEmpty &&
      !AppConfig.backendBaseUrl.contains('leadflow.local');

  bool get _shouldUseBackendInboxList =>
      !AppConfig.demoModeEnabled &&
      AppConfig.backendBaseUrl.isNotEmpty &&
      !AppConfig.backendBaseUrl.contains('leadflow.local');

  void _ensureConversationWatch() {
    if (_conversationsChannel == null) {
      final channel = _client.channel('public:conversations_live');
      channel
        ..onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'conversations',
          callback: (_) => _emitConversations(),
        )
        ..onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'messages',
          callback: (_) => _emitConversations(),
        )
        ..subscribe();
      _conversationsChannel = channel;
    }
    _conversationsPollTimer ??= Timer.periodic(
      const Duration(seconds: 15),
      (_) => _emitConversations(),
    );
  }

  void _ensureMessageWatch(String conversationId) {
    if (_messageChannels.containsKey(conversationId)) return;
    final channel = _client.channel('public:messages_live_$conversationId');
    channel
      ..onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'messages',
        filter: PostgresChangeFilter(
          type: PostgresChangeFilterType.eq,
          column: 'conversation_id',
          value: conversationId,
        ),
        callback: (_) => _emitMessages(conversationId),
      )
      ..subscribe();
    _messageChannels[conversationId] = channel;
  }

  Future<void> _emitConversations() async {
    final data = await fetchConversations();
    _conversationsStream.add(_dedupeConversations(data));
  }

  Future<void> _emitMessages(String conversationId) async {
    final ctrl = _messageStreams[conversationId];
    if (ctrl == null) return;
    final data = await fetchMessages(conversationId);
    ctrl.add(_dedupeMessages(data));
  }

  List<Conversation> _dedupeConversations(List<Conversation> items) {
    final map = <String, Conversation>{};
    for (final item in items) {
      map[item.id] = item;
    }
    final list = map.values.toList()..sort((a, b) => b.lastMessageAt.compareTo(a.lastMessageAt));
    return list;
  }

  List<UnifiedMessage> _dedupeMessages(List<UnifiedMessage> items) {
    final map = <String, UnifiedMessage>{};
    for (final item in items) {
      map[item.id] = item;
    }
    final list = map.values.toList()..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return list;
  }

  Future<List<Conversation>> _fetchConversationsFromBackend() async {
    final api = _backendApiClient;
    if (api == null) return const [];
    final userId = _client.auth.currentUser?.id;
    if (userId == null || userId.isEmpty) return const [];
    try {
      final response = await api.get(
        '/api/leads?user_id=${Uri.encodeQueryComponent(userId)}',
      );
      final items = LeadflowApiEnvelope.expectDataList(response);
      return items
          .whereType<Map>()
          .map((e) => _mapLeadAsConversation(Map<String, dynamic>.from(e)))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Conversation _mapLeadAsConversation(Map<String, dynamic> row) {
    final sourceRaw = row['source_channel']?.toString() ?? row['source']?.toString();
    final channel = ChannelType.values.firstWhere(
      (e) => e.name == sourceRaw,
      orElse: () => ChannelType.whatsapp,
    );
    final preview = row['message']?.toString() ??
        row['inquiry_text']?.toString() ??
        row['notes_summary']?.toString() ??
        row['notes']?.toString() ??
        'No message';
    final lastAt = DateTime.tryParse(
          row['updated_at']?.toString() ?? row['created_at']?.toString() ?? '',
        ) ??
        DateTime.now();
    final intentRaw =
        row['intent']?.toString() ?? row['priority']?.toString() ?? row['temperature']?.toString() ?? 'medium';
    final intent = switch (intentRaw.toLowerCase()) {
      'high' || 'hot' => BuyingIntent.high,
      'low' || 'cold' => BuyingIntent.low,
      _ => BuyingIntent.medium,
    };

    return Conversation(
      id: row['conversation_id']?.toString() ?? 'lead_${row['id']}',
      channel: channel,
      externalConversationId: row['conversation_id']?.toString() ?? row['id']?.toString() ?? '',
      externalUserId: row['phone']?.toString() ?? row['id']?.toString() ?? '',
      customerName: row['name']?.toString() ?? 'Unknown',
      customerPhone: row['phone']?.toString(),
      lastMessagePreview: preview,
      lastMessageAt: lastAt,
      unreadCount: 0,
      assignedTo: row['assigned_to']?.toString(),
      leadId: row['id']?.toString(),
      stage: _fromLeadStatus(row['status']?.toString()),
      intent: intent,
      sourceMetadata: {
        if (row['city'] != null) 'city': row['city'].toString(),
        if (sourceRaw != null) 'source': sourceRaw,
        'intent': intentRaw.toLowerCase(),
        if (row['status'] != null) 'leadStatus': row['status'].toString(),
      },
    );
  }

  InboxLeadStage _fromLeadStatus(String? status) {
    final normalized = status?.toLowerCase().replaceAll('-', '_') ?? '';
    return switch (normalized) {
      'contacted' => InboxLeadStage.contacted,
      'interested' || 'qualified' || 'negotiation' => InboxLeadStage.qualified,
      'follow_up_needed' || 'follow_up' => InboxLeadStage.followUp,
      'closed_won' || 'won' => InboxLeadStage.converted,
      'closed_lost' || 'lost' => InboxLeadStage.closed,
      _ => InboxLeadStage.leadNew,
    };
  }

  String _toConversationStatus(InboxLeadStage stage) {
    return switch (stage) {
      InboxLeadStage.leadNew || InboxLeadStage.contacted => 'open',
      InboxLeadStage.qualified || InboxLeadStage.followUp => 'pending',
      InboxLeadStage.converted || InboxLeadStage.closed => 'closed',
    };
  }

  InboxLeadStage _fromConversationStatus(String? status) {
    return switch (status) {
      'pending' => InboxLeadStage.followUp,
      'closed' => InboxLeadStage.closed,
      _ => InboxLeadStage.leadNew,
    };
  }

  BuyingIntent _fromPriority(String? priority) {
    return switch (priority) {
      'hot' => BuyingIntent.high,
      'cold' => BuyingIntent.low,
      _ => BuyingIntent.medium,
    };
  }
}
