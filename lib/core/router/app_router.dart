import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../config/app_config.dart';
import '../../features/app_state/providers.dart';
import '../../features/auth/presentation/forgot_password_screen.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/signup_screen.dart';
import '../../features/dashboard/presentation/dashboard_screen.dart';
import '../../features/followups/presentation/followup_screen.dart';
import '../../features/home/presentation/app_shell.dart';
import '../../features/inbox/presentation/inbox_screen.dart';
import '../../features/integrations/presentation/integrations_screen.dart';
import '../../features/leads/presentation/add_edit_lead_screen.dart';
import '../../features/leads/presentation/lead_details_screen.dart';
import '../../features/leads/presentation/leads_screen.dart';
import '../../features/reports/presentation/reports_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../../features/splash/presentation/splash_screen.dart';
import '../../features/team/presentation/team_screen.dart';
import 'route_paths.dart';

final goRouterProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen(appStateProvider, (_, __) => refresh.value++);
  return GoRouter(
    initialLocation: RoutePaths.splash,
    refreshListenable: refresh,
    redirect: (context, state) {
      final appState = ref.read(appStateProvider);
      const authRequired = !AppConfig.demoModeEnabled;
      final isAuth = appState.isAuthenticated;
      final isSplash = state.matchedLocation == RoutePaths.splash;
      final isAuthRoute = {
        RoutePaths.login,
        RoutePaths.signup,
        RoutePaths.forgotPassword,
      }.contains(state.matchedLocation);

      if (appState.loading && !isSplash) return RoutePaths.splash;
      if (appState.loading && isSplash) return null;
      if (authRequired && !isAuth && !isAuthRoute) return RoutePaths.login;
      if (authRequired && isAuth && (isAuthRoute || isSplash)) return RoutePaths.dashboard;
      if (!authRequired && isSplash) return RoutePaths.dashboard;
      if (!authRequired && isAuthRoute) return RoutePaths.dashboard;
      if (!appState.isAdmin && state.matchedLocation == RoutePaths.team) return RoutePaths.dashboard;
      return null;
    },
    routes: [
      GoRoute(path: RoutePaths.splash, builder: (_, __) => const SplashScreen()),
      GoRoute(path: RoutePaths.login, builder: (_, __) => const LoginScreen()),
      GoRoute(path: RoutePaths.signup, builder: (_, __) => const SignupScreen()),
      GoRoute(path: RoutePaths.forgotPassword, builder: (_, __) => const ForgotPasswordScreen()),
      ShellRoute(
        builder: (_, __, child) => AppShell(child: child),
        routes: [
          GoRoute(path: RoutePaths.dashboard, builder: (_, __) => const DashboardScreen()),
          GoRoute(path: RoutePaths.inbox, builder: (_, __) => const InboxScreen()),
          GoRoute(path: RoutePaths.leads, builder: (_, __) => const LeadsScreen()),
          GoRoute(path: RoutePaths.followUps, builder: (_, __) => const FollowUpScreen()),
          GoRoute(path: RoutePaths.reports, builder: (_, __) => const ReportsScreen()),
          GoRoute(path: RoutePaths.team, builder: (_, __) => const TeamScreen()),
          GoRoute(path: RoutePaths.settings, builder: (_, __) => const SettingsScreen()),
        ],
      ),
      GoRoute(path: RoutePaths.integrations, builder: (_, __) => const IntegrationsScreen()),
      GoRoute(
        path: RoutePaths.addLead,
        builder: (_, state) => AddEditLeadScreen(
          editId: state.uri.queryParameters['editId'],
          prefillName: state.uri.queryParameters['name'],
          prefillSource: state.uri.queryParameters['source'],
          prefillInquiry: state.uri.queryParameters['inquiry'],
          prefillCity: state.uri.queryParameters['city'],
          conversationId: state.uri.queryParameters['conversationId'],
        ),
      ),
      GoRoute(
        path: '${RoutePaths.leadDetails}/:id',
        builder: (_, state) => LeadDetailsScreen(leadId: state.pathParameters['id'] ?? ''),
      ),
    ],
  );
});
