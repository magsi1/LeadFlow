import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/network/backend_providers.dart';
import '../../../core/utils/iterable_extensions.dart';
import '../../../core/router/route_paths.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../data/models/app_user.dart';
import '../../../data/models/follow_up.dart';
import '../../../data/models/lead.dart';
import '../../analytics/presentation/providers.dart';
import '../../app_state/app_state.dart';
import '../../app_state/providers.dart';
import '../widgets/dashboard_stat_card.dart';
import '../widgets/quick_action_button.dart';
import '../widgets/recent_lead_tile.dart';
import '../widgets/section_header.dart';

final dashboardSummaryProvider = FutureProvider<Map<String, int>>((ref) async {
  final api = ref.watch(backendApiClientProvider);
  final response = await api.get('/analytics/summary');
  int toInt(Object? value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  return {
    'totalLeads': toInt(response['totalLeads']),
    'hotLeads': toInt(response['hotLeads']),
    'closedLeads': toInt(response['closedLeads']),
    'todayLeads': toInt(response['todayLeads']),
  };
});

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appStateProvider);
    final analyticsAsync = ref.watch(analyticsSnapshotProvider);
    final summaryAsync = ref.watch(dashboardSummaryProvider);
    final appUser = state.currentUser;
    if (appUser == null) {
      return const EmptyState(title: 'No session', subtitle: 'Please login to continue.');
    }

    final user = Supabase.instance.client.auth.currentUser;
    final email = user?.email ?? 'No Email';

    final myLeads = state.leads.where((e) => e.assignedTo == appUser.id).toList()..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    final viewLeads = (state.isAdmin ? state.leads : myLeads)..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    final now = DateTime.now();
    final summary = summaryAsync.valueOrNull;
    final kpis = analyticsAsync.value?.kpis;
    final todayNew = summary?['todayLeads'] ?? kpis?.newToday ?? 0;
    final dueToday = kpis?.followUpsDueToday ?? 0;
    final won = summary?['closedLeads'] ?? kpis?.wonLeads ?? 0;
    final conversionRate = kpis?.conversionRate ?? 0.0;
    final hot = summary?['hotLeads'] ?? viewLeads.where((e) => e.temperature == LeadTemperature.hot).length;
    final totalLeads = summary?['totalLeads'] ?? kpis?.totalLeads ?? viewLeads.length;
    final recentLeads = viewLeads.take(6).toList();

    final followUpsToday = state.followUps.where((f) {
      if (f.completed) return false;
      return f.dueAt.year == now.year && f.dueAt.month == now.month && f.dueAt.day == now.day;
    }).take(6).toList();

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(dashboardSummaryProvider);
        await ref.read(appStateProvider.notifier).refreshData();
      },
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          final isDesktop = width >= 1100;
          final isTablet = width >= 760 && width < 1100;
          final statsCrossAxis = isDesktop ? 4 : (isTablet ? 2 : 1);

          return ListView(
            padding: EdgeInsets.symmetric(horizontal: isDesktop ? 24 : 16, vertical: 16),
            children: [
              _header(context, ref, appUser, isDesktop, email),
              const SizedBox(height: 14),
              GridView.count(
                crossAxisCount: statsCrossAxis,
                childAspectRatio: isDesktop ? 1.65 : (isTablet ? 1.75 : 2.0),
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                children: [
                  DashboardStatCard(
                    icon: Icons.people_alt_outlined,
                    label: state.isAdmin ? 'Total Leads' : 'My Leads',
                    value: '$totalLeads',
                    helper: 'Active pipeline',
                    onTap: () => _openLeadsWithFilter(
                      context,
                      ref,
                      state.filters.copyWith(
                        clearStatus: true,
                        clearSource: true,
                        clearAssignedTo: true,
                        clearTemperature: true,
                        clearCity: true,
                        followUpDueOnly: false,
                      ),
                    ),
                  ),
                  DashboardStatCard(
                    icon: Icons.fiber_new_rounded,
                    label: 'New Today',
                    value: '$todayNew',
                    helper: todayNew > 0 ? '+$todayNew fresh inquiries' : 'No fresh inquiries',
                    accent: Colors.indigo,
                    onTap: () => _openLeadsWithFilter(
                      context,
                      ref,
                      state.filters.copyWith(
                        status: LeadStatus.leadNew,
                        clearSource: true,
                        clearAssignedTo: true,
                        clearTemperature: true,
                        clearCity: true,
                        followUpDueOnly: false,
                      ),
                    ),
                  ),
                  DashboardStatCard(
                    icon: Icons.alarm_on_rounded,
                    label: 'Follow-ups Due',
                    value: '$dueToday',
                    helper: hot > 0 ? '$hot hot leads in pipeline' : 'Track pending callbacks',
                    accent: Colors.orange,
                    onTap: () => _openLeadsWithFilter(
                      context,
                      ref,
                      state.filters.copyWith(
                        clearStatus: true,
                        clearSource: true,
                        clearAssignedTo: true,
                        clearTemperature: true,
                        clearCity: true,
                        followUpDueOnly: true,
                      ),
                    ),
                  ),
                  DashboardStatCard(
                    icon: Icons.check_circle_outline_rounded,
                    label: 'Converted',
                    value: '$won',
                    helper: '${(conversionRate * 100).toStringAsFixed(0)}% conversion',
                    accent: Colors.green,
                    onTap: () => _openLeadsWithFilter(
                      context,
                      ref,
                      state.filters.copyWith(
                        status: LeadStatus.closedWon,
                        clearSource: true,
                        clearAssignedTo: true,
                        clearTemperature: true,
                        clearCity: true,
                        followUpDueOnly: false,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              if (isDesktop)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 6,
                      child: _recentLeadsCard(context, state, recentLeads),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 4,
                      child: _quickActionsCard(context),
                    ),
                  ],
                )
              else
                Column(
                  children: [
                    _recentLeadsCard(context, state, recentLeads),
                    const SizedBox(height: 12),
                    _quickActionsCard(context),
                  ],
                ),
              const SizedBox(height: 12),
              if (isDesktop || isTablet)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: _followUpsCard(context, state, followUpsToday)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _performanceCard(
                        context,
                        viewLeads,
                        won,
                        dueToday,
                        analyticsAsync.isLoading,
                      ),
                    ),
                  ],
                )
              else
                Column(
                  children: [
                    _followUpsCard(context, state, followUpsToday),
                    const SizedBox(height: 12),
                    _performanceCard(context, viewLeads, won, dueToday, analyticsAsync.isLoading),
                  ],
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _header(BuildContext context, WidgetRef ref, AppUser appUser, bool isDesktop, String email) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const Flexible(
                  flex: 2,
                  child: Text(
                    'LeadFlow Dashboard',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 12),
                Flexible(
                  flex: 3,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Flexible(
                        child: Text(
                          email,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.end,
                        ),
                      ),
                      const SizedBox(width: 10),
                      PopupMenuButton<String>(
                        tooltip: 'Account',
                        icon: CircleAvatar(
                          radius: 18,
                          backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                          child: Icon(
                            Icons.person,
                            size: 20,
                            color: Theme.of(context).colorScheme.onPrimaryContainer,
                          ),
                        ),
                        onSelected: (value) async {
                          if (value == 'logout') {
                            await ref.read(appStateProvider.notifier).signOut();
                            if (context.mounted) context.go(RoutePaths.login);
                          }
                        },
                        itemBuilder: (context) => [
                          const PopupMenuItem<String>(
                            value: 'logout',
                            child: Row(
                              children: [
                                Icon(Icons.logout),
                                SizedBox(width: 10),
                                Text('Logout'),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(width: 10),
                      ElevatedButton.icon(
                        onPressed: () => context.push(RoutePaths.addLead),
                        icon: const Icon(Icons.add),
                        label: const Text('Add Lead'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Welcome back, ${appUser.fullName}',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey.shade700),
              ),
            ),
            if (isDesktop) ...[
              const SizedBox(height: 12),
              TextField(
                onChanged: (value) {
                  final filters = ref.read(appStateProvider).filters;
                  ref.read(appStateProvider.notifier).updateFilters(filters.copyWith(search: value.trim()));
                },
                onSubmitted: (value) => _applySearch(context, ref, value),
                decoration: InputDecoration(
                  hintText: 'Search leads, city, phone, source...',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: IconButton(
                    tooltip: 'Search in leads',
                    onPressed: () => _applySearch(context, ref, ref.read(appStateProvider).filters.search),
                    icon: const Icon(Icons.arrow_forward_rounded),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _recentLeadsCard(BuildContext context, AppState state, List<Lead> recentLeads) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SectionHeader(
              title: 'Recent Leads',
              subtitle: 'Latest updates from your pipeline',
              trailing: TextButton(
                onPressed: () => context.go(RoutePaths.leads),
                child: const Text('View all'),
              ),
            ),
            const SizedBox(height: 10),
            if (recentLeads.isEmpty)
              const EmptyState(
                title: 'No leads yet',
                subtitle: 'Add your first lead to start tracking pipeline.',
                icon: Icons.people_alt_outlined,
              )
            else
              ...recentLeads.map((lead) {
                final assignee = state.team.firstWhere(
                  (u) => u.id == lead.assignedTo,
                  orElse: () => state.team.firstOrNull ?? state.currentUser!,
                );
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: RecentLeadTile(
                    lead: lead,
                    assigneeName: assignee.fullName,
                    onTap: () => context.push('${RoutePaths.leadDetails}/${lead.id}'),
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }

  Widget _followUpsCard(BuildContext context, AppState state, List<FollowUp> followUpsToday) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SectionHeader(
              title: 'Follow-ups Today',
              subtitle: 'Tasks needing action today',
              trailing: TextButton(
                onPressed: () => context.go(RoutePaths.followUps),
                child: const Text('Open tracker'),
              ),
            ),
            const SizedBox(height: 8),
            if (followUpsToday.isEmpty)
              const EmptyState(
                title: 'No follow-ups due',
                subtitle: 'Great! Nothing due right now.',
                icon: Icons.alarm_off_outlined,
              )
            else
              ...followUpsToday.map((f) {
                final lead = state.leads.firstWhere(
                  (l) => l.id == f.leadId,
                  orElse: () => state.leads.firstOrNull ?? Lead(
                    id: '',
                    businessId: '',
                    customerName: 'Unknown Lead',
                    phone: '-',
                    email: '',
                    city: '-',
                    address: '-',
                    source: 'Other',
                    productInterest: '-',
                    budget: '-',
                    inquiryText: '-',
                    status: LeadStatus.leadNew,
                    temperature: LeadTemperature.warm,
                    assignedTo: '',
                    createdBy: '',
                    createdAt: DateTime.now(),
                    updatedAt: DateTime.now(),
                    notesSummary: '',
                    isArchived: false,
                    isDeleted: false,
                  ),
                );
                return ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                  leading: const Icon(Icons.schedule_rounded, size: 18),
                  title: Text(
                    lead.customerName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    softWrap: false,
                  ),
                  subtitle: Text('${lead.phone} • ${lead.city}'),
                  trailing: Text(
                    '${f.dueAt.hour.toString().padLeft(2, '0')}:${f.dueAt.minute.toString().padLeft(2, '0')}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  onTap: () => context.push('${RoutePaths.leadDetails}/${lead.id}'),
                );
              }),
          ],
        ),
      ),
    );
  }

  Widget _quickActionsCard(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionHeader(title: 'Quick Actions', subtitle: 'Common tasks'),
            const SizedBox(height: 10),
            QuickActionButton(
              label: 'Add Lead',
              icon: Icons.person_add_alt_1_outlined,
              onTap: () => context.push(RoutePaths.addLead),
            ),
            const SizedBox(height: 8),
            QuickActionButton(
              label: 'Schedule Follow-up',
              icon: Icons.alarm_add_outlined,
              onTap: () => context.go(RoutePaths.followUps),
              color: Colors.orange,
            ),
            const SizedBox(height: 8),
            QuickActionButton(
              label: 'View Reports',
              icon: Icons.bar_chart_outlined,
              onTap: () => context.go(RoutePaths.reports),
              color: Colors.green,
            ),
          ],
        ),
      ),
    );
  }

  Widget _performanceCard(
    BuildContext context,
    List<Lead> leads,
    int won,
    int dueToday,
    bool loading,
  ) {
    final contacted = leads.where((e) => e.status == LeadStatus.contacted || e.status == LeadStatus.interested).length;
    final followUpNeeded = leads.where((e) => e.status == LeadStatus.followUpNeeded).length;
    final conversion = leads.isEmpty ? 0.0 : won / leads.length;
    final contactRate = leads.isEmpty ? 0.0 : contacted / leads.length;
    final actionRate = leads.isEmpty ? 0.0 : (1 - (dueToday / leads.length)).clamp(0, 1).toDouble();

    Widget kpiRow(String label, double value, Color color) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(label, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                Text('${(value * 100).toStringAsFixed(0)}%', style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                minHeight: 8,
                value: value,
                color: color,
                backgroundColor: color.withValues(alpha: 0.16),
              ),
            ),
          ],
        ),
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (loading) const LinearProgressIndicator(minHeight: 2),
            SectionHeader(
              title: 'Performance Overview',
              subtitle: '$followUpNeeded need follow-up',
            ),
            const SizedBox(height: 10),
            kpiRow('Conversion', conversion, Colors.green),
            kpiRow('Contact Rate', contactRate, Colors.indigo),
            kpiRow('Response Discipline', actionRate, Colors.orange),
          ],
        ),
      ),
    );
  }

  void _openLeadsWithFilter(BuildContext context, WidgetRef ref, LeadFilters filters) {
    ref.read(appStateProvider.notifier).updateFilters(filters);
    context.go(RoutePaths.leads);
  }

  void _applySearch(BuildContext context, WidgetRef ref, String value) {
    final text = value.trim();
    final filters = ref.read(appStateProvider).filters;
    ref.read(appStateProvider.notifier).updateFilters(filters.copyWith(search: text));
    context.go(RoutePaths.leads);
  }
}
