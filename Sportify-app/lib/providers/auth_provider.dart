import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import '../services/auth_service.dart';
import '../services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  User? _user;
  bool _loading = true;

  User? get user => _user;
  bool get loading => _loading;
  bool get isAuthenticated => _user != null;
  String? get uid => _user?.uid;
  String get displayName =>
      _user?.displayName ?? _user?.email?.split('@').first ?? 'Player';

  AuthProvider() {
    AuthService.instance.authStateChanges.listen((user) {
      _user = user;
      // ApiService fetches the ID token per request and clears its cache
      // when the uid changes, so no token plumbing is needed here.
      if (user != null) {
        // Preload common data in the background so pages feel instant
        _preloadCommonData();
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

  Future<void> signOut() => AuthService.instance.signOut();
}
