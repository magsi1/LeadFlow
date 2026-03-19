import '../../../../shared/models/channel_type.dart';
import 'dart:async';
import '../../domain/entities/conversation.dart';
import '../../domain/entities/unified_message.dart';
import '../../domain/repositories/inbox_repository.dart';

class MockInboxRepository implements InboxRepository {
  MockInboxRepository() {
    _conversations = _seedConversations();
    _messages = _seedMessages(_conversations);
  }

  late List<Conversation> _conversations;
  late List<UnifiedMessage> _messages;
  final StreamController<List<Conversation>> _conversationsStream = StreamController.broadcast();
  final Map<String, StreamController<List<UnifiedMessage>>> _messagesStreams = {};

  @override
  Future<void> assignConversation(String conversationId, String userId) async {
    _conversations = _conversations
        .map((c) => c.id == conversationId ? c.copyWith(assignedTo: userId) : c)
        .toList();
    _emitConversations();
  }

  @override
  Future<List<Conversation>> fetchConversations() async =>
      _conversations..sort((a, b) => b.lastMessageAt.compareTo(a.lastMessageAt));

  @override
  Stream<List<Conversation>> watchConversations() async* {
    yield await fetchConversations();
    yield* _conversationsStream.stream;
  }

  @override
  Future<List<UnifiedMessage>> fetchMessages(String conversationId) async {
    final list = _messages.where((m) => m.conversationId == conversationId).toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return list;
  }

  @override
  Stream<List<UnifiedMessage>> watchMessages(String conversationId) async* {
    yield await fetchMessages(conversationId);
    final ctrl = _messagesStreams.putIfAbsent(conversationId, () => StreamController.broadcast());
    yield* ctrl.stream;
  }

  @override
  Future<void> linkLead(String conversationId, String leadId) async {
    _conversations = _conversations
        .map((c) => c.id == conversationId ? c.copyWith(leadId: leadId, stage: InboxLeadStage.contacted) : c)
        .toList();
    _emitConversations();
  }

  @override
  Future<void> sendMessage({
    required String conversationId,
    required String text,
    String? clientMessageId,
  }) async {
    final conversation = _conversations.firstWhere((e) => e.id == conversationId);
    _messages = [
      ..._messages,
      UnifiedMessage(
        id: 'msg_${DateTime.now().millisecondsSinceEpoch}',
        conversationId: conversationId,
        channel: conversation.channel,
        externalMessageId: 'ext_${DateTime.now().millisecondsSinceEpoch}',
        externalUserId: 'leadflow_agent',
        senderName: 'LeadFlow Agent',
        text: text,
        createdAt: DateTime.now(),
        direction: 'outgoing',
        status: 'sent',
        clientMessageId: clientMessageId,
      ),
    ];
    _conversations = _conversations
        .map(
          (c) => c.id == conversationId
              ? c.copyWith(
                  lastMessagePreview: text,
                  lastMessageAt: DateTime.now(),
                  unreadCount: 0,
                )
              : c,
        )
        .toList();
    _emitConversations();
    _emitMessages(conversationId);
  }

  @override
  Future<void> retryMessage(String messageId) async {
    final idx = _messages.indexWhere((m) => m.id == messageId);
    if (idx < 0) return;
    final original = _messages[idx];
    if (original.status != 'failed') return;
    await sendMessage(
      conversationId: original.conversationId,
      text: original.text,
      clientMessageId: 'retry_${DateTime.now().microsecondsSinceEpoch}',
    );
  }

  @override
  Future<void> updateConversationStage(String conversationId, InboxLeadStage stage) async {
    _conversations = _conversations
        .map((c) => c.id == conversationId ? c.copyWith(stage: stage) : c)
        .toList();
    _emitConversations();
  }

  @override
  Future<void> updateLeadStatus(String leadId, String status) async {
    final stage = switch (status.toUpperCase()) {
      'CONTACTED' => InboxLeadStage.contacted,
      'QUALIFIED' => InboxLeadStage.qualified,
      'CLOSED' => InboxLeadStage.closed,
      _ => InboxLeadStage.leadNew,
    };
    _conversations = _conversations
        .map((c) => c.leadId == leadId ? c.copyWith(stage: stage) : c)
        .toList();
    _emitConversations();
  }

  void _emitConversations() {
    final list = [..._conversations]..sort((a, b) => b.lastMessageAt.compareTo(a.lastMessageAt));
    _conversationsStream.add(list);
  }

  void _emitMessages(String conversationId) {
    final ctrl = _messagesStreams[conversationId];
    if (ctrl == null) return;
    final list = _messages.where((m) => m.conversationId == conversationId).toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    ctrl.add(list);
  }

