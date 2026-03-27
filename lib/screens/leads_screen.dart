import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/theme/app_colors.dart';
import '../core/theme/app_spacing.dart';
import '../core/auth/supabase_auth_helpers.dart';
import '../core/utils/phone_validation.dart';
import '../data/models/api_lead.dart';
import '../data/services/supabase_leads_write_service.dart';
import '../services/lead_service.dart';
import 'lead_dashboard_screen.dart';
import 'lead_notes_screen.dart';
import 'pipeline_screen.dart';
import 'widgets/dashboard_lead_card.dart';
import 'widgets/lead_dashboard_helpers.dart';

class LeadsScreen extends StatefulWidget {
  const LeadsScreen({super.key});

  @override
  State<LeadsScreen> createState() => _LeadsScreenState();
}

class _LeadsScreenState extends State<LeadsScreen> {
  /// Reused for every lead on each filter pass (avoid allocating per row).
  static final RegExp _nonDigitChars = RegExp(r'\D');

  final TextEditingController _searchController = TextEditingController();
  String selectedFilter = 'all';

  RealtimeChannel? _channel;
  List<Map<String, dynamic>> _leads = <Map<String, dynamic>>[];
  bool _leadsLoading = true;
  String? _leadsError;

  /// Row ids hidden immediately while delete is in flight (optimistic UI).
  final Set<String> _pendingDeleteIds = <String>{};

  /// Disables edit/delete on all cards while a delete request runs.
  bool _deleteInProgress = false;

  @override
  void initState() {
    super.initState();
    unawaited(_loadLeads());
    _subscribeToLeads();
    _searchController.addListener(_onSearchTextChanged);
  }

  void _onSearchTextChanged() {
    setState(() {});
  }

  @override
  void dispose() {
    final ch = _channel;
    _channel = null;
    if (ch != null) {
      unawaited(Supabase.instance.client.removeChannel(ch));
    }
    _searchController.removeListener(_onSearchTextChanged);
    _searchController.dispose();
    super.dispose();
  }

  /// Fetches leads assigned to the current user (same query as before Realtime v2).
  Future<void> _loadLeads({bool silent = false}) async {
    final supabase = Supabase.instance.client;
    final userId = supabase.auth.currentUser?.id;
    // ignore: avoid_print — debug: auth context before leads load
    print('CURRENT USER ID: $userId');

    if (userId == null) {
      if (!mounted) return;
      setState(() {
        _leads = <Map<String, dynamic>>[];
        _leadsLoading = false;
        _leadsError = null;
      });
      return;
    }

    if (!silent && mounted) {
      setState(() {
        _leadsLoading = true;
        _leadsError = null;
      });
    }

    try {
      logLeadsDbOp('select (leads load)');
      await LeadService.claimUnassignedLeadsForCurrentUser();
      final response = await supabase
          .from('leads')
          .select()
          .eq('assigned_to', userId)
          .order('created_at', ascending: false);

      final rows = List<Map<String, dynamic>>.from(
        (response as List<dynamic>).map(
          (e) => Map<String, dynamic>.from(e as Map),
        ),
      );

      if (!mounted) return;
      setState(() {
        _leads = rows;
        _leadsLoading = false;
        _leadsError = null;
      });
    } catch (e, st) {
      debugPrint('_loadLeads error: $e\n$st');
      if (!mounted) return;
      setState(() {
        _leadsLoading = false;
        _leadsError = e.toString();
      });
    }
  }

  /// Supabase Realtime v2 — single channel, no deprecated `.on().subscribe()`.
  void _subscribeToLeads() {
    if (_channel != null) return;

    final supabase = Supabase.instance.client;
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;

    _channel = supabase.channel('public:leads')
  ..onPostgresChanges(
    event: PostgresChangeEvent.all,
    schema: 'public',
    table: 'leads',
    callback: (payload) {
      debugPrint('Realtime: ${payload.eventType}');

      if (!mounted) return;

      _loadLeads(); // full refresh
    },
  )
  ..subscribe();
  }

  List<Map<String, dynamic>> _withoutPendingDeletes(
    List<Map<String, dynamic>> rows,
  ) {
    if (_pendingDeleteIds.isEmpty) return rows;
    return rows
        .where((l) => !_pendingDeleteIds.contains(l['id']?.toString()))
        .toList();
  }

