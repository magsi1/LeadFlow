import '../../../../shared/models/channel_type.dart';
import 'integration_status.dart';

class ChannelAccount {
  const ChannelAccount({
    required this.id,
    required this.channel,
    required this.displayName,
    required this.businessName,
    required this.status,
    this.externalAccountId,
    this.connectedAt,
  });

  final String id;
  final ChannelType channel;
  final String displayName;
  final String businessName;
  final IntegrationStatus status;
  final String? externalAccountId;
  final DateTime? connectedAt;

  ChannelAccount copyWith({
    IntegrationStatus? status,
    String? displayName,
    String? businessName,
  }) {
    return ChannelAccount(
      id: id,
      channel: channel,
      displayName: displayName ?? this.displayName,
      businessName: businessName ?? this.businessName,
      status: status ?? this.status,
      externalAccountId: externalAccountId,
      connectedAt: connectedAt,
    );
  }
}
