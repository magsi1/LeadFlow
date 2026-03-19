import '../../../../shared/models/channel_type.dart';

enum InboxLeadStage { leadNew, contacted, qualified, followUp, converted, closed }
enum BuyingIntent { low, medium, high }

class Conversation {
  const Conversation({
    required this.id,
    required this.channel,
    required this.externalConversationId,
    required this.externalUserId,
    required this.customerName,
    required this.lastMessagePreview,
    required this.lastMessageAt,
    this.customerPhone,
    this.customerHandle,
    this.unreadCount = 0,
    this.assignedTo,
    this.leadId,
    this.stage = InboxLeadStage.leadNew,
    this.intent = BuyingIntent.medium,
    this.isCommentThread = false,
    this.sourceMetadata = const {},
  });

  final String id;
  final ChannelType channel;
  final String externalConversationId;
  final String externalUserId;
  final String customerName;
  final String? customerPhone;
  final String? customerHandle;
  final String lastMessagePreview;
  final DateTime lastMessageAt;
  final int unreadCount;
  final String? assignedTo;
  final String? leadId;
  final InboxLeadStage stage;
  final BuyingIntent intent;
  final bool isCommentThread;
  final Map<String, dynamic> sourceMetadata;

  Conversation copyWith({
    String? assignedTo,
    String? leadId,
    InboxLeadStage? stage,
    BuyingIntent? intent,
    String? lastMessagePreview,
    DateTime? lastMessageAt,
    int? unreadCount,
    Map<String, dynamic>? sourceMetadata,
  }) {
    return Conversation(
      id: id,
      channel: channel,
      externalConversationId: externalConversationId,
      externalUserId: externalUserId,
      customerName: customerName,
      customerPhone: customerPhone,
      customerHandle: customerHandle,
      lastMessagePreview: lastMessagePreview ?? this.lastMessagePreview,
      lastMessageAt: lastMessageAt ?? this.lastMessageAt,
      unreadCount: unreadCount ?? this.unreadCount,
      assignedTo: assignedTo ?? this.assignedTo,
      leadId: leadId ?? this.leadId,
      stage: stage ?? this.stage,
      intent: intent ?? this.intent,
      isCommentThread: isCommentThread,
      sourceMetadata: sourceMetadata ?? this.sourceMetadata,
    );
  }
}
