import 'package:flutter_web_plugins/flutter_web_plugins.dart';

/// Hash URLs (`/#/route`) avoid the server needing to rewrite deep links on refresh.
void configureWebUrlStrategy() {
  setUrlStrategy(const HashUrlStrategy());
}
