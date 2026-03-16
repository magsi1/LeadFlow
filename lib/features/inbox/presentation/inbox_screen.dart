import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/route_paths.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/iterable_extensions.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../shared/models/channel_type.dart';
import '../../../data/models/lead.dart';
import '../../inbox/domain/services/ai_intent_service.dart';
import '../../app_state/providers.dart';
import '../../inbox/domain/entities/conversation.dart';
import '../../inbox/domain/entities/unified_message.dart';
import '../../inbox/presentation/inbox_notifier.dart';
import '../../inbox/presentation/inbox_state.dart';
import '../../inbox/presentation/providers.dart';

class InboxScreen extends ConsumerStatefulWidget {
  const InboxScreen({super.key});

  @override
  ConsumerState<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends ConsumerState<InboxScreen> {
  final _searchCtrl = TextEditingController();
  final _replyCtrl = TextEditingController();
  final _messageScrollController = ScrollController();
  bool _isNearMessageBottom = true;
  String? _scrollConversationId;
  int _scrollMessageCount = 0;

  @override
  void initState() {
    super.initState();
    _messageScrollController.addListener(() {
      if (!_messageScrollController.hasClients) return;
      final distance = _messageScrollController.position.maxScrollExtent - _messageScrollController.offset;
      _isNearMessageBottom = distance <= 120;
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _replyCtrl.dispose();
    _messageScrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<InboxState>(inboxStateProvider, (previous, next) {
      final error = next.error;
      if (error == null || error == previous?.error) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
    });
    final inboxState = ref.watch(inboxStateProvider);
    final notifier = ref.read(inboxStateProvider.notifier);
    final conversations = ref.watch(visibleConversationsProvider);
    final selected = ref.watch(selectedConversationProvider);
    final appState = ref.watch(appStateProvider);
    final isWide = MediaQuery.sizeOf(context).width >= 1000;
    if (conversations.isNotEmpty && selected == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        notifier.selectConversation(conversations.first.id);
      });
    }

    Color channelColor(ChannelType c) => switch (c) {
          ChannelType.whatsapp => Colors.green,
          ChannelType.instagram => Colors.purple,
          ChannelType.facebook => Colors.indigo,
        };

    Widget channelBadge(ChannelType c) {
      final color = channelColor(c);
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(c.label, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700)),
      );
    }