  String _formatCreatedAt(dynamic createdAt) {
    final raw = (createdAt ?? '').toString();
    if (raw.isEmpty) return '';
    final parsed = DateTime.tryParse(raw);
    if (parsed == null) return '';
    return DateFormat('dd MMM yyyy, hh:mm a').format(parsed.toLocal());
  }

  /// Hot / warm / cold from `intent` (primary) or `status` (fallback).
  bool _leadMatchesTemperature(Map<String, dynamic> lead, String bucket) {
    final b = bucket.toLowerCase();
    final intent = (lead['intent'] ?? '').toString().toLowerCase();
    final status = (lead['status'] ?? '').toString().toLowerCase();
    return intent == b || status == b;
  }

  bool _matchesFilter(Map<String, dynamic> lead) {
    if (selectedFilter == 'all') return true;
    final intent = (lead['intent'] ?? '').toString().toUpperCase();
    return intent == selectedFilter.toUpperCase();
  }

  /// Search tokens computed once per frame; [qDigits] from raw trimmed text.
  (String q, String qDigits) _normalizedSearchQuery() {
    final raw = _searchController.text.trim();
    if (raw.isEmpty) return ('', '');
    return (raw.toLowerCase(), raw.replaceAll(_nonDigitChars, ''));
  }

  /// Search: name + source (required), plus phone for usability.
  bool _matchesSearch(
    Map<String, dynamic> lead,
    String q,
    String qDigits,
  ) {
    final query = q;
    if (query.isEmpty && qDigits.isEmpty) return true;
    final name = (lead['name'] ?? '').toString().toLowerCase();
    final source = (lead['source'] ?? '').toString().toLowerCase();
    if (query.isNotEmpty) {
      if (name.contains(query) || source.contains(query)) return true;
      final phoneLower = (lead['phone'] ?? '').toString().toLowerCase();
      if (phoneLower.contains(query)) return true;
    }
    if (qDigits.isNotEmpty) {
      final phoneDigits =
          (lead['phone'] ?? '').toString().replaceAll(_nonDigitChars, '');
      if (phoneDigits.contains(qDigits)) return true;
    }
    return false;
  }

  String _normalizeSource(String raw) {
    final u = raw.toUpperCase().trim();
    if (u == 'WHATSAPP' || u == 'INSTAGRAM' || u == 'WEBSITE') return u;
    return 'WHATSAPP';
  }

  String _normalizeIntent(String raw) {
    final u = raw.toUpperCase().trim();
    if (u == 'HOT' || u == 'WARM' || u == 'COLD') return u;
    return 'COLD';
  }

