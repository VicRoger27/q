/**
 * Secure local cookie and device storage for GitHub personal access tokens.
 * Keeps the token stored on the user's physical device in a SameSite=Strict cookie,
 * ensuring it is retained across sessions without being sent to external logging or telemetry.
 */

const GITHUB_TOKEN_COOKIE = 'vaultdrop_gh_token';
const GITHUB_REMEMBER_COOKIE = 'vaultdrop_gh_remember';

/**
 * Read a cookie by name from document.cookie
 */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const encodedName = encodeURIComponent(name);
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const trimmed = cookie.trim();
      if (trimmed.startsWith(encodedName + '=')) {
        return decodeURIComponent(trimmed.substring(encodedName.length + 1));
      }
    }
  } catch (err) {
    console.warn('Error reading cookie:', err);
  }
  return null;
}

/**
 * Set a cookie on the user's device with SameSite=Strict
 */
export function setCookie(name: string, value: string, days = 365): void {
  if (typeof document === 'undefined') return;
  try {
    const expires = new Date(Date.now() + days * 86400000).toUTCString();
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    // SameSite=Strict ensures the cookie is never sent with cross-site requests
    // Secure is appended if served over HTTPS
    const secureFlag = isHttps ? '; Secure' : '';
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict${secureFlag}`;
  } catch (err) {
    console.warn('Error setting cookie:', err);
  }
}

/**
 * Delete a cookie immediately
 */
export function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict`;
  } catch (err) {
    console.warn('Error deleting cookie:', err);
  }
}

/**
 * Retrieve the saved GitHub personal access token from device cookie (with localStorage fallback)
 */
export function getSavedGitHubToken(): string {
  try {
    const fromCookie = getCookie(GITHUB_TOKEN_COOKIE);
    if (fromCookie && fromCookie.trim()) {
      return fromCookie.trim();
    }
    // Fallback to localStorage if cookies are cleared or isolated in restricted browsing modes
    if (typeof localStorage !== 'undefined') {
      const fromLocal = localStorage.getItem(GITHUB_TOKEN_COOKIE);
      if (fromLocal && fromLocal.trim()) {
        return fromLocal.trim();
      }
    }
  } catch (err) {
    console.warn('Error retrieving saved token:', err);
  }
  return '';
}

/**
 * Save or remove GitHub personal access token from device cookie
 */
export function saveGitHubTokenToCookie(token: string, remember = true): void {
  try {
    const clean = token.trim();
    if (remember && clean) {
      setCookie(GITHUB_TOKEN_COOKIE, clean, 365);
      setCookie(GITHUB_REMEMBER_COOKIE, 'true', 365);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(GITHUB_TOKEN_COOKIE, clean);
        localStorage.setItem(GITHUB_REMEMBER_COOKIE, 'true');
      }
    } else {
      clearSavedGitHubToken();
    }
  } catch (err) {
    console.warn('Failed saving token to cookie storage:', err);
  }
}

/**
 * Completely wipe the saved token from this device
 */
export function clearSavedGitHubToken(): void {
  try {
    deleteCookie(GITHUB_TOKEN_COOKIE);
    deleteCookie(GITHUB_REMEMBER_COOKIE);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(GITHUB_TOKEN_COOKIE);
      localStorage.removeItem(GITHUB_REMEMBER_COOKIE);
    }
  } catch (err) {
    console.warn('Failed clearing saved token:', err);
  }
}

/**
 * Export and download the saved PAT / cookie data as a local file onto the user's computer.
 */
export function downloadGitHubTokenBackup(token?: string): boolean {
  const tokenToSave = (token && token.trim()) || getSavedGitHubToken();
  if (!tokenToSave) return false;

  const now = new Date();
  const dateStr = now.toISOString().replace(/T/, ' ').replace(/\..+/, '');
  const timestamp = now.toISOString().slice(0, 10);

  const fileContent = `# ===================================================
# VaultDrop - GitHub Personal Access Token (PAT) Backup
# Stored on device cookie: vaultdrop_gh_token
# Exported on: ${dateStr}
# ===================================================

GITHUB_PAT=${tokenToSave}

# Quick Info:
# - Scope: repo (Grants access to private GitHub releases)
# - Cookie Name: vaultdrop_gh_token
# - Stored Locally: Yes (Strict SameSite cookie on your device)

# Instructions:
# To restore or use in VaultDrop on this or another browser,
# copy this token and paste it into the "GitHub Token" field.
`;

  try {
    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vaultdrop-github-pat-${timestamp}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch (err) {
    console.error('Failed to download PAT backup file:', err);
    return false;
  }
}

/**
 * Check if the user previously enabled "Remember on this device"
 */
export function isRememberTokenEnabled(): boolean {
  try {
    const cookieVal = getCookie(GITHUB_REMEMBER_COOKIE);
    if (cookieVal === 'true') return true;
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(GITHUB_REMEMBER_COOKIE) === 'true';
    }
  } catch {
    // default false
  }
  return true; // Default to true so user convenience is prioritized
}
