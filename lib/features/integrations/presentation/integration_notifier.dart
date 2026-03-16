import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../integrations/domain/repositories/integration_repository.dart';
import 'integration_state.dart';

class IntegrationNotifier extends StateNotifier<IntegrationState> {
  IntegrationNotifier(this._repository) : super(const IntegrationState());

  final IntegrationRepository _repository;

  Future<void> load() async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final accounts = await _repository.fetchAccounts();
      state = state.copyWith(accounts: accounts, loading: false);
    } catch (e) {
      state = state.copyWith(loading: false, error: e.toString());
    }
  }

  Future<void> connect(String accountId) async {
    await _repository.connect(accountId);
    await load();
  }

  Future<void> reconnect(String accountId) async {
    await _repository.reconnect(accountId);
    await load();
  }

  Future<void> disconnect(String accountId) async {
    await _repository.disconnect(accountId);
    await load();
  }

  Future<void> syncNow(String accountId) async {
    await _repository.syncNow(accountId);
    await load();
  }
}
