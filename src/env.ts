export interface Env {
    ASSETS: Fetcher;
    HMAC_SECRET?: string;
    PROXY_BASE_URL: string;
    UBO_PROXY_BASE_URL: string;
    UBO_USE_ORIGINAL_UBLOCK_ASSETS?: string;
    UBO_ASSETS_JSON_URL?: string;
    UBO_ASSETS_JSON_SHA256?: string;
    CHROMIUM_FALLBACK_VERSION?: string;
}
