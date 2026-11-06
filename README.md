# StayHub — port a Next.js 15

Port 1:1 de [StayHub](../airbnb-app) (la app de referencia escrita contra
los stubs tipados de `@platform/core`) a un stack actual: Next.js 15 (App
Router), React 19 y TypeScript. Es el "otro lado" del benchmark framework
vs. stack actual: misma spec, mismos 15 requisitos funcionales (F1–F15) y
los mismos 39 tests de aceptación, con los mismos nombres y los mismos
valores esperados. Lo que cambia es todo lo que el framework resolvía por
el desarrollador: persistencia, eventos, reloj, sesión, cron y transporte
HTTP pasan a ser código propio.

## Validar

```bash
cd airbnb-in-next
npm install
npm run check   # tsc --noEmit
npm test        # vitest: 39 tests de aceptación
npm run build   # next build (producción)
npm run dev     # http://localhost:3000
```

Resultado verificado:

- `npm run check` (tsc --noEmit): limpio.
- `npm test` (vitest): 39/39 tests pasan.
- `npx next build`: build de producción exitoso (10 rutas: `/`, `/trips`,
  7 API routes, not-found).

A diferencia de la referencia, acá no hay dos caminos (stubs para `tsc`,
mock runtime para vitest): el código corre de verdad. El estado vive en
módulos (`db`, `clock`) y [tests/setup.ts](tests/setup.ts) los resetea al
inicio de cada caso.

## Dominio

Idéntico a la referencia: guests buscan alojamientos por ciudad, cotizan y
reservan; las reservas pending expiran a las 24 h; al terminar la estadía
pueden dejar una review que recalcula el rating del listing. Hosts publican
y desactivan listings. 12% de service fee; cancelación con 100% de
reembolso hasta 7 días antes, 50% después.

## Requisitos funcionales → implementación → test

F1–F2 en [listings.test.ts](tests/listings.test.ts), F3–F9 en
[bookings.test.ts](tests/bookings.test.ts), F10–F11 en
[reviews.test.ts](tests/reviews.test.ts), F12–F15 en
[platform.test.tsx](tests/platform.test.tsx).

| # | Requisito | Dónde se garantiza | Test |
|---|---|---|---|
| F1 | Un listing se publica con título, ciudad, tarifa, capacidad y moneda válidos | `validateListingInput` + `createListing` en [listings.ts](src/lib/listings.ts) | listings |
| F2 | La búsqueda devuelve solo listings activos de la ciudad, con filtros de precio y capacidad | `searchListings` (filtro `active && city` + `maxNightly`/`minGuests`), `deactivateListing` | listings |
| F3 | Una estadía es de 1 a 30 noches, con `checkOut > checkIn` y sin comenzar en el pasado | `validateStayRange` (I1) en [bookings.ts](src/lib/bookings.ts); capacidad en `loadBookableListing` | bookings |
| F4 | El precio es `rate×noches + limpieza + 12%` de service fee, redondeado a centavos | `computeQuote` + `SERVICE_FEE_RATE` (I3), función pura | bookings |
| F5 | Los montos nunca se aceptan del cliente: se recalculan server-side | `requestBooking` re-cotiza internamente (I3) | bookings |
| F6 | Dos reservas vivas no pueden solaparse en el mismo listing (rango semi-abierto) | `hasOverlap`: `a1 < b2 AND a2 > b1` sobre pending/confirmed (I2) | bookings |
| F7 | Una reserva pending expira a las 24 h y libera las fechas | `PENDING_TTL_MS` + `expirePendingBookings`, expuesto en [cron/expire](src/app/api/cron/expire/route.ts) | bookings |
| F8 | Solo transiciones válidas: pending→confirmed/expired, pending\|confirmed→cancelled | guards en `confirmBooking` / `cancelBooking` (I4) | bookings |
| F9 | Cancelación: 100% a más de 7 días del check-in, 50% después, nunca tras comenzar | `FREE_CANCEL_WINDOW_MS` + `cancelBooking` | bookings |
| F10 | Solo el guest de una reserva confirmada y finalizada puede reseñar, una sola vez | `addReview` (R1–R3) en [reviews.ts](src/lib/reviews.ts); unicidad por `bookingId` chequeada en código | reviews |
| F11 | El rating del listing es el promedio exacto de sus reviews, mantenido incrementalmente | `nextAverage` (R4) en [reviews.ts](src/lib/reviews.ts) | reviews |
| F12 | Reservas confirmadas ≥ 1000 USD/EUR generan alerta; cancelaciones con reembolso parcial se auditan | `emit` en `confirmBooking`/`cancelBooking` + handlers con predicado en [notifications.ts](src/lib/notifications.ts) sobre [events.ts](src/lib/events.ts) | platform |
| F13 | Conversión de moneda consistente vía USD, con tabla caliente por proceso | `ExchangeRateService` + `getExchangeService` (singleton, init lazy) en [exchange.ts](src/lib/exchange.ts) | platform |
| F14 | Home muestra destacados por rating; Mis viajes lista reservas del usuario de la sesión | `getFeaturedListings` + [page.tsx](src/app/page.tsx); `myBookings` + `getCurrentUser` en [trips/page.tsx](src/app/trips/page.tsx) | platform |
| F15 | La UI recibe datos por props tipadas | [ListingCard](src/app/components/ListingCard.tsx), [BookingSummary](src/app/components/BookingSummary.tsx), [SectionTitle](src/app/components/SectionTitle.tsx) con tipos de [models.ts](src/lib/models.ts) | platform |

