import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/clan_model.dart';
import '../../services/api_service.dart';
import '../../widgets/app_card.dart';
import '../../widgets/loading_screen.dart';

class ClansScreen extends StatefulWidget {
  const ClansScreen({super.key});

  @override
  State<ClansScreen> createState() => _ClansScreenState();
}

class _ClansScreenState extends State<ClansScreen> {
  List<Clan> _clans  = [];
  bool _loading      = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await ApiService.instance.get('/api/clans/get_user_clan');
      final all  = (data['data'] as List? ?? data['clans'] as List? ?? []);
      setState(() {
        _clans = all
            .map((e) => Clan.fromJson(e as Map<String, dynamic>))
            .where((c) => !c.isBatch)
            .toList();
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Clans'),
      actions: [
        IconButton(
          icon: const Icon(Icons.add_circle_outline, size: 22),
          onPressed: _showCreateClan,
          tooltip: 'Create Clan',
        ),
      ],
    ),
    body: _loading
        ? const CenteredLoader()
        : _error != null
            ? ErrorView(message: _error!, onRetry: _load)
            : RefreshIndicator(
                onRefresh: _load,
                color: kColorPrimary,
                child: _clans.isEmpty
                    ? EmptyView(
                        message: "You're not in any clans yet",
                        icon: Icons.shield_outlined,
                        action: ElevatedButton(
                          onPressed: _showJoinClan,
                          child: const Text('Join a Clan'),
                        ),
                      )
                    : ListView(
                        padding: const EdgeInsets.all(16),
                        children: [
                          ..._clans.map((c) => Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _ClanCard(clan: c),
                          )),
                          const SizedBox(height: 8),
                          OutlinedButton.icon(
                            onPressed: _showJoinClan,
                            icon: const Icon(Icons.group_add_outlined, size: 18),
                            label: const Text('Join Another Clan'),
                          ),
                        ],
                      ),
              ),
  );

  void _showCreateClan() {
    final ctrl = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: kColorSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(24, 24, 24,
          MediaQuery.of(ctx).viewInsets.bottom + 24),
        child: Column(mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Create Clan', style: TextStyle(
              fontWeight: FontWeight.w800, fontSize: 18, color: kColorText)),
            const SizedBox(height: 16),
            TextField(
              controller: ctrl,
              decoration: const InputDecoration(labelText: 'Clan Name'),
              textCapitalization: TextCapitalization.words,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () async {
                if (ctrl.text.trim().isEmpty) return;
                try {
                  await ApiService.instance.post('/api/clans/create_clan',
                    {'name': ctrl.text.trim()});
                  if (ctx.mounted) Navigator.pop(ctx);
                  _load();
                } catch (e) {
                  if (ctx.mounted) ScaffoldMessenger.of(ctx).showSnackBar(
                    SnackBar(content: Text(e.toString())));
                }
              },
              child: const Text('Create'),
            ),
          ],
        ),
      ),
    );
  }

  void _showJoinClan() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: kColorSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => _JoinClanSheet(onJoined: _load),
    );
  }
}

class _ClanCard extends StatelessWidget {
  final Clan clan;
  const _ClanCard({required this.clan});

  static Color _rankColor(int rank) {
    if (rank == 1) return const Color(0xFFFBBF24);
    if (rank == 2) return const Color(0xFFB0BEC5);
    if (rank == 3) return const Color(0xFFCD7F32);
    return kColorPrimary;
  }

