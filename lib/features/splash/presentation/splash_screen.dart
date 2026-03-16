import 'package:flutter/material.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              height: 84,
              width: 84,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primary,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Icon(Icons.insights_rounded, color: Theme.of(context).colorScheme.onPrimary, size: 42),
            ),
            const SizedBox(height: 16),
            Text('LeadFlow', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 8),
            const Text('Capture. Follow up. Close deals.'),
            const SizedBox(height: 24),
            const CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
