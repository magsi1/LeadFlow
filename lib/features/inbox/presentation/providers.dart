import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/iterable_extensions.dart';
import '../../inbox/data/repositories/mock_inbox_repository.dart';
import '../../inbox/data/services/mock_ai_intent_service.dart';
import '../../inbox/domain/entities/conversation.dart';
import '../../inbox/domain/repositories/inbox_repository.dart';
import '../../inbox/domain/services/ai_intent_service.dart';
import 'inbox_notifier.dart';
import 'inbox_state.dart';

final inboxRepositoryProvider = Provider<InboxRepository>((ref) {
  return MockInboxRepository();
});

final aiIntentServiceProvider = Provider<AiIntentService>((ref) {
  return MockAiIntentService();
});

final inboxStateProvider = StateNotifierProvider<InboxNotifier, InboxState>((ref) {
  final notifier = InboxNotifier(ref.watch(inboxRepositoryProvider));
  notifier.load();
  return notifier;
});

final visibleConversationsProvider = Provider<List<Conversation>>((ref) {
  final state = ref.watch(inboxStateProvider);
  Iterable<Conversation> list = state.conversations;
  if (state.selectedChannel != null) {
    list = list.where((c) => c.channel == state.selectedChannel);
  }
  if (state.search.trim().isNotEmpty) {
    final q = state.search.toLowerCase();
    list = list.where((c) =>
        c.customerName.toLowerCase().contains(q) ||
        (c.customerPhone ?? '').toLowerCase().contains(q) ||
        c.lastMessagePreview.toLowerCase().contains(q));
  }
  if (state.onlyUnassigned) list = list.where((c) => c.assignedTo == null);
  if (state.onlyHot) list = list.where((c) => c.intent == BuyingIntent.high);
  if (state.onlyFollowUpDue) {
    list = list.where((c) => c.stage == InboxLeadStage.followUp || c.stage == InboxLeadStage.qualified);
  }
  if (state.onlyConverted) list = list.where((c) => c.stage == InboxLeadStage.converted);
  final sorted = list.toList()..sort((a, b) => b.lastMessageAt.compareTo(a.lastMessageAt));
  return sorted;
});

final selectedConversationProvider = Provider<Conversation?>((ref) {
  final state = ref.watch(inboxStateProvider);
  if (state.selectedConversationId == null) return null;
  return state.conversations.where((c) => c.id == state.selectedConversationId).cast<Conversation?>().firstOrNull;
});
