/**
 * Test extension Service Worker
 * Exposes a minimal router for E2E testing.
 */

import { createBridge, mutation, query, subscription } from '../../../index';

export const router = {
  echo: query(async (input: string) => input),

  add: mutation(async (input: { a: number; b: number }) => input.a + input.b),

  greet: query(async (name: string) => `Hello, ${name}!`),

  error: query(async () => {
    throw new Error('intentional error');
  }),

  counter: subscription<number>((emit) => {
    let count = 0;
    const id = setInterval(() => emit(++count), 100);
    return () => clearInterval(id);
  }),
};

createBridge(router, { debug: true }).listen();
