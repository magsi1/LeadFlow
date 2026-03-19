import '../../../../core/network/backend_api_client.dart';
import '../../../../shared/models/channel_type.dart';
import '../../domain/entities/conversation.dart';
import '../../domain/entities/unified_message.dart';
import '../../domain/repositories/inbox_repository.dart';

class RemoteInboxRepository implements InboxRepository {
  RemoteInboxRepository(this._apiClient);
  final BackendApiClient _apiClient;

  @override
  Future<void> assignConversation(String conversationId, String userId) async {
    await _apiClient.patch('/api/conversations/$conversationId/assign', body: {'userId': userId});
  }

  @override
  Stream<List<Conversation>> watchConversations() async* {
    yield await fetchConversations();
  }

  @override
  Future<List<Conversation>> fetchConversations() async {
    final response = await _apiClient.get('/api/conversations');
    final items = response['conversations'];
    if (items is! List) return [];
    return items.whereType<Map<String, dynamic>>().map(_toConversation).toList();
  }

  @override
  Future<List<UnifiedMessage>> fetchMessages(String conversationId) async {
    final response = await _apiClient.get('/api/conversations/$conversationId/messages');
    final items = response['messages'];
    if (items is! List) return [];
    return items.whereType<Map<String, dynamic>>().map(_toMessage).toList();
  }

  @override
  Stream<List<UnifiedMessage>> watchMessages(String conversationId) async* {
    yield await fetchMessages(conversationId);
  }

  @override
  Future<void> linkLead(String conversationId, String leadId) async {
    await _apiClient.patch('/api/conversations/$conversationId/link-lead', body: {'leadId': leadId});
  }

  @override
  Future<void> sendMessage({
    required String conversationId,
    required String text,
    String? clientMessageId,
  }) async {
    await _apiClient.post('/api/messages/send', body: {
      'conversationId': conversationId,
      'body': text,
      if (clientMessageId != null) 'clientMessageId': clientMessageId,
    });
  }

  @override
  Future<void> retryMessage(String messageId) async {
    await _apiClient.post('/api/messages/$messageId/retry');
  }

  @override
  Future<void> updateConversationStage(String conversationId, InboxLeadStage stage) async {
    await _apiClient.patch('/api/conversations/$conversationId/stage', body: {'stage': stage.name});
  }

  @override
  Future<void> updateLeadStatus(String leadId, String status) async {
    await _apiClient.patch('/leads/$leadId/status', body: {'status': status});
  }

  Conversation _toConversation(Map<String, dynamic> map) {
    final channel = _channelFrom(map['channel']?.toString());
    final stage = InboxLeadStage.values.firstWhere(
      (e) => e.name == map['stage']?.toString(),
      orElse: () => InboxLeadStage.leadNew,
    );
    final intent = BuyingIntent.values.firstWhere(
      (e) => e.name == map['intent']?.toString(),
      orElse: () => BuyingIntent.low,
    );
    return Conversation(
      id: map['id']?.toString() ?? '',
      channel: channel,
      customerName: map['customerName']?.toString() ?? 'Unknown',
      customerHandle: map['customerHandle']?.toString(),
      customerPhone: map['customerPhone']?.toString(),
      externalUserId: map['externalUserId']?.toString() ?? '',
      externalConversationId: map['externalConversationId']?.toString() ?? '',
      lastMessagePreview: map['lastMessagePreview']?.toString() ?? '',
      lastMessageAt: DateTime.tryParse(map['lastMessageAt']?.toString() ?? '') ?? DateTime.now(),
      unreadCount: (map['unreadCount'] as num?)?.toInt() ?? 0,
      assignedTo: map['assignedTo']?.toString(),
      leadId: map['leadId']?.toString(),
      stage: stage,
      intent: intent,
      isCommentThread: map['isCommentThread'] == true,
      sourceMetadata: (map['sourceMetadata'] as Map<String, dynamic>?) ?? const {},
    );
  }

  UnifiedMessage _toMessage(Map<String, dynamic> map) {
    final channel = _channelFrom(map['channel']?.toString());
    return UnifiedMessage(
      id: map['id']?.toString() ?? '',
      conversationId: map['conversationId']?.toString() ?? '',
      channel: channel,
      externalMessageId: map['externalMessageId']?.toString() ?? '',
      externalUserId: map['externalUserId']?.toString() ?? '',
      senderName: map['senderName']?.toString() ?? '',
      senderHandle: map['senderHandle']?.toString(),
      text: map['text']?.toString() ?? '',
      mediaType: map['mediaType']?.toString(),
      createdAt: DateTime.tryParse(map['createdAt']?.toString() ?? '') ?? DateTime.now(),
      direction: map['direction']?.toString() ?? 'incoming',
      status: map['status']?.toString() ?? 'received',
      rawPayload: (map['rawPayload'] as Map<String, dynamic>?) ?? const {},
      clientMessageId: map['clientMessageId']?.toString(),
      errorCode: map['errorCode']?.toString(),
      errorMessage: map['errorMessage']?.toString(),
      deliveredAt: DateTime.tryParse(map['deliveredAt']?.toString() ?? ''),
      readAt: DateTime.tryParse(map['readAt']?.toString() ?? ''),
      failedAt: DateTime.tryParse(map['failedAt']?.toString() ?? ''),
    );
  }

  ChannelType _channelFrom(String? value) {
    return ChannelType.values.firstWhere(
      (e) => e.name == value,
      orElse: () => ChannelType.whatsapp,
    );
  }
}
