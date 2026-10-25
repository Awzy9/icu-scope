# ICU Scope – iOS (Expo + EAS)

Native React Native (Expo) app. It reads the site's published feed (`https://icu-scope.vercel.app/data/articles.json`), so the daily GitHub Action updates reach the app without a rebuild. Tabs: Today (article of the week, this week, trending), Browse (organ systems, guidelines, KSA research, Bottom Line, FOAMed, preprints), Search, and Saved. Saved articles and the last downloaded feed are stored on the device, so the app opens offline. Follows the system light/dark setting.

## Develop

```bash
npm test        # unit tests (Jest via jest-expo): feed/search/storage logic, evidence score, error boundary
npm run lint    # ESLint with eslint-config-expo
npx expo-doctor # project health check
```

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