    Widget conversationList() {
      if (inboxState.loading && conversations.isEmpty) {
        return const Center(child: CircularProgressIndicator());
      }
      if (conversations.isEmpty) {
        return const EmptyState(
          title: 'No conversations',
          subtitle: 'Connect channels or use demo mode to preview omnichannel inbox.',
          icon: Icons.forum_outlined,
        );
      }
      return ListView.builder(
        itemCount: conversations.length,
        itemBuilder: (_, i) {
          final c = conversations[i];
          final isSelected = c.id == selected?.id;
          return Card(
            color: isSelected ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.08) : null,
            child: ListTile(
              onTap: () => notifier.selectConversation(c.id),
              title: Row(
                children: [
                  Expanded(
                    child: Text(
                      c.customerName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                  if (c.unreadCount > 0)
                    CircleAvatar(
                      radius: 10,
                      backgroundColor: Colors.redAccent,
                      child: Text('${c.unreadCount}', style: const TextStyle(fontSize: 10, color: Colors.white)),
                    ),
                ],
              ),
              subtitle: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 4),
                  channelBadge(c.channel),
                  const SizedBox(height: 6),
                  Text(c.lastMessagePreview, maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Text(Formatters.dateTime(c.lastMessageAt), style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
          );
        },
      );
    }

    Widget conversationDetail() {
      if (selected == null) {
        return const EmptyState(
          title: 'Select a conversation',
          subtitle: 'Choose any thread to view full messages and actions.',
          icon: Icons.chat_bubble_outline,
        );
      }
      final assignee = appState.team.where((u) => u.id == selected.assignedTo).firstOrNull?.fullName ?? 'Unassigned';
      final city = _extractLocation(selected);
      final stageLabel = _stageLabel(selected.stage);
      final stageColor = _stageColor(selected.stage);
      final priorityLabel = _priorityLabel(selected.intent);
      final priorityColor = _priorityColor(selected.intent);
      final conversationActivities = appState.activities
          .where(
            (a) =>
                a.metadata['conversationId']?.toString() == selected.id ||
                (selected.leadId != null && a.leadId == selected.leadId),
          )
          .toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

      final shouldAutoScroll =
          _scrollConversationId != selected.id || _scrollMessageCount != inboxState.messages.length;
      if (shouldAutoScroll) {
        final force = _scrollConversationId != selected.id;
        _scrollConversationId = selected.id;
        _scrollMessageCount = inboxState.messages.length;
        WidgetsBinding.instance.addPostFrameCallback((_) => _scrollMessagesToLatest(force: force));
      }
      return LayoutBuilder(
        builder: (context, constraints) {
          final suggestionsMaxHeight = constraints.maxHeight * 0.34;
          return Column(
            children: [
              if (inboxState.actionLoading) const LinearProgressIndicator(minHeight: 2),
              Card(
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(selected.customerName, style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: 4),
                            Text('${selected.channel.label} • $assignee'),
                            const SizedBox(height: 6),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                Chip(
                                  visualDensity: VisualDensity.compact,
                                  label: Text(stageLabel),
                                  side: BorderSide(color: stageColor.withValues(alpha: 0.35)),
                                  backgroundColor: stageColor.withValues(alpha: 0.12),
                                  labelStyle: TextStyle(color: stageColor, fontWeight: FontWeight.w700),
                                ),
                                Chip(
                                  visualDensity: VisualDensity.compact,
                                  label: Text(priorityLabel),
                                  side: BorderSide(color: priorityColor.withValues(alpha: 0.35)),
                                  backgroundColor: priorityColor.withValues(alpha: 0.12),
                                  labelStyle: TextStyle(color: priorityColor, fontWeight: FontWeight.w700),
                                ),
                                Chip(
                                  visualDensity: VisualDensity.compact,
                                  label: Text(city),
                                  avatar: const Icon(Icons.location_on_outlined, size: 16),
                                ),
                                Chip(
                                  visualDensity: VisualDensity.compact,
                                  label: Text('Active ${Formatters.dateTime(selected.lastMessageAt)}'),
                                  avatar: const Icon(Icons.schedule_outlined, size: 16),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      PopupMenuButton<String>(
                        tooltip: 'Assign salesperson',
                        enabled: !inboxState.actionLoading,
                        onSelected: (userId) => _assignConversation(selected, userId),
                        itemBuilder: (_) => appState.team
                            .map((u) => PopupMenuItem<String>(value: u.id, child: Text(u.fullName)))
                            .toList(),
                        child: const Chip(
                          avatar: Icon(Icons.person_add_alt_1_outlined, size: 16),
                          label: Text('Assign'),
                        ),
                      ),
                      OutlinedButton(
                        onPressed: inboxState.actionLoading ? null : () => _openLeadFromConversation(selected),
                        child: Text(selected.leadId == null ? 'Create Lead' : 'Open Lead'),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton.icon(
                        onPressed: (selected.leadId == null || inboxState.actionLoading)
                            ? null
                            : () => _scheduleFollowUpFromConversation(selected),
                        icon: const Icon(Icons.schedule_rounded, size: 16),
                        label: const Text('Schedule Follow-up'),
                      ),
                      const SizedBox(width: 8),
                      PopupMenuButton<InboxLeadStage>(
                        enabled: !inboxState.actionLoading,
                        onSelected: (stage) => notifier.setStage(selected.id, stage),
                        itemBuilder: (_) =>
                            InboxLeadStage.values.map((s) => PopupMenuItem(value: s, child: Text(s.name))).toList(),
                        child: const Chip(
                          avatar: Icon(Icons.flag_outlined, size: 16),
                          label: Text('Stage'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: ListView(
                  controller: _messageScrollController,
                  children: inboxState.messages
                      .map(
                        (m) => Align(
                          alignment: m.direction == 'outgoing' ? Alignment.centerRight : Alignment.centerLeft,
                          child: Container(
                            margin: const EdgeInsets.symmetric(vertical: 4),
                            padding: const EdgeInsets.all(10),
                            constraints: const BoxConstraints(maxWidth: 520),
                            decoration: BoxDecoration(
                              color: m.direction == 'outgoing'
                                  ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.12)
                                  : Colors.grey.shade100,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(m.text),
                                const SizedBox(height: 4),
                                Text(Formatters.dateTime(m.createdAt), style: Theme.of(context).textTheme.bodySmall),
                              ],
                            ),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ),
              const SizedBox(height: 8),
              ConstrainedBox(
                constraints: BoxConstraints(maxHeight: suggestionsMaxHeight.clamp(120, 320)),
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (selected.leadId != null)
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            _leadStatusChip(selected, LeadStatus.leadNew, 'New', disabled: inboxState.actionLoading),
                            _leadStatusChip(
                              selected,
                              LeadStatus.contacted,
                              'Contacted',
                              disabled: inboxState.actionLoading,
                            ),
                            _leadStatusChip(
                              selected,
                              LeadStatus.interested,
                              'Qualified',
                              disabled: inboxState.actionLoading,
                            ),
                            _leadStatusChip(
                              selected,
                              LeadStatus.followUpNeeded,
                              'Follow-up',
                              disabled: inboxState.actionLoading,
                            ),
                            _leadStatusChip(selected, LeadStatus.closedWon, 'Won', disabled: inboxState.actionLoading),
                            _leadStatusChip(
                              selected,
                              LeadStatus.closedLost,
                              'Lost',
                              disabled: inboxState.actionLoading,
                            ),
                          ],
                        ),
                      if (selected.leadId != null) const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _quickReplyChip(notifier, 'Share pricing'),
                          _quickReplyChip(notifier, 'Please share your location so I can send the right package.'),
                          _quickReplyChip(notifier, 'Can you share your monthly electricity bill?'),
                          _quickReplyChip(notifier, 'Would you like to book a quick call today?'),
                        ],
                      ),
                      const SizedBox(height: 8),
                      FutureBuilder<AiAnalysisResult?>(
                        key: ValueKey('${selected.id}_${inboxState.messages.length}'),
                        future: _resolveAiAnalysis(ref, selected, inboxState.messages),
                        builder: (context, snapshot) {
                          final analysis = snapshot.data;
                          final suggestions = analysis?.suggestedReplies ?? _fallbackReplies(selected.intent);
                          final summary = analysis?.summary ?? _fallbackSummary(selected);
                          return Card(
                            margin: EdgeInsets.zero,
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Icon(
                                        Icons.auto_awesome_outlined,
                                        size: 18,
                                        color: Theme.of(context).colorScheme.primary,
                                      ),
                                      const SizedBox(width: 8),
                                      Text('AI Reply Suggestions', style: Theme.of(context).textTheme.titleSmall),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Text(summary, style: Theme.of(context).textTheme.bodySmall),
                                  const SizedBox(height: 10),
                                  ...suggestions.take(3).map(
                                        (s) => Card(
                                          margin: const EdgeInsets.only(bottom: 8),
                                          child: ListTile(
                                            dense: true,
                                            leading: const Icon(Icons.chat_outlined, size: 18),
                                            title: Text(s),
                                            trailing: TextButton(
                                              onPressed: () {
                                                _replyCtrl.text = s;
                                                _replyCtrl.selection = TextSelection.collapsed(offset: _replyCtrl.text.length);
                                              },
                                              child: const Text('Use'),
                                            ),
                                          ),
                                        ),
                                      ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                      const SizedBox(height: 8),
                      Card(
                        margin: EdgeInsets.zero,
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Activity Timeline', style: Theme.of(context).textTheme.titleSmall),
                              const SizedBox(height: 8),
                              if (conversationActivities.isEmpty)
                                Text(
                                  'No activity yet.',
                                  style: Theme.of(context).textTheme.bodySmall,
                                )
                              else
                                ...conversationActivities.take(5).map(
                                      (a) => ListTile(
                                        contentPadding: EdgeInsets.zero,
                                        dense: true,
                                        leading: const Icon(Icons.bolt_outlined, size: 16),
                                        title: Text(a.message, maxLines: 2, overflow: TextOverflow.ellipsis),
                                        subtitle: Text(Formatters.dateTime(a.createdAt)),
                                      ),
                                    ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _replyCtrl,
                      decoration: const InputDecoration(hintText: 'Type reply...'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: inboxState.actionLoading
                        ? null
                        : () async {
                            final text = _replyCtrl.text;
                            await notifier.sendReply(text);
                            _replyCtrl.clear();
                          },
                    child: const Text('Send'),
                  ),
                ],
              ),
            ],
          );
        },
      );
    }

    return Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Unified Inbox', style: Theme.of(context).textTheme.headlineSmall),
                              const SizedBox(height: 4),
                              const Text('All WhatsApp, Instagram, and Facebook conversations in one place.'),
                            ],
                          ),
                        ),
                        OutlinedButton(
                          onPressed: () => context.push(RoutePaths.integrations),
                          child: const Text('Manage Integrations'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _searchCtrl,
                      decoration: const InputDecoration(
                        hintText: 'Search conversations',
                        prefixIcon: Icon(Icons.search),
                      ),
                      onChanged: notifier.setSearch,
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        ChoiceChip(
                          label: const Text('All'),
                          selected: inboxState.selectedChannel == null,
                          onSelected: (_) => notifier.setChannelFilter(null),
                        ),
                        for (final c in ChannelType.values)
                          ChoiceChip(
                            label: Text(c.label),
                            selected: inboxState.selectedChannel == c,
                            onSelected: (_) => notifier.setChannelFilter(c),
                          ),
                        FilterChip(
                          label: const Text('Unassigned'),
                          selected: inboxState.onlyUnassigned,
                          onSelected: (_) => notifier.toggleUnassigned(),
                        ),
                        FilterChip(
                          label: const Text('Hot'),
                          selected: inboxState.onlyHot,
                          onSelected: (_) => notifier.toggleHot(),
                        ),
                        FilterChip(
                          label: const Text('Follow-up Due'),
                          selected: inboxState.onlyFollowUpDue,
                          onSelected: (_) => notifier.toggleFollowUpDue(),
                        ),
                        FilterChip(
                          label: const Text('Converted'),
                          selected: inboxState.onlyConverted,
                          onSelected: (_) => notifier.toggleConverted(),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: isWide
                  ? Row(
                      children: [
                        Expanded(flex: 4, child: conversationList()),
                        const SizedBox(width: 12),
                        Expanded(flex: 6, child: conversationDetail()),
                      ],
                    )
                  : Column(
                      children: [
                        Expanded(flex: 5, child: conversationList()),
                        const SizedBox(height: 8),
                        Expanded(flex: 5, child: conversationDetail()),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openLeadFromConversation(Conversation conversation) async {
    if (conversation.leadId != null) {
      if (!mounted) return;
      context.push('${RoutePaths.leadDetails}/${conversation.leadId!}');
      return;
    }
    final city = _extractLocation(conversation);
    if (!mounted) return;
    context.push(
      Uri(
        path: RoutePaths.addLead,
        queryParameters: {
          'name': conversation.customerName,
          'source': conversation.channel.label,
          'inquiry': conversation.lastMessagePreview,
          'conversationId': conversation.id,
          if (city.isNotEmpty && city != 'Unknown') 'city': city,
        },
      ).toString(),
    );
  }

  Future<void> _assignConversation(Conversation conversation, String userId) async {
    final inboxNotifier = ref.read(inboxStateProvider.notifier);
    try {
      await inboxNotifier.assignConversationAndLead(
        conversationId: conversation.id,
        userId: userId,
        leadId: conversation.leadId,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Assigned successfully.')));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to assign conversation.')));
    }
  }

  Future<void> _scheduleFollowUpFromConversation(Conversation conversation) async {
    final leadId = conversation.leadId;
    if (leadId == null) return;
    final appState = ref.read(appStateProvider);
    final lead = appState.leads.where((l) => l.id == leadId).firstOrNull;
    if (lead == null) return;

    final now = DateTime.now();
    final pickedDate = await showDatePicker(
      context: context,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
      initialDate: now,
    );
    if (pickedDate == null) return;
    if (!mounted) return;
    final pickedTime = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.now(),
    );
    if (pickedTime == null) return;
    if (!mounted) return;
    final noteCtrl = TextEditingController();
    final note = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Follow-up note'),
        content: TextField(
          controller: noteCtrl,
          decoration: const InputDecoration(hintText: 'Add follow-up note'),
          maxLines: 3,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, noteCtrl.text.trim()), child: const Text('Save')),
        ],
      ),
    );
    final dueAt = DateTime(
      pickedDate.year,
      pickedDate.month,
      pickedDate.day,
      pickedTime.hour,
      pickedTime.minute,
    );
    try {
      await ref.read(inboxStateProvider.notifier).scheduleFollowUpFromConversation(
            conversationId: conversation.id,
            leadId: lead.id,
            dueAt: dueAt,
            note: note?.isNotEmpty == true ? note : 'Scheduled from Inbox',
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Follow-up scheduled.')));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to schedule follow-up.')));
    }
  }

  Widget _leadStatusChip(
    Conversation conversation,
    LeadStatus status,
    String label, {
    bool disabled = false,
  }) {
    return ActionChip(
      label: Text(label),
      onPressed: disabled ? null : () => _setLeadStatusFromConversation(conversation, status),
    );
  }

  Future<void> _setLeadStatusFromConversation(Conversation conversation, LeadStatus status) async {
    final leadId = conversation.leadId;
    if (leadId == null) return;
    final appState = ref.read(appStateProvider);
    final lead = appState.leads.where((l) => l.id == leadId).firstOrNull;
    if (lead == null) return;
    try {
      await ref.read(inboxStateProvider.notifier).updateLeadStatusFromConversation(
            conversationId: conversation.id,
            leadId: lead.id,
            status: status,
          );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to update lead status.')));
    }
  }

  Widget _quickReplyChip(InboxNotifier notifier, String message) {
    return ActionChip(
      label: Text(message),
      onPressed: () async {
        _replyCtrl.text = message;
        _replyCtrl.selection = TextSelection.collapsed(offset: _replyCtrl.text.length);
        await notifier.sendReply(message);
        _replyCtrl.clear();
      },
    );
  }

  Future<AiAnalysisResult?> _resolveAiAnalysis(
    WidgetRef ref,
    Conversation conversation,
    List<UnifiedMessage> messages,
  ) async {
    final service = ref.read(aiIntentServiceProvider);
    return service.analyze(
      conversation: conversation,
      messages: messages,
    );
  }

  void _scrollMessagesToLatest({bool force = false}) {
    if (!_messageScrollController.hasClients) return;
    if (!force && !_isNearMessageBottom) return;
    _messageScrollController.animateTo(
      _messageScrollController.position.maxScrollExtent,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );
  }

  List<String> _fallbackReplies(BuyingIntent intent) {
    return switch (intent) {
      BuyingIntent.high => const [
          'Great timing. I can share our best package with delivery timeline now.',
          'Would you prefer full cash price or monthly installment options?',
          'If you share your area, I can send an exact quote in 5 minutes.',
        ],
      BuyingIntent.medium => const [
          'Thanks for your message. What setup size are you looking for?',
          'Please share your location and I can suggest a suitable option.',
          'Would you like a quick call or details over chat?',
        ],
      BuyingIntent.low => const [
          'Happy to help. Tell me your requirement and budget range.',
          'I can send a simple starter package if you like.',
          'Whenever you are ready, I can share updated prices.',
        ],
    };
  }

  String _fallbackSummary(Conversation conversation) {
    return 'Lead from ${conversation.channel.label} asking about ${conversation.lastMessagePreview.toLowerCase()}.';
  }

  String _extractLocation(Conversation conversation) {
    final metadata = conversation.sourceMetadata;
    final location = metadata['city'] ?? metadata['location'];
    if (location != null && location.toString().trim().isNotEmpty) {
      return location.toString().trim();
    }
    return 'Unknown';
  }

  String _priorityLabel(BuyingIntent intent) {
    return switch (intent) {
      BuyingIntent.high => 'Hot',
      BuyingIntent.medium => 'Warm',
      BuyingIntent.low => 'Cold',
    };
  }

  Color _priorityColor(BuyingIntent intent) {
    return switch (intent) {
      BuyingIntent.high => Colors.redAccent,
      BuyingIntent.medium => Colors.orange,
      BuyingIntent.low => Colors.blueGrey,
    };
  }

  String _stageLabel(InboxLeadStage stage) {
    return switch (stage) {
      InboxLeadStage.leadNew => 'New',
      InboxLeadStage.contacted => 'Contacted',
      InboxLeadStage.qualified => 'Qualified',
      InboxLeadStage.followUp => 'Follow-up',
      InboxLeadStage.converted => 'Converted',
      InboxLeadStage.closed => 'Closed',
    };
  }

  Color _stageColor(InboxLeadStage stage) {
    return switch (stage) {
      InboxLeadStage.leadNew => Colors.indigo,
      InboxLeadStage.contacted => Colors.blue,
      InboxLeadStage.qualified => Colors.green,
      InboxLeadStage.followUp => Colors.orange,
      InboxLeadStage.converted => Colors.teal,
      InboxLeadStage.closed => Colors.grey,
    };
  }
}
