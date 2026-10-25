# ICU Scope – iOS (Expo + EAS)

Thin native wrapper that loads the hosted site (`https://icu-scope.vercel.app`) in a WebView, mirroring `../android-app`. Feed updates ship via the website; the app itself only needs rebuilding for native changes.

## Build

Requires an Expo account and a paid Apple Developer account.

```bash
cd ios-app
npm install
npm i -g eas-cli && eas login
eas init                                   # links the project, writes extra.eas.projectId into app.json
eas build --platform ios --profile preview     # internal (ad hoc) build; register devices when prompted
eas build --platform ios --profile production  # App Store build
eas submit --platform ios --profile production # upload to App Store Connect / TestFlight
```

EAS manages certificates and provisioning profiles; bundle ID is `com.awzy9.icuscope`. Use `--profile development` for a simulator build.

Note: App Store review (guideline 4.2) can reject apps that are only a website wrapper; consider adding native value (e.g. push notifications, offline saved articles) before submitting.
