import type { Env } from '../env';

const strictGet = (env: Env, name: 'UBO_PROXY_BASE_URL') => {
    const val = env[name];
    if (typeof val !== 'string' || !val) {
        throw new Error(`env ${name} is missing`);
    }

    return val;
};

const getBool = (val: string | undefined) => {
    return ['true', 'yes', 'on', 't', 'y', '1'].includes(
        (val || '').toLowerCase(),
    );
};

const getUrl = (val: string | undefined) => {
    if (val) {
        return new URL(val).toString();
    }
};

export const resolveUboEnv = (env: Env) => {
    const useHeliumAssets = !getBool(env.UBO_USE_ORIGINAL_UBLOCK_ASSETS);
    const customAssetsUrl = getUrl(env.UBO_ASSETS_JSON_URL);
    const customAssetsChecksum = env.UBO_ASSETS_JSON_SHA256;

    if (!useHeliumAssets && customAssetsChecksum) {
        throw 'USE_ORIGINAL_UBLOCK_ASSETS and UBO_ASSETS_JSON_* '
            + 'cannot be set at the same time';
    }

    if (!!customAssetsUrl !== !!customAssetsChecksum) {
        throw 'one of UBO_ASSETS_JSON_{URL,SHA256} is defined, but other'
            + 'is missing';
    }

    const VERSION_HELIUM = '1.74.0';
    const VERSION_VANILLA = '1.74.0';

    const CSUM_HELIUM =
        '94d3de3dfccfe953be535961e4108773c5f5797291d69de07f8f1f831a361656';
    const CSUM_VANILLA =
        '61488d15d26dfb7a8c73e8e2692ebf636300eb4fb6b98bc8356e317631487996';

    const VERSION = useHeliumAssets ? VERSION_HELIUM : VERSION_VANILLA;
    const REPO = useHeliumAssets ? 'imputnet/uBlock' : 'gorhill/uBlock';

    return {
        baseURL: strictGet(env, 'UBO_PROXY_BASE_URL'),
        fileChecksum: customAssetsChecksum
            || (useHeliumAssets ? CSUM_HELIUM : CSUM_VANILLA),
        assetsUrl: customAssetsUrl
            || (`https://raw.githubusercontent.com/${REPO}/refs/tags/`
                + `${VERSION}/assets/assets.json`),
    };
};
