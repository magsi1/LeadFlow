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
    this.clientMessageId,
    this.errorCode,
    this.errorMessage,
    this.deliveredAt,
    this.readAt,
    this.failedAt,
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
  final String? clientMessageId;
  final String? errorCode;
  final String? errorMessage;
  final DateTime? deliveredAt;
  final DateTime? readAt;
  final DateTime? failedAt;

  UnifiedMessage copyWith({
    String? status,
    String? errorCode,
    String? errorMessage,
    DateTime? deliveredAt,
    DateTime? readAt,
    DateTime? failedAt,
  }) {
    return UnifiedMessage(
      id: id,
      conversationId: conversationId,
      channel: channel,
      externalMessageId: externalMessageId,
      externalUserId: externalUserId,
      senderName: senderName,
      text: text,
      createdAt: createdAt,
      senderHandle: senderHandle,
      mediaType: mediaType,
      direction: direction,
      status: status ?? this.status,
      rawPayload: rawPayload,
      clientMessageId: clientMessageId,
      errorCode: errorCode ?? this.errorCode,
      errorMessage: errorMessage ?? this.errorMessage,
      deliveredAt: deliveredAt ?? this.deliveredAt,
      readAt: readAt ?? this.readAt,
      failedAt: failedAt ?? this.failedAt,
    );
  }
}
