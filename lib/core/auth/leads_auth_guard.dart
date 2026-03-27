import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../screens/leads_screen.dart';

/// Wraps the dashboard so `/leads` cannot be shown without a Supabase session.
class LeadsAuthGuard extends StatelessWidget {
  const LeadsAuthGuard({super.key});

  @override
  Widget build(BuildContext context) {
    final session = Supabase.instance.client.auth.currentSession;
    if (session == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final nav = Navigator.maybeOf(context);
        if (nav != null && context.mounted) {
          nav.pushNamedAndRemoveUntil('/login', (route) => false);
        }
      });
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(),
        ),
      );
    }
    return const LeadsScreen();
  }
}
