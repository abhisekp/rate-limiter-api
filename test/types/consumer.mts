import modern from '../../build/modern/dist/rate-limiter-api.mjs';
// The import entry's declaration is tested from the installed npm package by verify:packages.
import type {Limiter} from '../../build/modern/index.d.mts';
const limiter: Limiter = modern({threshold: 1});
const value: Promise<string> = limiter.limit(async () => 'typed');
void value;
