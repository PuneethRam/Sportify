import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sportify_app/core/router.dart';
import 'package:sportify_app/screens/invite/invite_screen.dart';
import 'package:sportify_app/services/analytics.dart';
import 'package:sportify_app/services/deep_links.dart';
import 'package:sportify_app/services/push_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('inviteLocationFor', () {
    test('maps invite links to /invite/<token>', () {
      expect(inviteLocationFor(Uri.parse('https://sportifyweb.netlify.app/i/AbC_12-xyz')),
          '/invite/AbC_12-xyz');
      expect(inviteLocationFor(Uri.parse('https://sportifyweb.netlify.app/i/tok/')),
          '/invite/tok');
      expect(inviteLocationFor(Uri.parse('https://SportifyWeb.netlify.app/i/tok?utm=x')),
          '/invite/tok');
    });

    test('ignores other hosts, schemes and paths', () {
      for (final s in [
        'https://evil.example.com/i/tok',
        'http://sportifyweb.netlify.app/i/tok',
        'https://sportifyweb.netlify.app/x/tok',
        'https://sportifyweb.netlify.app/i/',
        'https://sportifyweb.netlify.app/i/a/b',
        'https://sportifyweb.netlify.app/i/bad%20token',
        'sportify://i/tok',
      ]) {
        expect(inviteLocationFor(Uri.parse(s)), isNull, reason: s);
      }
    });
  });

  group('pushRouteFrom', () {
    test('accepts in-app paths only', () {
      expect(pushRouteFrom({'route': '/clans/5', 'type': 'announcement'}), '/clans/5');
      expect(pushRouteFrom({'route': '/find/9'}), '/find/9');
      expect(pushRouteFrom({'route': 'https://evil.example.com'}), isNull);
      expect(pushRouteFrom({'route': '//evil.example.com'}), isNull);
      expect(pushRouteFrom({'route': ''}), isNull);
      expect(pushRouteFrom({'route': 5}), isNull);
      expect(pushRouteFrom({}), isNull);
    });
  });

  group('authRedirect', () {
    Uri u(String s) => Uri.parse(s);

    test('waits while auth is loading', () {
      final r = authRedirect(loading: true, authed: false, uri: u('/invite/t'), pending: null);
      expect(r.to, isNull);
      expect(r.pending, isNull);
    });

    test('remembers the invite while signed out, then returns to it', () {
      var r = authRedirect(loading: false, authed: false, uri: u('/invite/t'), pending: null);
      expect(r.to, '/login');
      expect(r.pending, '/invite/t');

      r = authRedirect(loading: false, authed: false, uri: u('/signup'), pending: r.pending);
      expect(r.to, isNull);
      expect(r.pending, '/invite/t');

      r = authRedirect(loading: false, authed: true, uri: u('/'), pending: r.pending);
      expect(r.to, '/invite/t');
      expect(r.pending, isNull);

      r = authRedirect(loading: false, authed: true, uri: u('/invite/t'), pending: r.pending);
      expect(r.to, isNull);
    });

    test('plain sign-in still lands on home', () {
      var r = authRedirect(loading: false, authed: false, uri: u('/'), pending: null);
      expect(r, (to: '/login', pending: null));
      r = authRedirect(loading: false, authed: true, uri: u('/login'), pending: null);
      expect(r, (to: '/', pending: null));
    });
  });

  group('inviteBlocker', () {
    test('status and session checks', () {
      expect(inviteBlocker({'status': 'active', 'type': 'clan', 'target': {}}), isNull);
      expect(inviteBlocker({'status': 'expired', 'type': 'clan'}), contains('expired'));
      expect(inviteBlocker({'status': 'revoked', 'type': 'batch'}), contains('turned off'));
      final full = {'status': 'active', 'type': 'session',
        'target': {'maxPlayers': 4, 'joinedCount': 4, 'sessionStatus': 'open'}};
      expect(inviteBlocker(full), contains('full'));
      expect(inviteBlocker({...full, 'alreadyMember': true}), isNull);
      expect(inviteBlocker({'status': 'active', 'type': 'session',
        'target': {'maxPlayers': 4, 'joinedCount': 1, 'sessionStatus': 'cancelled'}}),
        contains('cancelled'));
    });
  });

  test('Analytics without a key never calls the plugin', () async {
    final calls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(const MethodChannel('posthog_flutter'), (c) async {
      calls.add(c);
      return null;
    });
    final a = Analytics('');
    expect(a.enabled, isFalse);
    await a.init();
    await a.identify('uid-1');
    await a.track('clan_joined', {'source': 'invite'});
    await a.reset();
    expect(calls, isEmpty);
  });
}
