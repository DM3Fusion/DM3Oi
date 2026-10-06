import "server-only";

export function logServerPerformance(
  route: string,
  stage: string,
  startedAt: number,
) {
  console.info("DM3Oi PERF", {
    route,
    stage,
    durationMs: Math.round(performance.now() - startedAt),
  });
}

export async function measureServerPerformance<T>(
  route: string,
  stage: string,
  operation: () => T,
): Promise<Awaited<T>> {
  const startedAt = performance.now();

  try {
    return await operation();
  } finally {
    logServerPerformance(route, stage, startedAt);
  }
}
