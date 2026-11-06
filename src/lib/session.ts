/**
 * Sesión demo. Auth fuera de scope (como en la referencia): siempre se
 * devuelve el mismo usuario. En producción saldría de la cookie/JWT.
 */

export const DEMO_USER = { id: "guest_bruno", name: "Bruno", email: "bruno@example.com" };

export function getCurrentUser(): typeof DEMO_USER {
  return DEMO_USER;
}
