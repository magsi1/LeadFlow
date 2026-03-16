import '../models/activity.dart';
import '../models/follow_up.dart';
import '../models/lead.dart';

abstract class LeadRepository {
  Future<List<Lead>> fetchLeads();
  Future<List<Activity>> fetchActivities();
  Future<List<FollowUp>> fetchFollowUps();
  Stream<void> watchDataChanges();
  Future<Lead> saveLead(Lead lead);
  Future<void> addActivity(Activity activity);
  Future<void> saveFollowUp(FollowUp followUp);
  Future<void> resetDemoData();
}
