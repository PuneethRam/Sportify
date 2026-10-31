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
