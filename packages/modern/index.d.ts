declare const RateLimiterAPI: RateLimiterAPI.Factory;
declare namespace RateLimiterAPI {
  interface Factory { (options?: Options): Limiter; default: Factory }
  interface Options { threshold?: number; concurrency?: number; strategy?: 'burst-first' | 'uniform'; numberOfRequests?: number; timeout?: number }
  interface RateLimits { rateLimit?: number | string; rateRemaining?: number | string; rateReset?: number | string }
  type Callback<T> = (error?: Error | null, response?: T) => void;
  interface Snapshot { rateLimit: number; rateRemaining: number; rateReset: number | null; active: number; queued: number }
  interface Limiter {
    threshold: number;
    concurrency: number;
    limit<T>(handler: (callback: Callback<T>) => void | PromiseLike<T>, options?: {signal?: AbortSignal}): Promise<T>;
    updateRateLimits(limits: RateLimits): this;
    getRateLimits(): Snapshot;
    close(): void;
  }
}
export = RateLimiterAPI;
