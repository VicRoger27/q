import { ShareItem } from '../types';

const STORAGE_KEY = 'vaultdrop_local_shares';

export function getLocalShares(): ShareItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalShare(share: ShareItem, password?: string): void {
  try {
    const list = getLocalShares();
    const updated = [share, ...list.filter((s) => s.id !== share.id)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    if (password) {
      // Store password hash in localStorage for client-side verification on Vercel
      localStorage.setItem(`vaultdrop_pwd_${share.id}`, btoa(password));
    }
  } catch (err) {
    console.error('Error saving to localStorage:', err);
  }
}

export function getLocalShareById(id: string): ShareItem | null {
  const list = getLocalShares();
  return list.find((s) => s.id === id) || null;
}

export function verifyLocalPassword(shareId: string, passwordAttempt: string): boolean {
  try {
    const stored = localStorage.getItem(`vaultdrop_pwd_${shareId}`);
    if (!stored) return false;
    return atob(stored) === passwordAttempt.trim();
  } catch {
    return false;
  }
}

export function encodeStatelessShare(share: ShareItem, password?: string): string {
  try {
    const payload = {
      id: share.id,
      t: share.title,
      fn: share.filename,
      fs: share.fileSize,
      url: share.githubDownloadUrl,
      repo: share.githubRepo,
      tag: share.githubReleaseTag,
      h: password ? btoa(password.trim()) : undefined,
    };
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  } catch {
    return '';
  }
}

export function decodeStatelessShare(encoded: string): ShareItem | null {
  try {
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const json = JSON.parse(decodeURIComponent(escape(atob(base64))));
    return {
      id: json.id || 'gh_share',
      title: json.t || json.fn,
      description: '',
      filename: json.fn,
      fileSize: json.fs || 0,
      fileType: 'application/zip',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      isFolder: false,
      hasPassword: true,
      sourceType: 'github',
      githubRepo: json.repo,
      githubReleaseTag: json.tag,
      githubDownloadUrl: json.url,
      downloadCount: 0,
    };
  } catch {
    return null;
  }
}

export function verifyStatelessPassword(encoded: string, passwordAttempt: string): boolean {
  try {
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const json = JSON.parse(decodeURIComponent(escape(atob(base64))));
    if (!json.h) return true;
    return atob(json.h) === passwordAttempt.trim();
  } catch {
    return false;
  }
}

