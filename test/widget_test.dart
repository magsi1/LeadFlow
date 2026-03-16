import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:leadflow/app.dart';

void main() {
  testWidgets('LeadFlow app boots', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: LeadFlowApp()));
    await tester.pumpAndSettle();

    expect(find.text('LeadFlow'), findsAtLeastNWidgets(1));
  });
}
