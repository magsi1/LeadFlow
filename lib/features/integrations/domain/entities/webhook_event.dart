import '../../../../shared/models/channel_type.dart';

enum MessageDirection { incoming, outgoing }

class WebhookEvent {
  const WebhookEvent({
    required this.id,
    required this.channel,
    required this.externalMessageId,
    required this.externalUserId,
    required this.externalConversationId,
    required this.senderName,
    this.senderHandle,
    this.messageText,
    this.commentText,
    required this.createdAt,
    this.mediaType,
    this.direction = MessageDirection.incoming,
    this.status = 'received',
    this.rawPayload = const {},
  });

  final String id;
  final ChannelType channel;
  final String externalMessageId;
  final String externalUserId;
  final String externalConversationId;
  final String senderName;
  final String? senderHandle;
  final String? messageText;
  final String? commentText;
  final DateTime createdAt;
  final String? mediaType;
  final MessageDirection direction;
  final String status;
  final Map<String, dynamic> rawPayload;
}
