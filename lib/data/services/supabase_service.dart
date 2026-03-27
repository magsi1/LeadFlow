import 'package:supabase_flutter/supabase_flutter.dart';

/// Uses [Supabase.instance.client] after [main] calls [Supabase.initialize] once.
class SupabaseService {
  static bool get isAvailable {
    try {
      Supabase.instance.client;
      return true;
    } catch (_) {
      return false;
    }
  }

  static SupabaseClient? get client {
    if (isAvailable) return Supabase.instance.client;
    return null;
  }
}
