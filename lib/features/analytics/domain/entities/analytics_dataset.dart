import '../../../../data/models/activity.dart';
import '../../../../data/models/app_user.dart';
import '../../../../data/models/follow_up.dart';
import '../../../../data/models/lead.dart';
import '../../../inbox/domain/entities/conversation.dart';
import '../../../inbox/domain/entities/unified_message.dart';

class AnalyticsDataset {
  const AnalyticsDataset({
    required this.leads,
    required this.followUps,
    required this.activities,
    required this.conversations,
    required this.messages,
    required this.team,
  });

  final List<Lead> leads;
  final List<FollowUp> followUps;
  final List<Activity> activities;
  final List<Conversation> conversations;
  final List<UnifiedMessage> messages;
  final List<AppUser> team;
}
