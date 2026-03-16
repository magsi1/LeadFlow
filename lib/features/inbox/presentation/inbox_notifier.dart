import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../inbox/domain/entities/conversation.dart';
import '../../inbox/domain/repositories/inbox_repository.dart';
import '../../../shared/models/channel_type.dart';
import 'inbox_state.dart';

class InboxNotifier extends StateNotifier<InboxState> {
  InboxNotifier(this._repository) : super(const InboxState());

  final InboxRepository _repository;

  Future<void> load() async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final conversations = await _repository.fetchConversations();
      state = state.copyWith(
        conversations: conversations,
        loading: false,
      );
      if (conversations.isNotEmpty && state.selectedConversationId == null) {
        await selectConversation(conversations.first.id);
      }
    } catch (e) {
      state = state.copyWith(loading: false, error: e.toString());
    }
  }

  Future<void> selectConversation(String id) async {
    final messages = await _repository.fetchMessages(id);
    state = state.copyWith(selectedConversationId: id, messages: messages);
  }

  Future<void> sendReply(String text) async {
    if (state.selectedConversationId == null || text.trim().isEmpty) return;
    await _repository.sendMessage(conversationId: state.selectedConversationId!, text: text.trim());
    await selectConversation(state.selectedConversationId!);
    await load();
  }

  Future<void> assignConversation(String conversationId, String userId) async {
    await _repository.assignConversation(conversationId, userId);
    await load();
  }

  Future<void> linkLead(String conversationId, String leadId) async {
    await _repository.linkLead(conversationId, leadId);
    await load();
  }

  Future<void> setStage(String conversationId, InboxLeadStage stage) async {
    await _repository.updateConversationStage(conversationId, stage);
    await load();
  }

  void setSearch(String value) => state = state.copyWith(search: value);

  void setChannelFilter(ChannelType? channel) =>
      state = state.copyWith(selectedChannel: channel, clearSelectedChannel: channel == null);

  void toggleUnassigned() => state = state.copyWith(onlyUnassigned: !state.onlyUnassigned);
  void toggleHot() => state = state.copyWith(onlyHot: !state.onlyHot);
  void toggleFollowUpDue() => state = state.copyWith(onlyFollowUpDue: !state.onlyFollowUpDue);
  void toggleConverted() => state = state.copyWith(onlyConverted: !state.onlyConverted);
}
