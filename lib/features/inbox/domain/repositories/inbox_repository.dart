import '../entities/conversation.dart';
import '../entities/unified_message.dart';

abstract class InboxRepository {
  Future<List<Conversation>> fetchConversations();
  Future<List<UnifiedMessage>> fetchMessages(String conversationId);
  Future<void> sendMessage({required String conversationId, required String text});
  Future<void> linkLead(String conversationId, String leadId);
  Future<void> assignConversation(String conversationId, String userId);
  Future<void> updateConversationStage(String conversationId, InboxLeadStage stage);
}
