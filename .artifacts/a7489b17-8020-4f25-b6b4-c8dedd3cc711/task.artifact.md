# Task: Fix Build and Run on Device

- [ ] Fix Build Environment Issues
    - [ ] Resolve `AndroidLocationsException` by clearing `ANDROID_PREFS_ROOT` in Gradle
    - [ ] Set `expo.node` system property in `gradle.properties`
    - [ ] Update `settings.gradle` to export `expo.node`
    - [ ] Update `node_modules/.../Os.kt` to respect `expo.node` property
- [ ] Verify Gradle Sync
    - [ ] Run `./gradlew help` or similar to verify evaluation
- [ ] Run App on Device
    - [ ] Deploy to connected device using `./gradlew installDebug`
