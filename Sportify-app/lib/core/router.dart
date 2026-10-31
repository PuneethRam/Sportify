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
import '../widgets/loading_screen.dart';

final _rootKey = GlobalKey<NavigatorState>();
final _shellKey = GlobalKey<NavigatorState>();

GoRouter buildRouter(AuthProvider authProvider) => GoRouter(
  navigatorKey: _rootKey,
  refreshListenable: authProvider,
  redirect: (context, state) {
    final loading = authProvider.loading;
    final authed  = authProvider.isAuthenticated;
    final loc     = state.uri.path;

    if (loading) return null;

    final onAuth = loc == '/login' || loc == '/signup';
    if (!authed && !onAuth) return '/login';
    if (authed  &&  onAuth) return '/';
    return null;
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
