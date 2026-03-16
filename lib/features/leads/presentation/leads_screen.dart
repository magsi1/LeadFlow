import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/router/route_paths.dart';
import '../../../core/utils/iterable_extensions.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../data/models/lead.dart';
import '../../app_state/app_state.dart';
import '../../app_state/providers.dart';
import '../widgets/filter_chip_bar.dart';
import '../widgets/lead_detail_panel.dart';
import '../widgets/lead_mobile_card.dart';
import '../widgets/lead_table_row.dart';
import '../widgets/leads_header.dart';

class LeadsScreen extends ConsumerStatefulWidget {
  const LeadsScreen({super.key});

  @override
  ConsumerState<LeadsScreen> createState() => _LeadsScreenState();
}

enum _QuickLeadFilter { all, leadNew, contacted, followUpDue, converted }

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
    final notifier = ref.read(appStateProvider.notifier);
    final scopedLeads = _scopeByRole(state);
    final quickFilter = _deriveQuickFilter(filters);

    final allCount = scopedLeads.length;
    final newCount = scopedLeads.where((e) => e.status == LeadStatus.leadNew).length;
    final contactedCount = scopedLeads.where((e) => e.status == LeadStatus.contacted).length;
    final convertedCount = scopedLeads.where((e) => e.status == LeadStatus.closedWon).length;
    final dueCount = scopedLeads
        .where(
          (e) =>
              e.nextFollowUpAt != null &&
              !e.nextFollowUpAt!.isAfter(DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day, 23, 59, 59)) &&
              e.status != LeadStatus.closedLost &&
              e.status != LeadStatus.closedWon,
        )
        .length;

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () => notifier.refreshData(),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final isDesktop = constraints.maxWidth >= 1100;
            final isTablet = constraints.maxWidth >= 760 && constraints.maxWidth < 1100;

            return ListView(
              padding: EdgeInsets.symmetric(horizontal: isDesktop ? 24 : 16, vertical: 16),
              children: [
                LeadsHeader(
                  searchController: _searchCtrl,
                  onSearchChanged: (value) => notifier.updateFilters(filters.copyWith(search: value.trim())),
                  onFilterTap: () => _openFilterSheet(context, filters),
                  onAddTap: () => context.push(RoutePaths.addLead),
                  onExportTap: () => _showInfo(context, 'Export feature can be wired to CSV in next phase.'),
                  isDesktop: isDesktop,
                ),
                const SizedBox(height: 12),
                FilterChipBar(
                  items: [
                    LeadsFilterChipData(
                      label: 'All Leads',
                      count: allCount,
                      selected: quickFilter == _QuickLeadFilter.all,
                      onTap: () => _applyQuickFilter(_QuickLeadFilter.all),
                    ),
                    LeadsFilterChipData(
                      label: 'New',
                      count: newCount,
                      selected: quickFilter == _QuickLeadFilter.leadNew,
                      onTap: () => _applyQuickFilter(_QuickLeadFilter.leadNew),
                      color: Colors.indigo,
                    ),
                    LeadsFilterChipData(
                      label: 'Contacted',
                      count: contactedCount,
                      selected: quickFilter == _QuickLeadFilter.contacted,
                      onTap: () => _applyQuickFilter(_QuickLeadFilter.contacted),
                      color: Colors.blue,
                    ),
                    LeadsFilterChipData(
                      label: 'Follow-up Due',
                      count: dueCount,
                      selected: quickFilter == _QuickLeadFilter.followUpDue,
                      onTap: () => _applyQuickFilter(_QuickLeadFilter.followUpDue),
                      color: Colors.orange,
                    ),
                    LeadsFilterChipData(
                      label: 'Converted',
                      count: convertedCount,
                      selected: quickFilter == _QuickLeadFilter.converted,
                      onTap: () => _applyQuickFilter(_QuickLeadFilter.converted),
                      color: Colors.green,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                if (state.loading && state.leads.isEmpty)
                  _loadingPlaceholder()
                else if (leads.isEmpty)
                  const EmptyState(
                    title: 'No leads found',
                    subtitle: 'Try clearing filters or add a new lead to continue.',
                    icon: Icons.person_search_outlined,
                  )
                else if (isDesktop || isTablet)
                  _desktopLeadsTable(context, state, leads)
                else
                  ...leads.map((lead) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: LeadMobileCard(
                          lead: lead,
                          assignedName: _assignedName(state, lead.assignedTo),
                          onView: () => context.push('${RoutePaths.leadDetails}/${lead.id}'),
                          onEdit: () => context.push('${RoutePaths.addLead}?editId=${lead.id}'),
                          onFollowUp: () => _markFollowUp(lead),
                          onStatusChange: (status) => notifier.changeLeadStatus(lead, status),
                        ),
                      )),
              ],
            );
          },
        ),
      ),
    );
  }

  List<Lead> _scopeByRole(AppState state) {
    final user = state.currentUser;
    if (user == null) return state.leads;
    if (user.role.name == 'salesperson') {
      return state.leads.where((e) => e.assignedTo == user.id).toList();
    }
    return state.leads;
  }

  _QuickLeadFilter _deriveQuickFilter(LeadFilters filters) {
    if (filters.followUpDueOnly) return _QuickLeadFilter.followUpDue;
    if (filters.status == LeadStatus.leadNew) return _QuickLeadFilter.leadNew;
    if (filters.status == LeadStatus.contacted) return _QuickLeadFilter.contacted;
    if (filters.status == LeadStatus.closedWon) return _QuickLeadFilter.converted;
    return _QuickLeadFilter.all;
  }

  void _applyQuickFilter(_QuickLeadFilter quick) {
    final notifier = ref.read(appStateProvider.notifier);
    final filters = ref.read(appStateProvider).filters;
    switch (quick) {
      case _QuickLeadFilter.all:
        notifier.updateFilters(filters.copyWith(clearStatus: true, followUpDueOnly: false));
      case _QuickLeadFilter.leadNew:
        notifier.updateFilters(filters.copyWith(status: LeadStatus.leadNew, followUpDueOnly: false));
      case _QuickLeadFilter.contacted:
        notifier.updateFilters(filters.copyWith(status: LeadStatus.contacted, followUpDueOnly: false));
      case _QuickLeadFilter.followUpDue:
        notifier.updateFilters(filters.copyWith(clearStatus: true, followUpDueOnly: true));
      case _QuickLeadFilter.converted:
        notifier.updateFilters(filters.copyWith(status: LeadStatus.closedWon, followUpDueOnly: false));
    }
  }

  String _assignedName(AppState state, String assignedTo) {
    return state.team.firstWhere((u) => u.id == assignedTo, orElse: () => state.team.firstOrNull ?? state.currentUser!).fullName;
  }

  Widget _desktopLeadsTable(BuildContext context, AppState state, List<Lead> leads) {
    final notifier = ref.read(appStateProvider.notifier);
    return Card(
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 1000),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Row(
                  children: [
                    _headCell('Name', 3),
                    _headCell('Source', 2),
                    _headCell('City', 2),
                    _headCell('Status', 3),
                    _headCell('Assigned To', 2),
                    _headCell('Follow-up', 2),
                    const SizedBox(width: 170, child: Align(alignment: Alignment.centerRight, child: Text('Actions'))),
                  ],
                ),
              ),
              const Divider(height: 1),
              ...leads.map((lead) {
                return Column(
                  children: [
                    LeadTableRow(
                      lead: lead,
                      assignedName: _assignedName(state, lead.assignedTo),
                      onView: () => context.push('${RoutePaths.leadDetails}/${lead.id}'),
                      onEdit: () => context.push('${RoutePaths.addLead}?editId=${lead.id}'),
                      onFollowUp: () => _markFollowUp(lead),
                      onStatusChange: (status) => notifier.changeLeadStatus(lead, status),
                      onOpenPanel: () => _showLeadPanel(context, state, lead),
                    ),
                    const Divider(height: 1),
                  ],
                );
              }),
            ],
          ),
        ),
      ),
    );
  }

  Widget _headCell(String title, int flex) {
    return Expanded(
      flex: flex,
      child: Text(
        title,
        style: const TextStyle(fontWeight: FontWeight.w700),
      ),
    );
  }

  Widget _loadingPlaceholder() {
    return Column(
      children: List.generate(
        4,
        (i) => Card(
          child: Container(
            height: 90,
            margin: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.grey.shade200,
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _markFollowUp(Lead lead) async {
    final dueAt = DateTime.now().add(const Duration(days: 1));
    await ref.read(appStateProvider.notifier).scheduleFollowUp(lead, dueAt, note: 'Follow-up scheduled from Leads screen');
    if (!mounted) return;
    _showInfo(context, 'Follow-up marked for ${lead.customerName}');
  }

  Future<void> _showLeadPanel(BuildContext context, AppState state, Lead lead) async {
    if (MediaQuery.sizeOf(context).width < 1000) return;
    await showDialog<void>(
      context: context,
      builder: (_) => Dialog(
        child: LeadDetailPanel(
          lead: lead,
          assignedName: _assignedName(state, lead.assignedTo),
          onEdit: () {
            Navigator.pop(context);
            context.push('${RoutePaths.addLead}?editId=${lead.id}');
          },
          onView: () {
            Navigator.pop(context);
            context.push('${RoutePaths.leadDetails}/${lead.id}');
          },
        ),
      ),
    );
  }

  Future<void> _openFilterSheet(BuildContext context, LeadFilters filters) async {
    LeadStatus? selectedStatus = filters.status;
    String? selectedSource = filters.source;
    LeadTemperature? selectedTemp = filters.temperature;
    bool followUpDue = filters.followUpDueOnly;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Filter Leads', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<LeadStatus?>(
                    initialValue: selectedStatus,
                    decoration: const InputDecoration(labelText: 'Status'),
                    items: [
                      const DropdownMenuItem<LeadStatus?>(value: null, child: Text('All statuses')),
                      ...LeadStatus.values.map((s) => DropdownMenuItem<LeadStatus?>(value: s, child: Text(s.name))),
                    ],
                    onChanged: (v) => setModalState(() => selectedStatus = v),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String?>(
                    initialValue: selectedSource,
                    decoration: const InputDecoration(labelText: 'Source'),
                    items: [
                      const DropdownMenuItem<String?>(value: null, child: Text('All sources')),
                      ...AppConstants.leadSources.map((s) => DropdownMenuItem<String?>(value: s, child: Text(s))),
                    ],
                    onChanged: (v) => setModalState(() => selectedSource = v),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<LeadTemperature?>(
                    initialValue: selectedTemp,
                    decoration: const InputDecoration(labelText: 'Temperature'),
                    items: [
                      const DropdownMenuItem<LeadTemperature?>(value: null, child: Text('All temperatures')),
                      ...LeadTemperature.values
                          .map((t) => DropdownMenuItem<LeadTemperature?>(value: t, child: Text(t.name))),
                    ],
                    onChanged: (v) => setModalState(() => selectedTemp = v),
                  ),
                  const SizedBox(height: 10),
                  SwitchListTile(
                    value: followUpDue,
                    onChanged: (v) => setModalState(() => followUpDue = v),
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Only Follow-up Due'),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () {
                            _searchCtrl.clear();
                            ref.read(appStateProvider.notifier).updateFilters(const LeadFilters());
                            Navigator.pop(context);
                          },
                          child: const Text('Clear'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton(
                          onPressed: () {
                            ref.read(appStateProvider.notifier).updateFilters(
                                  filters.copyWith(
                                    status: selectedStatus,
                                    source: selectedSource,
                                    temperature: selectedTemp,
                                    followUpDueOnly: followUpDue,
                                    clearStatus: selectedStatus == null,
                                    clearSource: selectedSource == null,
                                    clearTemperature: selectedTemp == null,
                                  ),
                                );
                            Navigator.pop(context);
                          },
                          child: const Text('Apply'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  void _showInfo(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}
