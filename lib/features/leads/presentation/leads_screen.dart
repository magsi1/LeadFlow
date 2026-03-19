import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class LeadsScreen extends StatefulWidget {
  const LeadsScreen({super.key});

  @override
  State<LeadsScreen> createState() => _LeadsScreenState();
}

class _LeadsScreenState extends State<LeadsScreen> {
  final _supabase = Supabase.instance.client;
  final _dateFormatter = DateFormat('dd MMM yyyy, hh:mm a');

  List<Map<String, dynamic>> _leads = <Map<String, dynamic>>[];
  bool _myLeadsOnly = false;
  bool _isLoading = true;
  StreamSubscription<List<Map<String, dynamic>>>? _leadsSubscription;

  @override
  void initState() {
    super.initState();
    _fetchLeads();
    _subscribeToLeads();
  }

  @override
  void dispose() {
    _leadsSubscription?.cancel();
    super.dispose();
  }

  Future<List<Map<String, dynamic>>> fetchLeads() async {
    var query = _supabase.from('leads').select();
    if (_myLeadsOnly) {
      final userId = _supabase.auth.currentUser?.id;
      if (userId != null && userId.isNotEmpty) {
        query = query.eq('assigned_to', userId);
      }
    }
    final response = await query.order('created_at', ascending: false);
    return List<Map<String, dynamic>>.from(response);
  }

  Future<void> _fetchLeads() async {
    try {
      final data = await fetchLeads();
      if (!mounted) return;
      setState(() {
        _leads = data;
      });
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to load leads: $error')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _subscribeToLeads() {
    _leadsSubscription?.cancel();
    _leadsSubscription = _supabase
        .from('leads')
        .stream(primaryKey: ['id'])
        .order('created_at', ascending: false)
        .listen(
      (data) {
        if (!mounted) return;
        List<Map<String, dynamic>> filtered = List<Map<String, dynamic>>.from(data);
        if (_myLeadsOnly) {
          final userId = _supabase.auth.currentUser?.id;
          if (userId != null && userId.isNotEmpty) {
            filtered = filtered.where((lead) => (lead['assigned_to'] ?? '').toString() == userId).toList();
          }
        }
        setState(() {
          _leads = filtered;
          _isLoading = false;
        });
      },
      onError: (Object error) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Realtime update error: $error')),
        );
      },
    );
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

  Color _scoreColor(String category) {
    switch (category.toUpperCase()) {
      case 'HOT':
        return Colors.green;
      case 'WARM':
        return Colors.orange;
      case 'COLD':
        return Colors.red;
      default:
        return Colors.blueGrey;
    }
  }

  Future<void> _showStatusDialog(Map<String, dynamic> lead) async {
    final selectedStatus = await showDialog<String>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Update status'),
        children: [
          SimpleDialogOption(
            onPressed: () => Navigator.of(context).pop('new'),
            child: const Text('New'),
          ),
          SimpleDialogOption(
            onPressed: () => Navigator.of(context).pop('contacted'),
            child: const Text('Contacted'),
          ),
          SimpleDialogOption(
            onPressed: () => Navigator.of(context).pop('closed'),
            child: const Text('Closed'),
          ),
        ],
      ),
    );

    if (selectedStatus == null) return;

    try {
      await _supabase.from('leads').update({'status': selectedStatus}).eq('id', lead['id']);
      await _fetchLeads();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Status update failed: $error')),
      );
    }
  }

  Future<void> _showAssignDialog(Map<String, dynamic> lead) async {
    final controller = TextEditingController(text: (lead['assigned_to'] ?? '').toString());
    final assignedTo = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Assign Lead'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            labelText: 'Agent user id',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();

    if (assignedTo == null || assignedTo.isEmpty) return;
    try {
      await _supabase.from('leads').update({'assigned_to': assignedTo}).eq('id', lead['id']);
      await _fetchLeads();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Assign failed: $error')),
      );
    }
  }

  Future<void> _openWhatsApp(String rawPhone) async {
    final phone = rawPhone.replaceAll(RegExp(r'[^0-9]'), '');
    if (phone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Phone number is not valid')),
      );
      return;
    }

    final uri = Uri.parse('https://wa.me/$phone');
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open WhatsApp')),
      );
    }
  }

  String _formatCreatedAt(dynamic createdAt) {
    if (createdAt == null) return '-';
    try {
      final date = DateTime.tryParse(createdAt.toString());
      if (date == null) return createdAt.toString();
      return _dateFormatter.format(date.toLocal());
    } catch (_) {
      return createdAt.toString();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('CRM Leads Dashboard'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 10),
            child: FilterChip(
              selected: _myLeadsOnly,
              onSelected: (selected) {
                setState(() {
                  _myLeadsOnly = selected;
                });
                _fetchLeads();
                _subscribeToLeads();
              },
              label: const Text('My Leads'),
            ),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _leads.isEmpty
              ? const Center(child: Text('No leads yet'))
              : RefreshIndicator(
                  onRefresh: _fetchLeads,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _leads.length,
                    itemBuilder: (context, index) {
                      final lead = _leads[index];
                      final name = (lead['name'] ?? 'Unknown').toString();
                      final phone = (lead['phone'] ?? '').toString();
                      final message = (lead['message'] ?? '').toString();
                      final status = (lead['status'] ?? 'new').toString();
                      final score = (lead['score'] as num?)?.toInt() ?? 0;
                      final scoreCategory = (lead['score_category'] ?? 'COLD').toString();
                      final assignedTo = (lead['assigned_to'] ?? '').toString();
                      final dealValue = (lead['deal_value'] as num?)?.toDouble() ?? 0;
                      final dealStatus = (lead['deal_status'] ?? 'open').toString();
                      final createdAt = _formatCreatedAt(lead['created_at']);

                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(12),
                          onTap: () => _showStatusDialog(lead),
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
                                        name,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 16,
                                        ),
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: _statusColor(status).withValues(alpha: 0.14),
                                        borderRadius: BorderRadius.circular(999),
                                      ),
                                      child: Text(
                                        status.toUpperCase(),
                                        style: TextStyle(
                                          color: _statusColor(status),
                                          fontWeight: FontWeight.w600,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                Text('Phone: ${phone.isEmpty ? '-' : phone}'),
                                const SizedBox(height: 6),
                                Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: _scoreColor(scoreCategory).withValues(alpha: 0.14),
                                        borderRadius: BorderRadius.circular(999),
                                      ),
                                      child: Text(
                                        '$scoreCategory ($score)',
                                        style: TextStyle(
                                          color: _scoreColor(scoreCategory),
                                          fontWeight: FontWeight.w600,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        'Assigned: ${assignedTo.isEmpty ? 'Unassigned' : assignedTo}',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    TextButton(
                                      onPressed: () => _showAssignDialog(lead),
                                      child: const Text('Assign'),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  'Deal: ${dealStatus.toUpperCase()}  |  Value: ${dealValue.toStringAsFixed(2)}',
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  'Message: ${message.isEmpty ? '-' : message}',
                                  maxLines: 3,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 8),
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        'Created: $createdAt',
                                        style: TextStyle(
                                          color: Colors.grey.shade700,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ),
                                    IconButton(
                                      tooltip: 'Open WhatsApp',
                                      onPressed: phone.isEmpty ? null : () => _openWhatsApp(phone),
                                      icon: const Icon(Icons.open_in_new),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
