import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/utils/iterable_extensions.dart';
import '../../../core/router/route_paths.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../data/models/follow_up.dart';
import '../../../data/models/lead.dart';
import '../../app_state/app_state.dart';
import '../../app_state/providers.dart';
import '../widgets/dashboard_stat_card.dart';
import '../widgets/quick_action_button.dart';
import '../widgets/recent_lead_tile.dart';
import '../widgets/section_header.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appStateProvider);
    final user = state.currentUser;
    if (user == null) {
      return const EmptyState(title: 'No session', subtitle: 'Please login to continue.');
    }

    final myLeads = state.leads.where((e) => e.assignedTo == user.id).toList()..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    final viewLeads = (state.isAdmin ? state.leads : myLeads)..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    final now = DateTime.now();

    int todayNew = viewLeads
        .where((e) => e.createdAt.day == now.day && e.createdAt.month == now.month && e.createdAt.year == now.year)
        .length;
    int hot = viewLeads.where((e) => e.temperature == LeadTemperature.hot).length;
    int dueToday = viewLeads
        .where((e) =>
            e.nextFollowUpAt != null &&
            e.nextFollowUpAt!.day == now.day &&
            e.nextFollowUpAt!.month == now.month &&
            e.nextFollowUpAt!.year == now.year &&
            e.status != LeadStatus.closedWon &&
            e.status != LeadStatus.closedLost)
        .length;
    int won = viewLeads.where((e) => e.status == LeadStatus.closedWon).length;
    final conversionRate = viewLeads.isEmpty ? 0.0 : won / viewLeads.length;
    final recentLeads = viewLeads.take(6).toList();

    final followUpsToday = state.followUps.where((f) {
      if (f.completed) return false;
      return f.dueAt.year == now.year && f.dueAt.month == now.month && f.dueAt.day == now.day;
    }).take(6).toList();

    return RefreshIndicator(
      onRefresh: () => ref.read(appStateProvider.notifier).refreshData(),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          final isDesktop = width >= 1100;
          final isTablet = width >= 760 && width < 1100;
          final statsCrossAxis = isDesktop ? 4 : (isTablet ? 2 : 1);

          return ListView(
            padding: EdgeInsets.symmetric(horizontal: isDesktop ? 24 : 16, vertical: 16),
            children: [
              _header(context, user.fullName, isDesktop),
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
                    value: '${viewLeads.length}',
                    helper: 'Active pipeline',
                  ),
                  DashboardStatCard(
                    icon: Icons.fiber_new_rounded,
                    label: 'New Today',
                    value: '$todayNew',
                    helper: todayNew > 0 ? '+$todayNew fresh inquiries' : 'No fresh inquiries',
                    accent: Colors.indigo,
                  ),
                  DashboardStatCard(
                    icon: Icons.alarm_on_rounded,
                    label: 'Follow-ups Due',
                    value: '$dueToday',
                    helper: hot > 0 ? '$hot hot leads in pipeline' : 'Track pending callbacks',
                    accent: Colors.orange,
                  ),
                  DashboardStatCard(
                    icon: Icons.check_circle_outline_rounded,
                    label: 'Converted',
                    value: '$won',
                    helper: '${(conversionRate * 100).toStringAsFixed(0)}% conversion',
                    accent: Colors.green,
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
                    Expanded(child: _performanceCard(context, viewLeads, won, dueToday)),
                  ],
                )
              else
                Column(
                  children: [
                    _followUpsCard(context, state, followUpsToday),
                    const SizedBox(height: 12),
                    _performanceCard(context, viewLeads, won, dueToday),
                  ],
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _header(BuildContext context, String fullName, bool isDesktop) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Dashboard', style: Theme.of(context).textTheme.headlineSmall),
                      const SizedBox(height: 4),
                      Text(
                        'Welcome back, $fullName',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey.shade700),
                      ),
                    ],
                  ),
                ),
                CircleAvatar(
                  radius: 18,
                  backgroundColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.14),
                  child: Icon(Icons.person_outline, color: Theme.of(context).colorScheme.primary),
                ),
              ],
            ),
            if (isDesktop) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  const Expanded(
                    child: TextField(
                      decoration: InputDecoration(
                        hintText: 'Search leads, city, phone...',
                        prefixIcon: Icon(Icons.search),
                      ),
                      readOnly: true,
                    ),
                  ),
                  const SizedBox(width: 10),
                  FilledButton.icon(
                    onPressed: () => context.push(RoutePaths.addLead),
                    icon: const Icon(Icons.add),
                    label: const Text('Add Lead'),
                  ),
                ],
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
                  title: Text(lead.customerName),
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

  Widget _performanceCard(BuildContext context, List<Lead> leads, int won, int dueToday) {
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
}
