import 'dart:convert';
import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../../services/api_service.dart';
import '../../widgets/loading_screen.dart';

class _TournamentTeam {
  String name;
  List<String> playerIds;
  _TournamentTeam(this.name, {List<String>? playerIds}) : playerIds = playerIds ?? [];
}

class _TournamentGroup {
  String name;
  List<int> teamIndices;
  int repeatCount;
  _TournamentGroup(this.name) : teamIndices = [], repeatCount = 1;
}

class CreateTournamentScreen extends StatefulWidget {
  final String clanId;
  const CreateTournamentScreen({super.key, required this.clanId});

  @override
  State<CreateTournamentScreen> createState() => _CreateTournamentScreenState();
}

class _CreateTournamentScreenState extends State<CreateTournamentScreen> {
  final _nameCtrl = TextEditingController();

  String _type = 'singles';
  String _format = 'knockout';
  bool _playerMode = true;
  DateTime _startDate = DateTime.now();
  int _teamCount = 2;

  List<Map<String, dynamic>> _members = [];
  bool _membersLoading = true;

  List<Map<String, dynamic>> _selectedPlayers = [];
  List<_TournamentTeam> _teams = [_TournamentTeam('Team 1'), _TournamentTeam('Team 2')];

  List<_TournamentGroup> _groups = [_TournamentGroup('Group A')];
  int _teamsPerGroup = 2;
  int? _expandedTeam;

  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _loadMembers();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadMembers() async {
    try {
      final data = await ApiService.instance.get(
        '/api/clans/get_clanmembers',
        query: {'clanId': widget.clanId},
      );
      setState(() {
        _members = List<Map<String, dynamic>>.from(
            data['members'] ?? data['data'] ?? []);
        _membersLoading = false;
      });
    } catch (_) {
      setState(() => _membersLoading = false);
    }
  }

  List<_TournamentTeam> get _effectiveTeams {
    if (_playerMode && _type == 'singles') {
      return _selectedPlayers.map((p) => _TournamentTeam(
        p['name']?.toString() ?? 'Player',
        playerIds: [p['user_id']?.toString() ?? ''],
      )).toList();
    }
    return _teams;
  }

