import '../entities/channel_account.dart';

abstract class IntegrationRepository {
  Future<List<ChannelAccount>> fetchAccounts({String? workspaceId});
  Future<ChannelAccount> connect(String accountId);
  Future<ChannelAccount> reconnect(String accountId);
  Future<ChannelAccount> disconnect(String accountId);
  Future<ChannelAccount> syncNow(String accountId);
  Future<bool> testConnection(String accountId);
}
