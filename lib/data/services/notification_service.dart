import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

class NotificationService {
  static final FirebaseMessaging _messaging = FirebaseMessaging.instance;

  static Future<void> initialize() async {
    try {
      debugPrint('[LeadFlow] Notification init attempt');
      await _messaging.requestPermission().timeout(const Duration(seconds: 3));
      await _messaging.getToken().timeout(const Duration(seconds: 3));
      debugPrint('[LeadFlow] Notification init complete');
    } catch (e) {
      // Keep app functional when FCM is not configured.
      debugPrint('[LeadFlow] Notification init skipped: $e');
    }
  }
}
