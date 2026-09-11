import type { App, OmahaResponse, ServiceId } from './types';

export const addToPool = (_id: ServiceId, _app: App) => {
};

export const addToPoolFromResponse = (_id: ServiceId, _response: OmahaResponse) => {
};

export const addRandomExtensions = (_id: ServiceId, apps: readonly App[]) => {
    return [...apps];
};

export const unmixResponse = (expectedApps: readonly App[], response: OmahaResponse) => {
    void expectedApps;
    return response;
};
