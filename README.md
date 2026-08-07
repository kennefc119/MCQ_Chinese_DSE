
### Production build
```bash
eas build --profile production --platform ios
```

### Submit to TestFlight (App Store Connect)

```bash
eas submit --platform ios --latest
```

### Build + Submit in one step

```bash
eas build --profile production --platform ios --auto-submit
```update only
eas update --branch production --message "your update description"





You already have expo-dev-client in your package.json. This creates a custom Expo Go-like app with your native modules baked in.

One-time build step:
eas build --profile production --platform ios --auto-submit

eas build --profile development --platform ios

Test in dev
# 1. Kill all node processes
taskkill /F /IM node.exe

# 2. Install ngrok globally (if not done)
npm install -g @expo/ngrok

# 3. Try tunnel again
npx expo start --dev-client --tunnel --clear
npx expo start --dev-client --lan --clear

npx expo start --dev-client --tunnel~

### Advisor V2 local dev test

V2 uses separate Supabase tables and Edge Functions. It does not read or write
the existing advisor chat table or function.

```powershell
$env:EXPO_PUBLIC_ADVISOR_V2_DEV = "true"
npx expo start --dev-client --lan --clear
```

Open the Advisor screen, select the options icon, then enable `啟用新顧問模式`.
This affects only the local Expo session. Restart Expo without the environment
variable to return to the current V1 advisor path.