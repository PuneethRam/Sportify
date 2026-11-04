import 'dart:async';
import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';
import '../core/constants.dart';

final _tokenPattern = RegExp(r'^[A-Za-z0-9_-]{1,128}$');

/// Maps `https://<kApiBase host>/i/<token>` to the app route `/invite/<token>`.
/// Anything else returns null.
String? inviteLocationFor(Uri uri) {
  final host = Uri.parse(kApiBase).host;
  if (uri.scheme != 'https' || uri.host.toLowerCase() != host) return null;
  final segs = uri.pathSegments.where((s) => s.isNotEmpty).toList();
  if (segs.length != 2 || segs[0] != 'i' || !_tokenPattern.hasMatch(segs[1])) {
    return null;
  }
  return '/invite/${segs[1]}';
}

/// Listens for invite links (cold start and while running) and routes them.
class DeepLinks {
  DeepLinks._();
  static final DeepLinks instance = DeepLinks._();

  StreamSubscription<Uri>? _sub;
  String? _last;
  DateTime? _lastAt;

  Future<void> init(GoRouter router) async {
    if (kIsWeb || _sub != null) return;
    final links = AppLinks();
    // The stream may also replay the initial link; _open drops the duplicate.
    _sub = links.uriLinkStream.listen((uri) => _open(router, uri), onError: (_) {});
    try {
      final initial = await links.getInitialLink();
      if (initial != null) _open(router, initial);
    } catch (_) {}
  }

  void _open(GoRouter router, Uri uri) {
    final loc = inviteLocationFor(uri);
    if (loc == null) return;
    final now = DateTime.now();
    if (loc == _last && _lastAt != null &&
        now.difference(_lastAt!) < const Duration(seconds: 2)) {
      return;
    }
    _last = loc;
    _lastAt = now;
    router.go(loc);
  }
}
