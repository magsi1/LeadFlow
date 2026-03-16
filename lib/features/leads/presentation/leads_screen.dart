import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/router/route_paths.dart';
import '../../../core/widgets/app_text_field.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/lead_card.dart';
import '../../../data/models/lead.dart';
import '../../app_state/app_state.dart';
import '../../app_state/providers.dart';

class LeadsScreen extends ConsumerStatefulWidget {
  const LeadsScreen({super.key});

  @override
  ConsumerState<LeadsScreen> createState() => _LeadsScreenState();
}

class _LeadsScreenState extends ConsumerState<LeadsScreen> {
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchCtrl.text = ref.read(appStateProvider).filters.search;
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final leads = ref.watch(visibleLeadsProvider);
    final state = ref.watch(appStateProvider);
    final filters = state.filters;

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push(RoutePaths.addLead),
        label: const Text('Add Lead'),
        icon: const Icon(Icons.add),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(appStateProvider.notifier).refreshData(),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Leads', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 12),
            AppTextField(
              controller: _searchCtrl,
              label: 'Search by name, phone, city',
              hint: 'Hassan, +923..., Lahore',
              onChanged: (value) {
                ref.read(appStateProvider.notifier).updateFilters(filters.copyWith(search: value.trim()));
              },
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilterChip(
                  label: Text(filters.followUpDueOnly ? 'Follow-up Due: ON' : 'Follow-up Due'),
                  selected: filters.followUpDueOnly,
                  onSelected: (v) {
                    ref.read(appStateProvider.notifier).updateFilters(filters.copyWith(followUpDueOnly: v));
                  },
                ),
                _statusMenu(context, ref, filters),
                _sourceMenu(context, ref, filters),
                _tempMenu(context, ref, filters),
                ActionChip(
                  label: const Text('Clear Filters'),
                  onPressed: () {
                    _searchCtrl.clear();
                    ref.read(appStateProvider.notifier).updateFilters(const LeadFilters());
                  },
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (state.loading && state.leads.isEmpty)
              const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
            else if (leads.isEmpty)
              const EmptyState(title: 'No leads found', subtitle: 'Try removing filters or add a new lead.')
            else
              ...leads.map((lead) {
                final assignedName =
                    state.team.firstWhere((u) => u.id == lead.assignedTo, orElse: () => state.team.first).fullName;
                return LeadCard(
                  lead: lead,
                  assignedName: assignedName,
                  onTap: () => context.push('${RoutePaths.leadDetails}/${lead.id}'),
                );
              }),
          ],
        ),
      ),
    );
  }

  Widget _statusMenu(BuildContext context, WidgetRef ref, LeadFilters filters) {
    return PopupMenuButton<LeadStatus?>(
      child: Chip(label: Text(filters.status?.name ?? 'Status')),
      onSelected: (v) {
        ref.read(appStateProvider.notifier).updateFilters(
              v == null ? filters.copyWith(clearStatus: true) : filters.copyWith(status: v),
            );
      },
      itemBuilder: (_) => [
        const PopupMenuItem<LeadStatus?>(value: null, child: Text('All statuses')),
        ...LeadStatus.values.map((e) => PopupMenuItem(value: e, child: Text(e.name))),
      ],
    );
  }

  Widget _sourceMenu(BuildContext context, WidgetRef ref, LeadFilters filters) {
    return PopupMenuButton<String?>(
      child: Chip(label: Text(filters.source ?? 'Source')),
      onSelected: (v) {
        ref.read(appStateProvider.notifier).updateFilters(
              v == null ? filters.copyWith(clearSource: true) : filters.copyWith(source: v),
            );
      },
      itemBuilder: (_) => [
        const PopupMenuItem<String?>(value: null, child: Text('All sources')),
        ...AppConstants.leadSources.map((e) => PopupMenuItem(value: e, child: Text(e))),
      ],
    );
  }

  Widget _tempMenu(BuildContext context, WidgetRef ref, LeadFilters filters) {
    return PopupMenuButton<LeadTemperature?>(
      child: Chip(label: Text(filters.temperature?.name ?? 'Temperature')),
      onSelected: (v) {
        ref.read(appStateProvider.notifier).updateFilters(
              v == null ? filters.copyWith(clearTemperature: true) : filters.copyWith(temperature: v),
            );
      },
      itemBuilder: (_) => [
        const PopupMenuItem<LeadTemperature?>(value: null, child: Text('All temperatures')),
        ...LeadTemperature.values.map((e) => PopupMenuItem(value: e, child: Text(e.name))),
      ],
    );
  }
}
