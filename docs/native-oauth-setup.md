# Native Google / Facebook sign-in (Android)

The code is in place and inert. It activates when the four
`NEXT_PUBLIC_*` variables in `.env` are filled in and a new APK ships. Until
then the app keeps using the Chrome Custom Tab flow, so nothing is broken
while you work through the consoles below.

## How the three paths relate

| Where | Path | UI the customer sees |
|---|---|---|
| Android app, configured | native plugin | Google: OS account-picker sheet, in-app. Facebook: one tap via the FB app, else a Custom Tab |
| Android app, not configured / old APK | Chrome Custom Tab | Browser tab over the app |
| Browser | server redirect | Normal OAuth page |

`lib/oauth-client.ts` picks between them at runtime. The fallback is
deliberate: this app loads a **remote** URL (`server.url` in
`capacitor.config.ts`), so JavaScript updates the moment laundrease.in is
deployed, while the native plugin only arrives with a new APK. Someone on an
older APK gets the newest JS with no plugin under it — and falls back rather
than hitting a broken button.

> **Deploy order matters.** Ship the web deploy and the APK together. Web-only
> is safe (fallback). APK-only is safe (JS gates on the env vars).

## Prerequisite: your signing SHA-1 fingerprints

Both providers key on the **signing certificate**, so you need every
fingerprint your app is ever signed with:

```bash
keytool -list -v -keystore laundrease-upload.jks -alias laundrease
```

Debug builds use a different one:

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

**The one people forget:** once you enrol in Play App Signing, Google re-signs
the app, so the certificate on real devices is *neither* of the above. Take it
from Play Console → Test and release → App integrity → App signing key
certificate. Skip it and sign-in works perfectly in testing, then fails for
every user who installs from Play.

Register **all three** (debug, upload, Play) with both providers.

## Google

1. Google Cloud Console → same project as the existing web OAuth client.
2. Create **OAuth client ID → Android**: package name `in.laundrease.customer`,
   plus one entry per SHA-1 above.
3. Copy the **Web** client ID (the one already backing `GOOGLE_CLIENT_ID`) into
   `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

The Android client authorises the app to ask; the ID token that comes back is
issued to the **web** client. Putting the Android client ID in
`NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` is the single most common failure here —
the sheet appears and the backend then rejects every token, because
`app/api/customer/auth/oauth/native/route.ts` verifies `aud` against
`GOOGLE_CLIENT_ID`. Those two must be the same value.

## Facebook

Facebook has **no OS account picker** — Android has no system-level Facebook
account store, so there is nothing to enumerate. Native buys one-tap sign-in
for users with the Facebook app installed; everyone else still gets a Custom
Tab. That is the ceiling, not a configuration problem.

1. Meta app dashboard → Add Product → Facebook Login → Android.
2. Package name `in.laundrease.customer`, default activity class
   `in.laundrease.customer.MainActivity`.
3. Add **key hashes** — the same fingerprints, base64 rather than hex:
   ```bash
   keytool -exportcert -alias laundrease -keystore laundrease-upload.jks | openssl sha1 -binary | openssl base64
   ```
   From a Play Console hex SHA-1: `echo "AB:CD:..." | xxd -r -p | openssl base64`
4. Settings → Basic: App ID → `NEXT_PUBLIC_FACEBOOK_APP_ID` (same value as
   `FACEBOOK_APP_ID`). Settings → Advanced: Client Token →
   `NEXT_PUBLIC_FACEBOOK_CLIENT_TOKEN`.

Nothing goes in `strings.xml` or `AndroidManifest.xml` — the plugin calls
`FacebookSdk.setApplicationId()` from the values passed to `initialize()`, and
removes `FacebookInitProvider` itself.

## MainActivity

Deliberately left as the 4-line stub. The plugin's
`ModifiedMainActivityForSocialLoginPlugin` interface is only required for
Google *offline mode* (server auth codes) and *custom scopes*; we use neither,
and Facebook's activity results already route through the plugin's own
`handleOnActivityResult`. Implementing the interface without making the
matching change would defeat a real runtime guard — so if you ever enable
offline mode or extra scopes, do the documented modification then.

## Verifying

1. Fill the env vars, deploy, build a **release** APK (debug SHA-1 works only
   if you registered it).
2. Tap Google → the account sheet should slide up over the app, no browser.
3. Server log on failure: the reason is in `Native google token verification
   failed:`. `aud` mismatch means the wrong client ID; a Credential Manager
   error before any request means the SHA-1 or package name is unregistered.
