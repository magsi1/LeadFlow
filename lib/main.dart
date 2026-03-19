import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'core/config/app_config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  debugPrint('[CONFIG] URL: ${AppConfig.supabaseUrl}');
  final keyPrefix = AppConfig.supabaseAnonKey.length > 20
      ? AppConfig.supabaseAnonKey.substring(0, 20)
      : AppConfig.supabaseAnonKey;
  debugPrint('[CONFIG] KEY: $keyPrefix...');

  if (AppConfig.supabaseUrl.isEmpty || AppConfig.supabaseAnonKey.isEmpty) {
    debugPrint('[SUPABASE] Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  } else {
    try {
      await Supabase.initialize(
        url: AppConfig.supabaseUrl,
        anonKey: AppConfig.supabaseAnonKey,
      );
      debugPrint('[SUPABASE] Connection initialized successfully');
      debugPrint('CURRENT USER: ${Supabase.instance.client.auth.currentUser}');
      debugPrint('SESSION: ${Supabase.instance.client.auth.currentSession}');
    } catch (e) {
      debugPrint('[SUPABASE] Initialization error: $e');
    }
  }
  runApp(const ProviderScope(child: LeadFlowApp()));
}
