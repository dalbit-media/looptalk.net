# LoopTalk Desktop

Packaged Windows, macOS, and Linux app for the LoopTalk messenger. It loads the
hosted messenger (`looptalkUrl` in `package.json`) in an Electron window and
adds features that a browser tab cannot provide reliably:

- **Notifications are on by default.** On first launch LoopTalk asks once,
  in its own prompt, whether it may show notifications. After you allow, it
  shows native OS notifications for new messages and incoming calls. It does not
  depend on the browser notification permission or on Web Push. Turning
  notifications back on in Settings asks again. That choice applies only to
  this computer.
- **Starts at login.** Start at login is enabled on the first packaged launch.
  The app starts hidden in the system tray and keeps the live connection open.
  Users can turn it off from the tray menu's **Start at login** item.
- **Runs in the tray.** Closing the window hides it; quit from the tray menu.
  Clicking a notification opens the related conversation.

Native notifications are delivered while the app is running, including when it
is hidden in the tray.

## Development

```sh
npm ci --prefix desktop
npm start --prefix desktop
```

Set `LOOPTALK_URL` to load another messenger, for example
`LOOPTALK_URL=http://localhost:3001/app/` with the local server running. Only
HTTPS URLs, or HTTP on `localhost`, are accepted. Start at login only applies
to packaged builds.

```sh
npm test --prefix desktop
```

## Packaging

```sh
npm run dist:win --prefix desktop    # dist/LoopTalk-Setup.exe
npm run dist:mac --prefix desktop    # dist/LoopTalk.dmg (on macOS)
npm run dist:linux --prefix desktop  # dist/LoopTalk.AppImage, dist/LoopTalk.deb
```

Each `dist*` run, including CI, bumps the shared build number (`v.01`, `v.02`, ...)
in the root and desktop `package.json` files. Persist/commit the updated manifests
and lockfiles between releases; separate clean checkouts start from their
committed number.

Pushing a `desktop-v*` tag runs `.github/workflows/desktop-release.yml`, which
builds every installer and publishes them as a GitHub release. The installer is
optional: on desktop, the website opens the web app in the default browser.
Browser notifications work there without installing anything. Old
`/download/desktop/<platform>` links open `/app/` until you set
`DESKTOP_DOWNLOAD_BASE_URL` to a public HTTPS folder holding the published
installers. For example, use
`https://github.com/<owner>/<repo>/releases/latest/download` once a release exists.

Builds are unsigned unless signing secrets are configured. Those secrets are
`DESKTOP_CSC_LINK` and `DESKTOP_CSC_KEY_PASSWORD`, plus `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` for macOS notarization.
Unsigned builds trigger Windows SmartScreen and macOS Gatekeeper warnings.
