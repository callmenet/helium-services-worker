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

    const VERSION_HELIUM = '1.76.4';
    const VERSION_VANILLA = '1.76.6';

    const CSUM_HELIUM =
        '07fbdf20c9c1f5212ad6c55d2d7aea1980f4d093fc33e57bf019744dd9694dac';
    const CSUM_VANILLA =
        'e994253fe9987f987149bec99bf366e1e3636f166e6acf444bfe0702fc15cfcc';

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
