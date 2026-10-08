export type TagRules = Readonly<Record<string, readonly string[]>>;

export const REQUIRED_TAGS: TagRules = {
  Project: ['escola-gratis-de-tecnologia'],
  Environment: ['dev', 'prod', 'shared'],
  Component: [
    'edge',
    'site',
    'api',
    'data',
    'auth',
    'media',
    'jobs',
    'certificates',
    'observability',
    'bootstrap',
  ],
  ManagedBy: ['terraform', 'app'],
  Repository: ['github.com/escolagratisdetecnologia/escolagratisdetecnologia'],
};
