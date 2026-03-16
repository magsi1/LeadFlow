import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/widgets/app_text_field.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Forgot password')),
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
                    controller: _email,
                    label: 'Email',
                    validator: (v) => (v == null || v.isEmpty) ? 'Email is required' : null,
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () {
                      if (!_formKey.currentState!.validate()) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Password reset flow is ready for Firebase Auth wiring.')),
                      );
                      context.pop();
                    },
                    child: const Text('Send reset link'),
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
