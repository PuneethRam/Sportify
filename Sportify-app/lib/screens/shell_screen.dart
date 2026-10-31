import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../core/theme.dart';

class ShellScreen extends StatelessWidget {
  final Widget child;
  const ShellScreen({super.key, required this.child});

  static const _tabs = [
    ('/', Icons.home_rounded, Icons.home_outlined, 'Home'),
    ('/clans', Icons.shield_rounded, Icons.shield_outlined, 'Clans'),
    ('/find', Icons.people_rounded, Icons.people_outlined, 'Find'),
    ('/academy', Icons.school_rounded, Icons.school_outlined, 'Academy'),
  ];

  int _selectedIndex(BuildContext context) {
    final loc = GoRouterState.of(context).uri.path;
    for (int i = 0; i < _tabs.length; i++) {
      if (i == 0 ? loc == '/' : loc.startsWith(_tabs[i].$1)) return i;
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final idx = _selectedIndex(context);
    return Scaffold(
      body: child,
      bottomNavigationBar: _NavBar(
        selectedIndex: idx,
        onTap: (i) => context.go(_tabs[i].$1),
        tabs: _tabs,
      ),
    );
  }
}

class _NavBar extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onTap;
  final List<(String, IconData, IconData, String)> tabs;

  const _NavBar({
    required this.selectedIndex,
    required this.onTap,
    required this.tabs,
  });

  @override
  Widget build(BuildContext context) {
    final bottomPadding = MediaQuery.of(context).padding.bottom;
    return Container(
      decoration: BoxDecoration(
        color: kColorSurface,
        border: const Border(top: BorderSide(color: Color(0x0C000000))),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.08),
            blurRadius: 20,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Row(
            children: List.generate(tabs.length, (i) {
              final (_, activeIcon, inactiveIcon, label) = tabs[i];
              final selected = i == selectedIndex;
              return Expanded(
                child: GestureDetector(
                  onTap: () => onTap(i),
                  behavior: HitTestBehavior.opaque,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    curve: Curves.easeOut,
                    padding: EdgeInsets.only(
                      top: 8, bottom: bottomPadding > 0 ? 0 : 4),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 220),
                          curve: Curves.easeOut,
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
                          decoration: BoxDecoration(
                            color: selected
                                ? kColorPrimary.withOpacity(0.12)
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: selected
                              ? [BoxShadow(
                                  color: kColorPrimary.withOpacity(0.28),
                                  blurRadius: 14,
                                  spreadRadius: 1,
                                )]
                              : [],
                          ),
                          child: Icon(
                            selected ? activeIcon : inactiveIcon,
                            color: selected ? kColorPrimary : kColorMuted,
                            size: 22,
                          ),
                        ),
                        const SizedBox(height: 3),
                        AnimatedDefaultTextStyle(
                          duration: const Duration(milliseconds: 200),
                          style: TextStyle(
                            color: selected ? kColorPrimary : kColorMuted,
                            fontSize: 10,
                            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                            letterSpacing: 0.1,
                          ),
                          child: Text(label),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}