  @override
  Widget build(BuildContext context) {
    final rc = _rankColor(clan.clanRank);
    final isTop3 = clan.clanRank <= 3;

    return GestureDetector(
      onTap: () => context.push('/clans/${clan.clanId}'),
      child: Container(
        decoration: BoxDecoration(
          gradient: isTop3
              ? LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [const Color(0xFF070D1C), const Color(0xFF0B1E3E)],
                )
              : null,
          color: isTop3 ? null : kColorSurface,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
              color: rc.withOpacity(isTop3 ? 0.30 : 0.12),
              blurRadius: isTop3 ? 24 : 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: Stack(children: [
            // Decorative shine for top-3
            if (isTop3)
              Positioned(
                right: -30, top: -30,
                child: Container(
                  width: 100, height: 100,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: rc.withOpacity(0.06),
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(children: [
                // Shield icon with glow ring
                Container(
                  width: 56, height: 56,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      begin: Alignment.topLeft, end: Alignment.bottomRight,
                      colors: [rc, rc.withOpacity(0.6)],
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: rc.withOpacity(isTop3 ? 0.50 : 0.25),
                        blurRadius: isTop3 ? 16 : 8,
                        spreadRadius: isTop3 ? 1 : 0,
                      ),
                    ],
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(3),
                    child: Container(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isTop3 ? const Color(0xFF0B1E3E) : kColorSurface,
                      ),
                      child: Icon(Icons.shield_rounded, color: rc, size: 26),
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(clan.name, style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 16,
                      color: isTop3 ? Colors.white : kColorText,
                      letterSpacing: -0.3,
                    )),
                    const SizedBox(height: 5),
                    Row(children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: rc.withOpacity(isTop3 ? 0.18 : 0.10),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: rc.withOpacity(0.35), width: 1),
                        ),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Icon(
                            clan.clanRank == 1 ? Icons.emoji_events_rounded
                              : clan.clanRank == 2 ? Icons.workspace_premium_rounded
                              : Icons.military_tech_rounded,
                            color: rc, size: 11),
                          const SizedBox(width: 4),
                          Text('Rank #${clan.clanRank}', style: TextStyle(
                            fontSize: 11, color: rc, fontWeight: FontWeight.w800,
                            letterSpacing: 0.3)),
                        ]),
                      ),
                    ]),
                  ],
                )),
                Icon(Icons.chevron_right_rounded,
                  color: isTop3 ? Colors.white38 : kColorMuted, size: 20),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class _JoinClanSheet extends StatefulWidget {
  final VoidCallback onJoined;
  const _JoinClanSheet({required this.onJoined});

  @override
  State<_JoinClanSheet> createState() => _JoinClanSheetState();
}

class _JoinClanSheetState extends State<_JoinClanSheet> {
  final _searchCtrl   = TextEditingController();
  List<Clan> _all     = [];
  List<Clan> _filtered = [];
  bool _loading        = true;

  @override
  void initState() {
    super.initState();
    _loadAll();
    _searchCtrl.addListener(() {
      final q = _searchCtrl.text.toLowerCase();
      setState(() {
        _filtered = q.isEmpty
            ? _all
            : _all.where((c) => c.name.toLowerCase().contains(q)).toList();
      });
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadAll() async {
    try {
      final data = await ApiService.instance.get('/api/clans/get_all_clans');
      final list = (data['data'] as List? ?? [])
          .map((e) => Clan.fromJson(e as Map<String, dynamic>)).toList();
      setState(() { _all = list; _filtered = list; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => DraggableScrollableSheet(
    expand: false,
    initialChildSize: 0.75,
    maxChildSize: 0.92,
    builder: (ctx, scroll) => Column(children: [
      Container(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
        child: Column(children: [
          const Text('Join a Clan', style: TextStyle(
            fontSize: 18, fontWeight: FontWeight.w800, color: kColorText)),
          const SizedBox(height: 12),
          TextField(
            controller: _searchCtrl,
            decoration: const InputDecoration(
              labelText: 'Search clans',
              prefixIcon: Icon(Icons.search, size: 18),
            ),
          ),
        ]),
      ),
      Expanded(
        child: _loading
            ? const CenteredLoader()
            : ListView.builder(
                controller: scroll,
                padding: const EdgeInsets.symmetric(horizontal: 20),
                itemCount: _filtered.length,
                itemBuilder: (_, i) {
                  final c = _filtered[i];
                  return ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 0, vertical: 4),
                    leading: const CircleAvatar(
                      backgroundColor: Color(0x1A0284C7),
                      child: Icon(Icons.shield_rounded, color: kColorPrimary, size: 20),
                    ),
                    title: Text(c.name, style: const TextStyle(
                      fontWeight: FontWeight.w600, color: kColorText)),
                    subtitle: Text('Rank #${c.clanRank}',
                      style: const TextStyle(fontSize: 12, color: kColorMuted)),
                    trailing: TextButton(
                      onPressed: () async {
                        try {
                          await ApiService.instance.post('/api/clans/join_clan',
                            {'clanId': c.clanId});
                          if (ctx.mounted) Navigator.pop(ctx);
                          widget.onJoined();
                        } catch (e) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(e.toString())));
                        }
                      },
                      child: const Text('Join'),
                    ),
                  );
                },
              ),
      ),
    ]),
  );
}
