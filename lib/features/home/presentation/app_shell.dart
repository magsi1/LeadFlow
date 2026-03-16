import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/route_paths.dart';
import '../../app_state/providers.dart';

class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.child});

  final Widget child;

  int _indexFromLocation(String location, bool isAdmin) {
    if (location.startsWith(RoutePaths.dashboard)) return 0;
    if (location.startsWith(RoutePaths.leads)) return 1;
    if (location.startsWith(RoutePaths.followUps)) return 2;
    if (location.startsWith(RoutePaths.reports)) return 3;
    if (isAdmin && location.startsWith(RoutePaths.team)) return 4;
    return isAdmin ? 5 : 4;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isAdmin = ref.watch(appStateProvider).isAdmin;
    final location = GoRouterState.of(context).matchedLocation;
    final index = _indexFromLocation(location, isAdmin);

    final routes = <String>[
      RoutePaths.dashboard,
      RoutePaths.leads,
      RoutePaths.followUps,
      RoutePaths.reports,
      if (isAdmin) RoutePaths.team,
      RoutePaths.settings,
    ];

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => context.go(routes[i]),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.dashboard_outlined), label: 'Dashboard'),
          const NavigationDestination(icon: Icon(Icons.people_alt_outlined), label: 'Leads'),
          const NavigationDestination(icon: Icon(Icons.alarm_on_outlined), label: 'Follow-ups'),
          const NavigationDestination(icon: Icon(Icons.bar_chart_outlined), label: 'Reports'),
          if (isAdmin) const NavigationDestination(icon: Icon(Icons.groups_outlined), label: 'Team'),
          const NavigationDestination(icon: Icon(Icons.settings_outlined), label: 'Settings'),
        ],
      ),
    );
  }
}
