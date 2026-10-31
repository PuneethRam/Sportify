import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../../services/api_service.dart';
import '../../widgets/loading_screen.dart';

class CreateSeriesScreen extends StatefulWidget {
  final String clanId;
  const CreateSeriesScreen({super.key, required this.clanId});

  @override
  State<CreateSeriesScreen> createState() => _CreateSeriesScreenState();
}

class _CreateSeriesScreenState extends State<CreateSeriesScreen> {
  final _nameCtrl = TextEditingController();
  String _type = 'singles';
  int _totalMatches = 5;
  List<Map<String, dynamic>> _members = [];
  bool _loadingMembers = true;
  bool _saving = false;

  final List<String> _team1Players = [];
  final List<String> _team2Players = [];
  String _team1Name = 'Team 1';
  String _team2Name = 'Team 2';

  final _team1NameCtrl = TextEditingController(text: 'Team 1');
  final _team2NameCtrl = TextEditingController(text: 'Team 2');

  @override
  void initState() {
    super.initState();
    _loadMembers();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _team1NameCtrl.dispose();
    _team2NameCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadMembers() async {
    try {
      final data = await ApiService.instance.get(
        '/api/clans/get_clanmembers',
        query: {'clanId': widget.clanId},
      );
      setState(() {
        _members = List<Map<String, dynamic>>.from(data['data'] ?? data['members'] ?? []);
        _loadingMembers = false;
      });
    } catch (_) {
      setState(() => _loadingMembers = false);
    }
  }

  int get _needed => _type == 'doubles' ? 2 : 1;
  bool get _canSubmit =>
      _nameCtrl.text.trim().isNotEmpty &&
      _team1Players.length >= _needed &&
      _team2Players.length >= _needed;

  Future<void> _submit() async {
    if (!_canSubmit) return;
    setState(() => _saving = true);
    try {
      final team1Detail = _members.where((m) => _team1Players.contains(m['user_id']?.toString())).toList();
      final team2Detail = _members.where((m) => _team2Players.contains(m['user_id']?.toString())).toList();
      await ApiService.instance.post('/api/clans/series/create_series', {
        'clanId': widget.clanId,
        'name': _nameCtrl.text.trim(),
        'type': _type,
        'totalMatches': _totalMatches,
        'Team1_players': team1Detail,
        'Team2players': team2Detail,
        'team1_name': _team1Name,
        'team2_name': _team2Name,
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Create Series')),
    body: _loadingMembers
        ? const CenteredLoader()
        : ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Series name
              const Text('Series Name', style: TextStyle(
                color: kColorMuted, fontSize: 12, fontWeight: FontWeight.w700,
                letterSpacing: 0.8)),
              const SizedBox(height: 8),
              TextFormField(
                controller: _nameCtrl,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(hintText: 'e.g. Championship Finals'),
              ),
              const SizedBox(height: 20),

              // Match type
              const Text('Match Type', style: TextStyle(
                color: kColorMuted, fontSize: 12, fontWeight: FontWeight.w700,
                letterSpacing: 0.8)),
              const SizedBox(height: 8),
              Row(children: [
                _TypeBtn(label: 'Singles', icon: Icons.person_rounded,
                  selected: _type == 'singles',
                  onTap: () => setState(() => _type = 'singles')),
                const SizedBox(width: 8),
                _TypeBtn(label: 'Doubles', icon: Icons.people_rounded,
                  selected: _type == 'doubles',
                  onTap: () => setState(() => _type = 'doubles')),
              ]),
              const SizedBox(height: 20),

              // Total matches
              const Text('Total Matches', style: TextStyle(
                color: kColorMuted, fontSize: 12, fontWeight: FontWeight.w700,
                letterSpacing: 0.8)),
              const SizedBox(height: 8),
              Wrap(spacing: 8, children: [3, 5, 7, 9].map((n) => ChoiceChip(
                label: Text('$n'),
                selected: _totalMatches == n,
                onSelected: (_) => setState(() => _totalMatches = n),
              )).toList()),
              const SizedBox(height: 4),
              Text('Best of $_totalMatches — first to ${(_totalMatches / 2).ceil()} wins',
                style: const TextStyle(color: kColorMuted, fontSize: 12)),
              const SizedBox(height: 24),

              // Teams
              _TeamPanel(
                title: 'Team 1',
                nameCtrl: _team1NameCtrl,
                color: kColorPrimary,
                selected: _team1Players,
                members: _members,
                needed: _needed,
                onNameChanged: (v) => _team1Name = v,
                onToggle: (uid) => setState(() {
                  if (_team1Players.contains(uid)) _team1Players.remove(uid);
                  else _team1Players.add(uid);
                }),
              ),
              const SizedBox(height: 16),
              _TeamPanel(
                title: 'Team 2',
                nameCtrl: _team2NameCtrl,
                color: kColorEmerald,
                selected: _team2Players,
                members: _members,
                needed: _needed,
                onNameChanged: (v) => _team2Name = v,
                onToggle: (uid) => setState(() {
                  if (_team2Players.contains(uid)) _team2Players.remove(uid);
                  else _team2Players.add(uid);
                }),
              ),
              const SizedBox(height: 24),

              ElevatedButton(
                onPressed: (_canSubmit && !_saving) ? _submit : null,
                child: _saving
                    ? const SizedBox(width: 20, height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Create Series'),
              ),
            ],
          ),
  );
}

class _TypeBtn extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  const _TypeBtn({required this.label, required this.icon, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) => Expanded(
    child: GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: selected ? kColorPrimary : kColorSurface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? kColorPrimary : const Color(0x18000000)),
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(icon, size: 16, color: selected ? Colors.white : kColorMuted),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(
            color: selected ? Colors.white : kColorText,
            fontWeight: FontWeight.w600, fontSize: 13)),
        ]),
      ),
    ),
  );
}

