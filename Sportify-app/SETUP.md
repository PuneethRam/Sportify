# Sportify Flutter App — Setup

## 1. Firebase configuration

The app needs your Firebase project credentials.

```bash
# Install FlutterFire CLI
dart pub global activate flutterfire_cli

# In this directory, run:
flutterfire configure
```

This auto-generates `lib/firebase_options.dart` with your real credentials.
Delete the placeholder file first, then run the command.

Add `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)
to the platform folders as prompted by flutterfire.

## 2. API base URL

Edit `lib/core/constants.dart`:

```dart
// Android emulator
const String kApiBase = 'http://10.0.2.2:3000';

// iOS simulator
const String kApiBase = 'http://localhost:3000';

// Physical device (use your machine's local IP)
const String kApiBase = 'http://192.168.x.x:3000';

// Production
const String kApiBase = 'https://your-domain.com';
```

## 3. Run

```bash
flutter pub get
flutter run
```

### Analytics (PostHog)

Analytics are off unless a PostHog project key is passed at build time:

```bash
flutter run --dart-define=POSTHOG_KEY=phc_xxx
flutter build apk --release --dart-define=POSTHOG_KEY=phc_xxx \
  --dart-define=POSTHOG_HOST=https://eu.i.posthog.com   # optional, default us.i.posthog.com
```

Without the key `lib/services/analytics.dart` is a no-op. Users are identified
by Firebase uid only; event properties are ids / enums / counts (no names,
emails or phone numbers). Session replay, surveys and PostHog's push capture are
disabled; native auto-init is off (`com.posthog.posthog.AUTO_INIT=false` in
AndroidManifest.xml and Info.plist).

## Invite links and push notifications

- **Invite links** — `https://sportifyweb.netlify.app/i/<token>` opens the
  app's `/invite/<token>` screen (`app_links`). Signed-out users are sent to
  login and returned to the invite afterwards.
  - Android: `MainActivity` has an `autoVerify` intent filter for `/i/`.
    Verification needs `https://sportifyweb.netlify.app/.well-known/assetlinks.json`
    to list the SHA-256 of the **release** signing key. Release builds are
    currently signed with the debug key (`android/app/build.gradle.kts`), so
    create a real release keystore (or use Play App Signing and copy its
    SHA-256 from the Play Console) before App Links can verify. Test with
    `adb shell am start -a android.intent.action.VIEW -d https://sportifyweb.netlify.app/i/<token>`
    and `adb shell pm get-app-links com.avartanlabs.sportify_app`.
  - iOS: see `ios/README-PUSH-AND-LINKS.md` (Associated Domains, needs the
    Apple Team ID).
- **Push (FCM)** — `lib/services/push_service.dart`. The app never asks for
  permission on launch; a one-time soft prompt appears after submitting a
  result, creating/joining a game, joining a clan/batch or accepting an invite.
  Tokens are registered with `POST /api/notifications/devices` and removed on
  logout. Notification taps open the `route` from the message data. Users
  manage categories under Dashboard → bell icon (`/settings/notifications`).

### Still needs console work

1. **Run `flutterfire configure`** to register real Android
   (`com.avartanlabs.sportify_app`) and iOS (`com.avartanlabs.sportifyApp`)
   apps. Today `lib/firebase_options.dart` uses the **web** app id for Android
   and iOS and there is no `google-services.json` / `GoogleService-Info.plist`,
   so FCM (and Crashlytics) cannot work on a device until this is done. The
   app catches the failures, so it still runs.
2. iOS: APNs key upload + Xcode capabilities — `ios/README-PUSH-AND-LINKS.md`.
3. Android release keystore / Play App Signing SHA-256 in `assetlinks.json`
   (see above).

## 4. Build APK

```bash
flutter build apk --release
# Output: build/app/outputs/flutter-apk/app-release.apk
```

## 5. Build iOS

```bash
flutter build ios --release
# Then open ios/Runner.xcworkspace in Xcode
```

## Screens

| Screen | Route | Description |
|--------|-------|-------------|
| Login | `/login` | Email + Google sign in |
| Sign Up | `/signup` | Create account |
| Dashboard | `/` | Player stats + Coach view |
| Clans | `/clans` | Your clans list |
| Clan Detail | `/clans/:id` | Matches, Leaderboard, Members, Tournaments |
| Find a Mate | `/find` | Browse open game sessions |
| Create Session | `/find/create` | Host a session |
| Session Detail | `/find/:id` | Join + chat |
| Academy | `/academy` | Academies you own/belong to |
| Academy Detail | `/academy/:orgId` | Batches, Sessions, Announcements |
| Invite | `/invite/:token` | Preview + one-tap join from an invite link |
| Notification settings | `/settings/notifications` | Push categories + OS permission |
