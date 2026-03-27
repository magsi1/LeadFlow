import 'dart:developer' as developer;

import '../data/models/dashboard_lead.dart';
import '../data/services/supabase_dashboard_service.dart';
import 'whatsapp_service.dart';

/// In-memory guard so overlapping [checkAndSendFollowUps] ticks don't double-send.
final Set<String> _followUpInFlight = <String>{};

class FollowUpService {
  FollowUpService._();

  /// Sends the automated follow-up via [WhatsAppService.sendWhatsAppMessage].
  static Future<void> sendAutoWhatsApp(DashboardLead lead) async {
    final digits = WhatsAppService.normalizePhoneForApi(lead.phone);
    if (digits.isEmpty) {
      developer.log(
        'sendAutoWhatsApp: skip (no phone) lead=${lead.id}',
        name: 'FollowUpService',
      );
      throw StateError('No phone number for lead ${lead.id}');
    }

    final name = lead.name.trim().isEmpty ? 'there' : lead.name.trim();
    final message =
        "Hi $name, just following up on my previous message. Let me know if you're interested.";

    final result = await WhatsAppService.sendWhatsAppMessage(
      phone: lead.phone,
      message: message,
    );

    developer.log(
      'sendAutoWhatsApp: HTTP ${result.statusCode} for lead=${lead.id}',
      name: 'FollowUpService',
    );
  }

  /// Scans assigned leads and sends due follow-ups (status `follow_up`, time reached, not sent).
  static Future<void> checkAndSendFollowUps() async {
    List<DashboardLead> leads;
    try {
      leads = await SupabaseDashboardService.fetchDashboardLeads();
    } catch (e, st) {
      developer.log(
        'checkAndSendFollowUps: fetch failed: $e',
        name: 'FollowUpService',
        error: e,
        stackTrace: st,
      );
      return;
    }

    final now = DateTime.now();

    for (final lead in leads) {
      if (lead.status.toLowerCase().trim() != 'follow_up') continue;
      if (lead.followUpTime == null) continue;
      if (lead.followUpSent) continue;
      if (now.isBefore(lead.followUpTime!)) continue;
      if (_followUpInFlight.contains(lead.id)) continue;

      _followUpInFlight.add(lead.id);
      try {
        await sendAutoWhatsApp(lead);
        await SupabaseDashboardService.markFollowUpSent(lead.id);
        developer.log(
          'checkAndSendFollowUps: marked follow_up_sent for lead=${lead.id}',
          name: 'FollowUpService',
        );
      } catch (e, st) {
        developer.log(
          'checkAndSendFollowUps: error lead=${lead.id}: $e',
          name: 'FollowUpService',
          error: e,
          stackTrace: st,
        );
      } finally {
        _followUpInFlight.remove(lead.id);
      }
    }
  }
}
