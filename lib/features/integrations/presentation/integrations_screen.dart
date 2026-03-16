import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/formatters.dart';
import '../../integrations/domain/entities/integration_status.dart';
import 'providers.dart';

class IntegrationsScreen extends ConsumerWidget {
  const IntegrationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(integrationStateProvider);
    final notifier = ref.read(integrationStateProvider.notifier);

    Color stateColor(IntegrationConnectionState s) => switch (s) {
          IntegrationConnectionState.connected => Colors.green,
          IntegrationConnectionState.disconnected => Colors.grey,
          IntegrationConnectionState.error => Colors.redAccent,
          IntegrationConnectionState.syncing => Colors.orange,
        };

    return Scaffold(
      appBar: AppBar(title: const Text('Integrations')),
      body: RefreshIndicator(
        onRefresh: notifier.load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Card(
              child: Padding(
                padding: EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Business account prerequisites', style: TextStyle(fontWeight: FontWeight.w700)),
                    SizedBox(height: 8),
                    Text('• WhatsApp requires Business Platform setup and approved number.'),
                    Text('• Instagram and Facebook require Meta-linked business assets and page permissions.'),
                    Text('• Personal accounts are not supported in production webhook workflows.'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            if (state.loading) const LinearProgressIndicator(),
            if (state.error != null) Text(state.error!, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 8),
            ...state.accounts.map((account) {
              final status = account.status;
              final color = stateColor(status.state);
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(account.channel.label, style: Theme.of(context).textTheme.titleMedium),
                                const SizedBox(height: 2),
                                Text(account.displayName),
                                Text(account.businessName, style: Theme.of(context).textTheme.bodySmall),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: color.withValues(alpha: 0.13),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              status.state.name.toUpperCase(),
                              style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 11),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text('Last Sync: ${Formatters.dateTime(status.lastSyncAt)}'),
                      Text('Webhook: ${status.webhookHealthy ? 'Healthy' : 'Needs attention'}'),
                      if (status.message != null) Text('Note: ${status.message!}'),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          FilledButton.tonal(
                            onPressed: () => notifier.connect(account.id),
                            child: const Text('Connect'),
                          ),
                          OutlinedButton(
                            onPressed: () => notifier.reconnect(account.id),
                            child: const Text('Reconnect'),
                          ),
                          OutlinedButton(
                            onPressed: () => notifier.disconnect(account.id),
                            child: const Text('Disconnect'),
                          ),
                          OutlinedButton(
                            onPressed: () => notifier.syncNow(account.id),
                            child: const Text('Sync now'),
                          ),
                          OutlinedButton(
                            onPressed: () async {
                              final ok = await ref.read(integrationRepositoryProvider).testConnection(account.id);
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text(ok ? 'Connection test passed' : 'Connection test failed')),
                                );
                              }
                            },
                            child: const Text('Test'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}
