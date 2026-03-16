import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

class FirebaseService {
  static bool _initialized = false;

  static Future<void> initialize() async {
    if (_initialized) return;
    try {
      debugPrint('[LeadFlow] Firebase init attempt');
      await Firebase.initializeApp();
      _initialized = true;
      debugPrint('[LeadFlow] Firebase initialized');
    } catch (e) {
      // Firebase might not be configured yet during local demo preview.
      _initialized = false;
      debugPrint('[LeadFlow] Firebase unavailable, using demo mode: $e');
    }
  }
}
