import * as Util from './util';
import * as ExtensionProxy from './proxy';
import { APP_ID_REGEX } from './omaha/helpers';
import { handleOmahaQuery } from './omaha/handlers';
import type { Env } from './env';

export { handleOmahaQuery };
export * from './omaha/types';

const handleProxy = async (url: string, headers?: Headers, method = 'GET') => {
    const init: RequestInit = { method };
    if (headers) {
        init.headers = headers;
    }
    const response = await fetch(url, init);

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: Util.filterHeaders(
            response.headers,
            Util.SAFE_RESPONSE_HEADERS,
        ),
    });
};

const handlePayloadProxy = async (request: Request, env: Env) => {
    if (request.method !== 'GET') {
        throw { status: 405, text: 'method not allowed' };
    }

    const originalURL = await ExtensionProxy.unwrap(request.url, env);
    return handleProxy(
        originalURL,
        Util.filterHeaders(
            request.headers,
            Util.SAFE_REQUEST_HEADERS,
        ),
    );
};

const CHROME_WEBSTORE_SNIPPET =
    'https://chromewebstore.googleapis.com/v2/items/{}:fetchItemSnippet';

const handleSnippetProxy = (request: Request) => {
    if (!['GET', 'POST'].includes(request.method)) {
        throw { status: 405, text: 'method not allowed' };
    }

    const extensionId = new URL(request.url).searchParams.get('id');

    if (!extensionId || !APP_ID_REGEX.test(extensionId)) {
        throw 'missing or invalid extension id';
    }

    const headers = new Headers();
    headers.set('Accept', 'application/x-protobuf');
    headers.set('Content-Type', 'application/x-protobuf');
    headers.set('X-HTTP-Method-Override', 'GET');

    return handleProxy(
        CHROME_WEBSTORE_SNIPPET
            .replace('{}', extensionId),
        headers,
        'POST',
    );
};

type RequestHandler = (request: Request, env: Env) => Promise<Response>;
const handlers: Record<string, RequestHandler> = {
    '/proxy': handlePayloadProxy,
    '/cws_snippet': handleSnippetProxy,
    '/com': handleOmahaQuery,
    '/': handleOmahaQuery,
};

export const handle = (request: Request, env: Env) => {
    const { pathname } = new URL(request.url);

    if (Object.hasOwn(handlers, pathname)) {
        return handlers[pathname]!(request, env);
    }

    throw { status: 404, text: 'Not Found' };
};
