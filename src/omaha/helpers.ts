import * as V3 from './v3/index';
import * as V4 from './v4/index';
import type { App, OmahaRequest, ProtocolVersion, ResponseType, ServiceId } from './types';

export const APP_ID_REGEX = /^[a-p]{32}$/;

const APPID_ALLOWLIST: Partial<Record<ServiceId, Set<string>>> = {
    'CHROME_COMPONENTS': new Set([
        'hfnkpimlhhgieaddgfemjhofmfblmnib',
    ]),
};

export const checkAndFilterApps = (serviceId: ServiceId, apps: App[]) => {
    const ids = new Set();
    const allowlist = APPID_ALLOWLIST[serviceId];

    return apps.filter((obj) => {
        const { appid, version } = obj;

        if (ids.has(appid)) {
            throw `duplicates not allowed -- ${appid}`;
        } else if (!APP_ID_REGEX.test(appid)) {
            throw `invalid app id -- ${appid}`;
        } else if (version.length > 16 || version.length === 0) {
            throw `invalid version -- ${version}`;
        }

        if (!allowlist || allowlist.has(appid)) {
            ids.add(appid);
            return true;
        }
    });
};

type RequestData = {
    apps: App[];
    protocol: ProtocolVersion;
    responseType: ResponseType;
};

const getAppsFromQuery = (params: string[]): App[] => {
    return params.map((str) => {
        const params = new URLSearchParams(str);
        const appid = params.get('id');

        if (!params.has('uc') || !appid) {
            throw 'invalid x string';
        }

        return {
            appid,
            version: params.get('v') ?? '0.0.0.0',
        };
    });
};

const handleGet = (request: Request): RequestData => {
    const url = new URL(request.url);
    let responseType: RequestData['responseType'] = 'xml';

    if (url.searchParams.get('response') === 'redirect') {
        responseType = 'redirect';
    }

    const xParams = url.searchParams.getAll('x');
    if (
        xParams.length === 0 || (xParams.length > 1 && responseType === 'redirect')
    ) {
        throw 'malformed request';
    }

    return {
        responseType,
        protocol: 3,
        apps: getAppsFromQuery(xParams),
    };
};

const getAppsForProtocol = (
    request: OmahaRequest,
    protocol: ProtocolVersion,
): App[] => {
    let appList: App[];

    if (protocol === 3) {
        appList = (request as V3.OmahaRequest).app;
    } else if (protocol === 4) {
        appList = (request as V4.OmahaRequest).apps;
    } else {
        throw 'unreachable';
    }

    if (!appList) {
        throw 'malformed request';
    }

    return appList.map((app) => ({
        appid: app.appid,
        version: app.version,
        brand: app.brand,
        updatecheck: app.updatecheck && {
            cause: 'cause' in app.updatecheck ? app.updatecheck.cause : undefined,
            sameversionupdate: 'sameversionupdate' in app.updatecheck
                ? (app.updatecheck as { sameversionupdate?: boolean }).sameversionupdate
                : undefined,
            rollback_allowed: app.updatecheck.rollback_allowed,
            targetversionprefix: app.updatecheck.targetversionprefix,
            updatedisabled: app.updatecheck.updatedisabled,
        },
    }));
};

const handlePost = async (request: Request): Promise<RequestData> => {
    if (request.headers.get('content-type') !== 'application/json') {
        throw { status: 422, text: 'invalid content-type' };
    }

    let body: { request: OmahaRequest };
    try {
        body = await request.json();
    } catch {
        throw 'invalid body';
    }

    const protocolStr = body.request.protocol;
    let protocol: ProtocolVersion;
    if (protocolStr?.startsWith('3.')) {
        protocol = 3;
    } else if (protocolStr?.startsWith('4.')) {
        protocol = 4;
    } else {
        throw `unknown omaha protocol version: "${protocolStr}"`;
    }

    const apps = getAppsForProtocol(body.request, protocol);
    return {
        responseType: 'json',
        protocol,
        apps,
    };
};

export const getData = async (request: Request): Promise<RequestData> => {
    if (request.method === 'GET') {
        return handleGet(request);
    } else if (request.method === 'POST') {
        return await handlePost(request);
    }

    throw { status: 405, text: 'method not allowed' };
};

export const getServiceId = (request: Request): ServiceId => {
    const { pathname } = new URL(request.url);
    if (pathname === '/com') {
        return 'CHROME_COMPONENTS';
    }

    return 'CHROME_WEBSTORE';
};
