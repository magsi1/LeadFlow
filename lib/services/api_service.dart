import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/lead.dart';

const baseUrl = 'https://leadflow-production-7103.up.railway.app';

class ApiService {
  static Future<List<dynamic>> fetchLeads() async {
    final user = Supabase.instance.client.auth.currentUser;

    if (user == null) {
      throw Exception('User not logged in');
    }

    final res = await http.get(
      Uri.parse('$baseUrl/api/leads?user_id=${user.id}'),
    );

    // Same shape as axios: `response.data` = body, inner list = `response.data.data`
    final decoded = jsonDecode(res.body) as Map<String, dynamic>;
    if (decoded['ok'] != true) {
      throw Exception((decoded['error'] ?? 'Failed to fetch leads').toString());
    }

    final payload = decoded['data'];
    if (payload is! List) return <dynamic>[];
    return payload;
  }

  static Future<void> updateStatus(String id, String status) async {
    final user = Supabase.instance.client.auth.currentUser;

    if (user == null) {
      throw Exception('User not logged in');
    }

    final res = await http.put(
      Uri.parse('$baseUrl/api/leads/$id'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'status': status,
        'user_id': user.id,
      }),
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Failed to update status');
    }
  }

  static Future<void> createLead(String name, String phone, {String status = 'new'}) async {
    final user = Supabase.instance.client.auth.currentUser;

    if (user == null) {
      throw Exception('User not logged in');
    }

    final res = await http.post(
      Uri.parse('$baseUrl/api/leads'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'name': name,
        'phone': phone,
        'status': status,
        'message': 'New Lead',
        'user_id': user.id,
      }),
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Failed to create lead');
    }
  }

  static Future<void> updateLead({
    required String id,
    required String name,
    required String phone,
    required String status,
  }) async {
    final user = Supabase.instance.client.auth.currentUser;

    if (user == null) {
      throw Exception('User not logged in');
    }

    final res = await http.put(
      Uri.parse('$baseUrl/api/leads/$id'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'name': name,
        'phone': phone,
        'status': status,
        'user_id': user.id,
      }),
    );

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Failed to update lead');
    }
  }

  static Future<void> deleteLead(String id) async {
    final user = Supabase.instance.client.auth.currentUser;

    if (user == null) {
      throw Exception('User not logged in');
    }

    final res = await http.delete(
      Uri.parse('$baseUrl/api/leads/$id?user_id=${user.id}'),
      headers: {'Content-Type': 'application/json'},
    );

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Failed to delete lead');
    }
  }

  // Backward-compatible instance wrappers.
  Future<List<Lead>> fetchLeadsTyped() async {
    final raw = await fetchLeads();
    return raw
        .whereType<Map>()
        .map((item) => Lead.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<void> updateLeadStatus(String id, String status) {
    return updateStatus(id, status);
  }

  Future<void> createLeadLegacy(String name, String phone) {
    return createLead(name, phone);
  }
}
