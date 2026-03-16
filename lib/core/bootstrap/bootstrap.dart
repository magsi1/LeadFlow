import '../../data/services/firebase_service.dart';
import '../../data/services/notification_service.dart';
import '../../data/services/supabase_service.dart';

Future<void> bootstrap() async {
  await SupabaseService.initialize().timeout(
    const Duration(seconds: 4),
    onTimeout: () {
      // Continue startup in demo/remote mode if Supabase takes too long.
    },
  );

  await FirebaseService.initialize().timeout(
    const Duration(seconds: 4),
    onTimeout: () {
      // Continue startup in demo mode if Firebase takes too long.
    },
  );

  // Notifications are best-effort and should never block app startup.
  NotificationService.initialize();
}
