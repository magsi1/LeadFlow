import '../../../../core/config/app_config.dart';
import '../../domain/entities/conversation.dart';
import '../../domain/entities/unified_message.dart';
import '../../domain/services/ai_intent_service.dart';

class MockAiIntentService implements AiIntentService {
  @override
  Future<AiAnalysisResult?> analyze({
    required Conversation conversation,
    required List<UnifiedMessage> messages,
  }) async {
    if (!AppConfig.aiModeEnabled || AppConfig.openAiApiKey.isEmpty) {
      return null;
    }
    final latest = messages.isEmpty ? conversation.lastMessagePreview : messages.last.text;
    final intent = latest.toLowerCase().contains('urgent') ? BuyingIntent.high : BuyingIntent.medium;
    return AiAnalysisResult(
      intent: intent,
      summary: 'Customer asks about pricing and timeline from ${conversation.channel.label}.',
      suggestedReplies: const [
        'Thanks for reaching out. Can I share a quick quote with warranty details?',
        'Would you like a call today, or should I send options over chat?',
      ],
    );
  }
}
