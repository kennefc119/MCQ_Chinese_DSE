
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
```
