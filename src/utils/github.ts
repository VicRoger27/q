import { GitHubMatchedAsset } from '../types';
import { getSavedGitHubToken } from './cookieStorage';

export function parseGitHubRepoUrl(input: string): {
  owner: string;
  repo: string;
  directAsset?: { tag: string; filename: string; directUrl: string };
} | null {
  // Strip query parameters, hash, .git suffix, and trailing slashes
  const cleaned = input.trim().replace(/\.git$/, '').split('?')[0].split('#')[0].replace(/\/+$/, '');

  // Direct release asset URL: https://github.com/owner/repo/releases/download/tag/filename
  const directMatch = cleaned.match(
    /github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/releases\/download\/([^/]+)\/(.+)$/
  );
  if (directMatch) {
    return {
      owner: directMatch[1],
      repo: directMatch[2],
      directAsset: {
        tag: directMatch[3],
        filename: decodeURIComponent(directMatch[4]),
        directUrl: cleaned,
      },
    };
  }

  // Release tag page: https://github.com/owner/repo/releases/tag/tagname
  const tagPageMatch = cleaned.match(
    /github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/releases\/tag\/([^/]+)$/
  );
  if (tagPageMatch) {
    return {
      owner: tagPageMatch[1],
      repo: tagPageMatch[2],
    };
  }

  // Release page or general repo URL: https://github.com/owner/repo
  const repoUrlMatch = cleaned.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (repoUrlMatch) {
    return { owner: repoUrlMatch[1], repo: repoUrlMatch[2] };
  }

  // Shorthand: owner/repo
  const shorthandMatch = cleaned.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shorthandMatch) {
    return { owner: shorthandMatch[1], repo: shorthandMatch[2] };
  }

  return null;
}

/**
 * Probe asset details via backend proxy (handles CORS and redirect follow)
 */
export async function probeAssetSizeViaBackend(params: {
  owner?: string;
  repo?: string;
  tag?: string;
  filename?: string;
  downloadUrl?: string;
  apiUrl?: string;
  token?: string;
}): Promise<{ size: number; id?: number; apiUrl?: string; name?: string } | null> {
  try {
    const res = await fetch('/api/github/probe-asset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store',
      },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.warn('Backend asset probe failed:', err);
  }
  return null;
}

/**
 * Scan GitHub releases with cache-busting, private token fallback, and deep size resolution
 */
