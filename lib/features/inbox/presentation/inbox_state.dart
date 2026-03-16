import '../../../../shared/models/channel_type.dart';
import '../domain/entities/conversation.dart';
import '../domain/entities/unified_message.dart';

class InboxState {
  const InboxState({
    this.conversations = const [],
    this.messages = const [],
    this.selectedChannel,
    this.selectedConversationId,
    this.search = '',
    this.onlyUnassigned = false,
    this.onlyHot = false,
    this.onlyFollowUpDue = false,
    this.onlyConverted = false,
    this.loading = false,
    this.actionLoading = false,
    this.error,
  });

  final List<Conversation> conversations;
  final List<UnifiedMessage> messages;
  final ChannelType? selectedChannel;
  final String? selectedConversationId;
  final String search;
  final bool onlyUnassigned;
  final bool onlyHot;
  final bool onlyFollowUpDue;
  final bool onlyConverted;
  final bool loading;
  final bool actionLoading;
  final String? error;

  InboxState copyWith({
    List<Conversation>? conversations,
    List<UnifiedMessage>? messages,
    ChannelType? selectedChannel,
    bool clearSelectedChannel = false,
    String? selectedConversationId,
    bool clearSelectedConversation = false,
    String? search,
    bool? onlyUnassigned,
    bool? onlyHot,
    bool? onlyFollowUpDue,
    bool? onlyConverted,
    bool? loading,
    bool? actionLoading,
    String? error,
    bool clearError = false,
  }) {
    return InboxState(
      conversations: conversations ?? this.conversations,
      messages: messages ?? this.messages,
      selectedChannel: clearSelectedChannel ? null : selectedChannel ?? this.selectedChannel,
      selectedConversationId:
          clearSelectedConversation ? null : selectedConversationId ?? this.selectedConversationId,
      search: search ?? this.search,
      onlyUnassigned: onlyUnassigned ?? this.onlyUnassigned,
      onlyHot: onlyHot ?? this.onlyHot,
      onlyFollowUpDue: onlyFollowUpDue ?? this.onlyFollowUpDue,
      onlyConverted: onlyConverted ?? this.onlyConverted,
      loading: loading ?? this.loading,
      actionLoading: actionLoading ?? this.actionLoading,
      error: clearError ? null : error ?? this.error,
    );
  }
}
