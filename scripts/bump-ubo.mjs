import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const CONSTANTS_FILE = new URL('../src/ubo/assets-info.ts', import.meta.url);

const REPOS = {
    HELIUM: 'imputnet/uBlock',
    VANILLA: 'gorhill/uBlock',
};

const token = process.env.GITHUB_TOKEN;
const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'helium-services-worker',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
};

const getLatestVersion = async (repo) => {
    const response = await fetch(
        `https://api.github.com/repos/${repo}/releases/latest`,
        { headers },
    );

    if (!response.ok) {
        throw new Error(`failed to get latest release for ${repo}: ${response.status}`);
    }

    const { tag_name: version } = await response.json();
    if (!version) {
        throw new Error(`latest release for ${repo} has no tag`);
    }

    return version;
};

const getChecksum = async (repo, version) => {
    const response = await fetch(
        `https://raw.githubusercontent.com/${repo}/refs/tags/${version}/assets/assets.json`,
    );

    if (!response.ok) {
        throw new Error(`failed to get assets.json for ${repo}@${version}: ${response.status}`);
    }

    const contents = new Uint8Array(await response.arrayBuffer());
    return createHash('sha256').update(contents).digest('hex');
};

const replace = (source, pattern, replacement) => {
    if (!pattern.test(source)) {
        throw new Error(`pattern not found: ${pattern}`);
    }

    return source.replace(pattern, replacement);
};

let source = await readFile(CONSTANTS_FILE, 'utf8');

for (const [kind, repo] of Object.entries(REPOS)) {
    const version = await getLatestVersion(repo);
    const checksum = await getChecksum(repo, version);

    const currentVersion = new RegExp(`const VERSION_${kind} = '([^']*)';`)
        .exec(source)?.[1];
    const currentChecksum = new RegExp(`const CSUM_${kind} =\\s*'([^']*)';`)
        .exec(source)?.[1];

    if (currentVersion === undefined || currentChecksum === undefined) {
        throw new Error(`could not read ${kind} pin from src/ubo/assets-info.ts`);
    }

    if (checksum === currentChecksum) {
        console.log(`${kind}: assets.json unchanged in ${version}, keeping pin at ${currentVersion}`);
        continue;
    }

    source = replace(
        source,
        new RegExp(`const VERSION_${kind} = '[^']*';`),
        `const VERSION_${kind} = '${version}';`,
    );
    source = replace(
        source,
        new RegExp(`const CSUM_${kind} =\\s*'[^']*';`),
        `const CSUM_${kind} =\n        '${checksum}';`,
    );
    console.log(`${kind}: updated ${currentVersion} -> ${version}`);
}

await writeFile(CONSTANTS_FILE, source);