export async function scanGitHubReleasesClient(
  repoUrl: string,
  targetPattern: string = 'TARGET.zip',
  token?: string
): Promise<{
  owner: string;
  repo: string;
  matches: GitHubMatchedAsset[];
}> {
  const parsed = parseGitHubRepoUrl(repoUrl);
  if (!parsed) {
    throw new Error('Invalid GitHub repository format. Use "owner/repo" or "https://github.com/owner/repo".');
  }

  const { owner, repo, directAsset } = parsed;
  // Automatically pull saved token from SameSite cookie / localStorage if not passed explicitly
  const effectiveToken = (token && token.trim()) || getSavedGitHubToken();

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
  };
  if (effectiveToken) {
    headers['Authorization'] = `token ${effectiveToken}`;
  }

  // ----------------------------------------------------
  // CASE 1: Direct Release Asset Link
  // (e.g. https://github.com/VicRoger27/proj1/releases/download/TARGET/zip.zip)
  // ----------------------------------------------------
  if (directAsset) {
    let resolvedId: number | undefined = undefined;
    let resolvedSize = 0;
    let resolvedApiUrl: string | undefined = undefined;
    let tagStatus: number | null = null;

    // Step A: Query release tag endpoint with cache-busting timestamp
    try {
      const tagUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(
        directAsset.tag
      )}?_t=${Date.now()}`;
      const tagRes = await fetch(tagUrl, {
        headers,
        cache: 'no-store',
      });
      tagStatus = tagRes.status;

      if (tagRes.ok) {
        const tagJson = await tagRes.json();
        if (Array.isArray(tagJson.assets)) {
          const match = tagJson.assets.find(
            (a: any) =>
              a.name.toLowerCase() === directAsset.filename.toLowerCase() ||
              decodeURIComponent(a.name).toLowerCase() === directAsset.filename.toLowerCase()
          );
          if (match) {
            resolvedId = match.id;
            resolvedSize = Number(match.size) || 0;
            resolvedApiUrl = match.url;
          }
        }
      }
    } catch (tagErr) {
      console.warn('Direct tag lookup network error:', tagErr);
    }

    // Step B: If size is still 0 or tag returned 404 (e.g. draft release or tag name variation),
    // query all releases with cache-busting
    if (resolvedSize === 0) {
      try {
        const relUrl = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=50&_t=${Date.now()}`;
        const relRes = await fetch(relUrl, {
          headers,
          cache: 'no-store',
        });
        if (relRes.ok) {
          const releases = await relRes.json();
          if (Array.isArray(releases)) {
            for (const rel of releases) {
              if (Array.isArray(rel.assets)) {
                const match = rel.assets.find(
                  (a: any) =>
                    a.name.toLowerCase() === directAsset.filename.toLowerCase() ||
                    decodeURIComponent(a.name).toLowerCase() === directAsset.filename.toLowerCase()
                );
                if (match && Number(match.size) > 0) {
                  resolvedId = match.id;
                  resolvedSize = Number(match.size);
                  resolvedApiUrl = match.url;
                  break;
                }
              }
            }
          }
        }
      } catch (relErr) {
        console.warn('Releases list fallback failed:', relErr);
      }
    }

    // Step C: If size is still 0, run backend probe to bypass CORS and inspect Content-Length
    if (resolvedSize === 0) {
      try {
        const probed = await probeAssetSizeViaBackend({
          owner,
          repo,
          tag: directAsset.tag,
          filename: directAsset.filename,
          downloadUrl: directAsset.directUrl,
          apiUrl: resolvedApiUrl,
          token: effectiveToken,
        });
        if (probed && probed.size > 0) {
          resolvedSize = probed.size;
          if (probed.id && !resolvedId) resolvedId = probed.id;
          if (probed.apiUrl && !resolvedApiUrl) resolvedApiUrl = probed.apiUrl;
        }
      } catch (probeErr) {
        console.warn('Backend probe fallback failed:', probeErr);
      }
    }

    // Step D: If resolved size is still 0 and tag returned 404/401, inform user about private repo
    if (resolvedSize === 0 && (tagStatus === 404 || tagStatus === 401)) {
      if (!effectiveToken) {
        throw new Error(
          `Repository "${owner}/${repo}" returned HTTP ${tagStatus}. If this repository is private, please paste your GitHub Personal Access Token in the Token field with "repo" scope.`
        );
      } else {
        throw new Error(
          `GitHub returned HTTP ${tagStatus} for "${owner}/${repo}". Check that your token has full "repo" permissions and that the release tag "${directAsset.tag}" exists.`
        );
      }
    }

    return {
      owner,
      repo,
      matches: [
        {
          id: resolvedId,
          name: directAsset.filename,
          size: resolvedSize,
          downloadUrl: directAsset.directUrl,
          apiUrl: resolvedApiUrl,
          source: 'release',
          releaseTag: directAsset.tag,
          releaseName: `Direct Release Asset (${directAsset.tag})`,
        },
      ],
    };
  }

  // ----------------------------------------------------
  // CASE 2: Scan Repository Releases
  // ----------------------------------------------------
  const ghRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=50&_t=${Date.now()}`,
    {
      headers,
      cache: 'no-store',
    }
  );

  if (!ghRes.ok) {
    if (ghRes.status === 404) {
      throw new Error(
        `Repository "${owner}/${repo}" was not found or is Private. If private, enter your GitHub Personal Access Token with "repo" scope in the Token field below.`
      );
    }
    if (ghRes.status === 401) {
      throw new Error(
        `GitHub authentication failed (HTTP 401). Please check that your Personal Access Token is valid and has "repo" scope.`
      );
    }
    const errJson = await ghRes.json().catch(() => ({}));
    throw new Error(errJson.message || `GitHub returned HTTP ${ghRes.status}`);
  }

  const releases = await ghRes.json();
  if (!Array.isArray(releases) || releases.length === 0) {
    throw new Error(
      `No releases found in ${owner}/${repo}. Create a release under github.com/${owner}/${repo}/releases and attach your TARGET.zip binary.`
    );
  }

  const targetLower = targetPattern.toLowerCase();
  const primaryMatches: GitHubMatchedAsset[] = [];
  const otherAssets: GitHubMatchedAsset[] = [];

  for (const rel of releases) {
    if (Array.isArray(rel.assets)) {
      for (const asset of rel.assets) {
        const name = asset.name;
        const nameLower = name.toLowerCase();

        const isExact = nameLower === targetLower;
        const isPrefix = nameLower.startsWith(targetLower);
        const isArchive =
          (targetLower === 'target' || targetLower === 'target.zip') &&
          /\.(zip|7z|tar\.gz|tgz|rar|gz|bz2|xz|iso|dmg)$/i.test(name);

        const item: GitHubMatchedAsset = {
          id: asset.id,
          name: asset.name,
          size: Number(asset.size) || 0,
          downloadUrl: asset.browser_download_url,
          apiUrl: asset.url,
          source: 'release',
          releaseTag: rel.tag_name,
          releaseName: rel.name || rel.tag_name,
        };

        if (isExact || isPrefix || isArchive) {
          primaryMatches.push(item);
        } else {
          otherAssets.push(item);
        }
      }
    }
  }

  const matches = [...primaryMatches, ...otherAssets];
  if (matches.length === 0) {
    throw new Error(
      `No assets matching "${targetPattern}" found in ${owner}/${repo} releases. Upload a file to your release on GitHub.`
    );
  }

  return { owner, repo, matches };
}

/**
 * Force refresh the size of an asset (bypassing all browser and API caches)
 */
export async function refreshGitHubAssetSize(
  asset: GitHubMatchedAsset,
  owner: string,
  repo: string,
  token?: string
): Promise<number> {
  const effectiveToken = (token && token.trim()) || getSavedGitHubToken();

  // Try backend probe first (most reliable, handles redirects and Content-Length)
  try {
    const probed = await probeAssetSizeViaBackend({
      owner,
      repo,
      tag: asset.releaseTag,
      filename: asset.name,
      downloadUrl: asset.downloadUrl,
      apiUrl: asset.apiUrl,
      token: effectiveToken,
    });
    if (probed && probed.size > 0) {
      return probed.size;
    }
  } catch (err) {
    console.warn('Backend refresh failed:', err);
  }

  // Try direct GitHub API with cache-busting
  if (asset.apiUrl) {
    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      };
      if (effectiveToken) headers['Authorization'] = `token ${effectiveToken}`;
      const res = await fetch(`${asset.apiUrl}?_t=${Date.now()}`, { headers, cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.size && Number(data.size) > 0) {
          return Number(data.size);
        }
      }
    } catch (e) {
      console.warn('API refresh failed:', e);
    }
  }

  return asset.size || 0;
}
