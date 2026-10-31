import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../services/api_service.dart';
import '../../widgets/loading_screen.dart';
import '../../widgets/pending_results.dart';

// ── Simple data class (file-private) ─────────────────────────────────────────

class _Member {
  final String userId;
  final String name;
  const _Member({required this.userId, required this.name});
}

// ── Screen ───────────────────────────────────────────────────────────────────

class StartMatchScreen extends StatefulWidget {
  final String clanId;
  const StartMatchScreen({super.key, required this.clanId});

  @override
  State<StartMatchScreen> createState() => _StartMatchScreenState();
}

class _StartMatchScreenState extends State<StartMatchScreen> {
  List<_Member> _members = [];
  bool _loading   = true;
  bool _submitting = false;
  String? _error;

  String _matchType = 'singles';

  // Singles
  String? _player1;
  String? _player2;

  // Doubles
  String? _t1p1;
  String? _t1p2;
  String? _t2p1;
  String? _t2p2;

  final _scoreCtrl = TextEditingController();
  final _formKey   = GlobalKey<FormState>();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _scoreCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await ApiService.instance.get(
        '/api/clans/get_clanmembers',
        query: {'clanId': widget.clanId},
      );
      // API may return { members: [...] } or { data: [...] }
      final raw = data['members'] as List?
          ?? data['data'] as List?
          ?? [];
      setState(() {
        _members = raw.map<_Member>((m) => _Member(
          userId: m['user_id']?.toString() ?? '',
          name:   m['name']?.toString()    ?? '',
        )).toList();
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  // ── Validation helpers ────────────────────────────────────────────────────

  bool _validatePlayers() {
    if (_matchType == 'singles') {
      if (_player1 == null || _player2 == null) {
        _snack('Please select both players'); return false;
      }
      if (_player1 == _player2) {
        _snack('Please select different players'); return false;
      }
    } else {
      final all = [_t1p1, _t1p2, _t2p1, _t2p2];
      if (all.any((p) => p == null)) {
        _snack('Please select all four players'); return false;
      }
      if (all.toSet().length != 4) {
        _snack('Each player must be different'); return false;
      }
    }
    return true;
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg), backgroundColor: kColorRose));
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (!_validatePlayers()) return;

    setState(() => _submitting = true);
    try {
      final body = _matchType == 'singles'
          ? {
              'matchType': 'singles',
              'clanId': widget.clanId,
              'player1': _player1,
              'player2': _player2,
              'scoreDetails': {'score': _scoreCtrl.text.trim()},
            }
          : {
              'matchType': 'doubles',
              'clanId': widget.clanId,
              'team1Player1': _t1p1,
              'team1Player2': _t1p2,
              'team2Player1': _t2p1,
              'team2Player2': _t2p2,
              'scoreDetails': {'score': _scoreCtrl.text.trim()},
            };

      final res = await ApiService.instance.post('/api/clans/update_match', body);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(
          matchSubmitMessage(res, confirmed: 'Match recorded successfully!'))));
        context.pop();
      }
    } catch (e) {
      if (mounted) _snack(e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kColorBg,
      appBar: AppBar(
        backgroundColor: kColorSurface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => context.pop(),
        ),
        title: const Text('Record Match',
          style: TextStyle(
            color: kColorText, fontWeight: FontWeight.w800, fontSize: 18)),
      ),
      body: _loading
          ? const CenteredLoader()
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : _buildForm(),
    );
  }

  Widget _buildForm() {
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Match type toggle ─────────────────────────────────────────────
          _SectionCard(
            label: 'MATCH TYPE',
            child: Row(children: [
              for (final t in ['singles', 'doubles'])
                Expanded(child: Padding(
                  padding: EdgeInsets.only(right: t == 'singles' ? 8 : 0),
                  child: GestureDetector(
                    onTap: () => setState(() {
                      _matchType = t;
                      // Reset all player selections on type change
                      _player1 = _player2 = null;
                      _t1p1 = _t1p2 = _t2p1 = _t2p2 = null;
                    }),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: BoxDecoration(
                        color: _matchType == t
                            ? kColorPrimary.withOpacity(0.1)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: _matchType == t
                              ? kColorPrimary
                              : const Color(0x18000000)),
                      ),
                      child: Text(
                        t == 'singles' ? 'Singles' : 'Doubles',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: _matchType == t ? kColorPrimary : kColorMuted,
                          fontWeight: FontWeight.w700, fontSize: 14),
                      ),
                    ),
                  ),
                )),
            ]),
          ),
          const SizedBox(height: 12),

          // ── Players ───────────────────────────────────────────────────────
          if (_matchType == 'singles') ...[
            _PlayerDropdown(
              label: 'PLAYER 1',
              hint: 'Select Player 1',
              value: _player1,
              members: _members,
              onChanged: (v) => setState(() => _player1 = v),
            ),
            const SizedBox(height: 10),
            // VS divider
            Row(children: [
              const Expanded(child: Divider(color: Color(0x18000000))),
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 12),
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: kColorSurface,
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: const [BoxShadow(color: Color(0x08000000), blurRadius: 4)],
                ),
                child: const Text('VS',
                  style: TextStyle(color: kColorMuted,
                    fontWeight: FontWeight.w800, fontSize: 12)),
              ),
              const Expanded(child: Divider(color: Color(0x18000000))),
            ]),
            const SizedBox(height: 10),
            _PlayerDropdown(
              label: 'PLAYER 2',
              hint: 'Select Player 2',
              value: _player2,
              members: _members,
              onChanged: (v) => setState(() => _player2 = v),
            ),
          ] else ...[
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: _TeamBlock(
                title: 'Team 1',
                titleColor: kColorEmerald,
                bgColor: const Color(0x0A059669),
                borderColor: kColorEmerald,
                p1Value: _t1p1,
                p2Value: _t1p2,
                members: _members,
                onP1: (v) => setState(() => _t1p1 = v),
                onP2: (v) => setState(() => _t1p2 = v),
              )),
              const SizedBox(width: 10),
              Expanded(child: _TeamBlock(
                title: 'Team 2',
                titleColor: kColorRose,
                bgColor: const Color(0x0ADC2626),
                borderColor: kColorRose,
                p1Value: _t2p1,
                p2Value: _t2p2,
                members: _members,
                onP1: (v) => setState(() => _t2p1 = v),
                onP2: (v) => setState(() => _t2p2 = v),
              )),
            ]),
          ],
          const SizedBox(height: 12),

          // ── Score ─────────────────────────────────────────────────────────
          _SectionCard(
            label: 'MATCH SCORE',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextFormField(
                  controller: _scoreCtrl,
                  decoration: const InputDecoration(
                    hintText: 'e.g. 21-19, 15-21, 21-18',
                    isDense: true,
                  ),
                  validator: (v) =>
                      v == null || v.trim().isEmpty ? 'Enter match score' : null,
                ),
                const SizedBox(height: 6),
                const Text('Enter all sets separated by commas',
                  style: TextStyle(color: kColorMuted, fontSize: 11)),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // ── Submit ────────────────────────────────────────────────────────
          ElevatedButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting
                ? const SizedBox(width: 20, height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white))
                : const Text('Record Match'),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

