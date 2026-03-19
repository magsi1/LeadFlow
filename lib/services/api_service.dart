import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/lead.dart';

class ApiService {
  static const String _baseUrl =
      'https://leadflow-production-7103.up.railway.app';

  Future<List<Lead>> fetchLeads() async {
    final url = Uri.parse('$_baseUrl/api/leads');

    final response = await http.get(
      url,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final payload = data['data'];
      if (payload is! List) {
        return <Lead>[];
      }
      return payload
        .whereType<Map>()
        .map((item) => Lead.fromJson(Map<String, dynamic>.from(item)))
        .toList();
    } else {
      throw Exception('Failed to load leads: ${response.body}');
    }
  }

  Future<void> updateLeadStatus(String id, String status) async {
    final response = await http.patch(
      Uri.parse('$_baseUrl/api/leads/$id/status'),
      headers: const <String, String>{'Content-Type': 'application/json'},
      body: jsonEncode(<String, dynamic>{'status': status}),
    );

    final json = _decodeJson(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        _extractError(json, fallback: 'Failed to update lead status'),
      );
    }

    if (json['ok'] != true) {
      throw Exception(
        _extractError(json, fallback: 'Failed to update lead status'),
      );
    }
  }

  Future<void> createLead(String name, String phone) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/leads'),
      headers: const <String, String>{'Content-Type': 'application/json'},
      body: jsonEncode(<String, dynamic>{
        'name': name,
        'phone': phone,
        'status': 'new',
      }),
    );

    final json = _decodeJson(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_extractError(json, fallback: 'Failed to create lead'));
    }

    if (json['ok'] != true) {
      throw Exception(_extractError(json, fallback: 'Failed to create lead'));
    }
  }

  Map<String, dynamic> _decodeJson(http.Response response) {
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
    } catch (_) {
      // no-op
    }
    return <String, dynamic>{};
  }

  String _extractError(
    Map<String, dynamic> json, {
    required String fallback,
  }) {
    final raw = json['error'];
    if (raw == null) return fallback;
    final message = raw.toString().trim();
    return message.isEmpty ? fallback : message;
  }
}
