import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/bootstrap/bootstrap.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    debugPrint('[LeadFlow] Startup bootstrap begin');
    await bootstrap().timeout(
      const Duration(seconds: 8),
      onTimeout: () {
        debugPrint('[LeadFlow] Startup bootstrap timeout. Continuing in demo mode.');
      },
    );
    debugPrint('[LeadFlow] Startup bootstrap complete');
  } catch (e, st) {
    debugPrint('[LeadFlow] Startup bootstrap failed: $e');
    debugPrint(st.toString());
  }
  runApp(const ProviderScope(child: LeadFlowApp()));
}
