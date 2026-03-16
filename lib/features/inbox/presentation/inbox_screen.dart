import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/route_paths.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/iterable_extensions.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../shared/models/channel_type.dart';
import '../../app_state/providers.dart';
import '../application/lead_capture_service.dart';
import '../../inbox/domain/entities/conversation.dart';
import '../../inbox/presentation/providers.dart';

class InboxScreen extends ConsumerStatefulWidget {
  const InboxScreen({super.key});

  @override
  ConsumerState<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends ConsumerState<InboxScreen> {
  final _searchCtrl = TextEditingController();
  final _replyCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    _replyCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final inboxState = ref.watch(inboxStateProvider);
    final notifier = ref.read(inboxStateProvider.notifier);
    final conversations = ref.watch(visibleConversationsProvider);
    final selected = ref.watch(selectedConversationProvider);
    final appState = ref.watch(appStateProvider);
    final isWide = MediaQuery.sizeOf(context).width >= 1000;

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
      return Column(
        children: [
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
                      ],
                    ),
                  ),
                  OutlinedButton(
                    onPressed: () => _convertToLead(selected),
                    child: Text(selected.leadId == null ? 'Create Lead' : 'Open Lead'),
                  ),
                  const SizedBox(width: 8),
                  PopupMenuButton<InboxLeadStage>(
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
                onPressed: () async {
                  await notifier.sendReply(_replyCtrl.text);
                  _replyCtrl.clear();
                },
                child: const Text('Send'),
              ),
            ],
          ),
        ],
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

  Future<void> _convertToLead(Conversation conversation) async {
    final appState = ref.read(appStateProvider);
    final notifier = ref.read(appStateProvider.notifier);
    final inboxNotifier = ref.read(inboxStateProvider.notifier);
    final captureService = LeadCaptureService();
    final currentUser = appState.currentUser;
    if (currentUser == null) return;

    if (conversation.leadId != null) {
      if (!mounted) return;
      context.push('${RoutePaths.leadDetails}/${conversation.leadId!}');
      return;
    }

    final result = captureService.fromConversation(
      conversation: conversation,
      existingLeads: appState.leads,
      currentUser: currentUser,
    );

    if (!result.created) {
      await inboxNotifier.linkLead(conversation.id, result.lead.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Existing lead linked.')));
      return;
    }

    await notifier.saveLead(result.lead, isNew: true);
    await inboxNotifier.linkLead(conversation.id, result.lead.id);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Lead created from conversation.')));
  }
}
