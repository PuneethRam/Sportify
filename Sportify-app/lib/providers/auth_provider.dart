import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import '../services/analytics.dart';
import '../services/auth_service.dart';
import '../services/api_service.dart';
import '../services/push_service.dart';

class AuthProvider extends ChangeNotifier {
  User? _user;
  bool _loading = true;

  /// Where a signed-out user was headed (e.g. an invite link); the router
  /// sends them there once they sign in or sign up.
  String? pendingLocation;

  User? get user => _user;
  bool get loading => _loading;
  bool get isAuthenticated => _user != null;
  String? get uid => _user?.uid;
  String get displayName =>
      _user?.displayName ?? _user?.email?.split('@').first ?? 'Player';

  AuthProvider() {
    AuthService.instance.authStateChanges.listen((user) {
      final changed = user?.uid != _user?.uid || _loading;
      _user = user;
      // ApiService fetches the ID token per request and clears its cache
      // when the uid changes, so no token plumbing is needed here.
      if (user != null) {
        if (changed) {
          Analytics.instance.identify(user.uid);
          PushService.instance.registerDevice();
        }
        // Preload common data in the background so pages feel instant
        _preloadCommonData();
      } else {
        Analytics.instance.reset();
      }
      _loading = false;
      notifyListeners();
    });
  }

  void _preloadCommonData() {
    final api = ApiService.instance;
    // Fire-and-forget: populate cache so first page visits are instant
    api.get('/api/dashboard/all').catchError((_) {});
    api.get('/api/clans/get_user_clan').catchError((_) {});
    api.get('/api/organisations/get_user_orgs').catchError((_) {});
    api.get('/api/organisations/get_member_orgs').catchError((_) {});
    api.get('/api/organisations/coach-dashboard').catchError((_) {});
  }

  Future<void> signOut() async {
    await PushService.instance.unregisterDevice();
    await AuthService.instance.signOut();
  }
}
