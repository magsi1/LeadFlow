import '../entities/analytics_dataset.dart';
import '../entities/analytics_filter.dart';

abstract class AnalyticsRepository {
  Future<AnalyticsDataset> fetchDataset(AnalyticsFilter filter);
}
