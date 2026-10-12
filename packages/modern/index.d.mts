export interface Options { threshold?: number; concurrency?: number; strategy?: 'burst-first' | 'uniform'; numberOfRequests?: number; timeout?: number }
export interface RateLimits { rateLimit?: number | string; rateRemaining?: number | string; rateReset?: number | string }
export type Callback<T> = (error?: Error | null, response?: T) => void;
export interface Snapshot { rateLimit: number; rateRemaining: number; rateReset: number | null; active: number; queued: number }
export interface Limiter {
  threshold: number;
  concurrency: number;
  limit<T>(handler: (callback: Callback<T>) => void | PromiseLike<T>, options?: {signal?: AbortSignal}): Promise<T>;
  updateRateLimits(limits: RateLimits): this;
  getRateLimits(): Snapshot;
  close(): void;
}
export default function RateLimiterAPI(options?: Options): Limiter;
