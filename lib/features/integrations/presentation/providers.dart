import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/backend_providers.dart';
import '../../../data/services/supabase_service.dart';
import '../../integrations/data/repositories/mock_integration_repository.dart';
import '../../integrations/data/repositories/remote_integration_repository.dart';
import '../../integrations/data/repositories/supabase_integration_repository.dart';
import '../../integrations/domain/repositories/integration_repository.dart';
import 'integration_notifier.dart';
import 'integration_state.dart';

final integrationRepositoryProvider = Provider<IntegrationRepository>((ref) {
  if (AppConfig.demoModeEnabled) return MockIntegrationRepository();
  if (AppConfig.wantsSupabase && !AppConfig.isSupabaseConfigured) return MockIntegrationRepository();
  final supabaseClient = SupabaseService.client;
  if (AppConfig.useSupabase && supabaseClient != null) {
    return SupabaseIntegrationRepository(supabaseClient);
  }
  return RemoteIntegrationRepository(ref.watch(backendApiClientProvider));
});

final integrationStateProvider = StateNotifierProvider<IntegrationNotifier, IntegrationState>((ref) {
  final notifier = IntegrationNotifier(ref.watch(integrationRepositoryProvider));
  notifier.load();
  return notifier;
});
