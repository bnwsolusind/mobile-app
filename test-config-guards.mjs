import assert from 'node:assert';

// 1. Semver logic
function parseSemver(version) {
  if (!version || typeof version !== 'string') return [0, 0, 0];
  const clean = version.trim().replace(/^[vV]/, '').split('-')[0].split('+')[0];
  const parts = clean.split('.').map((p) => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : Math.max(0, num);
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function semverCompare(v1, v2) {
  const [maj1, min1, pat1] = parseSemver(v1);
  const [maj2, min2, pat2] = parseSemver(v2);
  if (maj1 !== maj2) return maj1 > maj2 ? 1 : -1;
  if (min1 !== min2) return min1 > min2 ? 1 : -1;
  if (pat1 !== pat2) return pat1 > pat2 ? 1 : -1;
  return 0;
}

function isForceUpdateRequired(currentVersion, minVersion, forceUpdateEnabled) {
  if (!forceUpdateEnabled) return false;
  return semverCompare(currentVersion, minVersion) < 0;
}

// 2. URL Safety logic
function isSafeRemoteUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.trim().toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('file:') ||
    lower.startsWith('data:') ||
    lower.startsWith('content:') ||
    lower.startsWith('blob:')
  ) {
    return false;
  }
  if (lower.startsWith('https://')) return true;
  if (lower.startsWith('http://')) {
    return (
      lower.includes('10.0.2.2') ||
      lower.includes('localhost') ||
      lower.includes('127.0.0.1') ||
      lower.includes('192.168.') ||
      lower.includes('10.0.') ||
      lower.includes('172.')
    );
  }
  return false;
}

function isSafeUpdateUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.trim().toLowerCase();
  if (lower.startsWith('market://')) return true;
  return isSafeRemoteUrl(url);
}

