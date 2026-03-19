import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/services/supabase_service.dart';
import '../../integrations/data/repositories/supabase_integration_repository.dart';
import '../../integrations/domain/repositories/integration_repository.dart';
import 'integration_notifier.dart';
import 'integration_state.dart';

final integrationRepositoryProvider = Provider<IntegrationRepository>((ref) {
  final supabaseClient = SupabaseService.client;
  if (supabaseClient != null) {
    return SupabaseIntegrationRepository(supabaseClient);
  }
  throw StateError('Supabase client is unavailable. Integrations require authentication.');
});

final integrationStateProvider = StateNotifierProvider<IntegrationNotifier, IntegrationState>((ref) {
  final notifier = IntegrationNotifier(ref, ref.watch(integrationRepositoryProvider));
  notifier.load();
  return notifier;
});