// ── Shared card wrapper ───────────────────────────────────────────────────────

class _SectionCard extends StatelessWidget {
  final String label;
  final Widget child;
  const _SectionCard({required this.label, required this.child});

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: kColorSurface,
      borderRadius: BorderRadius.circular(16),
      boxShadow: const [BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2))],
    ),
    padding: const EdgeInsets.all(14),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label,
        style: const TextStyle(
          color: kColorMuted, fontSize: 11, fontWeight: FontWeight.w700,
          letterSpacing: 0.8)),
      const SizedBox(height: 10),
      child,
    ]),
  );
}

// ── Player dropdown ───────────────────────────────────────────────────────────

class _PlayerDropdown extends StatelessWidget {
  final String label;
  final String hint;
  final String? value;
  final List<_Member> members;
  final ValueChanged<String?> onChanged;

  const _PlayerDropdown({
    required this.label, required this.hint,
    required this.value, required this.members, required this.onChanged,
  });

  @override
  Widget build(BuildContext context) => _SectionCard(
    label: label,
    child: DropdownButtonFormField<String>(
      value: value,
      hint: Text(hint),
      isExpanded: true,
      decoration: const InputDecoration(isDense: true),
      items: members.map((m) => DropdownMenuItem<String>(
        value: m.userId,
        child: Text(m.name),
      )).toList(),
      onChanged: onChanged,
      validator: (v) => v == null ? 'Please select a player' : null,
    ),
  );
}

// ── Doubles team block ────────────────────────────────────────────────────────

class _TeamBlock extends StatelessWidget {
  final String title;
  final Color titleColor;
  final Color bgColor;
  final Color borderColor;
  final String? p1Value;
  final String? p2Value;
  final List<_Member> members;
  final ValueChanged<String?> onP1;
  final ValueChanged<String?> onP2;

  const _TeamBlock({
    required this.title, required this.titleColor,
    required this.bgColor, required this.borderColor,
    required this.p1Value, required this.p2Value,
    required this.members, required this.onP1, required this.onP2,
  });

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: bgColor,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: borderColor.withOpacity(0.25)),
    ),
    padding: const EdgeInsets.all(12),
    child: Column(children: [
      Text(title,
        style: TextStyle(
          color: titleColor, fontSize: 13, fontWeight: FontWeight.w800)),
      const SizedBox(height: 10),
      DropdownButtonFormField<String>(
        value: p1Value,
        hint: const Text('Player 1', style: TextStyle(fontSize: 12)),
        isExpanded: true,
        decoration: const InputDecoration(isDense: true),
        items: members.map((m) => DropdownMenuItem<String>(
          value: m.userId,
          child: Text(m.name, style: const TextStyle(fontSize: 13)),
        )).toList(),
        onChanged: onP1,
        validator: (v) => v == null ? 'Required' : null,
      ),
      const SizedBox(height: 8),
      DropdownButtonFormField<String>(
        value: p2Value,
        hint: const Text('Player 2', style: TextStyle(fontSize: 12)),
        isExpanded: true,
        decoration: const InputDecoration(isDense: true),
        items: members.map((m) => DropdownMenuItem<String>(
          value: m.userId,
          child: Text(m.name, style: const TextStyle(fontSize: 13)),
        )).toList(),
        onChanged: onP2,
        validator: (v) => v == null ? 'Required' : null,
      ),
    ]),
  );
}
