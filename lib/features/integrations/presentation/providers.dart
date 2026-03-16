import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../integrations/data/repositories/mock_integration_repository.dart';
import '../../integrations/domain/repositories/integration_repository.dart';
import 'integration_notifier.dart';
import 'integration_state.dart';

final integrationRepositoryProvider = Provider<IntegrationRepository>((ref) {
  return MockIntegrationRepository();
});

final integrationStateProvider = StateNotifierProvider<IntegrationNotifier, IntegrationState>((ref) {
  final notifier = IntegrationNotifier(ref.watch(integrationRepositoryProvider));
  notifier.load();
  return notifier;
});
