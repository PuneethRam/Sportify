import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../core/theme.dart';
import '../../models/game_session_model.dart';
import '../../providers/auth_provider.dart';
import '../../services/analytics.dart';
import '../../services/api_service.dart';
import '../../services/push_service.dart';
import '../../widgets/loading_screen.dart';
import '../../core/constants.dart';
import '../../widgets/invite_share.dart';
import '../../widgets/sport_badge.dart';

class SessionDetailScreen extends StatefulWidget {
  final String sessionId;
  const SessionDetailScreen({super.key, required this.sessionId});

  @override
  State<SessionDetailScreen> createState() => _SessionDetailScreenState();
}

class _SessionDetailScreenState extends State<SessionDetailScreen> {
  GameSession? _session;
  List<Map<String, dynamic>> _players = [];
  List<Map<String, dynamic>> _messages = [];
  bool _loading = true;
  bool _joining = false;
  final _msgCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _msgCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        ApiService.instance.get('/api/game-sessions/${widget.sessionId}'),
        ApiService.instance.get('/api/game-sessions/${widget.sessionId}/messages'),
      ]);
      if (!mounted) return;
      setState(() {
        final d = results[0];
        _session = GameSession.fromJson(d['session'] ?? d);
        _players = List<Map<String, dynamic>>.from(
          d['players'] ?? d['participants'] ?? []);
        _messages = List<Map<String, dynamic>>.from(
          results[1]['messages'] ?? []);
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  Future<void> _join() async {
    setState(() => _joining = true);
    try {
      await ApiService.instance.post(
        '/api/game-sessions/${widget.sessionId}/join', {});
      Analytics.instance.track('session_joined', {'source': 'browse'});
      await _load();
      if (mounted) PushService.instance.maybeAskPermission(context);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _joining = false);
    }
  }

  Future<void> _sendMessage() async {
    final msg = _msgCtrl.text.trim();
    if (msg.isEmpty) return;
    _msgCtrl.clear();
    try {
      await ApiService.instance.post(
        '/api/game-sessions/${widget.sessionId}/messages',
        {'message': msg});
      await _load();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return Scaffold(
      appBar: AppBar(),
      body: const CenteredLoader(),
    );
    if (_session == null) return Scaffold(
      appBar: AppBar(),
      body: const ErrorView(message: 'Session not found'),
    );

    final s     = _session!;
    final uid   = context.read<AuthProvider>().uid;
    final color = sportColor(s.sport);
    final isHost     = s.hostUserId == uid;
    final hasJoined  = _players.any((p) => p['user_id']?.toString() == uid);
    final canJoin    = !isHost && !hasJoined && s.isOpen;

    return Scaffold(
      appBar: AppBar(
        title: Text(s.title, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          if (isHost && s.status == 'open')
            InviteShareButton(type: 'session', id: s.sessionId, name: s.title),
          if (isHost)
            IconButton(
              icon: const Icon(Icons.refresh_outlined, size: 18),
              onPressed: _load),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Hero
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: color.withOpacity(0.08),
              borderRadius: BorderRadius.circular(20),
              boxShadow: [
                BoxShadow(color: color.withOpacity(0.12), blurRadius: 12, offset: const Offset(0, 3)),
                const BoxShadow(color: Color(0x06000000), blurRadius: 2),
              ],
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text(kSportCfg[s.sport]?['emoji'] ?? '🎯',
                  style: const TextStyle(fontSize: 32)),
                const SizedBox(width: 12),
                Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.title, style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 18, color: kColorText)),
                    Text('Hosted by ${s.hostName}',
                      style: const TextStyle(color: kColorMuted, fontSize: 13)),
                  ],
                )),
              ]),
              const SizedBox(height: 16),
              _InfoRow(Icons.location_on_outlined, s.location),
              const SizedBox(height: 6),
              _InfoRow(Icons.access_time_outlined,
                DateFormat('EEE, MMM d · h:mm a').format(s.scheduledAt)),
              const SizedBox(height: 6),
              _InfoRow(Icons.people_outline,
                '${s.joinedCount}/${s.maxPlayers} players'),
              if (s.description != null && s.description!.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(s.description!, style: const TextStyle(
                  color: kColorMuted, fontSize: 13)),
              ],
            ]),
          ),

          const SizedBox(height: 16),

          // Join / full / joined
          if (canJoin)
            ElevatedButton(
              onPressed: _joining ? null : _join,
              style: ElevatedButton.styleFrom(backgroundColor: color),
              child: _joining
                  ? const SizedBox(width: 20, height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text('Join Session (${s.spotsLeft} spots left)'),
            )
          else if (hasJoined)
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: kColorEmerald.withOpacity(0.1),
                borderRadius: BorderRadius.circular(14),
                boxShadow: [BoxShadow(color: kColorEmerald.withOpacity(0.12), blurRadius: 8, offset: const Offset(0, 2))],
              ),
              child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(Icons.check_circle_rounded, color: kColorEmerald, size: 18),
                SizedBox(width: 8),
                Text("You're in!", style: TextStyle(
                  color: kColorEmerald, fontWeight: FontWeight.w700)),
              ]),
            )
          else if (s.isFull)
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: kColorMuted.withOpacity(0.08),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Center(child: Text('Session is full',
                style: TextStyle(color: kColorMuted))),
            ),

          const SizedBox(height: 16),

          // Players list
          if (_players.isNotEmpty) ...[
            Text('Players (${_players.length})',
              style: const TextStyle(fontWeight: FontWeight.w700,
                fontSize: 14, color: kColorText)),
            const SizedBox(height: 10),
            ..._players.map((p) {
              final name = p['name']?.toString() ?? 'Player';
              return ListTile(
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(
                  radius: 18,
                  backgroundColor: color.withOpacity(0.15),
                  child: Text(name[0], style: TextStyle(
                    color: color, fontWeight: FontWeight.w700)),
                ),
                title: Text(name, style: const TextStyle(fontSize: 14, color: kColorText)),
                trailing: p['user_id']?.toString() == s.hostUserId
                    ? const Chip(label: Text('Host'),
                        padding: EdgeInsets.zero,
                        visualDensity: VisualDensity.compact)
                    : null,
              );
            }),
            const SizedBox(height: 8),
          ],

          // Chat
          if (_messages.isNotEmpty || (hasJoined || isHost)) ...[
            const Divider(),
            const SizedBox(height: 8),
            const Text('Chat', style: TextStyle(
              fontWeight: FontWeight.w700, fontSize: 14, color: kColorText)),
            const SizedBox(height: 10),
            ..._messages.map((m) => _ChatBubble(
              message: m,
              isMe: m['user_id']?.toString() == uid,
            )),
            if (hasJoined || isHost) ...[
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: TextField(
                  controller: _msgCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Message',
                    isDense: true,
                  ),
                  onSubmitted: (_) => _sendMessage(),
                )),
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.send_rounded, color: kColorPrimary),
                  onPressed: _sendMessage,
                ),
              ]),
            ],
          ],
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String text;
  const _InfoRow(this.icon, this.text);

  @override
  Widget build(BuildContext context) => Row(children: [
    Icon(icon, size: 14, color: kColorMuted),
    const SizedBox(width: 6),
    Expanded(child: Text(text, style: const TextStyle(
      color: kColorMuted, fontSize: 13))),
  ]);
}

class _ChatBubble extends StatelessWidget {
  final Map<String, dynamic> message;
  final bool isMe;
  const _ChatBubble({required this.message, required this.isMe});

  @override
  Widget build(BuildContext context) {
    final name = message['name']?.toString() ?? 'Player';
    final text = message['message']?.toString() ?? '';
    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.7),
        decoration: BoxDecoration(
          color: isMe ? kColorPrimary.withOpacity(0.2) : Colors.black.withOpacity(0.06),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (!isMe)
            Text(name, style: TextStyle(
              color: kColorPrimary, fontSize: 11, fontWeight: FontWeight.w700)),
          Text(text, style: const TextStyle(color: kColorText, fontSize: 13)),
        ]),
      ),
    );
  }
}