Notas sobre la equivalencia de los tests:

- Los nombres de los `describe`/`it` se conservan tal cual (incluidos
  "openHome", "openMyTrips" y "la UI transporta providers"), para que el
  benchmark compare caso por caso.
- F14 verifica la consulta (`getFeaturedListings`, `myBookings`) y el render
  de los componentes con `renderToStaticMarkup`, en lugar de inspeccionar
  `session.ui`.
- F15 se degrada: en la referencia las props son providers con metadata y
  reactividad; acá son primitivos planos, y el test verifica solo el tipado.

## Equivalencias framework → Next

| Framework (`@platform/core`) | En este port |
|---|---|
| `ctx.tables` / `ctx.documents` / `ctx.memory` | [db.ts](src/lib/db.ts): arrays y un `Map` (`kv`) en memoria. En producción: Prisma/Postgres (y Redis para kv) |
| `@model`, `@field`, `@index`, `@unique` | Interfaces TS en [models.ts](src/lib/models.ts); índices y unicidad se resuelven en código |
| `@endpoint` | Funciones exportadas en `src/lib` + route handlers en `src/app/api` que parsean el request y mapean errores a HTTP |
| `@action` + `session.ui` | React Server Components (`page.tsx`, `trips/page.tsx`) |
| `@component` | Componentes React en `src/app/components` |
| `@event` + filtro EDF declarativo | Bus de eventos propio con predicados en código ([events.ts](src/lib/events.ts)); la emisión es explícita (`emit`) |
| `@cron("*/15 * * * *")` | Route handler `GET /api/cron/expire`, estilo Vercel Cron (agendado en `vercel.json`) |
| `@service` perNode + `@init` | Singleton de módulo con init lazy (`getExchangeService`) |
| `ctx.time` | [clock.ts](src/lib/clock.ts): reloj inyectable, congelable en tests |
| `session.user` | [session.ts](src/lib/session.ts): usuario demo fijo (auth fuera de scope, como en la referencia) |
| Concurrencia optimista (`.condition()` en update) | No replicada: con una DB real haría falta transacción o UPDATE condicional |
| Multitenancy automático | No existe |
| Reactividad transportada por providers | No existe: para UI viva habría que sumar websockets, polling o `revalidate` |

## Lo que hubo que construir a mano

Infraestructura que en el framework viene dada y acá son archivos propios:

- **Persistencia** — [db.ts](src/lib/db.ts): store en memoria con
  generación de ids y `reset()` para tests. No persiste entre procesos.
- **Eventos** — [events.ts](src/lib/events.ts): `on(topic, handler,
  filter)` / `emit(topic, payload)`, secuencial y en proceso.
- **Reloj** — [clock.ts](src/lib/clock.ts): `now`, `setNow`, `advanceMs`,
  `reset`.
- **Sesión** — [session.ts](src/lib/session.ts): `getCurrentUser()`.
- **Wiring de notificaciones** — los handlers se registran como efecto de
  importar `@/lib/notifications`; por eso ese import aparece explícito en
  [page.tsx](src/app/page.tsx) y en las routes de
  [bookings](src/app/api/bookings/route.ts),
  [confirm](src/app/api/bookings/[id]/confirm/route.ts) y
  [cancel](src/app/api/bookings/[id]/cancel/route.ts). Una route que emita
  eventos y olvide el import no dispara los handlers.
- **Capa HTTP** — 7 route handlers que parsean body/params, invocan la
  función de `src/lib` y traducen excepciones a 400/404.

Lo que directamente no se replicó:

- Reactividad en vivo de la UI (las páginas son `force-dynamic`, se
  re-renderizan solo por request).
- Multitenancy y aislamiento entre tenants/módulos.
- Invocación cross-language entre módulos (`ctx.mods`).
- Pushdown de filtros EDF al broker: los predicados se evalúan en el
  proceso, después de emitir.
- Concurrencia optimista sobre `ratingCount` (F11) y garantía de unicidad
  a nivel de almacenamiento (F10).

## Comparación de tamaño

Líneas medidas con `wc -l` sobre `src/` de cada proyecto (sin tests).

| Capa | Framework (`airbnb-app/src`) | Next (`airbnb-in-next/src`) |
|---|---:|---:|
| Modelos | 117 (`models.ts`) | 60 (`lib/models.ts`) |
| Lógica de dominio (listings, bookings, reviews, notifications, exchange) | 638 (`modules/`) | 593 (`lib/`) |
| UI (actions/páginas + componentes) | 181 (`ui/`) | 96 (páginas 47 + componentes 49) |
| HTTP (route handlers) | 0 | 141 (`app/api/`) |
| Infraestructura propia (db, events, clock, session) | 0 | 99 |
| **Total** | **936** | **989** |

Desglose de `src/lib` en Next (752 líneas): 653 de dominio y modelos
(bookings 275, listings 126, reviews 75, notifications 63, models 60,
exchange 54) y 99 de infraestructura que el framework da gratis (events
34, db 31, clock 24, session 10).

Los totales son parecidos y la lógica de dominio es la misma. La diferencia
está en dónde va el código: en la referencia, las líneas extra son
declaraciones (decoradores, índices, access patterns, filtros EDF) que le
dan al runtime persistencia, eventos, cron y reactividad; en Next esas
declaraciones desaparecen y se reemplazan por infraestructura propia y
wiring HTTP, sin cubrir reactividad, multitenancy ni concurrencia
optimista.
