import '../../../../shared/models/channel_type.dart';

class UnifiedMessage {
  const UnifiedMessage({
    required this.id,
    required this.conversationId,
    required this.channel,
    required this.externalMessageId,
    required this.externalUserId,
    required this.senderName,
    required this.text,
    required this.createdAt,
    this.senderHandle,
    this.mediaType,
    this.direction = 'incoming',
    this.status = 'received',
    this.rawPayload = const {},
  });

  final String id;
  final String conversationId;
  final ChannelType channel;
  final String externalMessageId;
  final String externalUserId;
  final String senderName;
  final String? senderHandle;
  final String text;
  final DateTime createdAt;
  final String? mediaType;
  final String direction;
  final String status;
  final Map<String, dynamic> rawPayload;
}
