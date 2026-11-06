/**
 * Bus de eventos en memoria. Equivale a @event + EDF del framework de
 * referencia: allá el filtro es una expresión declarativa con pushdown al
 * broker; acá es un predicado TS evaluado antes de invocar el handler.
 */

interface Subscription {
  topic: string;
  handler: (payload: unknown) => void | Promise<void>;
  filter?: (payload: unknown) => boolean;
}

const subscriptions: Subscription[] = [];

export function on<T>(
  topic: string,
  handler: (payload: T) => void | Promise<void>,
  filter?: (payload: T) => boolean,
): void {
  subscriptions.push({
    topic,
    handler: handler as (payload: unknown) => void | Promise<void>,
    filter: filter as ((payload: unknown) => boolean) | undefined,
  });
}

/** Ejecuta, en orden de registro, los handlers del tópico cuyo filtro no dé false. */
export async function emit(topic: string, payload: Record<string, unknown>): Promise<void> {
  for (const sub of subscriptions) {
    if (sub.topic !== topic) continue;
    if (sub.filter && sub.filter(payload) === false) continue;
    await sub.handler(payload);
  }
}