  Widget _buildFilterChip({
    required String label,
    required String value,
  }) {
    final active = selectedFilter == value;
    return GestureDetector(
      onTap: () {
        if (selectedFilter == value) return;
        setState(() {
          selectedFilter = value;
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: active ? AppColors.primary : AppColors.surface,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: active ? AppColors.primary : AppColors.border,
          ),
          boxShadow: active
              ? [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.25),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ]
              : const [],
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: active ? Colors.white : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }

  Widget _buildStatCard({
    required String title,
    required String value,
    required Color accent,
  }) {
    return Container(
      constraints: const BoxConstraints(minWidth: 180, minHeight: 100),
      padding: AppSpacing.cardPadding,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 13,
              color: AppColors.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontSize: 28,
              height: 1.1,
              fontWeight: FontWeight.w700,
              color: accent,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showAddLeadDialog() async {
    if (currentUserIdOrNull() == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('You must be logged in to add leads')),
      );
      return;
    }
    final nameController = TextEditingController();
    final phoneController = TextEditingController();
    final emailController = TextEditingController();
    final messageController = TextEditingController();
    String selectedSource = 'WHATSAPP';
    bool isSubmitting = false;

    await showDialog<void>(
      context: context,
      barrierDismissible: !isSubmitting,
      builder: (context) {
        final messenger = ScaffoldMessenger.of(context);
        return StatefulBuilder(
          builder: (context, setModalState) {
            final phoneRaw = phoneController.text;
            final phoneError = phoneRaw.trim().isEmpty
                ? null
                : (!isValidPhone(phoneRaw)
                    ? 'Enter valid phone number'
                    : null);
            final canSubmit = nameController.text.trim().isNotEmpty &&
                isValidPhone(phoneRaw) &&
                messageController.text.trim().isNotEmpty;

            return Dialog(
              insetPadding: const EdgeInsets.symmetric(
                horizontal: 20,
                vertical: 24,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Create New Lead',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: nameController,
                        onChanged: (_) => setModalState(() {}),
                        decoration: const InputDecoration(
                          labelText: 'Name',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: phoneController,
                        onChanged: (_) => setModalState(() {}),
                        keyboardType: TextInputType.phone,
                        maxLength: 16,
                        decoration: InputDecoration(
                          labelText: 'Phone',
                          hintText: '+92… (10–15 digits)',
                          errorText: phoneError,
                          counterText: '',
                          border: const OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: emailController,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          labelText: 'Email (optional)',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: messageController,
                        onChanged: (_) => setModalState(() {}),
                        maxLines: 3,
                        decoration: const InputDecoration(
                          labelText: 'Message',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        initialValue: selectedSource,
                        decoration: const InputDecoration(
                          labelText: 'Source',
                          border: OutlineInputBorder(),
                        ),
                        items: const [
                          DropdownMenuItem(
                            value: 'WHATSAPP',
                            child: Text('WHATSAPP'),
                          ),
                          DropdownMenuItem(
                            value: 'INSTAGRAM',
                            child: Text('INSTAGRAM'),
                          ),
                          DropdownMenuItem(
                            value: 'WEBSITE',
                            child: Text('WEBSITE'),
                          ),
                        ],
                        onChanged: isSubmitting
                            ? null
                            : (value) {
                                if (value == null) return;
                                setModalState(() {
                                  selectedSource = value;
                                });
                              },
                      ),
                      const SizedBox(height: 18),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          TextButton(
                            onPressed: isSubmitting
                                ? null
                                : () => Navigator.of(context).pop(),
                            child: const Text('Cancel'),
                          ),
                          const SizedBox(width: 8),
                          FilledButton(
                            onPressed: (isSubmitting || !canSubmit)
                                ? null
                                : () async {
                                    final name = nameController.text.trim();
                                    final phone = phoneController.text.trim();
                                    final message = messageController.text.trim();

                                    if (name.isEmpty || message.isEmpty) {
                                      messenger.showSnackBar(
                                        const SnackBar(
                                          content: Text(
                                            'Name and message are required',
                                          ),
                                        ),
                                      );
                                      return;
                                    }
                                    if (!isValidPhone(phone)) {
                                      messenger.showSnackBar(
                                        const SnackBar(
                                          content: Text(
                                            'Enter a valid phone number',
                                          ),
                                        ),
                                      );
                                      return;
                                    }

                                    setModalState(() {
                                      isSubmitting = true;
                                    });

                                    try {
                                      logLeadsDbOp('insert', extra: {
                                        'name': name,
                                        'source': selectedSource,
                                      });
                                      await SupabaseLeadsWriteService.insertLeadMvp(
                                        name: name,
                                        message: message,
                                        source: selectedSource,
                                        email: emailController.text.trim(),
                                        phone: phone,
                                        extra: const {
                                          'intent': 'HOT',
                                          'auto_replied': false,
                                        },
                                      );

                                      if (!context.mounted) return;
                                      Navigator.of(context).pop();
                                      if (!mounted) return;
                                      ScaffoldMessenger.of(this.context)
                                          .showSnackBar(
                                        const SnackBar(
                                          content: Text('Action successful'),
                                        ),
                                      );
                                      unawaited(_loadLeads());
                                    } catch (e) {
                                      setModalState(() {
                                        isSubmitting = false;
                                      });

                                      final duplicate =
                                          isLikelyDuplicateLeadError(e);

                                      if (!mounted) return;

                                      messenger.showSnackBar(
                                        SnackBar(
                                          content: Text(
                                            duplicate
                                                ? 'Lead with this phone already exists'
                                                : 'Something went wrong',
                                          ),
                                        ),
                                      );
                                    }
                                  },
                            child: isSubmitting
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Text('Add Lead'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );

    nameController.dispose();
    phoneController.dispose();
    emailController.dispose();
    messageController.dispose();
  }

  Future<void> _showEditLeadDialog(Map<String, dynamic> lead) async {
    final leadId = lead['id']?.toString();
    if (leadId == null || leadId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Invalid lead')),
      );
      return;
    }

    final supabase = Supabase.instance.client;
    if (currentUserIdOrNull() == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('You must be logged in to edit leads')),
      );
      return;
    }
    final nameController = TextEditingController(
      text: (lead['name'] ?? '').toString(),
    );
    final messageController = TextEditingController(
      text: (lead['message'] ?? '').toString(),
    );
    final emailController = TextEditingController(
      text: (lead['email'] ?? '').toString(),
    );
    String selectedSource =
        _normalizeSource((lead['source'] ?? 'WHATSAPP').toString());
    String selectedIntent =
        _normalizeIntent((lead['intent'] ?? 'COLD').toString());
    bool isSubmitting = false;

    await showDialog<void>(
      context: context,
      barrierDismissible: !isSubmitting,
      builder: (context) {
        final messenger = ScaffoldMessenger.of(context);
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Dialog(
              insetPadding: const EdgeInsets.symmetric(
                horizontal: 20,
                vertical: 24,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Edit Lead',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: nameController,
                        decoration: const InputDecoration(
                          labelText: 'Name',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: messageController,
                        maxLines: 3,
                        decoration: const InputDecoration(
                          labelText: 'Message',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: emailController,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          labelText: 'Email (optional)',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        key: ValueKey<String>('edit-source-$selectedSource'),
                        initialValue: selectedSource,
                        decoration: const InputDecoration(
                          labelText: 'Source',
                          border: OutlineInputBorder(),
                        ),
                        items: const [
                          DropdownMenuItem(
                            value: 'WHATSAPP',
                            child: Text('WHATSAPP'),
                          ),
                          DropdownMenuItem(
                            value: 'INSTAGRAM',
                            child: Text('INSTAGRAM'),
                          ),
                          DropdownMenuItem(
                            value: 'WEBSITE',
                            child: Text('WEBSITE'),
                          ),
                        ],
                        onChanged: isSubmitting
                            ? null
                            : (value) {
                                if (value == null) return;
                                setModalState(() {
                                  selectedSource = value;
                                });
                              },
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        key: ValueKey<String>('edit-intent-$selectedIntent'),
                        initialValue: selectedIntent,
                        decoration: const InputDecoration(
                          labelText: 'Intent',
                          border: OutlineInputBorder(),
                        ),
                        items: const [
                          DropdownMenuItem(value: 'HOT', child: Text('HOT')),
                          DropdownMenuItem(value: 'WARM', child: Text('WARM')),
                          DropdownMenuItem(value: 'COLD', child: Text('COLD')),
                        ],
                        onChanged: isSubmitting
                            ? null
                            : (value) {
                                if (value == null) return;
                                setModalState(() {
                                  selectedIntent = value;
                                });
                              },
                      ),
                      const SizedBox(height: 18),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          TextButton(
                            onPressed: isSubmitting
                                ? null
                                : () => Navigator.of(context).pop(),
                            child: const Text('Cancel'),
                          ),
                          const SizedBox(width: 8),
                          FilledButton(
                            onPressed: isSubmitting
                                ? null
                                : () async {
                                    final dialogNavigator =
                                        Navigator.of(context);
                                    final name = nameController.text.trim();
                                    final message = messageController.text.trim();
                                    final email = emailController.text.trim();

                                    if (name.isEmpty || message.isEmpty) {
                                      messenger.showSnackBar(
                                        const SnackBar(
                                          content: Text(
                                            'Name and message are required',
                                          ),
                                        ),
                                      );
                                      return;
                                    }

                                    setModalState(() {
                                      isSubmitting = true;
                                    });

                                    try {
                                      final user = requireLoggedInUser();
                                      logLeadsDbOp('update', extra: {
                                        'id': leadId,
                                      });
                                      await supabase.from('leads').update({
                                        'name': name,
                                        'message': message,
                                        'source': selectedSource,
                                        'intent': selectedIntent,
                                        'email': email.isEmpty ? null : email,
                                      }).eq('id', leadId).eq('assigned_to', user.id);

                                      if (!mounted) return;
                                      dialogNavigator.pop();
                                      ScaffoldMessenger.of(this.context)
                                          .showSnackBar(
                                        const SnackBar(
                                          content: Text('Action successful'),
                                        ),
                                      );
                                      unawaited(_loadLeads());
                                    } catch (e) {
                                      setModalState(() {
                                        isSubmitting = false;
                                      });
                                      messenger.showSnackBar(
                                        SnackBar(
                                          content: Text(
                                            'Error: ${e.toString()}',
                                          ),
                                        ),
                                      );
                                    }
                                  },
                            child: isSubmitting
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Text('Save changes'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );

    nameController.dispose();
    messageController.dispose();
    emailController.dispose();
  }

  Future<void> _confirmDeleteLead(Map<String, dynamic> lead) async {
    final leadId = lead['id']?.toString();
    if (leadId == null || leadId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Invalid lead')),
      );
      return;
    }

    if (currentUserIdOrNull() == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('You must be logged in to delete leads')),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete Lead?'),
        content: const Text('This action cannot be undone'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() {
      _pendingDeleteIds.add(leadId);
      _deleteInProgress = true;
    });
    try {
      final user = requireLoggedInUser();
      logLeadsDbOp('delete', extra: {'id': leadId});
      await Supabase.instance.client
          .from('leads')
          .delete()
          .eq('id', leadId)
          .eq('assigned_to', user.id);
      if (!mounted) return;
      setState(() {
        _pendingDeleteIds.remove(leadId);
        _deleteInProgress = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Action successful')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _pendingDeleteIds.remove(leadId);
        _deleteInProgress = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${e.toString()}')),
      );
    }
  }

  Future<void> _cycleLeadStatus(Map<String, dynamic> lead) async {
    if (_deleteInProgress) return;
    final id = lead['id']?.toString();
    if (id == null || id.isEmpty) return;

    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to update leads')),
      );
      return;
    }

    final next = getNextStatus(pipelineBucketFromLeadMap(lead));
    try {
      await Supabase.instance.client.from('leads').update(<String, dynamic>{
        'status': next,
        'intent': next.toUpperCase(),
      }).eq('id', id).eq('assigned_to', user.id);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not update status: $e')),
      );
    }
  }

  void _showLeadDetailsDialog(Map<String, dynamic> lead) {
    final name = (lead['name'] ?? 'Unnamed Lead').toString();
    final source = (lead['source'] ?? 'Unknown').toString();
    final intent = (lead['intent'] ?? 'COLD').toString().toUpperCase();
    final message = (lead['message'] ?? '').toString();
    final createdAt = _formatCreatedAt(lead['created_at']);
    final badgeColor = colorForIntent(intent);
    final autoReplied = lead['auto_replied'] == true;

    showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (context) {
        return Dialog(
          elevation: 0,
          backgroundColor: Colors.transparent,
          insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x26000000),
                      blurRadius: 28,
                      offset: Offset(0, 10),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            softWrap: false,
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF0F172A),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: badgeColor.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            intent,
                            style: TextStyle(
                              color: badgeColor,
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'Source: $source',
                      style: const TextStyle(
                        fontSize: 14,
                        color: Color(0xFF475569),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Created: ${createdAt.isEmpty ? 'N/A' : createdAt}',
                      style: const TextStyle(
                        fontSize: 13,
                        color: Color(0xFF64748B),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: autoReplied
                            ? const Color(0x1A16A34A)
                            : const Color(0x1AF59E0B),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        autoReplied ? 'AUTO REPLIED' : 'PENDING',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: autoReplied
                              ? const Color(0xFF166534)
                              : const Color(0xFF92400E),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'Message',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    const SizedBox(height: 8),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 220),
                      child: SingleChildScrollView(
                        child: Text(
                          message.isEmpty ? 'No message' : message,
                          style: const TextStyle(
                            fontSize: 14,
                            color: Color(0xFF334155),
                            height: 1.45,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        TextButton(
                          onPressed: () => Navigator.of(context).pop(),
                          child: const Text('Close'),
                        ),
                        const SizedBox(width: 8),
                        FilledButton.icon(
                          onPressed: () {
                            final messenger = ScaffoldMessenger.of(context);
                            final rawPhone = (lead['phone'] ?? '').toString().trim();
                            if (rawPhone.isEmpty) {
                              messenger.showSnackBar(
                                const SnackBar(
                                  content: Text('Phone number not available'),
                                ),
                              );
                              return;
                            }

                            final sanitizedPhone =
                                rawPhone.replaceAll(RegExp(r'[^0-9]'), '');
                            if (sanitizedPhone.isEmpty) {
                              messenger.showSnackBar(
                                const SnackBar(
                                  content: Text('Phone number not available'),
                                ),
                              );
                              return;
                            }

                            final prefill = Uri.encodeQueryComponent(
                              "Hi, I'm following up on your inquiry.",
                            );
                            final whatsappUrl = Uri.parse(
                              'https://wa.me/$sanitizedPhone?text=$prefill',
                            );

                            launchUrl(whatsappUrl).then((opened) {
                              if (!opened) {
                                messenger.showSnackBar(
                                  const SnackBar(
                                    content: Text('Could not open WhatsApp'),
                                  ),
                                );
                              }
                            });
                          },
                          icon: const Icon(Icons.message_outlined),
                          label: const Text('Reply on WhatsApp'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.textPrimary,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'LeadFlow',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: AppColors.textPrimary,
                    fontWeight: FontWeight.w600,
                    fontSize: 20,
                  ),
            ),
            Text(
              Supabase.instance.client.auth.currentUser?.email ?? 'No user',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.textMuted,
                  ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Dashboard',
            icon: const Icon(Icons.dashboard_outlined, color: AppColors.textSecondary),
            onPressed: () {
              Navigator.push<void>(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => const LeadDashboardScreen(),
                ),
              );
            },
          ),
          IconButton(
            tooltip: 'Pipeline',
            icon: const Icon(Icons.view_column, color: AppColors.textSecondary),
            onPressed: () {
              Navigator.push<void>(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => const PipelineScreen(),
                ),
              );
            },
          ),
          IconButton(
            tooltip: 'Refresh',
            onPressed: _deleteInProgress
                ? null
                : () {
                    unawaited(_loadLeads());
                  },
            icon: const Icon(Icons.refresh, color: AppColors.textSecondary),
          ),
          IconButton(
            tooltip: 'Sign Out',
            icon: const Icon(Icons.logout, color: AppColors.textSecondary),
            onPressed: () async {
              try {
                await Supabase.instance.client.auth.signOut();
              } catch (e) {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Sign out failed: $e')),
                );
                return;
              }
              // LeadFlowApp listens to onAuthStateChange and swaps home to LoginScreen.
            },
          ),
        ],
      ),
      body: Builder(
        builder: (context) {
          if (_leadsError != null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Error: $_leadsError',
                  style: const TextStyle(color: Colors.red),
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }

          if (_leadsLoading && _leads.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }

          final raw = List<Map<String, dynamic>>.from(_leads);
          final leads = _withoutPendingDeletes(raw);
          if (leads.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.inbox_outlined,
                      size: 56,
                      color: Colors.grey.shade400,
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'No leads yet',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: Colors.grey.shade800,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Add your first lead to start tracking conversations.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 14,
                        height: 1.4,
                        color: Colors.grey.shade600,
                      ),
                    ),
                    const SizedBox(height: 28),
                    ElevatedButton(
                      onPressed:
                          _deleteInProgress ? null : _showAddLeadDialog,
                      child: const Text('Add your first lead'),
                    ),
                  ],
                ),
              ),
            );
          }

          return LayoutBuilder(
            builder: (context, constraints) {
              final contentWidth =
                  constraints.maxWidth > 1200 ? 1200.0 : constraints.maxWidth;
              final (searchQ, searchQDigits) = _normalizedSearchQuery();
              final filteredLeads = leads
                  .where(_matchesFilter)
                  .where((l) => _matchesSearch(l, searchQ, searchQDigits))
                  .toList();

              final statsSource = filteredLeads;
              final totalLeads = statsSource.length;
              final hotLeads = statsSource
                  .where((l) => _leadMatchesTemperature(l, 'hot'))
                  .length;
              final warmLeads = statsSource
                  .where((l) => _leadMatchesTemperature(l, 'warm'))
                  .length;
              final coldLeads = statsSource
                  .where((l) => _leadMatchesTemperature(l, 'cold'))
                  .length;

              return Align(
                alignment: Alignment.topCenter,
                child: SizedBox(
                  width: contentWidth,
                  child: CustomScrollView(
                    cacheExtent: 400,
                    slivers: [
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(24, 24, 24, 0),
                        sliver: SliverToBoxAdapter(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Text(
                              'Dashboard',
                              style: Theme.of(context).textTheme.headlineSmall
                                  ?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: AppColors.textPrimary,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          FilledButton.icon(
                            onPressed:
                                _deleteInProgress ? null : _showAddLeadDialog,
                            icon: const Icon(Icons.add),
                            label: const Text('+ Add Lead'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Manage your leads efficiently',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: AppColors.textSecondary,
                            ),
                      ),
                      if (selectedFilter != 'all' ||
                          _searchController.text.trim().isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(
                          'Showing filtered results',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      TextField(
                        controller: _searchController,
                        textInputAction: TextInputAction.search,
                        decoration: InputDecoration(
                          hintText: 'Search by name, phone, or source…',
                          prefixIcon: const Icon(
                            Icons.search,
                            color: AppColors.textMuted,
                          ),
                          suffixIcon: _searchController.text.isEmpty
                              ? null
                              : IconButton(
                                  tooltip: 'Clear',
                                  icon: const Icon(Icons.clear),
                                  onPressed: () {
                                    _searchController.clear();
                                    setState(() {});
                                  },
                                ),
                          filled: true,
                          fillColor: AppColors.surface,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: const BorderSide(
                              color: AppColors.border,
                            ),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: const BorderSide(
                              color: AppColors.border,
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: const BorderSide(
                              color: AppColors.primary,
                              width: 1.5,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),
                      Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        children: [
                          _buildStatCard(
                            title: 'Total Leads',
                            value: '$totalLeads',
                            accent: AppColors.textPrimary,
                          ),
                          _buildStatCard(
                            title: 'Hot Leads',
                            value: '$hotLeads',
                            accent: AppColors.hot,
                          ),
                          _buildStatCard(
                            title: 'Warm Leads',
                            value: '$warmLeads',
                            accent: AppColors.warm,
                          ),
                          _buildStatCard(
                            title: 'Cold Leads',
                            value: '$coldLeads',
                            accent: AppColors.cold,
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          _buildFilterChip(label: 'All', value: 'all'),
                          _buildFilterChip(label: 'Hot', value: 'hot'),
                          _buildFilterChip(label: 'Warm', value: 'warm'),
                          _buildFilterChip(label: 'Cold', value: 'cold'),
                        ],
                      ),
                      const SizedBox(height: 20),
                            ],
                          ),
                        ),
                      ),
                      if (filteredLeads.isEmpty)
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(20, 28, 20, 32),
                          sliver: SliverToBoxAdapter(
                            child: Center(
                              child: Padding(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 24),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      Icons.inbox_outlined,
                                      size: 52,
                                      color: Colors.grey.shade400,
                                    ),
                                    const SizedBox(height: 18),
                                    Text(
                                      _searchController.text.trim().isEmpty
                                          ? 'No leads in this view'
                                          : 'No matching leads',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        fontSize: 17,
                                        fontWeight: FontWeight.w700,
                                        color: Colors.grey.shade800,
                                      ),
                                    ),
                                    const SizedBox(height: 10),
                                    Text(
                                      _searchController.text.trim().isEmpty
                                          ? 'Try another filter or add a new lead.'
                                          : 'Adjust your search or clear filters.',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        fontSize: 14,
                                        height: 1.4,
                                        color: Colors.grey.shade600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        )
                      else
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
                          sliver: SliverList(
                            delegate: SliverChildBuilderDelegate(
                              (context, index) {
                                final lead = filteredLeads[index];
                                final id = lead['id'];
                                return Padding(
                                  padding: const EdgeInsets.only(bottom: 14),
                                  child: RepaintBoundary(
                                    child: LeadCard(
                                      key: ValueKey(
                                        id != null
                                            ? 'lead_$id'
                                            : 'lead_idx_$index',
                                      ),
                                      lead: lead,
                                      lockActions: _deleteInProgress,
                                      onOpenDetails: () {
                                        Navigator.of(context).push(
                                          MaterialPageRoute<void>(
                                            builder: (_) => LeadNotesScreen(
                                              lead: ApiLead.fromJson(lead),
                                            ),
                                          ),
                                        );
                                      },
                                      onLongPressSummary: () =>
                                          _showLeadDetailsDialog(lead),
                                      onEdit: () => _showEditLeadDialog(lead),
                                      onDelete: () => _confirmDeleteLead(lead),
                                      formatCreatedAt: _formatCreatedAt,
                                      onCycleStatus: () {
                                        unawaited(_cycleLeadStatus(lead));
                                      },
                                    ),
                                  ),
                                );
                              },
                              childCount: filteredLeads.length,
                              addRepaintBoundaries: false,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}