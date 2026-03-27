import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/route_paths.dart';
import '../../../core/utils/email_validation.dart';
import '../../../core/widgets/app_text_field.dart';
import '../../app_state/providers.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController(text: '123456');

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    try {
      await ref.read(appStateProvider.notifier).signIn(
            email: _email.text.trim(),
            password: _password.text.trim(),
          );
      if (mounted) context.go(RoutePaths.dashboard);
    } catch (_) {
      if (!mounted) return;
      final message = ref.read(appStateProvider).error ?? 'Unable to sign in.';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = ref.watch(appStateProvider);
    final loading = appState.loading;
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('LeadFlow', style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: 8),
                  Text('Track leads. Close faster.', style: Theme.of(context).textTheme.bodyMedium),
                  const SizedBox(height: 24),
                  AppTextField(
                    controller: _email,
                    label: 'Email',
                    keyboardType: TextInputType.emailAddress,
                    validator: (v) {
                      final s = (v ?? '').trim();
                      if (s.isEmpty) return 'Email is required';
                      if (!isValidEmail(s)) return 'Please enter a valid email';
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),
                  AppTextField(
                    controller: _password,
                    label: 'Password',
                    obscureText: true,
                    validator: (v) => (v == null || v.length < 6) ? 'Password must be 6+ chars' : null,
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: loading ? null : _submit,
                    child: Text(loading ? 'Signing in...' : 'Login'),
                  ),
                  const SizedBox(height: 10),
                  TextButton(
                    onPressed: () => context.push(RoutePaths.forgotPassword),
                    child: const Text('Forgot password?'),
                  ),
                  TextButton(
                    onPressed: () => context.push(RoutePaths.signup),
                    child: const Text('Create account'),
                  ),
                  if ((appState.error ?? '').isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      appState.error!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
