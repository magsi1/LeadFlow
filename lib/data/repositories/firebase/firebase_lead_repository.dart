import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/activity.dart';
import '../../models/follow_up.dart';
import '../../models/lead.dart';
import '../lead_repository.dart';

class FirebaseLeadRepository implements LeadRepository {
  FirebaseLeadRepository(this._firestore);
  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _leadsRef => _firestore.collection('leads');
  CollectionReference<Map<String, dynamic>> get _activitiesRef => _firestore.collection('activities');
  CollectionReference<Map<String, dynamic>> get _followUpsRef => _firestore.collection('followups');

  @override
  Stream<void> watchDataChanges() => const Stream.empty();

  @override
  Future<void> addActivity(Activity activity) async {
    await _activitiesRef.doc(activity.id).set({
      'id': activity.id,
      'leadId': activity.leadId,
      'type': activity.type,
      'message': activity.message,
      'performedBy': activity.performedBy,
      'createdAt': activity.createdAt.toIso8601String(),
      'metadata': activity.metadata,
    });
  }

  @override
  Future<List<Activity>> fetchActivities() async {
    final snap = await _activitiesRef.orderBy('createdAt', descending: true).get();
    return snap.docs
        .map(
          (d) => Activity(
            id: d['id'] as String,
            leadId: d['leadId'] as String,
            type: d['type'] as String,
            message: d['message'] as String,
            performedBy: d['performedBy'] as String,
            createdAt: DateTime.tryParse(d['createdAt']?.toString() ?? '') ?? DateTime.now(),
            metadata: (d['metadata'] as Map<String, dynamic>?) ?? const {},
          ),
        )
        .toList();
  }

  @override
  Future<List<FollowUp>> fetchFollowUps() async {
    final snap = await _followUpsRef.orderBy('dueAt').get();
    return snap.docs
        .map(
          (d) => FollowUp(
            id: d['id'] as String,
            leadId: d['leadId'] as String,
            assignedTo: d['assignedTo'] as String,
            dueAt: DateTime.tryParse(d['dueAt']?.toString() ?? '') ?? DateTime.now(),
            completed: d['completed'] as bool? ?? false,
            lastNote: d['lastNote'] as String? ?? '',
          ),
        )
        .toList();
  }

  @override
  Future<List<Lead>> fetchLeads() async {
    final snap = await _leadsRef.orderBy('createdAt', descending: true).get();
    return snap.docs.map((d) => Lead.fromMap(d.data())).toList();
  }

  @override
  Future<Lead> saveLead(Lead lead) async {
    await _leadsRef.doc(lead.id).set(lead.toMap());
    return lead;
  }

  @override
  Future<void> saveFollowUp(FollowUp followUp) async {
    await _followUpsRef.doc(followUp.id).set({
      'id': followUp.id,
      'leadId': followUp.leadId,
      'assignedTo': followUp.assignedTo,
      'dueAt': followUp.dueAt.toIso8601String(),
      'completed': followUp.completed,
      'lastNote': followUp.lastNote,
    });
  }

  @override
  Future<void> resetDemoData() async {
    // Firebase mode should not reset production/live data through the demo action.
  }
}
