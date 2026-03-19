import 'package:flutter/material.dart';

import 'screens/leads_screen.dart';

void main() {
  runApp(const LeadFlowApp());
}

class LeadFlowApp extends StatelessWidget {
  const LeadFlowApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'LeadFlow',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        useMaterial3: true,
      ),
      home: const LeadsScreen(),
    );
  }
}
