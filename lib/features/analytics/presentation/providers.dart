import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/services/supabase_service.dart';
import '../../app_state/providers.dart';
import '../application/analytics_calculator.dart';
import '../data/repositories/supabase_analytics_repository.dart';
import '../domain/entities/analytics_filter.dart';
import '../domain/entities/analytics_snapshot.dart';
import '../domain/repositories/analytics_repository.dart';

final analyticsFilterProvider = StateProvider<AnalyticsFilter>((ref) {
  final appState = ref.watch(appStateProvider);
  return AnalyticsFilter(workspaceId: appState.activeWorkspaceId);
});

final analyticsRepositoryProvider = Provider<AnalyticsRepository>((ref) {
  final client = SupabaseService.client;
  if (client != null) {
    return SupabaseAnalyticsRepository(client);
  }
  throw StateError('Supabase client is unavailable. Analytics require authentication.');
});

final analyticsSnapshotProvider = FutureProvider<AnalyticsSnapshot>((ref) async {
  final appState = ref.watch(appStateProvider);
  final filter = ref.watch(analyticsFilterProvider).copyWith(
        workspaceId: appState.activeWorkspaceId,
      );
  final repository = ref.watch(analyticsRepositoryProvider);
  final dataset = await repository.fetchDataset(filter);
  return AnalyticsCalculator.build(
    dataset: dataset,
    filter: filter,
    viewer: appState.currentUser,
  );
});
