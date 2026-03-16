import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/utils/iterable_extensions.dart';
import '../../../core/widgets/app_text_field.dart';
import '../../../data/models/lead.dart';
import '../../app_state/providers.dart';
import '../../inbox/presentation/providers.dart';

class AddEditLeadScreen extends ConsumerStatefulWidget {
  const AddEditLeadScreen({
    super.key,
    this.editId,
    this.prefillName,
    this.prefillSource,
    this.prefillInquiry,
    this.prefillCity,
    this.conversationId,
  });

  final String? editId;
  final String? prefillName;
  final String? prefillSource;
  final String? prefillInquiry;
  final String? prefillCity;
  final String? conversationId;

  @override
  ConsumerState<AddEditLeadScreen> createState() => _AddEditLeadScreenState();
}

class _AddEditLeadScreenState extends ConsumerState<AddEditLeadScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _alternate = TextEditingController();
  final _city = TextEditingController();
  final _address = TextEditingController();
  final _inquiry = TextEditingController();
  final _product = TextEditingController();
  final _budget = TextEditingController();
  final _notes = TextEditingController();

  String _source = AppConstants.leadSources.first;
  LeadStatus _status = LeadStatus.leadNew;
  LeadTemperature _temperature = LeadTemperature.warm;
  DateTime? _followUpDate;
  String? _assignedTo;

  Lead? _editingLead;

  static const List<LeadStatus> _statusFlow = [
    LeadStatus.leadNew,
    LeadStatus.contacted,
    LeadStatus.interested,
    LeadStatus.followUpNeeded,
    LeadStatus.closedWon,
    LeadStatus.closedLost,
  ];

  @override
  void initState() {
    super.initState();
    final leads = ref.read(appStateProvider).leads;
    if (widget.editId != null) {
      _editingLead = leads.where((e) => e.id == widget.editId).cast<Lead?>().firstOrNull;
      final lead = _editingLead;
      if (lead != null) {
        _name.text = lead.customerName;
        _phone.text = lead.phone;
        _alternate.text = lead.alternatePhone ?? '';
        _city.text = lead.city;
        _address.text = lead.address;
        _inquiry.text = lead.inquiryText;
        _product.text = lead.productInterest;
        _budget.text = lead.budget;
        _notes.text = lead.notesSummary;
        _source = lead.source;
        _status = lead.status;
        _temperature = lead.temperature;
        _followUpDate = lead.nextFollowUpAt;
        _assignedTo = lead.assignedTo;
      }
    } else {
      _name.text = widget.prefillName?.trim() ?? '';
      _inquiry.text = widget.prefillInquiry?.trim() ?? '';
      _city.text = widget.prefillCity?.trim() ?? '';
      if (widget.prefillSource != null && AppConstants.leadSources.contains(widget.prefillSource)) {
        _source = widget.prefillSource!;
      }
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _alternate.dispose();
    _city.dispose();
    _address.dispose();
    _inquiry.dispose();
    _product.dispose();
    _budget.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final selected = await showDatePicker(
      context: context,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      initialDate: _followUpDate ?? DateTime.now(),
    );
    if (selected == null) return;
    setState(() => _followUpDate = DateTime(selected.year, selected.month, selected.day, 11));
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final appState = ref.read(appStateProvider);
    final user = appState.currentUser;
    if (user == null) return;

    final lead = Lead(
      id: _editingLead?.id ?? const Uuid().v4(),
      businessId: user.businessId,
      customerName: _name.text.trim(),
      phone: _phone.text.trim(),
      alternatePhone: _alternate.text.trim().isEmpty ? null : _alternate.text.trim(),
      city: _city.text.trim(),
      address: _address.text.trim(),
      source: _source,
      productInterest: _product.text.trim(),
      budget: _budget.text.trim(),
      inquiryText: _inquiry.text.trim(),
      status: _status,
      temperature: _temperature,
      assignedTo: _assignedTo ?? user.id,
      createdBy: _editingLead?.createdBy ?? user.id,
      createdAt: _editingLead?.createdAt ?? DateTime.now(),
      updatedAt: DateTime.now(),
      nextFollowUpAt: _followUpDate,
      notesSummary: _notes.text.trim(),
      isArchived: false,
      isDeleted: false,
    );

    if (widget.conversationId != null && widget.conversationId!.isNotEmpty) {
      await ref.read(inboxStateProvider.notifier).saveLeadFromConversation(
            lead: lead,
            isNew: _editingLead == null,
            conversationId: widget.conversationId!,
          );
    } else {
      await ref.read(appStateProvider.notifier).saveLead(lead, isNew: _editingLead == null);
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          widget.conversationId != null && widget.conversationId!.isNotEmpty
              ? 'Lead saved and linked to conversation.'
              : 'Lead saved successfully',
        ),
      ),
    );
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final team = ref.watch(appStateProvider).team;
    final assignedInitial = _assignedTo ?? (team.isNotEmpty ? team.first.id : null);
    return Scaffold(
      appBar: AppBar(title: Text(_editingLead == null ? 'Add Lead' : 'Edit Lead')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Form(
            key: _formKey,
            child: Column(
              children: [
                AppTextField(
                  controller: _name,
                  label: 'Full name',
                  validator: (v) => (v == null || v.isEmpty) ? 'Name is required' : null,
                ),
                const SizedBox(height: 10),
                AppTextField(
                  controller: _phone,
                  label: 'Phone number',
                  keyboardType: TextInputType.phone,
                  validator: (v) => (v == null || v.isEmpty) ? 'Phone is required' : null,
                ),
                const SizedBox(height: 10),
                AppTextField(controller: _alternate, label: 'Alternate phone', keyboardType: TextInputType.phone),
                const SizedBox(height: 10),
                AppTextField(controller: _city, label: 'City'),
                const SizedBox(height: 10),
                AppTextField(controller: _address, label: 'Address'),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: _source,
                  items: AppConstants.leadSources.map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
                  onChanged: (v) => setState(() => _source = v ?? _source),
                  decoration: const InputDecoration(labelText: 'Source'),
                ),
                const SizedBox(height: 10),
                AppTextField(controller: _inquiry, label: 'Inquiry text', maxLines: 3),
                const SizedBox(height: 10),
                AppTextField(controller: _product, label: 'Product interest'),
                const SizedBox(height: 10),
                AppTextField(controller: _budget, label: 'Budget'),
                const SizedBox(height: 10),
                DropdownButtonFormField<LeadTemperature>(
                  initialValue: _temperature,
                  items: LeadTemperature.values
                      .map((e) => DropdownMenuItem(value: e, child: Text(e.name.toUpperCase())))
                      .toList(),
                  onChanged: (v) => setState(() => _temperature = v ?? _temperature),
                  decoration: const InputDecoration(labelText: 'Lead temperature'),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<LeadStatus>(
                  initialValue: _status,
                  items: _statusFlow
                      .map((e) => DropdownMenuItem(value: e, child: Text(_statusLabel(e))))
                      .toList(),
                  onChanged: (v) => setState(() => _status = v ?? _status),
                  decoration: const InputDecoration(labelText: 'Status'),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: assignedInitial,
                  items: team.map((e) => DropdownMenuItem(value: e.id, child: Text(e.fullName))).toList(),
                  onChanged: (v) => setState(() => _assignedTo = v),
                  decoration: const InputDecoration(labelText: 'Assigned salesperson'),
                ),
                const SizedBox(height: 10),
                InkWell(
                  onTap: _pickDate,
                  borderRadius: BorderRadius.circular(12),
                  child: InputDecorator(
                    decoration: const InputDecoration(labelText: 'Follow-up date'),
                    child: Text(_followUpDate?.toIso8601String().split('T').first ?? 'Select follow-up date'),
                  ),
                ),
                const SizedBox(height: 10),
                AppTextField(controller: _notes, label: 'Notes', maxLines: 3),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: _save,
                  icon: const Icon(Icons.save_outlined),
                  label: const Text('Save lead'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _statusLabel(LeadStatus status) {
    return switch (status) {
      LeadStatus.leadNew => 'New',
      LeadStatus.contacted => 'Contacted',
      LeadStatus.interested => 'Qualified',
      LeadStatus.followUpNeeded => 'Follow-up',
      LeadStatus.closedWon => 'Won',
      LeadStatus.closedLost => 'Lost',
      LeadStatus.negotiation => 'Qualified',
    };
  }
}
