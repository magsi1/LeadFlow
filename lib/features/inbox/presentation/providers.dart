import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/backend_providers.dart';
import '../../../data/services/supabase_service.dart';
import '../../../core/utils/iterable_extensions.dart';
import '../../inbox/data/repositories/mock_inbox_repository.dart';
import '../../inbox/data/repositories/remote_inbox_repository.dart';
import '../../inbox/data/repositories/supabase_inbox_repository.dart';
import '../../inbox/data/services/mock_ai_intent_service.dart';
import '../../inbox/domain/entities/conversation.dart';
import '../../inbox/domain/repositories/inbox_repository.dart';
import '../../inbox/domain/services/ai_intent_service.dart';
import 'inbox_notifier.dart';
import 'inbox_state.dart';

final inboxRepositoryProvider = Provider<InboxRepository>((ref) {
  if (AppConfig.demoModeEnabled) return MockInboxRepository();
  if (AppConfig.wantsSupabase && !AppConfig.isSupabaseConfigured) return MockInboxRepository();
  final supabaseClient = SupabaseService.client;
  if (AppConfig.useSupabase && supabaseClient != null) {
    return SupabaseInboxRepository(supabaseClient);
  }
  return RemoteInboxRepository(ref.watch(backendApiClientProvider));
});

final aiIntentServiceProvider = Provider<AiIntentService>((ref) {
  return MockAiIntentService();
});

final inboxStateProvider = StateNotifierProvider<InboxNotifier, InboxState>((ref) {
  final notifier = InboxNotifier(ref, ref.watch(inboxRepositoryProvider));
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
        (c.customerHandle ?? '').toLowerCase().contains(q) ||
        c.lastMessagePreview.toLowerCase().contains(q) ||
        c.channel.label.toLowerCase().contains(q) ||
        (c.sourceMetadata['city']?.toString().toLowerCase().contains(q) ?? false));
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
