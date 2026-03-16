import '../../integrations/domain/entities/channel_account.dart';

class IntegrationState {
  const IntegrationState({
    this.accounts = const [],
    this.loading = false,
    this.error,
  });

  final List<ChannelAccount> accounts;
  final bool loading;
  final String? error;

  IntegrationState copyWith({
    List<ChannelAccount>? accounts,
    bool? loading,
    String? error,
    bool clearError = false,
  }) {
    return IntegrationState(
      accounts: accounts ?? this.accounts,
      loading: loading ?? this.loading,
      error: clearError ? null : error ?? this.error,
    );
  }
}
