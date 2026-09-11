import * as Extension from './extension';
import * as Ubo from './ubo/ubo';
import { respondWithError as respondWithExtError } from './util';
import { respondWithError as respondWithUboError } from './ubo/ubo';
import type { Env } from './env';

const handleBangs = async (request: Request, env: Env) => {
    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    headers.set('Cache-Control', 'public, max-age=86400, stale-if-error=604800');
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(asset.body, {
        status: asset.status,
        statusText: asset.statusText,
        headers,
    });
};

const stripPrefix = (request: Request, prefix: string) => {
    const url = new URL(request.url);
    const stripped = url.pathname.slice(prefix.length) || '/';
    url.pathname = stripped.startsWith('/') ? stripped : '/' + stripped;
    return new Request(url.toString(), request);
};

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const { pathname } = new URL(request.url);

        try {
            if (pathname === '/') {
                return Response.redirect('https://helium.computer', 302);
            }

            if (pathname === '/robots.txt') {
                return new Response('User-agent: *\nDisallow: /\n', {
                    headers: { 'content-type': 'text/plain' },
                });
            }

            if (pathname === '/connectivitycheck') {
                return new Response(null, { status: 204 });
            }

            if (pathname === '/bangs.json') {
                return await handleBangs(request, env);
            }

            if (pathname === '/com') {
                return await Extension.handle(request, env);
            }

            if (pathname === '/ext' || pathname.startsWith('/ext/')) {
                return await Extension.handle(stripPrefix(request, '/ext'), env);
            }

            if (pathname === '/ubo' || pathname.startsWith('/ubo/')) {
                try {
                    return await Ubo.handle(stripPrefix(request, '/ubo'), env, ctx);
                } catch (e) {
                    return respondWithUboError(e);
                }
            }

            throw { status: 404, text: 'Not Found' };
        } catch (e) {
            return respondWithExtError(e);
        }
    },
};
