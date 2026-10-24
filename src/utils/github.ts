import { GitHubMatchedAsset } from '../types';

export function parseGitHubRepoUrl(input: string): {
  owner: string;
  repo: string;
  directAsset?: { tag: string; filename: string; directUrl: string };
} | null {
  const cleaned = input.trim().replace(/\.git$/, '');

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

  // Release page or repo URL
  const repoUrlMatch = cleaned.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (repoUrlMatch) {
    return { owner: repoUrlMatch[1], repo: repoUrlMatch[2] };
  }

  // Shorthand owner/repo
  const shorthandMatch = cleaned.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shorthandMatch) {
    return { owner: shorthandMatch[1], repo: shorthandMatch[2] };
  }

  return null;
}

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

  // Direct asset link provided
  if (directAsset) {
    return {
      owner,
      repo,
      matches: [
        {
          name: directAsset.filename,
          size: 0,
          downloadUrl: directAsset.directUrl,
          source: 'release',
          releaseTag: directAsset.tag,
          releaseName: `Direct Release Asset (${directAsset.tag})`,
        },
      ],
    };
  }

  // Query GitHub's public REST API directly from the browser (Zero backend dependencies, 100% CORS supported)
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token && token.trim()) {
    headers['Authorization'] = `token ${token.trim()}`;
  }

  const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, { headers });

  if (!ghRes.ok) {
    if (ghRes.status === 404) {
      throw new Error(
        `Repository "${owner}/${repo}" was not found or is Private. If private, make it Public on GitHub or provide a Personal Access Token.`
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
          name: asset.name,
          size: asset.size,
          downloadUrl: asset.browser_download_url,
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
