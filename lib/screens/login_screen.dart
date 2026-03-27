import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/theme/app_colors.dart';
import '../core/utils/email_validation.dart';
import '../core/utils/supabase_signup_messages.dart';
import '../services/user_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final emailController = TextEditingController();
  final passwordController = TextEditingController();
  bool isLoading = false;
  /// Blocks duplicate signup calls before [isLoading] is committed in a frame.
  bool _signupInProgress = false;
  String? errorMessage;

  void _showError(String message) {
    if (!mounted) return;
    setState(() => errorMessage = message);
  }

  void _showSuccessSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  void _showErrorSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Theme.of(context).colorScheme.error,
      ),
    );
  }

  @override
  void dispose() {
    emailController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  Future<void> handleLogin() async {
    final supabase = Supabase.instance.client;
    final email = emailController.text.trim();
    final password = passwordController.text.trim();

    if (email.isEmpty || password.isEmpty) {
      _showError('Email and password required');
      return;
    }
    if (!isValidEmail(email)) {
      _showError('Please enter a valid email');
      return;
    }

    setState(() {
      isLoading = true;
      errorMessage = null;
    });

    try {
      final res = await supabase.auth.signInWithPassword(
        email: email,
        password: password,
      );

      debugPrint('LOGIN SUCCESS: ${res.user?.email}');

      if (!mounted) return;
      if (res.user != null) {
        // ignore: avoid_print — debug: confirm auth uid after login
        print('CURRENT USER ID: ${Supabase.instance.client.auth.currentUser?.id}');
        try {
          await UserService.upsertCurrentUserFromSession();
        } catch (e) {
          debugPrint('users upsert after login: $e');
        }
        if (!mounted) return;
        // Ensure we leave the login screen on web even if onAuthStateChange lags.
        Navigator.of(context).pushNamedAndRemoveUntil('/leads', (route) => false);
      }
    } on AuthException catch (e) {
      debugPrint('LOGIN ERROR: ${e.message}');
      if (!mounted) return;
      _showError(e.message);
    } catch (e) {
      debugPrint('LOGIN ERROR: $e');
      if (!mounted) return;
      _showError('Unexpected error occurred');
    } finally {
      if (mounted) {
        setState(() => isLoading = false);
      }
    }
  }

  /// Signup runs only from this handler (never from [build] or listeners).
  ///
  /// [VoidCallback] tear-off: `onPressed: handleSignup` — not `handleSignup()`.
  void handleSignup() {
    // ignore: avoid_print, prefer_single_quotes — signup diagnostics (exact log strings)
    print("Signup CLICKED");
    // One in-flight signup; [isLoading] also disables the button.
    if (isLoading || _signupInProgress) return;

    final supabase = Supabase.instance.client;
    final email = emailController.text.trim();
    final password = passwordController.text.trim();

    if (email.isEmpty || password.isEmpty) {
      _showErrorSnack('Email and password required');
      return;
    }
    if (!isValidEmail(email)) {
      _showErrorSnack('Please enter a valid email');
      return;
    }
    if (!isAcceptableSignupEmail(email)) {
      _showErrorSnack('Use your real email address (not a placeholder like user@gmail.com).');
      return;
    }

    _signupInProgress = true;
    setState(() {
      isLoading = true;
      errorMessage = null;
    });

    unawaited(_executeSignupApi(supabase, email, password));
  }

  Future<void> _executeSignupApi(
    SupabaseClient supabase,
    String email,
    String password,
  ) async {
    try {
      final res = await supabase.auth.signUp(
        email: email.trim(),
        password: password.trim(),
      );

      // ignore: avoid_print, prefer_single_quotes — signup diagnostics (exact log strings)
      print("Signup response: $res");
      debugPrint('Signup response: $res');
      debugPrint('SIGNUP SUCCESS: ${res.user?.email}');

      if (!mounted) return;
      if (res.user != null) {
        if (res.session != null) {
          _showSuccessSnack('Welcome! Your account is ready.');
          // ignore: avoid_print — debug: confirm auth uid when session is active
          print('CURRENT USER ID: ${Supabase.instance.client.auth.currentUser?.id}');
          try {
            await UserService.upsertCurrentUserFromSession();
          } catch (e) {
            debugPrint('users upsert after signup: $e');
          }
        } else {
          _showSuccessSnack(
            'Account created. Check your email to confirm, then sign in.',
          );
        }
      } else {
        _showErrorSnack('Unable to create account. Please try again.');
      }
    } on AuthException catch (e) {
      // ignore: avoid_print, prefer_single_quotes — signup diagnostics (exact log strings)
      print("Signup error: $e");
      debugPrint('SIGNUP ERROR: ${e.message}');
      if (!mounted) return;
      _showErrorSnack(
        isSignupRateLimited(e)
            ? signupRateLimitUserMessage
            : friendlySignupAuthMessage(e),
      );
    } catch (e) {
      // ignore: avoid_print, prefer_single_quotes — signup diagnostics (exact log strings)
      print("Signup error: $e");
      debugPrint('SIGNUP ERROR: $e');
      if (!mounted) return;
      _showErrorSnack(
        isSignupRateLimited(e)
            ? signupRateLimitUserMessage
            : 'Unexpected error occurred',
      );
    } finally {
      _signupInProgress = false;
      if (mounted) {
        setState(() => isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Sign in'),
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'LeadFlow',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Sign in to manage leads',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 28),
                TextField(
                  controller: emailController,
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    hintText: 'you@company.com',
                  ),
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: passwordController,
                  decoration: const InputDecoration(labelText: 'Password'),
                  obscureText: true,
                ),
                const SizedBox(height: 24),
                if (errorMessage != null) ...[
                  Text(
                    errorMessage!,
                    style: const TextStyle(color: Colors.red),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                ],
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton(
                        onPressed: isLoading ? null : handleLogin,
                        child: isLoading
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text('Login'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: isLoading ? null : handleSignup,
                        child: isLoading
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text('Sign up'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
