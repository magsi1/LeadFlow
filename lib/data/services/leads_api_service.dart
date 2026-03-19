import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/api_lead.dart';

class LeadsApiService {
  LeadsApiService({http.Client? client})
      : _client = client ?? http.Client();

  static const String _baseUrl =
      'https://leadflow-production-7103.up.railway.app';
  final http.Client _client;

  Future<List<ApiLead>> fetchLeads() async {
    final uri = Uri.parse('$_baseUrl/api/leads');
    final response = await _client.get(uri);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Failed to fetch leads (${response.statusCode})');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    final ok = decoded['ok'] == true;
    if (!ok) {
      throw Exception((decoded['error'] ?? 'Failed to fetch leads').toString());
    }

    final data = decoded['data'];
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
    String status = 'new',
  }) async {
    final uri = Uri.parse('$_baseUrl/api/leads');
    final payload = jsonEncode(<String, dynamic>{
      'name': name.trim(),
      'phone': phone.trim(),
      'status': status.trim().toLowerCase(),
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

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    final ok = decoded['ok'] == true;
    if (!ok) {
      throw Exception((decoded['error'] ?? 'Failed to add lead').toString());
    }

    final data = decoded['data'];
    if (data is! Map) {
      throw Exception('Invalid lead response');
    }
    return ApiLead.fromJson(Map<String, dynamic>.from(data));
  }

  Future<ApiLead> updateLeadStatus({
    required String id,
    required String status,
  }) async {
    final uri = Uri.parse('$_baseUrl/api/leads/$id');
    final response = await _client.put(
      uri,
      headers: const <String, String>{
        'Content-Type': 'application/json',
      },
      body: jsonEncode(<String, dynamic>{
        'status': status.trim().toLowerCase(),
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Failed to update lead (${response.statusCode})');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    final ok = decoded['ok'] == true;
    if (!ok) {
      throw Exception(
        (decoded['error'] ?? 'Failed to update lead status').toString(),
      );
    }

    final data = decoded['data'];
    if (data is! Map) {
      throw Exception('Invalid lead response');
    }
    return ApiLead.fromJson(Map<String, dynamic>.from(data));
  }
}
