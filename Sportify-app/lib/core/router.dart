import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/signup_screen.dart';
import '../screens/shell_screen.dart';
import '../screens/dashboard/dashboard_screen.dart';
import '../screens/clans/clans_screen.dart';
import '../screens/clans/clan_detail_screen.dart';
import '../screens/find_a_mate/find_a_mate_screen.dart';
import '../screens/find_a_mate/create_session_screen.dart';
import '../screens/find_a_mate/session_detail_screen.dart';
import '../screens/academy/academy_screen.dart';
import '../screens/academy/org_detail_screen.dart';
import '../screens/clans/player_profile_screen.dart';
import '../screens/clans/start_match_screen.dart';
import '../screens/clans/tournament_detail_screen.dart';
import '../screens/invite/invite_screen.dart';
import '../screens/settings/notification_settings_screen.dart';
import '../widgets/loading_screen.dart';

final _rootKey = GlobalKey<NavigatorState>();
final _shellKey = GlobalKey<NavigatorState>();

/// Auth gate. Signed-out users go to /login, remembering where they were
/// headed (e.g. an invite link) so sign-in / sign-up can send them back.
({String? to, String? pending}) authRedirect({
  required bool loading,
  required bool authed,
  required Uri uri,
  required String? pending,
}) {
  if (loading) return (to: null, pending: pending);

  final loc    = uri.path;
  final onAuth = loc == '/login' || loc == '/signup';
  if (!authed) {
    if (onAuth) return (to: null, pending: pending);
    return (to: '/login', pending: loc == '/' ? pending : uri.toString());
  }
  if (pending != null) {
    return (to: pending == uri.toString() ? null : pending, pending: null);
  }
  return (to: onAuth ? '/' : null, pending: null);
}

GoRouter buildRouter(AuthProvider authProvider) => GoRouter(
  navigatorKey: _rootKey,
  refreshListenable: authProvider,
  redirect: (context, state) {
    final r = authRedirect(
      loading: authProvider.loading,
      authed: authProvider.isAuthenticated,
      uri: state.uri,
      pending: authProvider.pendingLocation,
    );
    authProvider.pendingLocation = r.pending;
    return r.to;
  },
  routes: [
    GoRoute(
      path: '/login',
      builder: (_, __) => const LoginScreen(),
    ),
    GoRoute(
      path: '/signup',
      builder: (_, __) => const SignupScreen(),
    ),
    GoRoute(
      path: '/invite/:token',
      builder: (_, state) => InviteScreen(token: state.pathParameters['token']!),
    ),
    GoRoute(
      path: '/settings/notifications',
      builder: (_, __) => const NotificationSettingsScreen(),
    ),

    ShellRoute(
      navigatorKey: _shellKey,
      builder: (ctx, state, child) => ShellScreen(child: child),
      routes: [
        // Dashboard
        GoRoute(
          path: '/',
          builder: (_, __) => const DashboardScreen(),
        ),

        // Clans
        GoRoute(
          path: '/clans',
          builder: (_, __) => const ClansScreen(),
          routes: [
            GoRoute(
              path: ':clanId',
              parentNavigatorKey: _rootKey,
              builder: (_, state) => ClanDetailScreen(
                clanId: state.pathParameters['clanId']!),
              routes: [
                GoRoute(
                  path: 'player/:userId',
                  parentNavigatorKey: _rootKey,
                  builder: (_, state) => PlayerProfileScreen(
                    clanId: state.pathParameters['clanId']!,
                    userId: state.pathParameters['userId']!,
                  ),
                ),
                GoRoute(
                  path: 'start-match',
                  parentNavigatorKey: _rootKey,
                  builder: (_, state) => StartMatchScreen(
                    clanId: state.pathParameters['clanId']!),
                ),
                GoRoute(
                  path: 'tournament/:tournamentId',
                  parentNavigatorKey: _rootKey,
                  builder: (_, state) {
                    final extra = state.extra as Map<String, dynamic>?;
                    return TournamentDetailScreen(
                      clanId: state.pathParameters['clanId']!,
                      tournamentId: state.pathParameters['tournamentId']!,
                      tournamentName: '',
                      isAdmin: extra?['isAdmin'] as bool? ?? false,
                    );
                  },
                ),
              ],
            ),
          ],
        ),

        // Find a mate
        GoRoute(
          path: '/find',
          builder: (_, __) => const FindAMateScreen(),
          routes: [
            GoRoute(
              path: 'create',
              parentNavigatorKey: _rootKey,
              builder: (_, __) => const CreateSessionScreen(),
            ),
            GoRoute(
              path: ':sessionId',
              parentNavigatorKey: _rootKey,
              builder: (_, state) => SessionDetailScreen(
                sessionId: state.pathParameters['sessionId']!),
            ),
          ],
        ),

        // Academy
        GoRoute(
          path: '/academy',
          builder: (_, __) => const AcademyScreen(),
          routes: [
            GoRoute(
              path: ':orgId',
              parentNavigatorKey: _rootKey,
              builder: (_, state) {
                final extra = state.extra as Map<String, dynamic>?;
                return OrgDetailScreen(
                  orgId: state.pathParameters['orgId']!,
                  orgName: extra?['orgName'] as String? ?? '',
                  isOwner: extra?['isOwner'] as bool? ?? false,
                );
              },
            ),
          ],
        ),
      ],
    ),
  ],
  errorBuilder: (_, state) => Scaffold(
    body: ErrorView(message: state.error?.message ?? 'Page not found'),
  ),
);
