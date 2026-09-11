import * as Mixins from './mixins';
import * as Helpers from './helpers';
import * as OmahaRequest from './request';
import * as ResponseHandler from './response';

import * as Util from '../util';
import type { Env } from '../env';

export const handleOmahaQuery = async (request: Request, env: Env) => {
    const { apps, protocol, responseType } = await Helpers.getData(request);
    const serviceId = Helpers.getServiceId(request);
    const filteredApps = Helpers.checkAndFilterApps(serviceId, apps);

    if (filteredApps.length === 0) {
        throw 'no allowed extension IDs left to fetch';
    }

    const appsWithMixin = Util.shuffle(
        Mixins.addRandomExtensions(serviceId, filteredApps),
    );

    const omahaResponse = await OmahaRequest.request(
        { serviceId, protocolVersion: protocol },
        appsWithMixin,
        { userAgent: request.headers.get('user-agent') || '' },
        env,
    );

    Mixins.addToPoolFromResponse(serviceId, omahaResponse);
    return ResponseHandler.createResponse(
        responseType,
        protocol,
        Mixins.unmixResponse(filteredApps, omahaResponse),
        env,
    );
};
