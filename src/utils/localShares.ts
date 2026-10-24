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

// Simple synchronous symmetric string encryption with password so private tokens are never in plaintext in URLs
function encryptSecretWithPassword(secret: string, password: string): string {
  try {
    const enc = new TextEncoder();
    const sBytes = enc.encode(secret);
    const pBytes = enc.encode(password);
    const out = new Uint8Array(sBytes.length);
    for (let i = 0; i < sBytes.length; i++) {
      out[i] = sBytes[i] ^ pBytes[i % pBytes.length];
    }
    return btoa(String.fromCharCode(...out));
  } catch {
    return '';
  }
}

function decryptSecretWithPassword(encrypted: string, password: string): string {
  try {
    const raw = atob(encrypted);
    const sBytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) sBytes[i] = raw.charCodeAt(i);
    const pBytes = new TextEncoder().encode(password);
    const out = new Uint8Array(sBytes.length);
    for (let i = 0; i < sBytes.length; i++) {
      out[i] = sBytes[i] ^ pBytes[i % pBytes.length];
    }
    return new TextDecoder().decode(out);
  } catch {
    return '';
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
      aid: share.githubAssetId,
      aurl: share.githubAssetApiUrl,
      priv: share.isPrivateRepo ? 1 : undefined,
      tok: share.githubToken && password ? encryptSecretWithPassword(share.githubToken.trim(), password.trim()) : undefined,
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

export function decodeStatelessShare(encoded: string, passwordAttempt?: string): ShareItem | null {
  try {
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const json = JSON.parse(decodeURIComponent(escape(atob(base64))));

    let decryptedToken: string | undefined = undefined;
    if (json.tok && passwordAttempt) {
      decryptedToken = decryptSecretWithPassword(json.tok, passwordAttempt.trim());
    }

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
      githubAssetId: json.aid,
      githubAssetApiUrl: json.aurl,
      isPrivateRepo: Boolean(json.priv || json.tok),
      githubToken: decryptedToken,
      downloadCount: 0,
    };
  } catch {
    return null;
  }
}

export function getStatelessDecryptedToken(encoded: string, passwordAttempt: string): string | null {
  try {
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const json = JSON.parse(decodeURIComponent(escape(atob(base64))));
    if (!json.tok) return null;
    return decryptSecretWithPassword(json.tok, passwordAttempt.trim()) || null;
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


