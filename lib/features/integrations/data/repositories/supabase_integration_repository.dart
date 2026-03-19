import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../shared/models/channel_type.dart';
import '../../domain/entities/channel_account.dart';
import '../../domain/entities/integration_status.dart';
import '../../domain/repositories/integration_repository.dart';

class SupabaseIntegrationRepository implements IntegrationRepository {
  SupabaseIntegrationRepository(this._client);
  final SupabaseClient _client;

  @override
  Future<ChannelAccount> connect(String accountId) async {
    await _updateStatus(accountId, 'connected');
    return _getById(accountId);
  }

  @override
  Future<ChannelAccount> disconnect(String accountId) async {
    await _updateStatus(accountId, 'disconnected');
    return _getById(accountId);
  }

  @override
  Future<List<ChannelAccount>> fetchAccounts({String? workspaceId}) async {
    final rows = workspaceId == null
        ? await _client.from('integration_accounts').select().order('created_at')
        : await _client
            .from('integration_accounts')
            .select()
            .eq('workspace_id', workspaceId)
            .order('created_at');
    return rows.map(_mapAccount).toList();
  }

  @override
  Future<ChannelAccount> reconnect(String accountId) async {
    await _updateStatus(accountId, 'connected');
    return _getById(accountId);
  }

  @override
  Future<ChannelAccount> syncNow(String accountId) async {
    await _client.from('integration_accounts').update({
      'updated_at': DateTime.now().toIso8601String(),
      'config': {
        'last_sync_at': DateTime.now().toIso8601String(),
      },
    }).eq('id', accountId);
    return _getById(accountId);
  }

  @override
  Future<bool> testConnection(String accountId) async {
    final row = await _client.from('integration_accounts').select().eq('id', accountId).maybeSingle();
    if (row is! Map<String, dynamic>) return false;
    return row['status']?.toString() == 'connected';
  }

  Future<void> _updateStatus(String accountId, String status) async {
    await _client.from('integration_accounts').update({
      'status': status,
      'updated_at': DateTime.now().toIso8601String(),
      'config': {
        'last_sync_at': DateTime.now().toIso8601String(),
      },
    }).eq('id', accountId);
  }

  Future<ChannelAccount> _getById(String accountId) async {
    final row = await _client.from('integration_accounts').select().eq('id', accountId).maybeSingle();
    if (row is! Map<String, dynamic>) {
      throw Exception('Integration account not found');
    }
    return _mapAccount(row);
  }

  ChannelAccount _mapAccount(Map<String, dynamic> row) {
    final channel = ChannelType.values.firstWhere(
      (e) => e.name == row['channel']?.toString(),
      orElse: () => ChannelType.whatsapp,
    );
    final statusRaw = row['status']?.toString() ?? 'disconnected';
    final state = switch (statusRaw) {
      'connected' => IntegrationConnectionState.connected,
      'syncing' => IntegrationConnectionState.syncing,
      'error' => IntegrationConnectionState.error,
      _ => IntegrationConnectionState.disconnected,
    };
    final id = row['id']?.toString() ?? '';
    return ChannelAccount(
      id: id,
      channel: channel,
      displayName: row['display_name']?.toString() ?? 'Unknown',
      businessName: 'LeadFlow',
      externalAccountId: row['external_account_id']?.toString(),
      connectedAt: DateTime.tryParse(row['created_at']?.toString() ?? ''),
      status: IntegrationStatus(
        channelAccountId: id,
        state: state,
        webhookHealthy: true,
        lastSyncAt: DateTime.tryParse((row['config']?['last_sync_at'])?.toString() ?? ''),
        message: null,
      ),
    );
  }
}
