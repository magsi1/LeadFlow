import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/config/app_config.dart';

class SupabaseService {
  static bool _initialized = false;

  static bool get isAvailable {
    if (_initialized) return true;
    try {
      Supabase.instance.client;
      _initialized = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  static SupabaseClient? get client {
    if (isAvailable) return Supabase.instance.client;
    return null;
  }

  static Future<void> initialize() async {
    if (_initialized) return;
    try {
      Supabase.instance.client;
      _initialized = true;
      return;
    } catch (_) {
      // Not initialized yet; continue with configured initialization flow.
    }
    if (!AppConfig.isSupabaseConfigured) {
      debugPrint('[LeadFlow] Supabase config missing. Skipping init.');
      return;
    }
    try {
      debugPrint('[LeadFlow] Supabase init attempt');
      await Supabase.initialize(
        url: AppConfig.supabaseUrl,
        anonKey: AppConfig.supabaseAnonKey,
      );
      _initialized = true;
      debugPrint('[LeadFlow] Supabase initialized');
    } catch (e) {
      _initialized = false;
      debugPrint('[LeadFlow] Supabase unavailable, continuing fallback mode: $e');
    }
  }
}
