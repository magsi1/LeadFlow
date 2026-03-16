enum IntegrationConnectionState { connected, disconnected, error, syncing }

class IntegrationStatus {
  const IntegrationStatus({
    required this.channelAccountId,
    required this.state,
    this.lastSyncAt,
    this.webhookHealthy = false,
    this.message,
  });

  final String channelAccountId;
  final IntegrationConnectionState state;
  final DateTime? lastSyncAt;
  final bool webhookHealthy;
  final String? message;
}
