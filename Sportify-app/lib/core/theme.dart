import 'package:flutter/material.dart';

// ── Design Tokens ─────────────────────────────────────────────────────────────
const _bg      = Color(0xFFEFF6FF);   // blue-50: light sporty background
const _surface = Color(0xFFFFFFFF);
const _card    = Color(0xFFFFFFFF);
const _primary = Color(0xFF0284C7);   // sky-600: brand blue (matches web)
const _emerald = Color(0xFF059669);   // emerald-600
const _amber   = Color(0xFFD97706);   // amber-600
const _rose    = Color(0xFFDC2626);   // red-600
const _violet  = Color(0xFF7C3AED);   // violet-600: tournaments/competitions
const _text    = Color(0xFF0F172A);   // slate-950
const _muted   = Color(0xFF64748B);   // slate-500

ThemeData get appTheme => ThemeData(
  useMaterial3: true,
  brightness: Brightness.light,
  scaffoldBackgroundColor: _bg,
  colorScheme: const ColorScheme.light(
    primary: _primary,
    secondary: _emerald,
    surface: _surface,
    onPrimary: Colors.white,
    onSecondary: Colors.white,
    onSurface: _text,
    error: _rose,
    tertiary: _violet,
  ),
  cardTheme: CardThemeData(
    color: _card,
    elevation: 2,
    shadowColor: const Color(0x100284C7),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    margin: EdgeInsets.zero,
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: const Color(0xFFF8FAFF),
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: Color(0x18000000)),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: Color(0x18000000)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: _primary, width: 1.5),
    ),
    hintStyle: const TextStyle(color: _muted, fontSize: 14),
    labelStyle: const TextStyle(color: _muted),
    floatingLabelStyle: const TextStyle(color: _primary),
    prefixIconColor: _muted,
    suffixIconColor: _muted,
  ),
  elevatedButtonTheme: ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(
      backgroundColor: _primary,
      foregroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      padding: const EdgeInsets.symmetric(vertical: 14),
      minimumSize: const Size(double.infinity, 52),
      textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, letterSpacing: 0.2),
      elevation: 0,
      shadowColor: const Color(0x400284C7),
    ),
  ),
  outlinedButtonTheme: OutlinedButtonThemeData(
    style: OutlinedButton.styleFrom(
      foregroundColor: _text,
      side: const BorderSide(color: Color(0x25000000)),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      padding: const EdgeInsets.symmetric(vertical: 14),
      minimumSize: const Size(double.infinity, 52),
      textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
    ),
  ),
  textButtonTheme: TextButtonThemeData(
    style: TextButton.styleFrom(
      foregroundColor: _primary,
      textStyle: const TextStyle(fontWeight: FontWeight.w600),
    ),
  ),
  appBarTheme: AppBarTheme(
    backgroundColor: _surface,
    elevation: 0,
    scrolledUnderElevation: 1,
    shadowColor: const Color(0x12000000),
    centerTitle: false,
    surfaceTintColor: Colors.transparent,
    iconTheme: const IconThemeData(color: _text, size: 22),
    titleTextStyle: const TextStyle(
      color: _text, fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: -0.3,
    ),
    toolbarHeight: 56,
    shape: const Border(bottom: BorderSide(color: Color(0x08000000))),
  ),
  navigationBarTheme: NavigationBarThemeData(
    backgroundColor: _surface,
    elevation: 0,
    surfaceTintColor: Colors.transparent,
    height: 64,
    indicatorColor: const Color(0xFF0284C7).withOpacity(0.14),
    iconTheme: WidgetStateProperty.resolveWith((states) {
      if (states.contains(WidgetState.selected)) {
        return const IconThemeData(color: _primary, size: 22);
      }
      return const IconThemeData(color: _muted, size: 22);
    }),
    labelTextStyle: WidgetStateProperty.resolveWith((states) {
      if (states.contains(WidgetState.selected)) {
        return const TextStyle(
          color: _primary, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.2);
      }
      return const TextStyle(color: _muted, fontSize: 11, fontWeight: FontWeight.w500);
    }),
  ),
  chipTheme: ChipThemeData(
    backgroundColor: const Color(0x08000000),
    selectedColor: const Color(0xFF0284C7).withOpacity(0.14),
    side: const BorderSide(color: Color(0x14000000)),
    labelStyle: const TextStyle(fontSize: 12, color: _text, fontWeight: FontWeight.w500),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    showCheckmark: false,
  ),
  dividerTheme: const DividerThemeData(color: Color(0x10000000), space: 0),
  snackBarTheme: SnackBarThemeData(
    backgroundColor: const Color(0xFF0F172A),
    contentTextStyle: const TextStyle(color: Colors.white, fontSize: 13),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    behavior: SnackBarBehavior.floating,
    insetPadding: const EdgeInsets.all(16),
    elevation: 4,
  ),
  dialogTheme: DialogThemeData(
    backgroundColor: _surface,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    elevation: 8,
    titleTextStyle: const TextStyle(color: _text, fontSize: 18, fontWeight: FontWeight.w800),
    contentTextStyle: const TextStyle(color: _muted, fontSize: 14, height: 1.5),
  ),
  bottomSheetTheme: const BottomSheetThemeData(
    backgroundColor: _surface,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    showDragHandle: true,
    dragHandleColor: Color(0x30000000),
    dragHandleSize: Size(36, 4),
  ),
  textTheme: const TextTheme(
    headlineLarge:  TextStyle(color: _text, fontWeight: FontWeight.w900, fontSize: 28, letterSpacing: -0.5),
    headlineMedium: TextStyle(color: _text, fontWeight: FontWeight.w800, fontSize: 22, letterSpacing: -0.3),
    titleLarge:     TextStyle(color: _text, fontWeight: FontWeight.w700, fontSize: 18),
    titleMedium:    TextStyle(color: _text, fontWeight: FontWeight.w600, fontSize: 16),
    titleSmall:     TextStyle(color: _muted, fontWeight: FontWeight.w500, fontSize: 13),
    bodyLarge:      TextStyle(color: _text, fontSize: 15, height: 1.5),
    bodyMedium:     TextStyle(color: _muted, fontSize: 14, height: 1.5),
    bodySmall:      TextStyle(color: _muted, fontSize: 12),
    labelLarge:     TextStyle(color: _text, fontWeight: FontWeight.w700, fontSize: 14),
    labelSmall:     TextStyle(color: _muted, fontWeight: FontWeight.w600, fontSize: 11, letterSpacing: 0.5),
  ),
  tabBarTheme: TabBarThemeData(
    labelColor: _primary,
    unselectedLabelColor: _muted,
    indicatorColor: _primary,
    dividerColor: const Color(0x0A000000),
    indicatorSize: TabBarIndicatorSize.label,
    indicator: const UnderlineTabIndicator(
      borderSide: BorderSide(color: _primary, width: 2.5),
      borderRadius: BorderRadius.only(
        topLeft: Radius.circular(2), topRight: Radius.circular(2)),
    ),
    labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
    unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
    overlayColor: WidgetStateProperty.all(Colors.transparent),
  ),
);

// ── Exported Color Tokens ─────────────────────────────────────────────────────
const kColorEmerald = _emerald;
const kColorAmber   = _amber;
const kColorRose    = _rose;
const kColorViolet  = _violet;
const kColorPrimary = _primary;
const kColorMuted   = _muted;
const kColorSurface = _surface;
const kColorBg      = _bg;
const kColorText    = _text;
const kColorDark    = Color(0xFF080E1E);   // deep navy: hero/card dark backgrounds
const kColorGold    = Color(0xFFFBBF24);   // gold: achievements, #1 rank
