# iOS: push notifications and invite links

`Runner/Runner.entitlements` is checked in but **not yet wired into the Xcode
project** — that needs the Apple Team ID and signing, which we don't have yet.
Until these steps are done, iOS builds work but receive no pushes and open
invite links in Safari instead of the app.

1. **Register the iOS app in Firebase**: run `flutterfire configure` (adds
   `Runner/GoogleService-Info.plist` and regenerates `lib/firebase_options.dart`
   with a real iOS app id — the current file reuses the web app id).
2. **Xcode → Runner target → Signing & Capabilities**: pick the team, then add
   - **Push Notifications**
   - **Background Modes → Remote notifications** (already in `Info.plist`)
   - **Associated Domains** with `applinks:sportifyweb.netlify.app`
3. Make sure **Build Settings → Code Signing Entitlements**
   (`CODE_SIGN_ENTITLEMENTS`) is `Runner/Runner.entitlements` for Debug,
   Release and Profile, so Xcode uses this file rather than creating a new one.
4. For App Store / TestFlight builds set `aps-environment` to `production`
   (Xcode does this automatically when archiving with a distribution profile).
5. **APNs key**: Apple Developer → Keys → create a key with APNs enabled,
   download the `.p8`, and upload it in Firebase Console → Project settings →
   Cloud Messaging → Apple app configuration (with the Key ID and Team ID).
6. **Universal links**: set `APPLE_TEAM_ID` in the web app's environment
   (Netlify) so `https://sportifyweb.netlify.app/.well-known/apple-app-site-association`
   lists `<TEAM_ID>.com.avartanlabs.sportifyApp` for `/i/*`.
7. Test on a device (the simulator can't receive real pushes): open a
   `https://sportifyweb.netlify.app/i/<token>` link from Notes or Messages — it
   should open the app's invite screen.
