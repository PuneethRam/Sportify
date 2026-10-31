import 'dart:convert';
import 'package:http/http.dart' as http;
import '../core/constants.dart';

class ApiService {
  ApiService._();
  static final ApiService instance = ApiService._();

  String? _token;
  final Map<String, Map<String, dynamic>> _cache = {};

  void setToken(String? token) {
    if (token != _token) {
      _cache.clear();
    }
    _token = token;
  }

  void clearCache() => _cache.clear();

  void invalidate(String pathPrefix) {
    _cache.removeWhere((key, _) => key.contains(pathPrefix));
  }

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_token != null) 'Authorization': 'Bearer $_token',
  };

  static const _timeout = Duration(seconds: 15);

  Future<Map<String, dynamic>> get(String path,
      {Map<String, String>? query, bool cached = true}) async {
    final uri = Uri.parse('$kApiBase$path')
        .replace(queryParameters: query);
    final cacheKey = uri.toString();

    if (cached && _cache.containsKey(cacheKey)) {
      return _cache[cacheKey]!;
    }

    final res = await http.get(uri, headers: _headers).timeout(_timeout,
        onTimeout: () => throw ApiException('Request timed out — check API URL ($kApiBase)', 408));
    final parsed = _parse(res);

    if (cached) {
      _cache[cacheKey] = parsed;
    }
    return parsed;
  }

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) async {
    final res = await http.post(
      Uri.parse('$kApiBase$path'),
      headers: _headers,
      body: jsonEncode(body),
    ).timeout(_timeout,
        onTimeout: () => throw ApiException('Request timed out — check API URL ($kApiBase)', 408));
    final parsed = _parse(res);
    // Invalidate GET cache for related resources after mutation
    _invalidateRelated(path);
    return parsed;
  }

  Future<Map<String, dynamic>> put(String path, Map<String, dynamic> body) async {
    final res = await http.put(
      Uri.parse('$kApiBase$path'),
      headers: _headers,
      body: jsonEncode(body),
    ).timeout(_timeout,
        onTimeout: () => throw ApiException('Request timed out — check API URL ($kApiBase)', 408));
    return _parse(res);
  }

  Future<Map<String, dynamic>> patch(String path, Map<String, dynamic> body) async {
    final res = await http.patch(
      Uri.parse('$kApiBase$path'),
      headers: _headers,
      body: jsonEncode(body),
    ).timeout(_timeout,
        onTimeout: () => throw ApiException('Request timed out — check API URL ($kApiBase)', 408));
    return _parse(res);
  }

  Future<Map<String, dynamic>> delete(String path) async {
    final res = await http.delete(Uri.parse('$kApiBase$path'), headers: _headers)
        .timeout(_timeout,
            onTimeout: () => throw ApiException('Request timed out — check API URL ($kApiBase)', 408));
    final parsed = _parse(res);
    _invalidateRelated(path);
    return parsed;
  }

  void _invalidateRelated(String path) {
    // Extract the resource group prefix (e.g. /api/clans from /api/clans/series/finish_series)
    final parts = path.split('/').where((p) => p.isNotEmpty).toList();
    // Invalidate any cached GET that shares the same top-level resource group
    if (parts.length >= 2) {
      final prefix = '/${parts[0]}/${parts[1]}';
      _cache.removeWhere((key, _) => key.contains(prefix));
    }
  }

  Map<String, dynamic> _parse(http.Response res) {
    final decoded = jsonDecode(res.body);
    // Some endpoints (clans, leaderboard) return raw arrays — wrap them.
    final body = decoded is List
        ? <String, dynamic>{'data': decoded}
        : decoded as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw ApiException(
        body['error']?.toString() ?? 'Request failed',
        res.statusCode,
      );
    }
    return body;
  }
}

class ApiException implements Exception {
  final String message;
  final int statusCode;
  ApiException(this.message, this.statusCode);
  @override
  String toString() => message;
}
