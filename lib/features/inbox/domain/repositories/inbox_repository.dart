import '../entities/conversation.dart';
import '../entities/unified_message.dart';

abstract class InboxRepository {
  Future<List<Conversation>> fetchConversations();
  Stream<List<Conversation>> watchConversations();
  Future<List<UnifiedMessage>> fetchMessages(String conversationId);
  Stream<List<UnifiedMessage>> watchMessages(String conversationId);
  Future<void> sendMessage({
    required String conversationId,
    required String text,
    String? clientMessageId,
  });
  Future<void> retryMessage(String messageId);
  Future<void> linkLead(String conversationId, String leadId);
  Future<void> assignConversation(String conversationId, String userId);
  Future<void> updateConversationStage(String conversationId, InboxLeadStage stage);
  Future<void> updateLeadStatus(String leadId, String status);
}
