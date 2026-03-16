import 'package:url_launcher/url_launcher.dart';

class LaunchActions {
  static Future<bool> call(String phone) async {
    final uri = Uri.parse('tel:$phone');
    return launchUrl(uri);
  }

  static Future<bool> whatsapp(String phone) async {
    final cleaned = phone.replaceAll(RegExp(r'\s+'), '');
    final uri = Uri.parse('https://wa.me/$cleaned');
    return launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}
