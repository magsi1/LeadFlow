import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import 'backend_api_client.dart';

final backendApiClientProvider = Provider<BackendApiClient>((ref) {
  if (AppConfig.demoModeEnabled) {
    return MockBackendApiClient();
  }
  return HttpBackendApiClient();
});
