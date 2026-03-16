import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:async';

import '../../../core/utils/iterable_extensions.dart';
import '../../../data/models/lead.dart';
import '../../app_state/providers.dart';
import '../../inbox/domain/entities/conversation.dart';
import '../../inbox/domain/entities/unified_message.dart';
import '../../inbox/domain/repositories/inbox_repository.dart';
import '../../../shared/models/channel_type.dart';
import 'inbox_state.dart';

class InboxNotifier extends StateNotifier<InboxState> {
  InboxNotifier(this._ref, this._repository) : super(const InboxState());

  final Ref _ref;
  final InboxRepository _repository;
  int _selectionRequestToken = 0;
  StreamSubscription<List<Conversation>>? _conversationsSubscription;
  StreamSubscription<List<UnifiedMessage>>? _messagesSubscription;
  String? _messagesConversationId;

  Future<void> load() async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final conversations = await _repository.fetchConversations();
      final existingSelection = state.selectedConversationId;
      final stillExists =
          existingSelection != null && conversations.any((c) => c.id == existingSelection);
      final fallbackSelection = conversations.isEmpty ? null : conversations.first.id;
      final resolvedSelection = stillExists ? existingSelection : fallbackSelection;
      state = state.copyWith(
        conversations: conversations,
        selectedConversationId: resolvedSelection,
        clearSelectedConversation: resolvedSelection == null,
        loading: false,
      );
      if (resolvedSelection != null) {
        await selectConversation(resolvedSelection);
      }
      _bindConversationsStream();
    } catch (e) {
      state = state.copyWith(loading: false, error: e.toString());
    }
  }

  Future<void> selectConversation(String id) async {
    final requestToken = ++_selectionRequestToken;
    state = state.copyWith(selectedConversationId: id);
    final messages = await _repository.fetchMessages(id);
    if (requestToken != _selectionRequestToken || state.selectedConversationId != id) return;
    state = state.copyWith(messages: _dedupeMessages(messages));
    _bindMessagesStream(id);
  }

  Future<void> sendReply(String text) async {
    final conversationId = state.selectedConversationId;
    final trimmed = text.trim();
    if (conversationId == null || trimmed.isEmpty) return;

    final now = DateTime.now();
    final idx = state.conversations.indexWhere((c) => c.id == conversationId);
    if (idx < 0) return;
    final selectedConversation = state.conversations[idx];

    final optimisticMessage = UnifiedMessage(
      id: 'local_${now.microsecondsSinceEpoch}',
      conversationId: conversationId,
      channel: selectedConversation.channel,
      externalMessageId: 'local_ext_${now.microsecondsSinceEpoch}',
      externalUserId: 'leadflow_agent',
      senderName: 'LeadFlow Agent',
      text: trimmed,
      createdAt: now,
      direction: 'outgoing',
      status: 'pending',
    );

    final updatedConversations = state.conversations
        .map((c) => c.id == conversationId ? c.copyWith(lastMessagePreview: trimmed, lastMessageAt: now) : c)
        .toList();
    state = state.copyWith(
      conversations: updatedConversations,
      messages: [...state.messages, optimisticMessage],
    );

    try {
      await _repository.sendMessage(conversationId: conversationId, text: trimmed);
      final selectedConversationNow = state.conversations.where((c) => c.id == conversationId).firstOrNull;
      await _ref.read(appStateProvider.notifier).logActivity(
            type: 'message_sent',
            message: trimmed,
            leadId: selectedConversationNow?.leadId,
            metadata: {'conversationId': conversationId},
          );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> assignConversation(String conversationId, String userId) async {
    await _runAction(() async {
      await _repository.assignConversation(conversationId, userId);
      await load();
    });
  }

  Future<void> linkLead(String conversationId, String leadId) async {
    await _runAction(() async {
      await _repository.linkLead(conversationId, leadId);
      await load();
    });
  }

  Future<void> setStage(String conversationId, InboxLeadStage stage) async {
    await _runAction(() async {
      await _repository.updateConversationStage(conversationId, stage);
      await load();
    });
  }

  Future<void> saveLeadFromConversation({
    required Lead lead,
    required bool isNew,
    required String conversationId,
  }) async {
    await _runAction(() async {
      await _ref.read(appStateProvider.notifier).saveLead(lead, isNew: isNew);
      await _repository.linkLead(conversationId, lead.id);
      await _repository.updateConversationStage(conversationId, InboxLeadStage.contacted);
      await _ref.read(appStateProvider.notifier).logActivity(
            type: 'conversation_converted',
            message: 'Conversation converted to lead',
            leadId: lead.id,
            metadata: {'conversationId': conversationId},
          );
      await load();
    });
  }

  Future<void> assignConversationAndLead({
    required String conversationId,
    required String userId,
    String? leadId,
  }) async {
    await _runAction(() async {
      await _repository.assignConversation(conversationId, userId);
      if (leadId != null) {
        final appState = _ref.read(appStateProvider);
        final lead = appState.leads.where((l) => l.id == leadId).cast<Lead?>().firstOrNull;
        if (lead != null) {
          await _ref.read(appStateProvider.notifier).assignLead(lead, userId);
        }
      }
      await _ref.read(appStateProvider.notifier).logActivity(
            type: 'conversation_assigned',
            message: 'Conversation assigned to $userId',
            leadId: leadId,
            metadata: {'conversationId': conversationId},
          );
      await load();
    });
  }

  Future<void> updateLeadStatusFromConversation({
    required String conversationId,
    required String leadId,
    required LeadStatus status,
  }) async {
    await _runAction(() async {
      final appState = _ref.read(appStateProvider);
      final lead = appState.leads.where((l) => l.id == leadId).cast<Lead?>().firstOrNull;
      if (lead == null) return;
      await _ref.read(appStateProvider.notifier).changeLeadStatus(lead, status);
      await _repository.updateConversationStage(conversationId, _stageFromLeadStatus(status));
      await load();
    });
  }

  Future<void> scheduleFollowUpFromConversation({
    required String conversationId,
    required String leadId,
    required DateTime dueAt,
    String? note,
  }) async {
    await _runAction(() async {
      final appState = _ref.read(appStateProvider);
      final lead = appState.leads.where((l) => l.id == leadId).cast<Lead?>().firstOrNull;
      if (lead == null) return;
      await _ref.read(appStateProvider.notifier).scheduleFollowUp(lead, dueAt, note: note);
      await _repository.updateConversationStage(conversationId, InboxLeadStage.followUp);
      await load();
    });
  }

  void setSearch(String value) => state = state.copyWith(search: value);

  void setChannelFilter(ChannelType? channel) =>
      state = state.copyWith(selectedChannel: channel, clearSelectedChannel: channel == null);

  void toggleUnassigned() => state = state.copyWith(onlyUnassigned: !state.onlyUnassigned);
  void toggleHot() => state = state.copyWith(onlyHot: !state.onlyHot);
  void toggleFollowUpDue() => state = state.copyWith(onlyFollowUpDue: !state.onlyFollowUpDue);
  void toggleConverted() => state = state.copyWith(onlyConverted: !state.onlyConverted);

  void _bindConversationsStream() {
    _conversationsSubscription?.cancel();
    _conversationsSubscription = _repository.watchConversations().listen((items) {
      final conversations = _dedupeConversations(items);
      final selectedId = state.selectedConversationId;
      final exists = selectedId != null && conversations.any((c) => c.id == selectedId);
      final nextSelected = exists ? selectedId : (conversations.isNotEmpty ? conversations.first.id : null);
      state = state.copyWith(
        conversations: conversations,
        selectedConversationId: nextSelected,
        clearSelectedConversation: nextSelected == null,
      );
      if (nextSelected != null) {
        _bindMessagesStream(nextSelected);
      }
    });
  }

  void _bindMessagesStream(String conversationId) {
    if (_messagesConversationId == conversationId && _messagesSubscription != null) return;
    _messagesSubscription?.cancel();
    _messagesConversationId = conversationId;
    _messagesSubscription = _repository.watchMessages(conversationId).listen((items) {
      if (state.selectedConversationId != conversationId) return;
      state = state.copyWith(messages: _dedupeMessages(items));
    });
  }

  Future<void> _runAction(Future<void> Function() task) async {
    state = state.copyWith(actionLoading: true, clearError: true);
    try {
      await task();
    } catch (e) {
      state = state.copyWith(error: e.toString());
      rethrow;
    } finally {
      state = state.copyWith(actionLoading: false);
    }
  }

  InboxLeadStage _stageFromLeadStatus(LeadStatus status) {
    return switch (status) {
      LeadStatus.leadNew => InboxLeadStage.leadNew,
      LeadStatus.contacted => InboxLeadStage.contacted,
      LeadStatus.interested || LeadStatus.negotiation => InboxLeadStage.qualified,
      LeadStatus.followUpNeeded => InboxLeadStage.followUp,
      LeadStatus.closedWon => InboxLeadStage.converted,
      LeadStatus.closedLost => InboxLeadStage.closed,
    };
  }

  List<Conversation> _dedupeConversations(List<Conversation> items) {
    final map = <String, Conversation>{};
    for (final item in items) {
      map[item.id] = item;
    }
    final list = map.values.toList()..sort((a, b) => b.lastMessageAt.compareTo(a.lastMessageAt));
    return list;
  }

  List<UnifiedMessage> _dedupeMessages(List<UnifiedMessage> items) {
    final map = <String, UnifiedMessage>{};
    for (final item in items) {
      map[item.id] = item;
    }
    final list = map.values.toList()..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return list;
  }

  @override
  void dispose() {
    _messagesSubscription?.cancel();
    _conversationsSubscription?.cancel();
    _messagesConversationId = null;
    super.dispose();
  }
}
