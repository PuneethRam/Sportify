import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../services/analytics.dart';
import '../../services/api_service.dart';
import '../../services/push_service.dart';
import '../../widgets/loading_screen.dart';

/// Why an invite preview can't be joined, or null if it can.
String? inviteBlocker(Map<String, dynamic> preview) {
  switch (preview['status']) {
    case 'revoked': return 'This invite link has been turned off.';
    case 'expired': return 'This invite link has expired.';
  }
  if (preview['alreadyMember'] == true) return null;
  final t = preview['target'];
  if (preview['type'] == 'session' && t is Map) {
    final st = t['sessionStatus']?.toString();
    if (st == 'cancelled') return 'This game was cancelled.';
    if (st == 'completed') return 'This game has already been played.';
    final max = _int(t['maxPlayers']);
    if (max > 0 && _int(t['joinedCount']) >= max) return 'This game is full.';
  }
  return null;
}

int _int(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;

class InviteScreen extends StatefulWidget {
  final String token;
  const InviteScreen({super.key, required this.token});

  @override
  State<InviteScreen> createState() => _InviteScreenState();
}

class _InviteScreenState extends State<InviteScreen> {
  Map<String, dynamic>? _preview;
  String? _error;
  bool _loading = true;
  bool _joining = false;
  bool _tracked = false;
  String? _loadedFor;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Wait for auth so alreadyMember is filled in; reload if the user changes
    final auth = context.watch<AuthProvider>();
    if (auth.loading) return;
    final key = auth.uid ?? '';
    if (key != _loadedFor) {
      _loadedFor = key;
      _load();
    }
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await ApiService.instance.get(
          '/api/invites/${widget.token}', cached: false);
      if (!mounted) return;
      setState(() { _preview = data; _loading = false; });
      if (!_tracked) {
        _tracked = true;
        Analytics.instance.track('invite_link_opened', {
          'target_type': data['type']?.toString() ?? 'unknown',
          'status': data['status']?.toString() ?? 'unknown',
        });
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.statusCode == 404 ? "This invite link doesn't exist." : e.message;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _accept() async {
    final type = _preview?['type']?.toString() ?? 'unknown';
    setState(() => _joining = true);
    try {
      final res = await ApiService.instance.post(
        '/api/invites/${widget.token}/accept',
        {'userName': context.read<AuthProvider>().displayName},
      );
      final already = res['alreadyMember'] == true;
      Analytics.instance.track('invite_accepted', {
        'target_type': type,
        'already_member': already,
      });
      if (!already) {
        Analytics.instance.track(
          type == 'session' ? 'session_joined' : '${type}_joined',
          {'source': 'invite'},
        );
      }
      ApiService.instance.clearCache();
      final route = res['appRoute']?.toString();
      if (!mounted) return;
      context.go(route != null && route.startsWith('/') ? route : '/');
      if (!already) PushService.instance.maybeAskPermission();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      if (e.statusCode == 410) _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _joining = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text("You're invited"),
      leading: IconButton(
        icon: const Icon(Icons.close_rounded),
        onPressed: () => context.go('/'),
      ),
    ),
    body: _loading
        ? const CenteredLoader()
        : _error != null
            ? ErrorView(message: _error!, onRetry: _load)
            : _buildBody(),
  );

  Widget _buildBody() {
    final p = _preview!;
    final type = p['type']?.toString() ?? 'clan';
    final t = (p['target'] as Map?)?.cast<String, dynamic>() ?? {};
    final name = t['name']?.toString() ?? '';
    final invitedBy = p['invitedBy']?.toString();
    final already = p['alreadyMember'] == true;
    final blocker = inviteBlocker(p);
    final canOpen = already && p['status'] == 'active';

    final (IconData icon, String kind) = switch (type) {
      'batch'   => (Icons.school_rounded, 'Academy batch'),
      'session' => (Icons.sports_tennis_rounded, 'Game'),
      _         => (Icons.shield_rounded, 'Clan'),
    };

    final details = <Widget>[];
    if (type == 'session') {
      final when = DateTime.tryParse(t['scheduledAt']?.toString() ?? '')?.toLocal();
      final sport = t['sport']?.toString();
      if (sport != null) {
        details.add(_Info(Icons.sports_rounded,
            '${kSportCfg[sport]?['emoji'] ?? ''} $sport'.trim()));
      }
      if (when != null) {
        details.add(_Info(Icons.access_time_outlined,
            DateFormat('EEE, MMM d · h:mm a').format(when)));
      }
      final loc = t['location']?.toString();
      if (loc != null && loc.isNotEmpty) details.add(_Info(Icons.location_on_outlined, loc));
      final max = _int(t['maxPlayers']);
      final joined = _int(t['joinedCount']);
      details.add(_Info(Icons.people_outline,
          max > 0 ? '$joined/$max players · ${(max - joined).clamp(0, max)} spots left'
                  : '$joined players'));
      final skill = t['skillLevel']?.toString();
      if (skill != null && skill != 'any') details.add(_Info(Icons.trending_up_rounded, 'Level: $skill'));
      final host = t['hostName']?.toString();
      if (host != null && host.isNotEmpty) details.add(_Info(Icons.person_outline, 'Hosted by $host'));
    } else {
      final org = t['orgName']?.toString();
      if (type == 'batch' && org != null && org.isNotEmpty) {
        details.add(_Info(Icons.apartment_rounded, org));
      }
      final n = _int(t['memberCount']);
      details.add(_Info(Icons.people_outline, '$n member${n == 1 ? '' : 's'}'));
    }

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: kColorSurface,
            borderRadius: BorderRadius.circular(20),
            boxShadow: const [BoxShadow(color: Color(0x0F000000), blurRadius: 12, offset: Offset(0, 3))],
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(
                width: 48, height: 48,
                decoration: BoxDecoration(
                  color: kColorPrimary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: kColorPrimary),
              ),
              const SizedBox(width: 14),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(kind.toUpperCase(), style: const TextStyle(
                  color: kColorMuted, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1)),
                const SizedBox(height: 2),
                Text(name.isEmpty ? kind : name, style: const TextStyle(
                  color: kColorText, fontSize: 20, fontWeight: FontWeight.w800)),
              ])),
            ]),
            const SizedBox(height: 16),
            ...details.expand((w) => [w, const SizedBox(height: 6)]),
            if (invitedBy != null && invitedBy.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Invited by $invitedBy', style: const TextStyle(
                color: kColorMuted, fontSize: 13, fontStyle: FontStyle.italic)),
            ],
          ]),
        ),
        const SizedBox(height: 20),
        if (blocker != null) ...[
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: kColorRose.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(children: [
              const Icon(Icons.info_outline_rounded, color: kColorRose, size: 18),
              const SizedBox(width: 8),
              Expanded(child: Text(blocker, style: const TextStyle(
                color: kColorRose, fontWeight: FontWeight.w600))),
            ]),
          ),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: () => context.go('/'), child: const Text('Go to home')),
        ] else
          ElevatedButton(
            onPressed: _joining ? null : _accept,
            child: _joining
                ? const SizedBox(width: 20, height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(canOpen ? 'Open' : 'Join'),
          ),
      ],
    );
  }
}

class _Info extends StatelessWidget {
  final IconData icon;
  final String text;
  const _Info(this.icon, this.text);

  @override
  Widget build(BuildContext context) => Row(children: [
    Icon(icon, size: 16, color: kColorMuted),
    const SizedBox(width: 8),
    Expanded(child: Text(text, style: const TextStyle(color: kColorText, fontSize: 14))),
  ]);
}
