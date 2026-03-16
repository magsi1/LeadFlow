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
    if (location.startsWith(RoutePaths.inbox)) return 1;
    if (location.startsWith(RoutePaths.leads)) return 2;
    if (location.startsWith(RoutePaths.followUps)) return 3;
    if (location.startsWith(RoutePaths.reports)) return 4;
    if (isAdmin && location.startsWith(RoutePaths.team)) return 5;
    return isAdmin ? 6 : 5;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isAdmin = ref.watch(appStateProvider).isAdmin;
    final location = GoRouterState.of(context).matchedLocation;
    final index = _indexFromLocation(location, isAdmin);
    final isWide = MediaQuery.sizeOf(context).width >= 1100;

    final routes = <String>[
      RoutePaths.dashboard,
      RoutePaths.inbox,
      RoutePaths.leads,
      RoutePaths.followUps,
      RoutePaths.reports,
      if (isAdmin) RoutePaths.team,
      RoutePaths.settings,
    ];

    if (isWide) {
      return Scaffold(
        body: Row(
          children: [
            Container(
              width: 90,
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                border: Border(
                  right: BorderSide(color: Colors.grey.shade200),
                ),
              ),
              child: NavigationRail(
                selectedIndex: index,
                onDestinationSelected: (i) => context.go(routes[i]),
                labelType: NavigationRailLabelType.all,
                backgroundColor: Colors.transparent,
                useIndicator: true,
                destinations: [
                  const NavigationRailDestination(
                    icon: Icon(Icons.dashboard_outlined),
                    selectedIcon: Icon(Icons.dashboard_rounded),
                    label: Text('Dashboard'),
                  ),
                  const NavigationRailDestination(
                    icon: Icon(Icons.inbox_outlined),
                    selectedIcon: Icon(Icons.inbox_rounded),
                    label: Text('Inbox'),
                  ),
                  const NavigationRailDestination(
                    icon: Icon(Icons.people_alt_outlined),
                    selectedIcon: Icon(Icons.people_alt_rounded),
                    label: Text('Leads'),
                  ),
                  const NavigationRailDestination(
                    icon: Icon(Icons.alarm_on_outlined),
                    selectedIcon: Icon(Icons.alarm_on_rounded),
                    label: Text('Follow-ups'),
                  ),
                  const NavigationRailDestination(
                    icon: Icon(Icons.bar_chart_outlined),
                    selectedIcon: Icon(Icons.bar_chart_rounded),
                    label: Text('Reports'),
                  ),
                  if (isAdmin)
                    const NavigationRailDestination(
                      icon: Icon(Icons.groups_outlined),
                      selectedIcon: Icon(Icons.groups_rounded),
                      label: Text('Team'),
                    ),
                  const NavigationRailDestination(
                    icon: Icon(Icons.settings_outlined),
                    selectedIcon: Icon(Icons.settings_rounded),
                    label: Text('Settings'),
                  ),
                ],
              ),
            ),
            Expanded(child: child),
          ],
        ),
      );
    }

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        height: 76,
        selectedIndex: index,
        onDestinationSelected: (i) => context.go(routes[i]),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.dashboard_outlined), label: 'Dashboard'),
          const NavigationDestination(icon: Icon(Icons.inbox_outlined), label: 'Inbox'),
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
