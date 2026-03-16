import 'channel_type.dart';

class SourceMetadata {
  const SourceMetadata({
    required this.channel,
    required this.externalUserId,
    required this.externalConversationId,
    this.externalMessageId,
    this.senderHandle,
    this.accountId,
    this.rawPayload = const {},
  });

  final ChannelType channel;
  final String externalUserId;
  final String externalConversationId;
  final String? externalMessageId;
  final String? senderHandle;
  final String? accountId;
  final Map<String, dynamic> rawPayload;

  Map<String, dynamic> toMap() => {
        'channel': channel.name,
        'externalUserId': externalUserId,
        'externalConversationId': externalConversationId,
        'externalMessageId': externalMessageId,
        'senderHandle': senderHandle,
        'accountId': accountId,
        'rawPayload': rawPayload,
      };
}
