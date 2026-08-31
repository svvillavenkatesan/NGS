# Number Game Seller — Android

The Seller Entry client is Android-only in production. Super Admin and Distributor remain web panels.

## Features

- KL / DEAR Lot Code isolation
- Assigned schemes only
- Straight and unique 2D/3D/4D BOX entries
- Quick quantities 1, 2, 3, 4, 5, 10 and 15
- Current Bill, per-entry delete, total and Settle Bill
- Date, time and Show entry status
- Official Android client API identification

## Build

1. Install Flutter stable and Android SDK.
2. From this directory run `flutter create . --platforms android` once to generate platform scaffolding.
3. Run `flutter pub get`.
4. Emulator: `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000`.
5. Physical phone: use the server's reachable HTTPS URL.
6. Copy `android/key.properties.example` to `android/key.properties`, create a private release keystore, and replace all example values. Never commit either file.
7. Release: `flutter build apk --release --dart-define=API_BASE_URL=https://your-server.example`.

Release builds require both an HTTPS API address and a private signing key. Debug signing and clear-text HTTP are rejected for the production APK.

Production must use HTTPS. Do not ship a release APK pointing to localhost or a private development address.
