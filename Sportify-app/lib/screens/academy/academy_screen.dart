import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/organisation_model.dart';
import '../../services/api_service.dart';
import '../../widgets/loading_screen.dart';

class AcademyScreen extends StatefulWidget {
  const AcademyScreen({super.key});

  @override
  State<AcademyScreen> createState() => _AcademyScreenState();
}

class _AcademyScreenState extends State<AcademyScreen> {
  List<Organisation> _owned       = [];
  List<Organisation> _memberOrgs  = [];
  List<Batch>        _batches     = [];
  bool  _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([
        ApiService.instance.get('/api/organisations/get_user_orgs'),
        ApiService.instance.get('/api/organisations/get_member_orgs'),
        ApiService.instance.get('/api/clans/get_user_clan'),
      ]);

      final ownedList   = (results[0]['data'] as List? ?? [])
          .map((e) => Organisation.fromJson(e)).toList();
      final memberOrgList = (results[1]['data'] as List? ?? []);
      final clansRaw    = (results[2]['data'] as List? ?? []);

      setState(() {
        _owned      = ownedList;
        _memberOrgs = memberOrgList
            .map((e) => Organisation.fromJson(e as Map<String, dynamic>)).toList();
        _batches    = clansRaw
            .where((e) => (e as Map)['type']?.toString() == 'batch')
            .map((e) => Batch.fromJson(e as Map<String, dynamic>))
            .toList();
        _loading    = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Academy'),
      actions: [
        IconButton(
          icon: const Icon(Icons.add_business_outlined, size: 22),
          onPressed: _showCreateAcademy,
          tooltip: 'Create Academy',
        ),
        IconButton(
          icon: const Icon(Icons.group_add_outlined, size: 22),
          onPressed: _showJoinBatch,
          tooltip: 'Join Batch',
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
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    if (_owned.isNotEmpty) ...[
                      const _SectionLabel('My Academies', kColorEmerald,
                        Icons.school_rounded),
                      const SizedBox(height: 8),
                      ..._owned.map((org) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _OrgCard(org: org, isOwner: true),
                      )),
                      const SizedBox(height: 16),
                    ],

                    if (_memberOrgs.isNotEmpty) ...[
                      const _SectionLabel('Member Of', kColorPrimary,
                        Icons.apartment_outlined),
                      const SizedBox(height: 8),
                      ..._memberOrgs.map((org) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _OrgCard(org: org, isOwner: false),
                      )),
                      const SizedBox(height: 16),
                    ],

                    if (_batches.isNotEmpty) ...[
                      const _SectionLabel('My Batches', kColorAmber,
                        Icons.groups_rounded),
                      const SizedBox(height: 8),
                      ..._batches.map((b) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _BatchCard(batch: b),
                      )),
                    ],

                    if (_owned.isEmpty && _batches.isEmpty && _memberOrgs.isEmpty)
                      EmptyView(
                        message:
                          'No academies or batches yet.\nCreate one or join via invite code.',
                        icon: Icons.school_outlined,
                        action: Column(mainAxisSize: MainAxisSize.min, children: [
                          ElevatedButton(
                            onPressed: _showCreateAcademy,
                            child: const Text('Create Academy'),
                          ),
                          const SizedBox(height: 8),
                          OutlinedButton(
                            onPressed: _showJoinBatch,
                            child: const Text('Join with Invite Code'),
                          ),
                        ]),
                      ),
                  ],
                ),
              ),
  );

  void _showCreateAcademy() {
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
            const Text('Create Academy', style: TextStyle(
              fontSize: 18, fontWeight: FontWeight.w800, color: kColorText)),
            const SizedBox(height: 16),
            TextField(
              controller: ctrl,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Academy Name'),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () async {
                if (ctrl.text.trim().isEmpty) return;
                try {
                  await ApiService.instance.post('/api/organisations/create',
                    {'name': ctrl.text.trim()});
                  if (ctx.mounted) Navigator.pop(ctx);
                  _load();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
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

  void _showJoinBatch() {
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
            const Text('Join a Batch', style: TextStyle(
              fontSize: 18, fontWeight: FontWeight.w800, color: kColorText)),
            const SizedBox(height: 6),
            const Text('Enter the invite code from your coach',
              style: TextStyle(color: kColorMuted, fontSize: 13)),
            const SizedBox(height: 16),
            TextField(
              controller: ctrl,
              decoration: const InputDecoration(labelText: 'Invite Code'),
              textCapitalization: TextCapitalization.characters,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () async {
                if (ctrl.text.trim().isEmpty) return;
                try {
                  await ApiService.instance.post('/api/organisations/join_batch',
                    {'inviteCode': ctrl.text.trim()});
                  if (ctx.mounted) Navigator.pop(ctx);
                  _load();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(e.toString())));
                }
              },
              child: const Text('Join'),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  final Color color;
  final IconData icon;
  const _SectionLabel(this.text, this.color, this.icon);

  @override
  Widget build(BuildContext context) => Row(children: [
    Container(
      width: 28, height: 28,
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Icon(icon, color: color, size: 15),
    ),
    const SizedBox(width: 8),
    Text(text, style: TextStyle(
      color: color, fontWeight: FontWeight.w800,
      fontSize: 13, letterSpacing: 0.3)),
  ]);
}

class _OrgCard extends StatelessWidget {
  final Organisation org;
  final bool isOwner;
  const _OrgCard({required this.org, required this.isOwner});

  @override
  Widget build(BuildContext context) {
    final color = isOwner ? kColorEmerald : kColorPrimary;

    return GestureDetector(
      onTap: () => context.push(
        '/academy/${org.orgId}',
        extra: {'orgName': org.name, 'isOwner': isOwner},
      ),
      child: Container(
        decoration: BoxDecoration(
          gradient: isOwner
              ? const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF051A0D), Color(0xFF0A2E18)],
                )
              : const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF050C1C), Color(0xFF0A1A38)],
                ),
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
              color: color.withOpacity(0.28),
              blurRadius: 20, offset: const Offset(0, 6)),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: Stack(children: [
            // Background glow blob
            Positioned(right: -20, top: -20,
              child: Container(
                width: 80, height: 80,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: color.withOpacity(0.07),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(children: [
                // Glowing icon
                Container(
                  width: 52, height: 52,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      begin: Alignment.topLeft, end: Alignment.bottomRight,
                      colors: [color, color.withOpacity(0.6)]),
                    boxShadow: [BoxShadow(
                      color: color.withOpacity(0.45),
                      blurRadius: 14, spreadRadius: 1)],
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(3),
                    child: Container(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isOwner ? const Color(0xFF0A2E18) : const Color(0xFF0A1A38),
                      ),
                      child: Icon(
                        isOwner ? Icons.school_rounded : Icons.apartment_rounded,
                        color: color, size: 24),
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(org.name, style: const TextStyle(
                      color: Colors.white, fontWeight: FontWeight.w900,
                      fontSize: 15, letterSpacing: -0.2)),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: color.withOpacity(0.18),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: color.withOpacity(0.35)),
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(
                          isOwner ? Icons.verified_rounded : Icons.person_rounded,
                          color: color, size: 10),
                        const SizedBox(width: 4),
                        Text(isOwner ? 'ACADEMY OWNER' : 'MEMBER',
                          style: TextStyle(fontSize: 10, color: color,
                            fontWeight: FontWeight.w800, letterSpacing: 0.5)),
                      ]),
                    ),
                  ],
                )),
                const Icon(Icons.chevron_right_rounded, color: Colors.white30, size: 20),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class _BatchCard extends StatelessWidget {
  final Batch batch;
  const _BatchCard({required this.batch});

  @override
  Widget build(BuildContext context) {
    Color barColor;
    if (batch.attendanceRate >= 75) barColor = kColorEmerald;
    else if (batch.attendanceRate >= 50) barColor = kColorAmber;
    else barColor = batch.attendanceRate > 0 ? kColorRose : kColorAmber;

    return GestureDetector(
      onTap: () => context.push('/clans/${batch.clanId}'),
      child: Container(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF120B00), Color(0xFF231500)],
          ),
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
              color: kColorAmber.withOpacity(0.22),
              blurRadius: 18, offset: const Offset(0, 5)),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: Stack(children: [
            Positioned(right: -20, top: -20,
              child: Container(
                width: 80, height: 80,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: kColorAmber.withOpacity(0.06),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  // Glowing groups icon
                  Container(
                    width: 50, height: 50,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft, end: Alignment.bottomRight,
                        colors: [Color(0xFFFBBF24), Color(0xFFD97706)]),
                      boxShadow: [BoxShadow(
                        color: kColorAmber.withOpacity(0.40),
                        blurRadius: 12, spreadRadius: 1)],
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(3),
                      child: Container(
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle, color: Color(0xFF231500)),
                        child: const Icon(Icons.groups_rounded, color: kColorAmber, size: 24),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(batch.name, style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w900,
                        fontSize: 15, letterSpacing: -0.2)),
                      if (batch.orgName.isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Text(batch.orgName, style: const TextStyle(
                          color: Colors.white38, fontSize: 12)),
                      ],
                    ],
                  )),
                  const Icon(Icons.chevron_right_rounded, color: Colors.white30, size: 20),
                ]),
                if (batch.attendanceRate > 0) ...[
                  const SizedBox(height: 14),
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    const Text('ATTENDANCE', style: TextStyle(
                      color: Colors.white38, fontSize: 10,
                      fontWeight: FontWeight.w700, letterSpacing: 1.0)),
                    Text('${batch.attendanceRate.round()}%', style: TextStyle(
                      color: barColor, fontSize: 13, fontWeight: FontWeight.w900)),
                  ]),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: batch.attendanceRate / 100,
                      minHeight: 6,
                      backgroundColor: Colors.white.withOpacity(0.08),
                      valueColor: AlwaysStoppedAnimation(barColor),
                    ),
                  ),
                ],
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}
