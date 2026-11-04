import 'package:flutter/foundation.dart';
import 'package:posthog_flutter/posthog_flutter.dart';

/// Product analytics over PostHog. Without `--dart-define=POSTHOG_KEY=...`
/// every method is a no-op and the plugin is never touched.
///
/// Identify by Firebase uid only. Event properties must be ids, enums or
/// counts — never names, emails or phone numbers.
class Analytics {
  Analytics(this._key, {String host = _defaultHost}) : _host = host;

  static const _defaultHost = 'https://us.i.posthog.com';

  static final Analytics instance = Analytics(
    const String.fromEnvironment('POSTHOG_KEY'),
    host: const String.fromEnvironment('POSTHOG_HOST', defaultValue: _defaultHost),
  );

  final String _key;
  final String _host;
  bool _ready = false;
  String? _identified;

  bool get enabled => _key.isNotEmpty;

  Future<void> init() async {
    if (!enabled || _ready) return;
    final config = PostHogConfig(_key)
      ..host = _host
      ..sessionReplay = false
      ..surveys = false
      ..preloadFeatureFlags = false
      ..capturePushNotificationSubscriptions = false
      ..capturePushNotificationOpened = false
      ..personProfiles = PostHogPersonProfiles.identifiedOnly
      ..debug = kDebugMode;
    config.rageClickConfig.enabled = false;
    try {
      await Posthog().setup(config);
      _ready = true;
    } catch (e) {
      debugPrint('Analytics init failed: $e');
    }
  }

  Future<void> identify(String uid) async {
    if (!_ready || _identified == uid) return;
    _identified = uid;
    try {
      await Posthog().identify(userId: uid);
    } catch (_) {}
  }

  Future<void> reset() async {
    if (!_ready || _identified == null) return;
    _identified = null;
    try {
      await Posthog().reset();
    } catch (_) {}
  }

  Future<void> track(String event, [Map<String, Object>? props]) async {
    if (!_ready) return;
    try {
      await Posthog().capture(eventName: event, properties: props);
    } catch (_) {}
  }
}
