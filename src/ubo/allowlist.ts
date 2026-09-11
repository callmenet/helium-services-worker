type PathOrResource = string;
type Path = string;
type sURL = string;

const _paths: Record<Path, sURL[]> = {};
const _parents: Record<PathOrResource, Path[]> = {};

export const addEntries = (
    parent: string,
    entries: Record<string, string[]>,
) => {
    if (parent in _parents) {
        _parents[parent]!.forEach((path) => {
            delete _paths[path];
        });
    }

    _parents[parent] = Object.keys(entries);

    for (const [path, urls] of Object.entries(entries)) {
        if (path in _paths) {
            continue;
        }

        _paths[path] = [...urls];
    }
};

export const getURLsForPath = (path: string): readonly string[] | undefined => {
    return _paths[path];
};

export const hasManifest = () => {
    return 'assets.json' in _parents;
};

export const findTopPath = (path: string): string | undefined => {
    const parts = path.split('/');
    if (parts.length < 4) {
        return undefined;
    }
    const prefix = parts.slice(0, 3).join('/') + '/';
    return Object.keys(_paths).find((key) => key.startsWith(prefix));
};