  List<Conversation> _seedConversations() {
    final now = DateTime.now();
    return [
      Conversation(
        id: 'conv_wa_1',
        channel: ChannelType.whatsapp,
        externalConversationId: 'wa_thread_101',
        externalUserId: 'wa_user_hamza',
        customerName: 'Hamza Qureshi',
        customerPhone: '+923221114477',
        customerHandle: 'hamza.q',
        lastMessagePreview: 'Need 10kw system quote for DHA Karachi home.',
        lastMessageAt: now.subtract(const Duration(minutes: 5)),
        unreadCount: 2,
        assignedTo: 'u_sales_1',
        intent: BuyingIntent.high,
        stage: InboxLeadStage.leadNew,
        sourceMetadata: const {'city': 'Karachi'},
      ),
      Conversation(
        id: 'conv_ig_1',
        channel: ChannelType.instagram,
        externalConversationId: 'ig_thread_201',
        externalUserId: 'ig_nida_homes',
        customerName: 'Nida Homes',
        customerHandle: '@nida.homes',
        lastMessagePreview: 'Interested in inverter setup for office in Lahore.',
        lastMessageAt: now.subtract(const Duration(hours: 1)),
        unreadCount: 1,
        assignedTo: null,
        intent: BuyingIntent.medium,
        stage: InboxLeadStage.followUp,
        sourceMetadata: const {'city': 'Lahore'},
      ),
      Conversation(
        id: 'conv_fb_1',
        channel: ChannelType.facebook,
        externalConversationId: 'fb_msg_301',
        externalUserId: 'fb_rashid',
        customerName: 'Rashid Ali',
        customerPhone: '+923004441155',
        lastMessagePreview: 'Can you share payment plan for battery + inverter?',
        lastMessageAt: now.subtract(const Duration(hours: 2)),
        unreadCount: 0,
        assignedTo: 'u_sales_2',
        intent: BuyingIntent.medium,
        stage: InboxLeadStage.contacted,
        sourceMetadata: const {'city': 'Hyderabad'},
      ),
      Conversation(
        id: 'conv_fb_comment_1',
        channel: ChannelType.facebook,
        externalConversationId: 'fb_comment_401',
        externalUserId: 'fb_comment_user_1',
        customerName: 'Adeel Motors',
        customerHandle: 'Adeel Motors',
        lastMessagePreview: 'Commented: price for 7kw setup please?',
        lastMessageAt: now.subtract(const Duration(hours: 3)),
        unreadCount: 3,
        assignedTo: null,
        intent: BuyingIntent.high,
        stage: InboxLeadStage.leadNew,
        isCommentThread: true,
        sourceMetadata: const {'city': 'Islamabad'},
      ),
      Conversation(
        id: 'conv_ig_comment_1',
        channel: ChannelType.instagram,
        externalConversationId: 'ig_comment_501',
        externalUserId: 'ig_comment_biz',
        customerName: 'Quetta Heights',
        lastMessagePreview: 'Commented on reel: need urgent solar package.',
        lastMessageAt: now.subtract(const Duration(hours: 7)),
        unreadCount: 0,
        assignedTo: 'u_sales_1',
        intent: BuyingIntent.high,
        stage: InboxLeadStage.qualified,
        isCommentThread: true,
        sourceMetadata: const {'city': 'Quetta'},
      ),
    ];
  }

  List<UnifiedMessage> _seedMessages(List<Conversation> conversations) {
    final now = DateTime.now();
    return conversations
        .map(
          (c) => UnifiedMessage(
            id: 'msg_seed_${c.id}',
            conversationId: c.id,
            channel: c.channel,
            externalMessageId: 'ext_seed_${c.id}',
            externalUserId: c.externalUserId,
            senderName: c.customerName,
            senderHandle: c.customerHandle,
            text: c.lastMessagePreview,
            createdAt: c.lastMessageAt.subtract(const Duration(minutes: 2)),
            rawPayload: {'channel': c.channel.name, 'demo': true},
          ),
        )
        .followedBy([
          UnifiedMessage(
            id: 'msg_seed_outgoing_1',
            conversationId: 'conv_wa_1',
            channel: ChannelType.whatsapp,
            externalMessageId: 'ext_out_wa_1',
            externalUserId: 'leadflow_agent',
            senderName: 'LeadFlow Agent',
            text: 'Sure, please share monthly bill and location for accurate quote.',
            createdAt: now.subtract(const Duration(minutes: 3)),
            direction: 'outgoing',
            status: 'sent',
            rawPayload: const {'demo': true},
          ),
        ])
        .toList();
  }
}
