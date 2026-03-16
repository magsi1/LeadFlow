import '../../../../shared/models/channel_type.dart';
import '../../domain/entities/channel_account.dart';
import '../../domain/entities/integration_status.dart';
import '../../domain/repositories/integration_repository.dart';

class MockIntegrationRepository implements IntegrationRepository {
  final List<ChannelAccount> _accounts = [
    ChannelAccount(
      id: 'wa_biz_1',
      channel: ChannelType.whatsapp,
      displayName: 'LeadFlow Solar WhatsApp',
      businessName: 'LeadFlow Demo Business',
      connectedAt: DateTime.now().subtract(const Duration(days: 7)),
      status: IntegrationStatus(
        channelAccountId: 'wa_biz_1',
        state: IntegrationConnectionState.connected,
        lastSyncAt: DateTime.now().subtract(const Duration(minutes: 12)),
        webhookHealthy: true,
      ),
    ),
    ChannelAccount(
      id: 'ig_biz_1',
      channel: ChannelType.instagram,
      displayName: '@leadflow.solar',
      businessName: 'LeadFlow Demo Business',
      connectedAt: DateTime.now().subtract(const Duration(days: 5)),
      status: IntegrationStatus(
        channelAccountId: 'ig_biz_1',
        state: IntegrationConnectionState.connected,
        lastSyncAt: DateTime.now().subtract(const Duration(minutes: 28)),
        webhookHealthy: true,
      ),
    ),
    ChannelAccount(
      id: 'fb_page_1',
      channel: ChannelType.facebook,
      displayName: 'LeadFlow Solar Solutions',
      businessName: 'LeadFlow Demo Business',
      connectedAt: DateTime.now().subtract(const Duration(days: 2)),
      status: IntegrationStatus(
        channelAccountId: 'fb_page_1',
        state: IntegrationConnectionState.disconnected,
        lastSyncAt: DateTime.now().subtract(const Duration(days: 2)),
        webhookHealthy: false,
        message: 'Connection expired. Reconnect required.',
      ),
    ),
  ];

  ChannelAccount _update(
    String id,
    IntegrationConnectionState state, {
    bool webhookHealthy = false,
    String? message,
  }) {
    final idx = _accounts.indexWhere((a) => a.id == id);
    if (idx < 0) {
      // Safety guard for stale/unknown ids in UI actions.
      return _accounts.first;
    }
    final current = _accounts[idx];
    final updated = current.copyWith(
      status: IntegrationStatus(
        channelAccountId: current.id,
        state: state,
        webhookHealthy: webhookHealthy,
        lastSyncAt: DateTime.now(),
        message: message,
      ),
    );
    _accounts[idx] = updated;
    return updated;
  }

  @override
  Future<ChannelAccount> connect(String accountId) async {
    return _update(accountId, IntegrationConnectionState.connected, webhookHealthy: true);
  }

  @override
  Future<ChannelAccount> disconnect(String accountId) async {
    return _update(
      accountId,
      IntegrationConnectionState.disconnected,
      webhookHealthy: false,
      message: 'Disconnected by user.',
    );
  }

  @override
  Future<List<ChannelAccount>> fetchAccounts() async => _accounts;

  @override
  Future<ChannelAccount> reconnect(String accountId) async {
    return _update(accountId, IntegrationConnectionState.connected, webhookHealthy: true);
  }

  @override
  Future<ChannelAccount> syncNow(String accountId) async {
    return _update(accountId, IntegrationConnectionState.connected, webhookHealthy: true);
  }

  @override
  Future<bool> testConnection(String accountId) async {
    final account = _accounts.firstWhere((e) => e.id == accountId);
    return account.status.state == IntegrationConnectionState.connected;
  }
}
