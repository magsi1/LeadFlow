import '../../../../shared/models/channel_type.dart';

class IntegrationEndpoints {
  static const metaConnect = '/api/integrations/meta/connect';
  static const whatsappConnect = '/api/integrations/whatsapp/connect';
  static const integrationAccounts = '/api/integrations/accounts';
  static const metaWebhook = '/api/webhooks/meta';
  static const whatsappWebhook = '/api/webhooks/whatsapp';
}

class ConnectIntegrationRequest {
  const ConnectIntegrationRequest({
    required this.channel,
    required this.callbackUrl,
    required this.businessId,
  });

  final ChannelType channel;
  final String callbackUrl;
  final String businessId;

  Map<String, dynamic> toMap() => {
        'channel': channel.name,
        'callbackUrl': callbackUrl,
        'businessId': businessId,
      };
}

class ConnectIntegrationResponse {
  const ConnectIntegrationResponse({
    required this.connected,
    this.message,
    this.redirectUrl,
  });

  final bool connected;
  final String? message;
  final String? redirectUrl;
}
