import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/route_paths.dart';
import '../../../core/utils/email_validation.dart';
import '../../../core/utils/supabase_signup_messages.dart';
import '../../../core/widgets/app_text_field.dart';
import '../../app_state/providers.dart';

class SignupScreen extends ConsumerStatefulWidget {
  const SignupScreen({super.key});

  @override
  ConsumerState<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends ConsumerState<SignupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _isSigningUp = false;

  /// Signup runs only from this handler (never from [build] or listeners).
  ///
  /// [VoidCallback] tear-off: `onPressed: handleSignup` — not `handleSignup()`.
  void handleSignup() {
    // ignore: avoid_print, prefer_single_quotes — signup diagnostics (exact log strings)
    print("Signup CLICKED");
    if (_isSigningUp) return;
    final busy = ref.read(appStateProvider).loading;
    if (busy) return;
    if (!_formKey.currentState!.validate()) return;

    _isSigningUp = true;
    setState(() {});

    unawaited(_executeSignupApi());
  }

  Future<void> _executeSignupApi() async {
    try {
      await ref.read(appStateProvider.notifier).signUp(
            fullName: _name.text.trim(),
            email: _email.text.trim(),
            password: _password.text.trim(),
          );
      if (!mounted) return;
      final res = ref.read(appStateProvider).currentUser;
      // ignore: avoid_print, prefer_single_quotes — signup diagnostics (exact log strings)
      print("Signup response: $res");
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Account created successfully.'),
        ),
      );
      context.go(RoutePaths.dashboard);
    } on SignupFailure catch (e) {
      // ignore: avoid_print, prefer_single_quotes — signup diagnostics (exact log strings)
      print("Signup error: $e");
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            isSignupRateLimited(e) ? signupRateLimitUserMessage : e.message,
          ),
        ),
      );
    } catch (e) {
      // ignore: avoid_print, prefer_single_quotes — signup diagnostics (exact log strings)
      print("Signup error: $e");
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            isSignupRateLimited(e) ? signupRateLimitUserMessage : e.toString(),
          ),
        ),
      );
    } finally {
      _isSigningUp = false;
      if (mounted) setState(() {});
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final appBusy = ref.watch(appStateProvider).loading;

    return Scaffold(
      appBar: AppBar(title: const Text('Create account')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(
                children: [
                  AppTextField(
                    controller: _name,
                    label: 'Full name',
                    validator: (v) => (v == null || v.isEmpty) ? 'Name is required' : null,
                  ),
                  const SizedBox(height: 12),
                  AppTextField(
                    controller: _email,
                    label: 'Email',
                    keyboardType: TextInputType.emailAddress,
                    validator: (v) {
                      final s = (v ?? '').trim();
                      if (s.isEmpty) return 'Email is required';
                      if (!isValidEmail(s)) return 'Please enter a valid email';
                      if (!isAcceptableSignupEmail(s)) {
                        return 'Use your real email (not placeholders like user@gmail.com)';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),
                  AppTextField(
                    controller: _password,
                    label: 'Password',
                    obscureText: true,
                    validator: (v) => (v == null || v.length < 6) ? 'Use 6+ characters' : null,
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: (_isSigningUp || appBusy) ? null : handleSignup,
                    child: _isSigningUp
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Create account'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
