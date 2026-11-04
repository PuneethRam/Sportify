import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'analytics.dart';
import 'api_service.dart';

/// Root messenger so foreground pushes can show on whatever screen is open.
final rootMessengerKey = GlobalKey<ScaffoldMessengerState>();

/// The go_router path carried in a push's `data.route`, or null if it isn't
/// an in-app path.
String? pushRouteFrom(Map<String, dynamic> data) {
  final route = data['route'];
  if (route is! String || !route.startsWith('/') || route.startsWith('//')) {
    return null;
  }
  return route;
}

class PushService {
  PushService._();
  static final PushService instance = PushService._();

  static const _promptedKey = 'push_soft_prompt_shown';

  GoRouter? _router;
  String? _registeredToken;
  bool _started = false;

  bool get supported =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  String get _platform =>
      defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';

  Future<void> init(GoRouter router) async {
    _router = router;
    if (!supported || _started) return;
    _started = true;
    try {
      final fm = FirebaseMessaging.instance;
      FirebaseMessaging.onMessageOpenedApp.listen(_opened);
      FirebaseMessaging.onMessage.listen(_foreground);
      fm.onTokenRefresh.listen((_) => registerDevice(), onError: (_) {});
      final initial = await fm.getInitialMessage();
      if (initial != null) _opened(initial);
    } catch (e) {
      debugPrint('Push init failed: $e');
    }
  }

  void _opened(RemoteMessage m) {
    Analytics.instance.track('push_opened', {
      'type': m.data['type']?.toString() ?? 'unknown',
    });
    final route = pushRouteFrom(m.data);
    if (route != null) _router?.go(route);
  }

  void _foreground(RemoteMessage m) {
    final title = m.notification?.title;
    final body = m.notification?.body;
    if (title == null && body == null) return;
    final route = pushRouteFrom(m.data);
    rootMessengerKey.currentState?.showSnackBar(SnackBar(
      content: Text([title, body].whereType<String>().join('\n')),
      duration: const Duration(seconds: 6),
      action: route == null
          ? null
          : SnackBarAction(label: 'View', onPressed: () => _opened(m)),
    ));
  }

  Future<bool> isAuthorized() async {
    if (!supported) return false;
    try {
      final s = await FirebaseMessaging.instance.getNotificationSettings();
      return s.authorizationStatus == AuthorizationStatus.authorized ||
          s.authorizationStatus == AuthorizationStatus.provisional;
    } catch (_) {
      return false;
    }
  }

  /// Sends this device's FCM token to the server when signed in and allowed.
  Future<void> registerDevice() async {
    if (!supported || FirebaseAuth.instance.currentUser == null) return;
    if (!await isAuthorized()) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null) return;
      await ApiService.instance.post('/api/notifications/devices',
          {'token': token, 'platform': _platform});
      _registeredToken = token;
    } catch (e) {
      debugPrint('Push registration failed: $e');
    }
  }

  /// Call before signing out of Firebase (the request needs the ID token).
  Future<void> unregisterDevice() async {
    if (!supported) return;
    try {
      final token = _registeredToken ?? await FirebaseMessaging.instance.getToken();
      if (token == null) return;
      await ApiService.instance.delete('/api/notifications/devices', body: {'token': token});
      _registeredToken = null;
    } catch (_) {}
  }

  /// Asks the OS for permission; returns whether notifications are now allowed.
  Future<bool> requestPermission() async {
    if (!supported) return false;
    try {
      final s = await FirebaseMessaging.instance.requestPermission();
      final ok = s.authorizationStatus == AuthorizationStatus.authorized ||
          s.authorizationStatus == AuthorizationStatus.provisional;
      if (ok) await registerDevice();
      return ok;
    } catch (_) {
      return false;
    }
  }

  /// Soft prompt, at most once per install, before the OS permission dialog.
  /// Without [context] it uses the root navigator (for callers that just popped).
  Future<void> maybeAskPermission([BuildContext? context]) async {
    if (!supported) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getBool(_promptedKey) == true) return;
      final s = await FirebaseMessaging.instance.getNotificationSettings();
      final status = s.authorizationStatus;
      if (status == AuthorizationStatus.authorized ||
          status == AuthorizationStatus.provisional) {
        return;
      }
      // iOS reports "denied" only after the user said no; Android 13+ reports
      // it before the first request too.
      if (status == AuthorizationStatus.denied &&
          defaultTargetPlatform == TargetPlatform.iOS) {
        return;
      }
      final ctx = (context != null && context.mounted)
          ? context
          : _router?.routerDelegate.navigatorKey.currentContext;
      if (ctx == null || !ctx.mounted) return;
      await prefs.setBool(_promptedKey, true);
      if (!ctx.mounted) return;
      final yes = await showDialog<bool>(
        context: ctx,
        builder: (d) => AlertDialog(
          title: const Text('Stay in the game?'),
          content: const Text(
            'Get notified when your opponent confirms a result, someone joins '
            'your game, or your coach posts an announcement.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(d, false),
              child: const Text('Not now')),
            ElevatedButton(
              onPressed: () => Navigator.pop(d, true),
              child: const Text('Turn on')),
          ],
        ),
      );
      if (yes == true) await requestPermission();
    } catch (e) {
      debugPrint('Push prompt failed: $e');
    }
  }
}