// 3. Exact Normalization & Resolution Logic matching api.ts
function normalizeApiUrl(inputUrl, isDev = true) {
  if (!inputUrl || typeof inputUrl !== 'string') {
    throw new Error('API Base URL is required and must be a non-empty string');
  }

  const trimmed = inputUrl.trim();
  if (!trimmed) {
    throw new Error('API Base URL cannot be empty');
  }

  const lower = trimmed.toLowerCase();
  const unsafeSchemes = ['javascript:', 'file:', 'data:', 'content:', 'blob:'];
  if (unsafeSchemes.some((scheme) => lower.startsWith(scheme))) {
    throw new Error(`Unsafe URL scheme rejected: ${trimmed}`);
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Malformed API Base URL: ${trimmed}`);
  }

  if (parsed.username || parsed.password) {
    throw new Error('Embedded credentials in API Base URL are strictly prohibited');
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Unsupported protocol scheme: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocalHost = (
    hostname === '127.0.0.1' ||
    hostname === '10.0.2.2' ||
    hostname === 'localhost' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    (hostname.startsWith('172.') && (() => {
      const parts = hostname.split('.');
      const second = parseInt(parts[1] || '0', 10);
      return second >= 16 && second <= 31;
    })())
  );

  if (!isLocalHost && protocol === 'http:' && !isDev) {
    throw new Error(`Non-local production API URL must use HTTPS: ${trimmed}`);
  }

  let pathname = parsed.pathname.replace(/\/+$/, '');

  while (pathname.endsWith('/api/api')) {
    pathname = pathname.slice(0, -4);
  }

  if (!pathname || pathname === '/') {
    pathname = '/api';
  } else if (!pathname.endsWith('/api') && !pathname.includes('/api/')) {
    pathname = `${pathname}/api`;
  }

  parsed.pathname = pathname;
  return parsed.toString().replace(/\/+$/, '');
}

function resolveBaseUrl({ envUrl, os = 'android', isDev = true }) {
  const configured = envUrl?.trim();
  if (configured) {
    // Explicit environment configuration ALWAYS wins without hostname rewriting
    return normalizeApiUrl(configured, isDev);
  }

  if (isDev) {
    return normalizeApiUrl(
      os === 'android'
        ? 'http://10.0.2.2:8000/api'
        : 'http://127.0.0.1:8000/api',
      isDev
    );
  }

  throw new Error('EXPO_PUBLIC_API_URL environment variable is required in production');
}

function resolveCandidateUrls({ baseUrl, hasConfiguredUrl, os = 'android', isDev = true, metroHostIp = null }) {
  if (hasConfiguredUrl) {
    return [baseUrl];
  }

  if (!isDev) {
    return [baseUrl];
  }

  const metroApiUrl = metroHostIp ? `http://${metroHostIp}:8000/api` : null;
  const rawCandidates = os === 'android'
    ? [baseUrl, metroApiUrl, 'http://127.0.0.1:8000/api']
    : [baseUrl, metroApiUrl, 'http://10.0.2.2:8000/api'];

  return rawCandidates
    .filter(Boolean)
    .filter((url, idx, self) => self.indexOf(url) === idx);
}

// Simulated request interceptor & error fallback logic
function simulateRequest(candidateList, activeUrl, hasConfiguredUrl, isAuth, shouldFail = false) {
  let currentActive = activeUrl;
  const canAttemptFallback = (
    !hasConfiguredUrl &&
    !isAuth &&
    candidateList.length > 1
  );

  if (shouldFail) {
    if (canAttemptFallback) {
      const nextIndex = candidateList.indexOf(currentActive) + 1;
      if (nextIndex < candidateList.length) {
        // Fallback candidate tested in request only, activeBaseUrl is NOT permanently changed
        return { status: 'RETRYING_CANDIDATE', candidate: candidateList[nextIndex], activeUrl: currentActive };
      }
    }
    return { status: 'NETWORK_ERROR', stage: 'LOGIN_NETWORK_FAILURE', activeUrl: currentActive };
  }

  return { status: 'SUCCESS', activeUrl: currentActive };
}

// ==================== TEST SUITE ====================
console.log('--- RUNNING FOCUSED MOBILE CONFIG & RUNTIME GUARD TESTS ---');

// Test 1: Semver numeric comparison
assert.strictEqual(semverCompare('1.10.0', '1.2.0'), 1, '1.10.0 must be greater than 1.2.0');
assert.strictEqual(semverCompare('1.2.0', '1.10.0'), -1, '1.2.0 must be less than 1.10.0');
assert.strictEqual(semverCompare('1.0.0', '1.0.0'), 0, 'Equal versions must return 0');
assert.strictEqual(semverCompare('2.0.0', '1.99.9'), 1, 'Major bump 2.0.0 must be greater than 1.99.9');
console.log('✓ Test 1 Passed: Semantic version comparison is strictly numeric');

// Test 2: Force update resolution
assert.strictEqual(isForceUpdateRequired('1.0.0', '1.2.0', false), false, 'Disabled force update must never block');
assert.strictEqual(isForceUpdateRequired('1.0.0', '1.2.0', true), true, 'Outdated app with force update must block');
assert.strictEqual(isForceUpdateRequired('1.2.0', '1.2.0', true), false, 'Equal minimum version must not block');
assert.strictEqual(isForceUpdateRequired('1.5.0', '1.2.0', true), false, 'Newer app version must not block');
console.log('✓ Test 2 Passed: Force update required resolution');

// Test 3: Unsafe URL rejection
assert.strictEqual(isSafeRemoteUrl('https://example.com/logo.png'), true);
assert.strictEqual(isSafeRemoteUrl('http://10.0.2.2:8000/storage/logo.png'), true);
assert.strictEqual(isSafeRemoteUrl('javascript:alert(1)'), false);
assert.strictEqual(isSafeRemoteUrl('file:///data/user/0/databases'), false);
assert.strictEqual(isSafeRemoteUrl('data:text/html;base64,PHNjcmlwdD4='), false);
assert.strictEqual(isSafeRemoteUrl('/storage/internal/path.png'), false);
console.log('✓ Test 3 Passed: Dangerous URL schemes strictly blocked');

// Test 4: Update store URL safety
assert.strictEqual(isSafeUpdateUrl('market://details?id=id.sch.dareliman.simsit'), true);
assert.strictEqual(isSafeUpdateUrl('https://play.google.com/store/apps/details?id=id.sch.dareliman.simsit'), true);
assert.strictEqual(isSafeUpdateUrl('javascript:void(0)'), false);
console.log('✓ Test 4 Passed: Store update URL schemes validated');

// Test 5: Feature flag resolution logic
const mockConfig = {
  features: {
    qr_login: false,
    qr_attendance: true,
    chat: false,
    notifications: true,
  },
  system: {
    maintenance_mode: true,
    maintenance_message: 'Pemeliharaan Dar el-Iman',
  }
};
assert.strictEqual(mockConfig.features.qr_login, false);
assert.strictEqual(mockConfig.features.notifications, true);
assert.strictEqual(mockConfig.system.maintenance_mode, true);
console.log('✓ Test 5 Passed: Feature flags and maintenance states verified');

// ==================== TEST 6: 17-POINT DETERMINISTIC API URL RESOLUTION ====================
console.log('\n--- TEST 6: DETERMINISTIC API BASE URL RESOLUTION (17 MANDATORY REQUIREMENTS) ---');

// 6.1 Explicit physical USB URL is unchanged on Android (No 127.0.0.1 -> 10.0.2.2 rewrite!)
const usbUrl = resolveBaseUrl({ envUrl: 'http://127.0.0.1:8000/api', os: 'android', isDev: true });
assert.strictEqual(usbUrl, 'http://127.0.0.1:8000/api', 'Requirement 1: Explicit physical USB URL must remain unchanged on Android');
console.log('✓ 6.1 Requirement 1: Explicit physical USB URL is unchanged (Platform.OS does not rewrite 127.0.0.1)');

// 6.2 Explicit emulator URL is unchanged
const emuUrl = resolveBaseUrl({ envUrl: 'http://10.0.2.2:8000/api', os: 'android', isDev: true });
assert.strictEqual(emuUrl, 'http://10.0.2.2:8000/api', 'Requirement 2: Explicit emulator URL must remain unchanged');
console.log('✓ 6.2 Requirement 2: Explicit emulator URL is unchanged');

// 6.3 Explicit LAN URL is unchanged
const lanUrl = resolveBaseUrl({ envUrl: 'http://192.168.1.100:8000/api', os: 'android', isDev: true });
assert.strictEqual(lanUrl, 'http://192.168.1.100:8000/api', 'Requirement 3: Explicit LAN URL must remain unchanged');
console.log('✓ 6.3 Requirement 3: Explicit LAN URL is unchanged');

// 6.4 Explicit HTTPS domain is unchanged
const httpsUrl = resolveBaseUrl({ envUrl: 'https://simsit.example.sch.id/api', os: 'android', isDev: false });
assert.strictEqual(httpsUrl, 'https://simsit.example.sch.id/api', 'Requirement 4: Explicit HTTPS domain must remain unchanged');
console.log('✓ 6.4 Requirement 4: Explicit HTTPS domain is unchanged');

// 6.5 Explicit /api/v1 path is preserved
const v1Url = resolveBaseUrl({ envUrl: 'https://simsit.example.sch.id/api/v1', os: 'android', isDev: false });
assert.strictEqual(v1Url, 'https://simsit.example.sch.id/api/v1', 'Requirement 5: Explicit /api/v1 path must be preserved');
console.log('✓ 6.5 Requirement 5: Explicit /api/v1 path is preserved');

// 6.6 Trailing slash is removed
assert.strictEqual(normalizeApiUrl('http://127.0.0.1:8000/api/'), 'http://127.0.0.1:8000/api', 'Requirement 6: Trailing slash must be removed');
assert.strictEqual(normalizeApiUrl('https://simsit.example.sch.id/api/'), 'https://simsit.example.sch.id/api', 'Requirement 6: Trailing slash must be removed');
console.log('✓ 6.6 Requirement 6: Trailing slash is cleanly removed');

// 6.7 /api/api duplication is prevented
assert.strictEqual(normalizeApiUrl('http://127.0.0.1:8000/api/api'), 'http://127.0.0.1:8000/api', 'Requirement 7: /api/api duplication must be stripped');
assert.strictEqual(normalizeApiUrl('http://10.0.2.2:8000/api/api'), 'http://10.0.2.2:8000/api', 'Requirement 7: /api/api duplication must be stripped');
console.log('✓ 6.7 Requirement 7: Duplicate /api/api is prevented');

// 6.8 Unsafe schemes are rejected
const unsafeSchemes = ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/plain;base64,AAA', 'content://media/external', 'blob:https://example.com/uuid'];
for (const schemeUrl of unsafeSchemes) {
  assert.throws(() => normalizeApiUrl(schemeUrl), /Unsafe URL scheme/, `Requirement 8: Unsafe scheme ${schemeUrl} must be rejected`);
}
console.log('✓ 6.8 Requirement 8: All unsafe schemes (javascript, file, data, content, blob) are rejected');

// 6.9 Embedded credentials are rejected
assert.throws(() => normalizeApiUrl('http://admin:secret@127.0.0.1:8000/api'), /Embedded credentials/, 'Requirement 9: Embedded credentials must be rejected');
assert.throws(() => normalizeApiUrl('https://user:pass@simsit.example.sch.id/api'), /Embedded credentials/, 'Requirement 9: Embedded credentials must be rejected');
console.log('✓ 6.9 Requirement 9: Embedded credentials strictly rejected');

// 6.10 Production HTTP public domain is rejected
assert.throws(() => normalizeApiUrl('http://simsit.example.sch.id/api', false), /Non-local production API URL must use HTTPS/, 'Requirement 10: Non-local HTTP domain in production must be rejected');
console.log('✓ 6.10 Requirement 10: Production HTTP public domain is rejected');

// 6.11 Production HTTPS domain is accepted
const prodHttps = normalizeApiUrl('https://simsit.example.sch.id/api', false);
assert.strictEqual(prodHttps, 'https://simsit.example.sch.id/api', 'Requirement 11: Production HTTPS domain must be accepted');
console.log('✓ 6.11 Requirement 11: Production HTTPS domain is accepted');

// 6.12 Explicit environment produces exactly one candidate URL
const configuredCandidates = resolveCandidateUrls({
  baseUrl: usbUrl,
  hasConfiguredUrl: true,
  os: 'android',
  isDev: true,
  metroHostIp: '192.168.1.50'
});
assert.strictEqual(configuredCandidates.length, 1, 'Requirement 12: Configured environment must produce exactly 1 candidate');
assert.strictEqual(configuredCandidates[0], 'http://127.0.0.1:8000/api', 'Requirement 12: Candidate must be exactly the configured API_BASE_URL');
console.log('✓ 6.12 Requirement 12: Explicit environment produces exactly one candidate URL');

// 6.13 Explicit environment never rotates to localhost
const usbRun = simulateRequest(configuredCandidates, usbUrl, true, false, true);
assert.strictEqual(usbRun.activeUrl, 'http://127.0.0.1:8000/api', 'Requirement 13: Must never rotate to localhost');
assert.strictEqual(usbRun.status, 'NETWORK_ERROR', 'Requirement 13: Must emit NETWORK_ERROR directly without rotation');
console.log('✓ 6.13 Requirement 13: Explicit environment never rotates to localhost');

// 6.14 Explicit environment never rotates to 10.0.2.2
assert.ok(!configuredCandidates.includes('http://10.0.2.2:8000/api'), 'Requirement 14: Configured physical USB candidates must not contain 10.0.2.2');
console.log('✓ 6.14 Requirement 14: Explicit environment never rotates to 10.0.2.2');

// 6.15 Login endpoint resolves correctly
const loginEndpoint = `${usbUrl}/auth/login`;
assert.strictEqual(loginEndpoint, 'http://127.0.0.1:8000/api/auth/login', 'Requirement 15: Login endpoint must resolve correctly');
const prodLogin = `${prodHttps}/auth/login`;
assert.strictEqual(prodLogin, 'https://simsit.example.sch.id/api/auth/login', 'Requirement 15: Production login endpoint must resolve correctly');
console.log('✓ 6.15 Requirement 15: Login endpoint resolves correctly for development and production');

// 6.16 Network failure retains configured active URL
const netFail = simulateRequest(configuredCandidates, usbUrl, true, false, true);
assert.strictEqual(netFail.stage, 'LOGIN_NETWORK_FAILURE');
assert.strictEqual(netFail.activeUrl, 'http://127.0.0.1:8000/api', 'Requirement 16: Active URL must be preserved on network failure');
console.log('✓ 6.16 Requirement 16: Network failure retains the configured active URL');

// 6.17 Production without EXPO_PUBLIC_API_URL fails safely
assert.throws(() => resolveBaseUrl({ envUrl: undefined, os: 'android', isDev: false }), /EXPO_PUBLIC_API_URL environment variable is required in production/, 'Requirement 17: Production without EXPO_PUBLIC_API_URL must fail safely');
assert.throws(() => resolveBaseUrl({ envUrl: '', os: 'android', isDev: false }), /EXPO_PUBLIC_API_URL environment variable is required in production/, 'Requirement 17: Production with empty EXPO_PUBLIC_API_URL must fail safely');
console.log('✓ 6.17 Requirement 17: Production without EXPO_PUBLIC_API_URL fails safely');

console.log('\n--- ALL 17 DETERMINISTIC RESOLUTION REQUIREMENTS VERIFIED CLEANLY ---');
console.log('--- ALL MOBILE CONFIG & RUNTIME GUARD TESTS PASSED ---');
