import 'package:supabase_flutter/supabase_flutter.dart';

import '../../domain/entities/analytics_dataset.dart';
import '../../domain/entities/analytics_filter.dart';
import '../../domain/repositories/analytics_repository.dart';
import 'supabase_analytics_repository.dart';

class DemoAnalyticsRepository implements AnalyticsRepository {
  DemoAnalyticsRepository([SupabaseClient? client])
      : _supabaseRepository = SupabaseAnalyticsRepository(
          client ?? Supabase.instance.client,
        );

  final SupabaseAnalyticsRepository _supabaseRepository;

  @override
  Future<AnalyticsDataset> fetchDataset(AnalyticsFilter filter) async {
    // Repository layer should not perform authentication.
    // Auth is handled during app startup in main().
    return _supabaseRepository.fetchDataset(filter);
  }
}
