import '../../../../core/network/backend_api_client.dart';
import '../../../../shared/models/channel_type.dart';
import '../../domain/entities/channel_account.dart';
import '../../domain/entities/integration_status.dart';
import '../../domain/repositories/integration_repository.dart';

class RemoteIntegrationRepository implements IntegrationRepository {
  RemoteIntegrationRepository(this._apiClient);
  final BackendApiClient _apiClient;

  @override
  Future<ChannelAccount> connect(String accountId) async {
    final response = await _apiClient.post('/api/integrations/$accountId/connect');
    return _toAccount(response['account'] as Map<String, dynamic>? ?? const {});
  }

  @override
  Future<ChannelAccount> disconnect(String accountId) async {
    final response = await _apiClient.post('/api/integrations/$accountId/disconnect');
    return _toAccount(response['account'] as Map<String, dynamic>? ?? const {});
  }

  @override
  Future<List<ChannelAccount>> fetchAccounts({String? workspaceId}) async {
    final path = workspaceId == null
        ? '/api/integrations/accounts'
        : '/api/integrations/accounts?workspaceId=$workspaceId';
    final response = await _apiClient.get(path);
    final items = response['accounts'];
    if (items is! List) return [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(_toAccount)
        .toList();
  }

  @override
  Future<ChannelAccount> reconnect(String accountId) async {
    final response = await _apiClient.post('/api/integrations/$accountId/reconnect');
    return _toAccount(response['account'] as Map<String, dynamic>? ?? const {});
  }

  @override
  Future<ChannelAccount> syncNow(String accountId) async {
    final response = await _apiClient.post('/api/integrations/$accountId/sync');
    return _toAccount(response['account'] as Map<String, dynamic>? ?? const {});
  }

  @override
  Future<bool> testConnection(String accountId) async {
    final response = await _apiClient.get('/api/integrations/$accountId/test');
    return response['ok'] == true;
  }

  ChannelAccount _toAccount(Map<String, dynamic> map) {
    final channelName = map['channel']?.toString() ?? ChannelType.whatsapp.name;
    final channel = ChannelType.values.firstWhere(
      (e) => e.name == channelName,
      orElse: () => ChannelType.whatsapp,
    );
    final stateName = map['state']?.toString() ?? IntegrationConnectionState.disconnected.name;
    final connectionState = IntegrationConnectionState.values.firstWhere(
      (e) => e.name == stateName,
      orElse: () => IntegrationConnectionState.disconnected,
    );
    final id = map['id']?.toString() ?? '';
    return ChannelAccount(
      id: id,
      channel: channel,
      displayName: map['displayName']?.toString() ?? 'Unknown',
      businessName: map['businessName']?.toString() ?? 'Unknown',
      externalAccountId: map['externalAccountId']?.toString(),
      connectedAt: DateTime.tryParse(map['connectedAt']?.toString() ?? ''),
      status: IntegrationStatus(
        channelAccountId: id,
        state: connectionState,
        webhookHealthy: map['webhookHealthy'] == true,
        lastSyncAt: DateTime.tryParse(map['lastSyncAt']?.toString() ?? ''),
        message: map['message']?.toString(),
      ),
    );
  }
}
