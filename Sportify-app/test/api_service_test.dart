import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sportify_app/services/api_service.dart';

/// Fake token source: returns 'token-N', bumping N on each force refresh.
class FakeTokens {
  int version = 1;
  int calls = 0;
  int forcedCalls = 0;

  Future<String?> call({bool forceRefresh = false}) async {
    calls++;
    if (forceRefresh) {
      forcedCalls++;
      version++;
    }
    return 'token-$version';
  }
}

void main() {
  late FakeTokens tokens;
  late List<String?> authHeaders;
  String? uid;

  ApiService build(http.Response Function(http.Request) handler) =>
      ApiService(
        client: MockClient((req) async {
          authHeaders.add(req.headers['Authorization']);
          return handler(req);
        }),
        tokenProvider: tokens.call,
        uidProvider: () => uid,
      );

  setUp(() {
    tokens = FakeTokens();
    authHeaders = [];
    uid = 'user-a';
  });

  test('fetches the token for every request', () async {
    final api = build((_) => http.Response('{"ok":true}', 200));

    await api.get('/api/a', cached: false);
    await api.post('/api/b', {});
    await api.delete('/api/c');

    expect(tokens.calls, 3);
    expect(tokens.forcedCalls, 0);
    expect(authHeaders, everyElement('Bearer token-1'));
  });

  test('on 401 force-refreshes the token and retries once', () async {
    final api = build((req) => req.headers['Authorization'] == 'Bearer token-1'
        ? http.Response('{"error":"expired"}', 401)
        : http.Response('{"ok":true}', 200));

    final res = await api.get('/api/a', cached: false);

    expect(res['ok'], true);
    expect(tokens.forcedCalls, 1);
    expect(authHeaders, ['Bearer token-1', 'Bearer token-2']);
  });

  test('does not retry more than once on repeated 401', () async {
    final api = build((_) => http.Response('{"error":"nope"}', 401));

    await expectLater(
      api.post('/api/a', {}),
      throwsA(isA<ApiException>().having((e) => e.statusCode, 'statusCode', 401)),
    );
    expect(authHeaders.length, 2);
    expect(tokens.forcedCalls, 1);
  });

  test('does not retry when signed out', () async {
    final api = ApiService(
      client: MockClient((req) async {
        authHeaders.add(req.headers['Authorization']);
        return http.Response('{"error":"unauthorized"}', 401);
      }),
      tokenProvider: ({bool forceRefresh = false}) async => null,
      uidProvider: () => null,
    );

    await expectLater(api.get('/api/a'), throwsA(isA<ApiException>()));
    expect(authHeaders, [null]);
  });

  test('GET cache survives token refresh but clears on uid change', () async {
    var hits = 0;
    final api = build((_) {
      hits++;
      return http.Response('{"n":$hits}', 200);
    });

    await api.get('/api/a');
    tokens.version = 5; // token rotated, same user
    expect((await api.get('/api/a'))['n'], 1);
    expect(hits, 1);

    uid = 'user-b';
    expect((await api.get('/api/a'))['n'], 2);
    expect(hits, 2);
  });
}
