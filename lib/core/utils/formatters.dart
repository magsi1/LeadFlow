import 'package:intl/intl.dart';

class Formatters {
  static String dateTime(DateTime? value) {
    if (value == null) return '-';
    return DateFormat('dd MMM yyyy, hh:mm a').format(value);
  }

  static String date(DateTime? value) {
    if (value == null) return '-';
    return DateFormat('dd MMM yyyy').format(value);
  }
}
