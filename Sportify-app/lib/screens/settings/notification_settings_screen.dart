import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../../services/api_service.dart';
import '../../services/push_service.dart';
import '../../widgets/loading_screen.dart';

const _categories = [
  ('results', 'Match results', 'When a result needs your confirmation, is confirmed or disputed'),
  ('sessions', 'Game sessions', 'When someone joins your game, or a game you joined changes'),
  ('announcements', 'Announcements', 'When your coach or academy posts'),
  ('invites', 'Invites accepted', 'When someone joins using your invite link'),
  ('streaks', 'Streak reminders', 'Saturday nudge when your weekly streak is at risk'),
  ('seasons', 'Seasons and rankings', 'Season results, badges and when someone passes you'),
];

class NotificationSettingsScreen extends StatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  State<NotificationSettingsScreen> createState() => _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState extends State<NotificationSettingsScreen>
    with WidgetsBindingObserver {
  Map<String, bool> _prefs = {};
  bool _loading = true;
  bool _permitted = true;
  String? _error;
  final Set<String> _saving = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Back from system settings — permission may have changed
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _checkPermission();
  }

  Future<void> _checkPermission() async {
    final ok = !PushService.instance.supported || await PushService.instance.isAuthorized();
    if (mounted) setState(() => _permitted = ok);
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    _checkPermission();
    try {
      final data = await ApiService.instance.get(
          '/api/notifications/preferences', cached: false);
      if (!mounted) return;
      setState(() { _prefs = _parse(data); _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Map<String, bool> _parse(Map<String, dynamic> data) {
    final raw = data['preferences'];
    return {
      for (final c in _categories)
        c.$1: raw is Map ? raw[c.$1] != false : true,
    };
  }

  Future<void> _set(String key, bool value) async {
    final before = _prefs[key];
    setState(() { _prefs[key] = value; _saving.add(key); });
    try {
      final data = await ApiService.instance.put(
          '/api/notifications/preferences', {key: value});
      if (mounted) setState(() => _prefs = _parse(data));
    } catch (e) {
      if (!mounted) return;
      setState(() => _prefs[key] = before ?? !value);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _saving.remove(key));
    }
  }

  Future<void> _turnOn() async {
    final ok = await PushService.instance.requestPermission();
    if (!mounted) return;
    setState(() => _permitted = ok);
    if (ok) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Notifications are off'),
        content: const Text(
          'Open your phone\'s Settings → Apps → Sportify → Notifications '
          'and allow notifications.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Notifications')),
    body: _loading
        ? const CenteredLoader()
        : _error != null
            ? ErrorView(message: _error!, onRetry: _load)
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (!_permitted) ...[
                    Container(
                      decoration: BoxDecoration(
                        color: kColorAmber.withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: ListTile(
                        leading: const Icon(Icons.notifications_off_outlined, color: kColorAmber),
                        title: const Text('Turn on notifications',
                          style: TextStyle(fontWeight: FontWeight.w700, color: kColorText)),
                        subtitle: const Text('Notifications are off for Sportify on this phone',
                          style: TextStyle(color: kColorMuted, fontSize: 12)),
                        trailing: const Icon(Icons.chevron_right_rounded, color: kColorMuted),
                        onTap: _turnOn,
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                  Container(
                    decoration: BoxDecoration(
                      color: kColorSurface,
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: const [BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2))],
                    ),
                    child: Column(children: [
                      for (final c in _categories)
                        SwitchListTile(
                          title: Text(c.$2, style: const TextStyle(
                            fontWeight: FontWeight.w600, color: kColorText)),
                          subtitle: Text(c.$3, style: const TextStyle(
                            color: kColorMuted, fontSize: 12)),
                          value: _prefs[c.$1] ?? true,
                          onChanged: _saving.contains(c.$1) ? null : (v) => _set(c.$1, v),
                        ),
                    ]),
                  ),
                ],
              ),
  );
}
