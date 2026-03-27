import 'dart:async';
import 'dart:ui' show PlatformDispatcher;

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

// Web (Netlify): HashUrlStrategy via flutter_web_plugins — must stay in the web-only file
// so Android/iOS builds are unaffected. See web_url_strategy_web.dart.
import 'web_url_strategy_stub.dart'
    if (dart.library.html) 'web_url_strategy_web.dart' as web_url_strategy;

import 'services/followup_service.dart';
import 'screens/leads_screen.dart';
import 'screens/login_screen.dart';

/// Single Supabase project for LeadFlow (initialized once in [_bootstrapAfterFirstFrame]).
const String supabaseUrl = 'https://gxddsscaplfrfptgmcxa.supabase.co';
const String supabaseAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4ZGRzc2NhcGxmcmZwdGdtY3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NzI5ODAsImV4cCI6MjA4OTM0ODk4MH0.VvE6jvktjE0segzuuFG02DB9hdjPUdsjBKz4Bi2ZCdE';

/// Shown immediately so Netlify/users never see a long blank white screen during init.
class LeadFlowLoadingApp extends StatelessWidget {
  const LeadFlowLoadingApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'LeadFlow',
      home: Scaffold(
        backgroundColor: Colors.white,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircularProgressIndicator(),
              const SizedBox(height: 20),
              Text(
                'Loading…',
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.grey.shade700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Startup or configuration failure (missing/invalid Supabase, etc.).
class LeadFlowStartupErrorApp extends StatelessWidget {
  const LeadFlowStartupErrorApp({required this.message, super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'LeadFlow',
      home: Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Center(
              child: SelectableText(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Color(0xFFB91C1C),
                  fontSize: 15,
                  height: 1.4,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

Future<void> _bootstrapAfterFirstFrame() async {
  ErrorWidget.builder = (FlutterErrorDetails details) {
    return Material(
      color: Colors.white,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text(
            'APP ERROR:\n${details.exceptionAsString()}',
            style: const TextStyle(color: Colors.red),
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  };

  debugPrint('[LeadFlow] Supabase init: url=$supabaseUrl');

  if (supabaseUrl.isEmpty || supabaseAnonKey.isEmpty) {
    runApp(
      const LeadFlowStartupErrorApp(
        message:
            'Missing Supabase configuration. Please check build variables.',
      ),
    );
    return;
  }

  final parsed = Uri.tryParse(supabaseUrl);
  final isValidUrl = parsed != null &&
      parsed.scheme == 'https' &&
      parsed.host.isNotEmpty &&
      parsed.host.endsWith('.supabase.co');

  if (!isValidUrl) {
    runApp(
      const LeadFlowStartupErrorApp(
        message:
            'Invalid SUPABASE_URL. Expected https://<project-ref>.supabase.co',
      ),
    );
    return;
  }

  await Supabase.initialize(
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
  );

  debugPrint(
    '[LeadFlow] Supabase initialized OK (host: ${Uri.parse(supabaseUrl).host})',
  );

  runApp(const LeadFlowApp());
}

void main() {
  runZonedGuarded(
    () {
      WidgetsFlutterBinding.ensureInitialized();
      web_url_strategy.configureWebUrlStrategy();

      FlutterError.onError = (FlutterErrorDetails details) {
        FlutterError.presentError(details);
        debugPrint(
          '[LeadFlow] FlutterError: ${details.exceptionAsString()}',
        );
      };

      PlatformDispatcher.instance.onError = (error, stack) {
        debugPrint('[LeadFlow] PlatformDispatcher error: $error');
        debugPrint('$stack');
        return true;
      };

      runApp(const LeadFlowLoadingApp());

      scheduleMicrotask(() async {
        try {
          await _bootstrapAfterFirstFrame();
        } catch (e, stack) {
          debugPrint('[LeadFlow] Startup failed: $e');
          debugPrint('$stack');
          runApp(
            LeadFlowStartupErrorApp(
              message: 'Could not start LeadFlow.\n\n$e',
            ),
          );
        }
      });
    },
    (error, stack) {
      debugPrint('[LeadFlow] runZonedGuarded: $error');
      debugPrint('$stack');
    },
  );
}

class LeadFlowApp extends StatefulWidget {
  const LeadFlowApp({super.key});

  @override
  State<LeadFlowApp> createState() => _LeadFlowAppState();
}

class _LeadFlowAppState extends State<LeadFlowApp> {
  Session? _session;
  StreamSubscription<AuthState>? _authSub;
  Timer? _followUpTicker;

  @override
  void initState() {
    super.initState();
    _session = Supabase.instance.client.auth.currentSession;
    _authSub = Supabase.instance.client.auth.onAuthStateChange.listen(
      (AuthState data) {
        if (!mounted) return;
        setState(() {
          _session = data.session;
        });
      },
    );

    _followUpTicker = Timer.periodic(const Duration(minutes: 1), (_) {
      FollowUpService.checkAndSendFollowUps();
    });
    unawaited(FollowUpService.checkAndSendFollowUps());
  }

  @override
  void dispose() {
    _followUpTicker?.cancel();
    _authSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'LeadFlow',
      theme: ThemeData(
        primarySwatch: Colors.indigo,
        scaffoldBackgroundColor: const Color(0xFFF5F7FB),
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.white,
          elevation: 0,
          iconTheme: IconThemeData(color: Colors.black),
          titleTextStyle: TextStyle(
            color: Colors.black,
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
        cardTheme: CardThemeData(
          elevation: 2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      home: _session != null ? const LeadsScreen() : const LoginScreen(),
      routes: <String, WidgetBuilder>{
        '/login': (context) => const LoginScreen(),
        '/leads': (context) => const LeadsScreen(),
      },
    );
  }
}
