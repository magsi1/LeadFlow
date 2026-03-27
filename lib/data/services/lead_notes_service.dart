import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/lead_note.dart';

/// Supabase realtime + CRUD for `lead_notes` (RLS must allow select/insert by user).
class LeadNotesService {
  LeadNotesService({SupabaseClient? client})
      : _client = client ?? Supabase.instance.client;

  final SupabaseClient _client;

  /// Realtime stream of notes for [leadId], oldest first.
  Stream<List<LeadNote>> streamNotes(String leadId) {
    return _client
        .from('lead_notes')
        .stream(primaryKey: ['id'])
        .eq('lead_id', leadId)
        .order('created_at', ascending: true)
        .map(
          (rows) => rows
              .map((e) => LeadNote.fromJson(Map<String, dynamic>.from(e)))
              .toList(),
        );
  }

  Future<void> addNote({
    required String leadId,
    required String content,
  }) async {
    final user = _client.auth.currentUser;
    if (user == null) {
      throw Exception('User not authenticated');
    }
    final trimmed = content.trim();
    if (trimmed.isEmpty) {
      return;
    }

    await _client.from('lead_notes').insert(<String, dynamic>{
      'lead_id': leadId,
      'user_id': user.id,
      'content': trimmed,
      'created_at': DateTime.now().toUtc().toIso8601String(),
    });
  }
}
