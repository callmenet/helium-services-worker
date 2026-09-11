import { decodeBase64, encodeBase64 } from './base64url';
import * as Util from './util';
import type { Env } from './env';

export const PROXY_HOSTS = new Set([
    'clients2.google.com',
    'clients2.googleusercontent.com',
    'dl.google.com',
    'update.googleapis.com',
    'chromewebstore.googleapis.com',
]);

const keys = new Map<string, Promise<CryptoKey | null>>();

const getKey = (env: Env) => {
    const secret = env.HMAC_SECRET ?? '';
    let key = keys.get(secret);
    if (!key) {
        key = (async () => {
            if (secret.length < 32) {
                return null;
            }
            return await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(secret),
                { name: 'HMAC', hash: { name: 'SHA-256' } },
                false,
                ['sign', 'verify'],
            );
        })();
        keys.set(secret, key);
    }
    return key;
};

const getBaseOrigin = (env: Env) => {
    if (!env.PROXY_BASE_URL) {
        return null;
    }
    return new URL(env.PROXY_BASE_URL);
};

const sign = async (key: CryptoKey, url: string, expiry: number) => {
    Util.parseURLStrict(url);

    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(
            JSON.stringify({ url, expiry }),
        ),
    );

    return encodeBase64(signature);
};

const verify = async (key: CryptoKey, url: string, exp: string, sig: string) => {
    Util.parseURLStrict(url);

    const signature = decodeBase64(sig);
    const ok = await crypto.subtle.verify(
        'HMAC',
        key,
        signature,
        new TextEncoder().encode(
            JSON.stringify({ url, expiry: Number(exp) }),
        ),
    );

    if (!ok) {
        throw 'signature verification failed';
    }
};

export const wrap = async (url: string, env: Env) => {
    const baseOrigin = getBaseOrigin(env);
    const secret = await getKey(env);
    if (!baseOrigin || !secret) {
        return url;
    }

    const proxyURL = new URL(baseOrigin);
    const expiry = Util.now() + Util.ms.hours(1);

    if (!proxyURL.pathname.endsWith('/')) {
        proxyURL.pathname += '/';
    }
    proxyURL.pathname += 'proxy';
    proxyURL.searchParams.set('url', url);
    proxyURL.searchParams.set('sig', await sign(secret, url, expiry));
    proxyURL.searchParams.set('exp', expiry.toString());

    return proxyURL.toString();
};

export const unwrap = async (url_: string, env: Env) => {
    const baseOrigin = getBaseOrigin(env);
    const secret = await getKey(env);
    if (!baseOrigin || !secret) {
        throw { status: 404, text: 'content proxying is disabled' };
    }

    const url = new URL(url_);
    const originalURL = url.searchParams.get('url');
    const signature = url.searchParams.get('sig');
    const expiry = url.searchParams.get('exp');

    if (!originalURL || !signature || !expiry) {
        throw 'malformed url';
    }

    await verify(secret, originalURL, expiry, signature);

    if (Util.now() > +expiry) {
        throw { status: 410, text: 'URL expired' };
    }

    const parsed = Util.parseURLStrict(originalURL)!;
    if (!PROXY_HOSTS.has(parsed.hostname)) {
        throw { status: 403, text: 'proxy destination not allowed' };
    }

    return originalURL;
};
