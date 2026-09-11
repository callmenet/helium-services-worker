import * as Allowlist from './allowlist';
import { resolveUboEnv } from './assets-info';
import * as Resource from './resource';
import * as Path from 'node:path/posix';
import type { Env } from '../env';

export const digest = async (str: string) => {
    const u8 = new TextEncoder().encode(str);
    const hashBytes = await crypto.subtle.digest('SHA-256', u8);
    return [...new Uint8Array(hashBytes)]
        .map((a) => a.toString(16).padStart(2, '0'))
        .join('');
};

export const isValidUrl = (str: unknown) => {
    try {
        const { protocol } = new URL(
            String(str),
        );

        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
};

const canParse = (str: string) => {
    try {
        new URL(str);
        return true;
    } catch {
        return false;
    }
};

export const respondWithError = (e: unknown) => {
    if (typeof e === 'string') {
        e = { status: 400, text: e };
    }

    if (e instanceof Object) {
        if ('status' in e && 'text' in e) {
            return new Response(
                e.text as string,
                {
                    status: e.status as number,
                    headers: { 'content-type': 'text/plain' },
                },
            );
        }
    }

    return new Response('server error', { status: 500 });
};

export const shotgunFetch = async (
    input: readonly (RequestInfo | URL)[],
    init?: Omit<RequestInit, 'signal'>,
) => {
    const controller = new AbortController();
    const response = await Promise.any(
        input.map(async (info) => {
            const response = await fetch(
                info,
                {
                    ...init,
                    signal: controller.signal,
                    cf: { cacheTtl: 3600, cacheEverything: true },
                },
            );

            if (response.ok && response.status === 200) {
                const body = await response.arrayBuffer();
                const readyResponse = new Response(body, response);

                return readyResponse;
            } else throw response;
        }),
    );

    controller.abort();

    return response;
};

type Asset = {
    content: 'internal' | 'filters';
    group?: string;
    parent?: string;
    title?: string;
    tags?: string;
    updateAfter?: number;
    contentURL: string | string[];
    cdnURLs?: string[];
    patchURLs?: string[];
};

type Filename = string;
type AssetFile = Record<Filename, Asset>;

const withTrailingSlash = (base: string) => {
    return base.endsWith('/') ? base : base + '/';
};

const loadManifestFromGithub = async (env: Env) => {
    const cfg = resolveUboEnv(env);
    const assetList = await fetch(cfg.assetsUrl, {
        cf: { cacheTtl: 3600, cacheEverything: true },
    }).then((a) => a.text());
    const checksum = await digest(assetList);
    if (checksum !== cfg.fileChecksum) {
        throw `checksum does not match: ${checksum}`;
    }

    return JSON.parse(assetList) as AssetFile;
};

const prepareAssetString = async (env: Env) => {
    const manifest = await loadManifestFromGithub(env);
    const baseURL = withTrailingSlash(resolveUboEnv(env).baseURL);
    const manifestId = 'assets.json';
    const assetURLs: Record<string, string[]> = {};

    for (const [id, asset] of Object.entries(manifest)) {
        const allUrls = [asset.contentURL, asset.cdnURLs || []].flat();

        delete asset.cdnURLs;

        if (id === manifestId) {
            asset.contentURL = new URL('assets.json', baseURL)
                .toString();
            continue;
        }

        const sourceURLs = allUrls.filter(isValidUrl);
        const locals = allUrls.filter((u) => (u as string)?.startsWith('assets/'));

        if (!sourceURLs.length) {
            throw `no source for ${asset.title}`;
        }

        const filename = (() => {
            const fn = Path.basename(new URL(sourceURLs[0] as string).pathname);
            if (fn.endsWith('.txt') || fn.endsWith('.dat')) {
                return fn;
            }

            return 'filters.txt';
        })();

        const reprHash = [
            ...new Uint32Array(
                await crypto.subtle.digest(
                    { name: 'SHA-256' },
                    new TextEncoder().encode(sourceURLs[0] as string),
                ),
            ),
        ];

        const key = [
            id,
            (reprHash[0] as number).toString(16),
            (reprHash[1] as number).toString(16),
            filename,
        ].join('/');
        const proxyURL = new URL(key, baseURL).toString();

        if (locals.length) {
            asset.contentURL = [
                proxyURL,
                ...locals,
            ];
        } else {
            asset.contentURL = proxyURL;
        }

        if (asset.patchURLs) {
            asset.patchURLs = [
                new URL(Path.dirname(key), baseURL).toString(),
            ];
        }

        assetURLs[key] = sourceURLs as string[];
    }

    Allowlist.addEntries(manifestId, assetURLs);

    return JSON.stringify(manifest, null, 4);
};

const INCLUDE_REGEX = /^!#include +(\S+)[^\n\r]*(?:[\n\r]+|$)/;
const prepareFilterlist = async (path: string, env: Env, depth = 0): Promise<string> => {
    let urls = Allowlist.getURLsForPath(path);
    if (!urls && !Allowlist.hasManifest()) {
        await produceContent('assets.json', { type: 'application/json; charset=utf-8' }, () => prepareAssetString(env));
        urls = Allowlist.getURLsForPath(path);
    }
    if (!urls && depth < 1) {
        const top = Allowlist.findTopPath(path);
        if (top && top !== path) {
            await produceContent(top, { expiry_seconds: 3600 }, () => prepareFilterlist(top, env, depth + 1));
            urls = Allowlist.getURLsForPath(path);
        }
    }
    if (!urls) {
        throw { status: 404, text: 'Not Found' };
    }

    const response = await shotgunFetch(urls);
    const text = await response.text();

    const parentId = path.split('/')[0]!;
    const toAllowlist: Record<string, string[]> = {};

    const addToAllowlist = (relativePath: string) => {
        return (base: string) => {
            const url = new URL(relativePath, base);
            url.hash = '';

            return url.toString();
        };
    };

    const handleInclude = (line: string) => {
        const includeMatch = INCLUDE_REGEX.exec(line);
        if (includeMatch === null || !includeMatch[1]) {
            return;
        }

        const includePath = includeMatch[1];
        const absoluteIncludePath = Path.join(
            Path.dirname(path),
            includePath,
        );

        if (
            canParse(includePath)
            || absoluteIncludePath.split('/')[0] !== parentId
        ) {
            return;
        }

        toAllowlist[absoluteIncludePath] ??= (urls as readonly string[]).map(
            addToAllowlist(includePath),
        );
    };

    const handleDiff = (line: string) => {
        const diffPath = line.split('! Diff-Path:')[1]!.trim();
        const absoluteDiffPath =
            Path.join(Path.dirname(path), diffPath).split('#')[0]!;

        if (
            canParse(absoluteDiffPath)
            || absoluteDiffPath.split('/')[0] !== parentId
        ) {
            return;
        }

        toAllowlist[absoluteDiffPath] ??= (urls as readonly string[]).map(
            addToAllowlist(diffPath),
        );
    };

    for (const line of text.split('\n')) {
        if (line.startsWith('!#include')) {
            handleInclude(line);
        } else if (line.startsWith('! Diff-Path')) {
            handleDiff(line);
        }
    }

    Allowlist.addEntries(path, toAllowlist);

    return text;
};

type Produced = {
    bytes: ArrayBuffer;
    type: string;
    tag: string;
};

type Options = Partial<{
    type: string;
    expiry_seconds: number;
}>;

const _inflight = new Map<string, Promise<Produced>>();
const _negative = new Map<string, number>();

async function produceContent(
    key: string,
    options: Options,
    source: () => Promise<string>,
): Promise<Produced> {
    const neg = _negative.get(key);
    if (neg && neg > Date.now()) {
        throw { status: 404, text: 'Not Found' };
    }

    const pending = _inflight.get(key);
    if (pending) {
        return pending;
    }

    const task = (async () => {
        let data: string;
        try {
            data = await source();
        } catch (e) {
            _negative.set(key, Date.now() + 30000);
            throw e;
        }

        return {
            bytes: Resource.compress(data),
            type: options.type ?? 'text/plain; charset=utf-8',
            tag: await Resource.tag(data),
        };
    })();

    _inflight.set(key, task);
    try {
        return await task;
    } finally {
        _inflight.delete(key);
    }
}

const responseFor = (produced: Produced) => {
    const headers = {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': produced.type,
        'Content-Length': String(produced.bytes.byteLength),
        'Content-Encoding': 'br',
        'ETag': produced.tag,
        'Vary': 'Accept-Encoding',
    };

    return new Response(produced.bytes, { headers });
};

export const handle = async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        throw { status: 405, text: 'method not allowed' };
    }

    const acceptsBrotli = request.headers.get('accept-encoding')
        ?.split(', ', 8).some((enc) => enc === '*' || enc === 'br');

    if (!acceptsBrotli) {
        throw {
            status: 406,
            text: 'this service can only respond with brotli-encoded'
                + 'responses',
        };
    }

    const url = new URL(request.url);
    const isAssets = url.pathname === '/assets.json';
    const key = isAssets ? 'assets.json' : url.pathname.substring(1);

    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const cache = caches.default;
    let cached = await cache.match(cacheKey);

    if (!cached) {
        const produced = isAssets
            ? await produceContent(key, { type: 'application/json; charset=utf-8' }, () => prepareAssetString(env))
            : await produceContent(key, { expiry_seconds: 3600 }, () => prepareFilterlist(key, env));
        cached = responseFor(produced);
        ctx.waitUntil(cache.put(cacheKey, cached.clone()));
    }

    const etag = cached.headers.get('ETag')!;
    const cachedOnClient = request.headers.get('if-none-match')
        ?.split(', ', 8)
        .includes(etag);

    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                Allow: 'OPTIONS, GET, HEAD',
                ...Object.fromEntries(cached.headers),
            },
        });
    } else if (request.method === 'HEAD' || cachedOnClient) {
        return new Response(null, {
            status: cachedOnClient ? 304 : 200,
            headers: cached.headers,
        });
    }

    return cached;
};
