declare const RateLimiterAPI: RateLimiterAPI.Factory;
declare namespace RateLimiterAPI {
  interface Options { threshold?: number; concurrency?: number; strategy?: string; numberOfRequests?: number; rateUpdater?: unknown; [key: string]: unknown }
  interface RateLimits { rateLimit?: number | string; rateRemaining?: number | string; rateReset?: number | string }
  type Callback<T> = (error?: Error | null, response?: T) => void;
  interface Limiter { threshold: number; concurrency: number; limit<T>(handler: (callback: Callback<T>) => void): Promise<T>; updateRateLimits(limits: RateLimits): this; [key: string]: unknown }
  interface Factory {
    (options?: Options): Limiter;
    default: Factory;
    create(options?: Options): Limiter;
    refs(options: Options): Factory;
    state(options: Options): Factory;
    props(options: object): Factory;
    methods(methods: object): Factory;
    init(initializer: (this: Limiter, context: {instance: Limiter; args: unknown[]; stamp: Factory}) => unknown): Factory;
    enclose(initializer: (this: Limiter) => unknown): Factory;
    compose(...stamps: Factory[]): Factory;
    static(properties: object): Factory;
    fixed: {refs: Options; methods: object; props: object; init: Function[]; static: object};
  }
}
export = RateLimiterAPI;
