import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/utils/phone_validation.dart';
import '../../../data/models/api_lead.dart';
import '../../../data/services/leads_api_service.dart';
import '../../../services/lead_service.dart';

class LeadsScreen extends StatefulWidget {
  const LeadsScreen({super.key});

  @override
  State<LeadsScreen> createState() => _LeadsScreenState();
}

class _LeadsScreenState extends State<LeadsScreen> {
  final _api = LeadsApiService();
  final _dateFormatter = DateFormat('dd MMM yyyy, hh:mm a');
  static const List<String> _allowedStatuses = <String>[
    'new',
    'contacted',
    'closed',
  ];

  List<ApiLead> leads = <ApiLead>[];
  final Map<String, bool> _statusUpdating = <String, bool>{};

  String _searchQuery = '';
  String _selectedFilter = 'all';

  @override
  void initState() {
    super.initState();
    _fetchLeads();
  }

  Future<void> _fetchLeads() async {
    try {
      final data = await _api.fetchLeads();
      if (!mounted) return;
      setState(() => leads = data);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to load leads: $error')),
      );
    }
  }

  Future<void> _showCreateLeadDialog() async {
    final nameController = TextEditingController();
    final phoneController = TextEditingController();
    final emailController = TextEditingController();
    String selectedStatus = 'new';

    final created = await showDialog<bool>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            final phoneRaw = phoneController.text;
            final phoneError = phoneRaw.trim().isEmpty
                ? null
                : (!isValidPhone(phoneRaw)
                    ? 'Enter valid phone number'
                    : null);
            final canCreate = nameController.text.trim().isNotEmpty &&
                isValidPhone(phoneRaw);

            return AlertDialog(
              title: const Text('Add Lead'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: nameController,
                      onChanged: (_) => setDialogState(() {}),
                      decoration: const InputDecoration(labelText: 'Name'),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: phoneController,
                      onChanged: (_) => setDialogState(() {}),
                      keyboardType: TextInputType.phone,
                      maxLength: 16,
                      decoration: InputDecoration(
                        labelText: 'Phone',
                        hintText: '+92… (10–15 digits)',
                        errorText: phoneError,
                        counterText: '',
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: emailController,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(labelText: 'Email (optional)'),
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      initialValue: selectedStatus,
                      decoration: const InputDecoration(labelText: 'Status'),
                      items: _allowedStatuses
                          .map(
                            (status) => DropdownMenuItem<String>(
                              value: status,
                              child: Text(status.toUpperCase()),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        if (value == null) return;
                        setDialogState(() {
                          selectedStatus = value;
                        });
                      },
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: canCreate
                      ? () => Navigator.pop(context, true)
                      : null,
                  child: const Text('Create'),
                ),
              ],
            );
          },
        );
      },
    );

    final name = nameController.text.trim();
    final phone = phoneController.text.trim();
    final email = emailController.text.trim();
    nameController.dispose();
    phoneController.dispose();
    emailController.dispose();

    if (created != true) return;
    if (name.isEmpty || !isValidPhone(phone)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Name and valid phone are required')),
      );
      return;
    }

    try {
      await _api.addLead(
        name: name,
        phone: phone,
        email: email,
        status: selectedStatus,
      );
      await _fetchLeads();
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Lead added')));
    } catch (error) {
      if (!mounted) return;
      final duplicate = isLikelyDuplicateLeadError(error);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            duplicate
                ? 'Lead with this phone already exists'
                : 'Failed to add lead: $error',
          ),
        ),
      );
    }
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'new':
        return Colors.red;
      case 'contacted':
        return Colors.orange;
      case 'closed':
        return Colors.green;
      default:
        return Colors.blueGrey;
    }
  }

  String _formatCreatedAt(DateTime? createdAt) {
    if (createdAt == null) return '-';
    return _dateFormatter.format(createdAt.toLocal());
  }

  Future<void> _updateLeadStatus(ApiLead lead, String status) async {
    if (status == lead.status) return;

    setState(() {
      _statusUpdating[lead.id] = true;
      leads = leads
          .map((item) => item.id == lead.id ? item.copyWith(status: status) : item)
          .toList();
    });

    try {
      final updated = await _api.updateLeadStatus(id: lead.id, status: status);
      if (!mounted) return;
      setState(() {
        leads = leads
            .map((item) => item.id == lead.id ? updated : item)
            .toList();
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        leads = leads
            .map(
              (item) => item.id == lead.id ? item.copyWith(status: lead.status) : item,
            )
            .toList();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Status update failed: $error')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _statusUpdating.remove(lead.id);
        });
      }
    }
  }

  List<ApiLead> _computeFilteredLeads(List<Map<String, dynamic>> rawLeads) {
    final filteredLeads = <ApiLead>[];
    for (final e in rawLeads) {
      final raw = Map<String, dynamic>.from(e);
      final lead = ApiLead.fromJson(raw);
      final matchesSearch =
          lead.name.toLowerCase().contains(_searchQuery) ||
          lead.phone.toLowerCase().contains(_searchQuery) ||
          lead.email.toLowerCase().contains(_searchQuery);

      final filter = _selectedFilter.toLowerCase();
      final intent = (raw['intent'] ?? '').toString().toLowerCase();
      final matchesFilter = filter == 'all'
          ? true
          : lead.status.toLowerCase() == filter || intent == filter;

      if (matchesSearch && matchesFilter) {
        filteredLeads.add(lead);
      }
    }
    return filteredLeads;
  }

  Widget _buildFilterChip(String value, String label) {
    final selected = _selectedFilter == value;
    return FilterChip(
      label: Text(label),
      selected: selected,
      showCheckmark: false,
      selectedColor: Theme.of(context).colorScheme.primaryContainer,
      labelStyle: TextStyle(
        color: selected
            ? Theme.of(context).colorScheme.onPrimaryContainer
            : Theme.of(context).colorScheme.onSurface,
        fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
      ),
      side: BorderSide(
        color: selected
            ? Theme.of(context).colorScheme.primary
            : Colors.grey.shade300,
        width: selected ? 1.5 : 1,
      ),
      onSelected: (_) {
        setState(() {
          _selectedFilter = value;
        });
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final supabase = Supabase.instance.client;
    final user = supabase.auth.currentUser;

    return Scaffold(
      appBar: AppBar(
        title: const Text('LeadFlow Leads'),
        actions: [
          IconButton(
            onPressed: _fetchLeads,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: user == null
          ? const Center(child: Text('Sign in to view leads'))
          : StreamBuilder<List<Map<String, dynamic>>>(
              stream: Stream<void>.fromFuture(
                LeadService.claimUnassignedLeadsForCurrentUser(),
              ).asyncExpand((_) {
                return supabase
                    .from('leads')
                    .stream(primaryKey: ['id'])
                    .eq('assigned_to', user.id)
                    .order('created_at', ascending: false);
              }),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'Error: ${snapshot.error}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.red),
                      ),
                    ),
                  );
                }

                if (!snapshot.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }

                final rawLeads = snapshot.data!;

                if (rawLeads.isEmpty) {
                  return const Center(child: Text('No leads yet'));
                }

                final filteredLeads = _computeFilteredLeads(rawLeads);

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                      child: TextField(
                        onChanged: (value) {
                          setState(() {
                            _searchQuery = value.toLowerCase();
                          });
                        },
                        decoration: InputDecoration(
                          hintText: 'Search name, phone, or email…',
                          prefixIcon: const Icon(Icons.search),
                          filled: true,
                          fillColor: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide.none,
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _buildFilterChip('all', 'All'),
                          _buildFilterChip('hot', 'Hot'),
                          _buildFilterChip('warm', 'Warm'),
                          _buildFilterChip('cold', 'Cold'),
                        ],
                      ),
                    ),
                    Expanded(
                      child: RefreshIndicator(
                        onRefresh: _fetchLeads,
                        child: filteredLeads.isEmpty
                            ? ListView(
                                physics: const AlwaysScrollableScrollPhysics(),
                                children: const [
                                  SizedBox(height: 120),
                                  Center(
                                    child: Text(
                                      'No leads match your search or filter',
                                      style: TextStyle(
                                        color: Colors.grey,
                                        fontSize: 15,
                                      ),
                                    ),
                                  ),
                                ],
                              )
                            : ListView.builder(
                                physics: const AlwaysScrollableScrollPhysics(),
                                padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                                itemCount: filteredLeads.length,
                                itemBuilder: (context, index) {
                                  final lead = filteredLeads[index];
                                  final createdAt = _formatCreatedAt(lead.createdAt);
                                  final isUpdating = _statusUpdating[lead.id] == true;

                                  return Card(
                                    margin: const EdgeInsets.only(bottom: 12),
                                    elevation: 0.5,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12),
                                      side: BorderSide(color: Colors.grey.shade200),
                                    ),
                                    child: Padding(
                                      padding: const EdgeInsets.all(14),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Expanded(
                                                child: Text(
                                                  lead.name.isEmpty ? 'Unknown' : lead.name,
                                                  maxLines: 1,
                                                  overflow: TextOverflow.ellipsis,
                                                  softWrap: false,
                                                  style: const TextStyle(
                                                    fontWeight: FontWeight.w700,
                                                    fontSize: 16,
                                                  ),
                                                ),
                                              ),
                                              Container(
                                                padding: const EdgeInsets.symmetric(
                                                  horizontal: 10,
                                                  vertical: 4,
                                                ),
                                                decoration: BoxDecoration(
                                                  color: _statusColor(lead.status).withValues(alpha: 0.14),
                                                  borderRadius: BorderRadius.circular(999),
                                                ),
                                                child: Text(
                                                  lead.status.toUpperCase(),
                                                  style: TextStyle(
                                                    color: _statusColor(lead.status),
                                                    fontWeight: FontWeight.w600,
                                                    fontSize: 12,
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                          const SizedBox(height: 10),
                                          Text('Phone: ${lead.phone.isEmpty ? '-' : lead.phone}'),
                                          const SizedBox(height: 6),
                                          Text(
                                            'Email: ${lead.email.trim().isEmpty ? 'No Email' : lead.email.trim()}',
                                          ),
                                          const SizedBox(height: 10),
                                          Row(
                                            children: [
                                              const Text(
                                                'Status: ',
                                                style: TextStyle(fontWeight: FontWeight.w600),
                                              ),
                                              const SizedBox(width: 8),
                                              Expanded(
                                                child: DropdownButtonFormField<String>(
                                                  initialValue:
                                                      _allowedStatuses.contains(lead.status)
                                                          ? lead.status
                                                          : 'new',
                                                  items: _allowedStatuses
                                                      .map(
                                                        (status) => DropdownMenuItem<String>(
                                                          value: status,
                                                          child: Text(status.toUpperCase()),
                                                        ),
                                                      )
                                                      .toList(),
                                                  onChanged: isUpdating
                                                      ? null
                                                      : (value) {
                                                          if (value == null) return;
                                                          _updateLeadStatus(lead, value);
                                                        },
                                                  decoration: const InputDecoration(
                                                    isDense: true,
                                                    border: OutlineInputBorder(),
                                                    contentPadding: EdgeInsets.symmetric(
                                                      horizontal: 10,
                                                      vertical: 10,
                                                    ),
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                          const SizedBox(height: 8),
                                          Text(
                                            'Created: $createdAt',
                                            style: TextStyle(
                                              color: Colors.grey.shade700,
                                              fontSize: 12,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                },
                              ),
                      ),
                    ),
                  ],
                );
              },
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showCreateLeadDialog,
        icon: const Icon(Icons.add),
        label: const Text('Add Lead'),
      ),
    );
  }
}
