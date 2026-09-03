# SIMS Mobile Android

Expo React Native client for the Laravel API in `../backend`.

## Run Against Laravel

Start Laravel on the host machine:

```bash
php artisan serve --host=0.0.0.0 --port=8000
```

The Android emulator uses `http://10.0.2.2:8000/api` by default. For a physical Android device, set the host LAN address before starting Expo:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.10:8000/api npx expo start
```

The logged-in session is stored with AsyncStorage and is revoked through `/api/auth/logout` when the user signs out.

## Unified Login

The mobile app uses `/api/auth/login` with only an identifier and password. Laravel resolves the authenticated user, roles, permissions, default portal, and available workspaces; the app does not ask the user to choose a role.

The identifier can be an email, phone number, NIY, NIK, or NIS according to the linked account. Parent and student data are returned by the same response when applicable.

CRUD buttons are only shown when the authenticated user has the corresponding Laravel permission. The backend remains the final authorization boundary.
# mobile-app
