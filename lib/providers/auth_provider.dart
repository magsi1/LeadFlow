import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Centralized, reactive Supabase auth state for LeadFlow.
///
/// UI must use [AuthProvider] (via [Provider]/[Consumer]) — do not read
/// [Supabase.instance.client.auth.currentUser] directly in widgets.
class AuthProvider extends ChangeNotifier {
  AuthProvider({SupabaseClient? client})
      : _client = client ?? Supabase.instance.client;

  final SupabaseClient _client;

  User? _user;
  Session? _session;
  bool _isLoading = true;
  bool _isAuthBusy = false;
  StreamSubscription<AuthState>? _authSubscription;

  User? get user => _user;

  Session? get session => _session;

  /// True until initial session is read and auth listener is attached.
  bool get isLoading => _isLoading;

  /// True during sign-in, sign-up, or sign-out (prevents duplicate calls).
  bool get isAuthBusy => _isAuthBusy;

  /// Signed-in user email for display (reactive).
  String? get email => _user?.email;

  /// Hydrate from current session and subscribe to auth changes.
  /// Call once after [Supabase.initialize].
  Future<void> initialize() async {
    _isLoading = true;
    notifyListeners();

    _session = _client.auth.currentSession;
    _user = _client.auth.currentUser;

    _authSubscription ??= _client.auth.onAuthStateChange.listen((data) {
      _session = data.session;
      _user = data.session?.user;
      // ignore: avoid_print — intentional auth diagnostics
      print('Auth State Changed: ${_user?.email}');
      // ignore: avoid_print
      print('Session: $_session');
      notifyListeners();
    });

    _isLoading = false;
    notifyListeners();
  }

  /// Sign in with email/password. Navigation is driven by [onAuthStateChange].
  Future<String?> signIn({required String email, required String password}) async {
    if (_isAuthBusy) return 'Please wait…';
    _isAuthBusy = true;
    notifyListeners();
    try {
      await _client.auth.signInWithPassword(
        email: email.trim().toLowerCase(),
        password: password,
      );
      return null;
    } on AuthException catch (e) {
      return e.message;
    } catch (e) {
      return e.toString();
    } finally {
      _isAuthBusy = false;
      notifyListeners();
    }
  }

  /// Sign up. If email confirmation is required, session may stay null.
  Future<String?> signUp({required String email, required String password}) async {
    if (_isAuthBusy) return 'Please wait…';
    _isAuthBusy = true;
    notifyListeners();
    try {
      final res = await _client.auth.signUp(
        email: email.trim().toLowerCase(),
        password: password,
      );
      if (res.user != null && res.session == null) {
        debugPrint(
          'AuthProvider.signUp: user created, session pending (e.g. email confirm)',
        );
      }
      return null;
    } on AuthException catch (e) {
      return e.message;
    } catch (e) {
      return e.toString();
    } finally {
      _isAuthBusy = false;
      notifyListeners();
    }
  }

  /// Sign out; [AuthGate] will show [LoginScreen] when [user] becomes null.
  Future<String?> signOut() async {
    if (_isAuthBusy) return null;
    _isAuthBusy = true;
    notifyListeners();
    try {
      await _client.auth.signOut();
      return null;
    } catch (e) {
      return e.toString();
    } finally {
      _isAuthBusy = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    unawaited(_authSubscription?.cancel());
    _authSubscription = null;
    super.dispose();
  }
}
