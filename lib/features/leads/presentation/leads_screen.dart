import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../data/models/api_lead.dart';
import '../../../data/services/leads_api_service.dart';

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

  List<ApiLead> _leads = <ApiLead>[];
  bool _isLoading = true;
  String? _errorMessage;
  final Map<String, bool> _statusUpdating = <String, bool>{};

  @override
  void initState() {
    super.initState();
    _fetchLeads();
  }

  Future<void> _fetchLeads() async {
    if (!mounted) return;
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final data = await _api.fetchLeads();
      if (!mounted) return;
      setState(() {
        _leads = data;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _errorMessage = 'Failed to load leads: $error';
      });
    }
  }

  Future<void> _showCreateLeadDialog() async {
    final nameController = TextEditingController();
    final phoneController = TextEditingController();
    String selectedStatus = 'new';

    final created = await showDialog<bool>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Add Lead'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: nameController,
                    decoration: const InputDecoration(labelText: 'Name'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: phoneController,
                    decoration: const InputDecoration(labelText: 'Phone'),
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
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(context, true),
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
    nameController.dispose();
    phoneController.dispose();

    if (created != true) return;
    if (name.isEmpty || phone.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Name and phone are required')),
      );
      return;
    }

    try {
      await _api.addLead(name: name, phone: phone, status: selectedStatus);
      await _fetchLeads();
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Lead added')));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to add lead: $error')),
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
      _leads = _leads
          .map((item) => item.id == lead.id ? item.copyWith(status: status) : item)
          .toList();
    });

    try {
      final updated = await _api.updateLeadStatus(id: lead.id, status: status);
      if (!mounted) return;
      setState(() {
        _leads = _leads
            .map((item) => item.id == lead.id ? updated : item)
            .toList();
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _leads = _leads
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('LeadFlow Leads'),
        actions: [
          IconButton(
            onPressed: _isLoading ? null : _fetchLeads,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      _errorMessage!,
                      textAlign: TextAlign.center,
                    ),
                  ),
                )
              : _leads.isEmpty
              ? const Center(child: Text('No leads yet'))
              : RefreshIndicator(
                  onRefresh: _fetchLeads,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _leads.length,
                    itemBuilder: (context, index) {
                      final lead = _leads[index];
                      final createdAt = _formatCreatedAt(lead.createdAt);
                      final isUpdating = _statusUpdating[lead.id] == true;

                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
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
                                      color: _statusColor(
                                        lead.status,
                                      ).withValues(alpha: 0.14),
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
                              Text(
                                'Phone: ${lead.phone.isEmpty ? '-' : lead.phone}',
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
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showCreateLeadDialog,
        icon: const Icon(Icons.add),
        label: const Text('Add Lead'),
      ),
    );
  }
}
