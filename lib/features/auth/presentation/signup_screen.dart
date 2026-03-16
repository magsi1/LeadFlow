import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/widgets/app_text_field.dart';

class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
                    validator: (v) => (v == null || v.isEmpty) ? 'Email is required' : null,
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
                    onPressed: () {
                      if (!_formKey.currentState!.validate()) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Signup flow is ready for Firebase implementation.')),
                      );
                      context.pop();
                    },
                    child: const Text('Create account'),
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
