// Test-only resolver: permits offline native-Node tests without installing workspace dependencies.
// This is not evidence that pnpm installation or production module resolution works.
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@hk-school/contracts/identity') {
      return { url: new URL('../../packages/contracts/src/identity.ts', import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});