class _TeamPanel extends StatelessWidget {
  final String title;
  final TextEditingController nameCtrl;
  final Color color;
  final List<String> selected;
  final List<Map<String, dynamic>> members;
  final int needed;
  final ValueChanged<String> onNameChanged;
  final ValueChanged<String> onToggle;

  const _TeamPanel({
    required this.title,
    required this.nameCtrl,
    required this.color,
    required this.selected,
    required this.members,
    required this.needed,
    required this.onNameChanged,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final ok = selected.length >= needed;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: kColorSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ok ? color.withOpacity(0.3) : const Color(0x18000000)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(
              color: color.withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            alignment: Alignment.center,
            child: Text(title.substring(0, 2),
              style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 11)),
          ),
          const SizedBox(width: 10),
          Expanded(child: TextField(
            controller: nameCtrl,
            onChanged: onNameChanged,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: kColorText),
            decoration: const InputDecoration(
              isDense: true,
              contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            ),
          )),
        ]),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: ok ? kColorEmerald.withOpacity(0.08) : kColorAmber.withOpacity(0.08),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            ok ? '✓ ${selected.length} player${selected.length > 1 ? "s" : ""} selected'
               : 'Select $needed player${needed > 1 ? "s" : ""} (${selected.length}/$needed)',
            style: TextStyle(
              color: ok ? kColorEmerald : kColorAmber,
              fontSize: 11, fontWeight: FontWeight.w600)),
        ),
        const SizedBox(height: 10),
        ...members.map((m) {
          final uid  = m['user_id']?.toString() ?? '';
          final name = m['name']?.toString() ?? '';
          final sel  = selected.contains(uid);
          return GestureDetector(
            onTap: () => onToggle(uid),
            child: Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: sel ? color.withOpacity(0.1) : kColorBg,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: sel ? color.withOpacity(0.3) : const Color(0x10000000)),
              ),
              child: Row(children: [
                CircleAvatar(
                  radius: 14,
                  backgroundColor: sel ? color.withOpacity(0.2) : const Color(0x10000000),
                  child: sel
                      ? Icon(Icons.check_rounded, size: 14, color: color)
                      : Text(name.isEmpty ? '?' : name[0],
                          style: const TextStyle(color: kColorMuted, fontSize: 11, fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: 10),
                Expanded(child: Text(name, style: const TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w600, color: kColorText))),
              ]),
            ),
          );
        }),
      ]),
    );
  }
}
