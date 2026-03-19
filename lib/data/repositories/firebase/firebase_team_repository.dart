import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/app_user.dart';
import '../team_repository.dart';

class FirebaseTeamRepository implements TeamRepository {
  FirebaseTeamRepository(this._firestore);
  final FirebaseFirestore _firestore;

  @override
  Future<List<AppUser>> fetchTeam({String? workspaceId}) async {
    final snap = await _firestore.collection('users').get();
    return snap.docs.map((d) => AppUser.fromMap(d.data())).toList();
  }
}
