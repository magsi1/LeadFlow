import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/api_lead.dart';

class LeadsApiService {
  LeadsApiService({http.Client? client})
      : _client = client ?? http.Client();

  static const String _baseUrl =
      'https://leadflow-production-7103.up.railway.app';
  final http.Client _client;

  String _requireUserId() {
    final uid = Supabase.instance.client.auth.currentUser?.id;
    if (uid == null || uid.isEmpty) {
      throw Exception('User not logged in');
    }
    return uid;
  }

  /// Unwraps `{ ok: true, data: T }` (HTTP body is like axios `response.data`; list/single payload is `data`).
  Map<String, dynamic> _parseEnvelope(
    String body, {
    String fallbackError = 'Request failed',
  }) {
    final decoded = jsonDecode(body) as Map<String, dynamic>;
    if (decoded['ok'] != true) {
      throw Exception((decoded['error'] ?? fallbackError).toString());
    }
    return decoded;
  }

  Future<List<ApiLead>> fetchLeads() async {
    final userId = _requireUserId();
    final uri = Uri.parse(
      '$_baseUrl/api/leads?user_id=${Uri.encodeQueryComponent(userId)}',
    );
    final response = await _client.get(uri);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Failed to fetch leads (${response.statusCode})');
    }

    final envelope = _parseEnvelope(
      response.body,
      fallbackError: 'Failed to fetch leads',
    );
    final data = envelope['data'];
    if (data is! List) {
      return <ApiLead>[];
    }

    return data
        .whereType<Map>()
        .map(
          (item) => ApiLead.fromJson(Map<String, dynamic>.from(item)),
        )
        .toList();
  }

  Future<ApiLead> addLead({
    required String name,
    required String phone,
    String email = '',
    String status = 'new',
  }) async {
    final userId = _requireUserId();
    final uri = Uri.parse('$_baseUrl/api/leads');
    final trimmedEmail = email.trim();
    final payload = jsonEncode(<String, dynamic>{
      'name': name.trim(),
      'phone': phone.trim(),
      'status': status.trim().toLowerCase(),
      'user_id': userId,
      if (trimmedEmail.isNotEmpty) 'email': trimmedEmail,
    });
    final response = await _client.post(
      uri,
      headers: const <String, String>{
        'Content-Type': 'application/json',
      },
      body: payload,
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Failed to add lead (${response.statusCode})');
    }

    final envelope = _parseEnvelope(
      response.body,
      fallbackError: 'Failed to add lead',
    );
    final data = envelope['data'];
    if (data is! Map) {
      throw Exception('Invalid lead response');
    }
    return ApiLead.fromJson(Map<String, dynamic>.from(data));
  }

  Future<ApiLead> updateLeadStatus({
    required String id,
    required String status,
  }) async {
    final userId = _requireUserId();
    final uri = Uri.parse('$_baseUrl/api/leads/$id');
    final response = await _client.put(
      uri,
      headers: const <String, String>{
        'Content-Type': 'application/json',
      },
      body: jsonEncode(<String, dynamic>{
        'status': status.trim().toLowerCase(),
        'user_id': userId,
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Failed to update lead (${response.statusCode})');
    }

    final envelope = _parseEnvelope(
      response.body,
      fallbackError: 'Failed to update lead status',
    );
    final data = envelope['data'];
    if (data is! Map) {
      throw Exception('Invalid lead response');
    }
    return ApiLead.fromJson(Map<String, dynamic>.from(data));
  }
}
