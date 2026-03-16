class InboxEndpoints {
  static const conversations = '/api/conversations';
  static const messages = '/api/conversations/:id/messages';
  static const sendMessage = '/api/messages/send';
  static const createLeadFromMessage = '/api/leads/create-from-message';
  static const createLeadFromComment = '/api/comments/create-lead';
  static const assignLead = '/api/leads/:id/assign';
  static const updateLeadStatus = '/api/leads/:id/status';
}

class SendMessageRequest {
  const SendMessageRequest({
    required this.conversationId,
    required this.text,
  });

  final String conversationId;
  final String text;

  Map<String, dynamic> toMap() => {
        'conversationId': conversationId,
        'text': text,
      };
}
