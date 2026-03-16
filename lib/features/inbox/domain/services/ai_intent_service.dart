import '../entities/conversation.dart';
import '../entities/unified_message.dart';

class AiAnalysisResult {
  const AiAnalysisResult({
    required this.intent,
    required this.summary,
    required this.suggestedReplies,
  });

  final BuyingIntent intent;
  final String summary;
  final List<String> suggestedReplies;
}

abstract class AiIntentService {
  Future<AiAnalysisResult?> analyze({
    required Conversation conversation,
    required List<UnifiedMessage> messages,
  });
}