  Future<void> _create() async {
    if (_nameCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Enter a tournament name')));
      return;
    }
    final teams = _effectiveTeams;
    if (teams.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Add at least 2 participants')));
      return;
    }
    if (!_playerMode && teams.any((t) => t.playerIds.isEmpty)) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('All teams must have at least one player')));
      return;
    }

    setState(() => _saving = true);
    try {
      final startStr = '${_startDate.year}-'
          '${_startDate.month.toString().padLeft(2, '0')}-'
          '${_startDate.day.toString().padLeft(2, '0')}';

      await ApiService.instance.post(
          '/api/clans/tournaments/create_tournament', {
        'clanId': widget.clanId,
        'tournament_name': _nameCtrl.text.trim(),
        'tournament_type': _type,
        'format': _format,
        'start_date': startStr,
        'status': 'upcoming',
        'teams': teams.map((t) => {
          'team_name': t.name,
          'players': jsonEncode(t.playerIds),
        }).toList(),
        'groups': _format == 'group_knockout'
            ? _groups.map((g) => {
                'group_name': g.name,
                'teams': g.teamIndices,
                'match_repeat_count': g.repeatCount,
              }).toList()
            : [],
        'teams_per_group': _teamsPerGroup,
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _updateTeamCount(int n) {
    if (n < 2) n = 2;
    setState(() {
      _teamCount = n;
      while (_teams.length < n) _teams.add(_TournamentTeam('Team ${_teams.length + 1}'));
      while (_teams.length > n) _teams.removeLast();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create Tournament')),
      body: _membersLoading
          ? const CenteredLoader()
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _sectionLabel('1', 'Tournament Details'),
                const SizedBox(height: 12),
                TextField(
                  controller: _nameCtrl,
                  decoration: const InputDecoration(labelText: 'Tournament Name'),
                  textCapitalization: TextCapitalization.words,
                ),
                const SizedBox(height: 12),
                _buildDatePicker(),
                const SizedBox(height: 20),

                _sectionLabel('2', 'Configuration'),
                const SizedBox(height: 12),
                _buildTypeRow(),
                const SizedBox(height: 12),
                if (_type == 'singles') ...[
                  _buildEntryModeRow(),
                  const SizedBox(height: 12),
                ],
                _buildFormatRow(),
                if (!_playerMode) ...[
                  const SizedBox(height: 12),
                  _buildTeamCountRow(),
                ],
                const SizedBox(height: 20),

                _sectionLabel('3',
                    _playerMode && _type == 'singles'
                        ? 'Select Players'
                        : 'Teams & Players'),
                const SizedBox(height: 12),
                if (_playerMode && _type == 'singles')
                  _buildPlayerPicker()
                else
                  _buildTeamBuilder(),

                if (_format == 'group_knockout') ...[
                  const SizedBox(height: 20),
                  _sectionLabel('4', 'Group Configuration'),
                  const SizedBox(height: 12),
                  _buildGroupsConfig(),
                ],

                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _saving ? null : _create,
                  child: _saving
                      ? const SizedBox(
                          width: 20, height: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('Create Tournament'),
                ),
                const SizedBox(height: 16),
              ],
            ),
    );
  }

  Widget _sectionLabel(String step, String label) => Row(children: [
    Container(
      width: 26, height: 26,
      decoration: BoxDecoration(color: kColorPrimary, shape: BoxShape.circle),
      alignment: Alignment.center,
      child: Text(step, style: const TextStyle(
          color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
    ),
    const SizedBox(width: 10),
    Text(label, style: const TextStyle(
        color: kColorText, fontSize: 15, fontWeight: FontWeight.w800)),
  ]);

  Widget _buildDatePicker() => GestureDetector(
    onTap: () async {
      final d = await showDatePicker(
        context: context,
        initialDate: _startDate,
        firstDate: DateTime.now(),
        lastDate: DateTime.now().add(const Duration(days: 365)),
      );
      if (d != null) setState(() => _startDate = d);
    },
    child: Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: kColorSurface,
        borderRadius: BorderRadius.circular(14),
        boxShadow: const [BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2))],
      ),
      child: Row(children: [
        const Icon(Icons.calendar_today_outlined, color: kColorPrimary, size: 18),
        const SizedBox(width: 10),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Start Date', style: TextStyle(
              color: kColorMuted, fontSize: 11, fontWeight: FontWeight.w600)),
          Text(
            '${_startDate.day}/${_startDate.month}/${_startDate.year}',
            style: const TextStyle(color: kColorText, fontWeight: FontWeight.w700)),
        ]),
        const Spacer(),
        const Icon(Icons.chevron_right_rounded, color: kColorMuted, size: 18),
      ]),
    ),
  );

  Widget _buildTypeRow() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text('Match Type', style: TextStyle(
          color: kColorMuted, fontSize: 11, fontWeight: FontWeight.w700,
          letterSpacing: 0.8)),
      const SizedBox(height: 8),
      Row(children: [
        _typeChip('Singles', 'singles', Icons.person_rounded),
        const SizedBox(width: 8),
        _typeChip('Doubles', 'doubles', Icons.people_rounded),
      ]),
    ],
  );

  Widget _typeChip(String label, String value, IconData icon) {
    final sel = _type == value;
    return GestureDetector(
      onTap: () => setState(() {
        _type = value;
        if (value == 'doubles') _playerMode = false;
      }),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: sel ? kColorPrimary : kColorSurface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: sel ? kColorPrimary : const Color(0x18000000)),
        ),
        child: Row(children: [
          Icon(icon, size: 14, color: sel ? Colors.white : kColorMuted),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(
              color: sel ? Colors.white : kColorText,
              fontWeight: FontWeight.w700, fontSize: 13)),
        ]),
      ),
    );
  }

  Widget _buildEntryModeRow() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text('Entry Mode', style: TextStyle(
          color: kColorMuted, fontSize: 11, fontWeight: FontWeight.w700,
          letterSpacing: 0.8)),
      const SizedBox(height: 8),
      Row(children: [
        _entryModeChip('Player Mode', true,
            'Each player competes solo'),
        const SizedBox(width: 8),
        _entryModeChip('Team Mode', false,
            'Create named teams'),
      ]),
    ],
  );

  Widget _entryModeChip(String label, bool isPlayerMode, String desc) {
    final sel = _playerMode == isPlayerMode;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _playerMode = isPlayerMode),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: sel ? kColorPrimary.withOpacity(0.08) : kColorSurface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
                color: sel ? kColorPrimary : const Color(0x18000000)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: TextStyle(
                color: sel ? kColorPrimary : kColorText,
                fontWeight: FontWeight.w700, fontSize: 13)),
            const SizedBox(height: 2),
            Text(desc, style: const TextStyle(
                color: kColorMuted, fontSize: 11)),
          ]),
        ),
      ),
    );
  }

  Widget _buildFormatRow() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text('Format', style: TextStyle(
          color: kColorMuted, fontSize: 11, fontWeight: FontWeight.w700,
          letterSpacing: 0.8)),
      const SizedBox(height: 8),
      Row(children: [
        _formatChip('Knockout', 'knockout', kColorRose),
        const SizedBox(width: 8),
        _formatChip('Round Robin', 'round_robin', kColorPrimary),
        const SizedBox(width: 8),
        _formatChip('Group+KO', 'group_knockout', kColorAmber),
      ]),
    ],
  );

  Widget _formatChip(String label, String value, Color color) {
    final sel = _format == value;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _format = value),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: sel ? color.withOpacity(0.12) : kColorSurface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
                color: sel ? color : const Color(0x18000000)),
          ),
          alignment: Alignment.center,
          child: Text(label, style: TextStyle(
              color: sel ? color : kColorMuted,
              fontWeight: FontWeight.w700, fontSize: 12)),
        ),
      ),
    );
  }

  Widget _buildTeamCountRow() => Row(children: [
    const Text('Number of Teams',
        style: TextStyle(color: kColorMuted, fontSize: 13)),
    const Spacer(),
    GestureDetector(
      onTap: _teamCount > 2 ? () => _updateTeamCount(_teamCount - 1) : null,
      child: Container(
        width: 32, height: 32,
        decoration: BoxDecoration(
          color: _teamCount > 2 ? kColorPrimary.withOpacity(0.1) : const Color(0x08000000),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(Icons.remove_rounded,
            size: 16,
            color: _teamCount > 2 ? kColorPrimary : kColorMuted),
      ),
    ),
    Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Text('$_teamCount', style: const TextStyle(
          color: kColorText, fontWeight: FontWeight.w800, fontSize: 16)),
    ),
    GestureDetector(
      onTap: () => _updateTeamCount(_teamCount + 1),
      child: Container(
        width: 32, height: 32,
        decoration: BoxDecoration(
          color: kColorPrimary.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Icon(Icons.add_rounded, size: 16, color: kColorPrimary),
      ),
    ),
  ]);

  Widget _buildPlayerPicker() {
    if (_members.isEmpty) {
      return const EmptyView(message: 'No clan members', icon: Icons.person_outline);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _selectedPlayers.length >= 2
              ? '${_selectedPlayers.length} players selected'
              : 'Select at least 2 players',
          style: TextStyle(
              color: _selectedPlayers.length >= 2 ? kColorEmerald : kColorAmber,
              fontSize: 12, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 10),
        ..._members.map((m) {
          final uid = m['user_id']?.toString() ?? '';
          final name = m['name']?.toString() ?? '';
          final sel = _selectedPlayers.any((p) => p['user_id'] == uid);
          final idx = _selectedPlayers.indexWhere((p) => p['user_id'] == uid);
          return GestureDetector(
            onTap: () => setState(() {
              if (sel) _selectedPlayers.removeWhere((p) => p['user_id'] == uid);
              else _selectedPlayers.add(m);
            }),
            child: Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: sel ? kColorPrimary.withOpacity(0.08) : kColorSurface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: sel ? kColorPrimary : const Color(0x18000000)),
              ),
              child: Row(children: [
                Container(
                  width: 28, height: 28,
                  decoration: BoxDecoration(
                    color: sel ? kColorPrimary : const Color(0x10000000),
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: sel
                      ? Text('${idx + 1}', style: const TextStyle(
                          color: Colors.white, fontSize: 11,
                          fontWeight: FontWeight.w800))
                      : Text(name.isEmpty ? '?' : name[0].toUpperCase(),
                          style: const TextStyle(
                              color: kColorMuted, fontSize: 11,
                              fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: 10),
                Expanded(child: Text(name, style: TextStyle(
                    color: sel ? kColorPrimary : kColorText,
                    fontWeight: FontWeight.w600, fontSize: 13))),
                if (sel)
                  const Icon(Icons.check_circle_rounded,
                      color: kColorPrimary, size: 18),
              ]),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildTeamBuilder() {
    return Column(
      children: _teams.asMap().entries.map((e) {
        final i = e.key;
        final team = e.value;
        final isOpen = _expandedTeam == i;
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          decoration: BoxDecoration(
            color: kColorSurface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: team.playerIds.isEmpty
                  ? const Color(0x18000000)
                  : kColorEmerald.withOpacity(0.3)),
          ),
          child: Column(
            children: [
              GestureDetector(
                onTap: () => setState(() => _expandedTeam = isOpen ? null : i),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(children: [
                    Container(
                      width: 32, height: 32,
                      decoration: BoxDecoration(
                        color: team.playerIds.isNotEmpty
                            ? kColorEmerald.withOpacity(0.12)
                            : kColorPrimary.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: Text('${i + 1}', style: TextStyle(
                          color: team.playerIds.isNotEmpty ? kColorEmerald : kColorPrimary,
                          fontWeight: FontWeight.w800, fontSize: 13)),
                    ),
                    const SizedBox(width: 10),
                    Expanded(child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(team.name, style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 13,
                            color: kColorText)),
                        Text(
                          team.playerIds.isEmpty
                              ? 'No players'
                              : '${team.playerIds.length} player(s)',
                          style: TextStyle(
                              color: team.playerIds.isEmpty
                                  ? kColorMuted : kColorEmerald,
                              fontSize: 11)),
                      ],
                    )),
                    Icon(isOpen
                        ? Icons.keyboard_arrow_up_rounded
                        : Icons.keyboard_arrow_down_rounded,
                        color: kColorMuted),
                  ]),
                ),
              ),
              if (isOpen) ...[
                const Divider(height: 1),
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      TextField(
                        controller: TextEditingController(text: team.name)
                          ..selection = TextSelection.collapsed(offset: team.name.length),
                        decoration: const InputDecoration(
                            labelText: 'Team Name', isDense: true),
                        onChanged: (v) => setState(() => team.name = v),
                      ),
                      const SizedBox(height: 10),
                      const Text('Players', style: TextStyle(
                          color: kColorMuted, fontSize: 11,
                          fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      ..._members.map((m) {
                        final uid = m['user_id']?.toString() ?? '';
                        final mName = m['name']?.toString() ?? '';
                        final sel = team.playerIds.contains(uid);
                        final usedElsewhere = !sel && _teams.asMap().entries
                            .any((e2) => e2.key != i && e2.value.playerIds.contains(uid));
                        return GestureDetector(
                          onTap: usedElsewhere ? null : () => setState(() {
                            if (sel) team.playerIds.remove(uid);
                            else team.playerIds.add(uid);
                          }),
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 4),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 8),
                            decoration: BoxDecoration(
                              color: sel
                                  ? kColorPrimary.withOpacity(0.08)
                                  : usedElsewhere
                                      ? const Color(0x06000000)
                                      : const Color(0x04000000),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                  color: sel
                                      ? kColorPrimary.withOpacity(0.3)
                                      : const Color(0x10000000)),
                            ),
                            child: Row(children: [
                              Text(mName, style: TextStyle(
                                  color: usedElsewhere ? kColorMuted : kColorText,
                                  fontSize: 12, fontWeight: FontWeight.w600)),
                              if (usedElsewhere) ...[
                                const SizedBox(width: 6),
                                const Text('other team',
                                    style: TextStyle(
                                        color: kColorMuted, fontSize: 10)),
                              ],
                              const Spacer(),
                              if (sel)
                                const Icon(Icons.check_rounded,
                                    color: kColorPrimary, size: 16),
                            ]),
                          ),
                        );
                      }),
                    ],
                  ),
                ),
              ],
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _buildGroupsConfig() {
    final teams = _effectiveTeams;
    final knockoutSize = _groups.length * _teamsPerGroup;
    final isPow2 = knockoutSize >= 2 && (knockoutSize & (knockoutSize - 1)) == 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: isPow2
                ? kColorEmerald.withOpacity(0.06)
                : kColorAmber.withOpacity(0.06),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
                color: isPow2
                    ? kColorEmerald.withOpacity(0.3)
                    : kColorAmber.withOpacity(0.3)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Icon(isPow2 ? Icons.check_circle_rounded : Icons.warning_rounded,
                  color: isPow2 ? kColorEmerald : kColorAmber, size: 18),
              const SizedBox(width: 8),
              Text('Knockout bracket: $knockoutSize teams',
                  style: TextStyle(
                      color: isPow2 ? kColorEmerald : kColorAmber,
                      fontWeight: FontWeight.w700, fontSize: 13)),
            ]),
            if (!isPow2)
              const Padding(
                padding: EdgeInsets.only(top: 4),
                child: Text('Must be a power of 2 (2, 4, 8, 16…)',
                    style: TextStyle(color: kColorAmber, fontSize: 11)),
              ),
            const SizedBox(height: 10),
            Row(children: [
              const Text('Advance per group:',
                  style: TextStyle(color: kColorMuted, fontSize: 12)),
              const SizedBox(width: 10),
              _stepper(_teamsPerGroup, 1,
                  (v) => setState(() => _teamsPerGroup = v)),
            ]),
          ]),
        ),
        const SizedBox(height: 12),
        ..._groups.asMap().entries.map((e) {
          final gi = e.key;
          final g = e.value;
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: kColorSurface,
              borderRadius: BorderRadius.circular(12),
              boxShadow: const [BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2))],
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  width: 28, height: 28,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                        colors: [kColorAmber, Color(0xFFf59e0b)]),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  alignment: Alignment.center,
                  child: Text(String.fromCharCode(65 + gi),
                      style: const TextStyle(
                          color: Colors.white, fontWeight: FontWeight.w800,
                          fontSize: 12)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: TextEditingController(text: g.name)
                      ..selection =
                          TextSelection.collapsed(offset: g.name.length),
                    decoration: const InputDecoration(
                        isDense: true, border: InputBorder.none,
                        hintText: 'Group name'),
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 13,
                        color: kColorText),
                    onChanged: (v) => setState(() => g.name = v),
                  ),
                ),
                if (_groups.length > 1)
                  GestureDetector(
                    onTap: () => setState(() => _groups.removeAt(gi)),
                    child: const Icon(Icons.delete_outline,
                        color: kColorMuted, size: 18),
                  ),
              ]),
              const SizedBox(height: 8),
              Row(children: [
                const Text('Rounds:', style: TextStyle(
                    color: kColorMuted, fontSize: 11)),
                const SizedBox(width: 8),
                _stepper(g.repeatCount, 1,
                    (v) => setState(() => g.repeatCount = v)),
              ]),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6, runSpacing: 6,
                children: teams.asMap().entries.map((te) {
                  final ti = te.key;
                  final t = te.value;
                  final inThis = g.teamIndices.contains(ti);
                  final inOther = !inThis &&
                      _groups.asMap().entries.any((ge) =>
                          ge.key != gi && ge.value.teamIndices.contains(ti));
                  return GestureDetector(
                    onTap: inOther ? null : () => setState(() {
                      if (inThis) g.teamIndices.remove(ti);
                      else g.teamIndices.add(ti);
                    }),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: inThis
                            ? kColorAmber.withOpacity(0.12)
                            : inOther
                                ? const Color(0x06000000)
                                : const Color(0x08000000),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                            color: inThis
                                ? kColorAmber.withOpacity(0.4)
                                : const Color(0x12000000)),
                      ),
                      child: Text(t.name, style: TextStyle(
                          color: inThis
                              ? kColorAmber
                              : inOther ? kColorMuted : kColorText,
                          fontSize: 12, fontWeight: FontWeight.w600)),
                    ),
                  );
                }).toList(),
              ),
            ]),
          );
        }),
        TextButton.icon(
          onPressed: () => setState(() {
            _groups.add(_TournamentGroup(
                'Group ${String.fromCharCode(65 + _groups.length)}'));
          }),
          icon: const Icon(Icons.add, size: 16),
          label: const Text('Add Group'),
        ),
      ],
    );
  }

  Widget _stepper(int value, int min, void Function(int) onChange) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      GestureDetector(
        onTap: value > min ? () => onChange(value - 1) : null,
        child: Container(
          width: 28, height: 28,
          decoration: BoxDecoration(
            color: value > min
                ? kColorPrimary.withOpacity(0.1)
                : const Color(0x08000000),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Icon(Icons.remove_rounded, size: 14,
              color: value > min ? kColorPrimary : kColorMuted),
        ),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10),
        child: Text('$value', style: const TextStyle(
            color: kColorText, fontWeight: FontWeight.w800, fontSize: 14)),
      ),
      GestureDetector(
        onTap: () => onChange(value + 1),
        child: Container(
          width: 28, height: 28,
          decoration: BoxDecoration(
            color: kColorPrimary.withOpacity(0.1),
            borderRadius: BorderRadius.circular(6),
          ),
          child: const Icon(Icons.add_rounded, size: 14, color: kColorPrimary),
        ),
      ),
    ],
  );
}
