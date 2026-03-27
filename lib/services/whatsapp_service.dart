import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/config/app_config.dart';

// -----------------------------------------------------------------------------
// Integration (build-time secrets via --dart-define-from-file=.env.flutter):
//
//   WHATSAPP_API_URL=https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>/messages
//   WHATSAPP_API_TOKEN=<permanent_token>
//   # optional — Meta Cloud API body:
//   WHATSAPP_META_BODY=true
//   # optional — 360dialog:
//   WHATSAPP_D360_API_KEY=true
//
// Or use WHATSAPP_ACCESS_TOKEN when WHATSAPP_API_TOKEN is empty (legacy).
// -----------------------------------------------------------------------------

/// Result of a successful WhatsApp API send.
class WhatsAppSendResult {
  const WhatsAppSendResult({required this.statusCode, required this.body});

  final int statusCode;
  final String body;
}

/// WhatsApp REST API is not configured (missing URL or token).
class WhatsAppConfigException implements Exception {
  const WhatsAppConfigException(this.message);
  final String message;

  @override
  String toString() => 'WhatsAppConfigException: $message';
}

/// Non-success HTTP response from the provider.
class WhatsAppApiException implements Exception {
  WhatsAppApiException(this.statusCode, this.body);

  final int statusCode;
  final String body;

  @override
  String toString() =>
      'WhatsAppApiException: HTTP $statusCode — ${body.length > 200 ? '${body.substring(0, 200)}…' : body}';
}

class WhatsAppService {
  WhatsAppService._();

  static String _effectiveToken() {
    final t = AppConfig.whatsappApiToken.trim();
    if (t.isNotEmpty) return t;
    return AppConfig.whatsappAccessToken.trim();
  }

  /// E.164 digits only (no `+`), as required by most WhatsApp HTTP APIs.
  static String normalizePhoneForApi(String raw) {
    return raw.replaceAll(RegExp(r'\D'), '');
  }

  /// Sends a text template via your configured WhatsApp HTTP API (Twilio-style JSON
  /// supported by Cloud API / many providers):
  ///
  /// ```json
  /// { "to": "<phone>", "type": "text", "text": { "body": "<message>" } }
  /// ```
  ///
  /// When [AppConfig.whatsappMetaMessagingProduct] is true, also sets
  /// `"messaging_product": "whatsapp"` (Meta Graph API).
  static Future<WhatsAppSendResult> sendWhatsAppMessage({
    required String phone,
    required String message,
  }) async {
    final url = AppConfig.whatsappApiUrl.trim();
    final token = _effectiveToken();
    if (url.isEmpty || token.isEmpty) {
      throw const WhatsAppConfigException(
        'Set WHATSAPP_API_URL and WHATSAPP_API_TOKEN (or WHATSAPP_ACCESS_TOKEN) '
        'via --dart-define / --dart-define-from-file.',
      );
    }

    final to = normalizePhoneForApi(phone);
    if (to.isEmpty) {
      throw ArgumentError.value(phone, 'phone', 'No digits in phone number');
    }

    final uri = Uri.parse(url);
    final payload = <String, dynamic>{
      'to': to,
      'type': 'text',
      'text': <String, String>{'body': message},
    };
    if (AppConfig.whatsappMetaMessagingProduct) {
      payload['messaging_product'] = 'whatsapp';
    }

    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (AppConfig.whatsappD360ApiKeyHeader) {
      headers['D360-API-KEY'] = token;
    } else {
      headers['Authorization'] = 'Bearer $token';
    }

    final response = await http
        .post(
          uri,
          headers: headers,
          body: jsonEncode(payload),
        )
        .timeout(const Duration(seconds: 45));

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return WhatsAppSendResult(
        statusCode: response.statusCode,
        body: response.body,
      );
    }

    throw WhatsAppApiException(response.statusCode, response.body);
  }
}
