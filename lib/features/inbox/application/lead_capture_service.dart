import 'package:uuid/uuid.dart';

import '../../../data/models/app_user.dart';
import '../../../data/models/lead.dart';
import '../domain/entities/conversation.dart';

class LeadCaptureResult {
  const LeadCaptureResult({
    required this.lead,
    required this.created,
  });

  final Lead lead;
  final bool created;
}

class LeadCaptureService {
  LeadCaptureResult fromConversation({
    required Conversation conversation,
    required List<Lead> existingLeads,
    required AppUser currentUser,
  }) {
    Lead? existingLead;
    if (conversation.customerPhone != null && conversation.customerPhone!.isNotEmpty) {
      existingLead = existingLeads.where((l) => l.phone == conversation.customerPhone).cast<Lead?>().firstOrNull;
    }
    existingLead ??= existingLeads
        .where((l) => l.sourceMetadata['externalUserId']?.toString() == conversation.externalUserId)
        .cast<Lead?>()
        .firstOrNull;

    if (existingLead != null) {
      return LeadCaptureResult(lead: existingLead, created: false);
    }

    final lead = Lead(
      id: const Uuid().v4(),
      businessId: currentUser.businessId,
      customerName: conversation.customerName,
      phone: conversation.customerPhone ?? 'N/A',
      city: 'Karachi',
      address: 'Captured from ${conversation.channel.label}',
      source: conversation.channel.label,
      productInterest: 'General Inquiry',
      budget: 'Unknown',
      inquiryText: conversation.lastMessagePreview,
      status: LeadStatus.leadNew,
      temperature: conversation.intent == BuyingIntent.high ? LeadTemperature.hot : LeadTemperature.warm,
      assignedTo: conversation.assignedTo ?? currentUser.id,
      createdBy: currentUser.id,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
      notesSummary: 'Created from unified inbox conversation.',
      sourceMetadata: {
        'channel': conversation.channel.name,
        'externalUserId': conversation.externalUserId,
        'externalConversationId': conversation.externalConversationId,
      },
      isArchived: false,
      isDeleted: false,
    );
    return LeadCaptureResult(lead: lead, created: true);
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
