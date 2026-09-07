// src/errors/error-catalog.ts
import Boom from "@hapi/boom";
import type { ErrorCode } from "./app-errors.js";

/**
 * CATÁLOGO CENTRAL DE ERRORES
 * ---------------------------
 * Único lugar del proyecto donde se decide, para cada situación de fallo:
 *   - qué código HTTP le corresponde,
 *   - si la operación se puede reintentar,
 *   - qué mensaje ve el usuario final,
 *   - qué debería hacer para resolverlo.
 *
 * El código HTTP NO se escribe a mano: lo aporta @hapi/boom a través de sus
 * factories semánticas (Boom.notFound → 404, Boom.tooManyRequests → 429, ...).
 * Eso evita el clásico bug de "status escrito mal a mano" y hace que la
 * librería sea la fuente de verdad de la correspondencia situación → HTTP.
 *
 * Toda la dependencia de @hapi/boom vive en ESTE archivo: si mañana se cambia
 * de librería, se toca un solo módulo y el resto del proyecto no se entera.
 */

/**
 * Claves del catálogo. Son más finas que los `ErrorCode` de dominio a propósito:
 * un mismo ErrorCode ("GITHUB_API_ERROR") cubre situaciones muy distintas
 * (404, 403, 422, 5xx) y cada una merece su propio status y su propio mensaje.
 */
export type ErrorCatalogKey =
    | "VALIDATION_ERROR"
    | "AUTH_ERROR"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "UNPROCESSABLE"
    | "RATE_LIMIT"
    | "NETWORK_ERROR"
    | "GITHUB_SERVER_ERROR"
    | "GITHUB_UNEXPECTED"
    | "UNKNOWN_ERROR";

/** Datos opcionales para armar un mensaje concreto en vez de uno genérico. */
export interface ErrorContext {
    owner?: string;
    repo?: string;
    resource?: string;
    /** Status real que devolvió GitHub, cuando difiere del canónico (ej: 403 en rate limit). */
    githubStatus?: number;
}

export interface ErrorCatalogEntry {
    /** Código de dominio: mantiene la compatibilidad con la jerarquía de AppError. */
    code: ErrorCode;
    /** Etiqueta corta y legible para mostrarle al usuario. */
    title: string;
    /** ¿Tiene sentido que el usuario (o el retry automático) lo intente de nuevo? */
    retryable: boolean;
    /** Mensaje orientado al usuario. Recibe contexto para poder ser específico. */
    buildMessage: (ctx?: ErrorContext) => string;
    /** Acción concreta sugerida. Es lo que convierte un error en algo accionable. */
    hint: string;
    /** Factory de @hapi/boom: de acá sale el código HTTP, no de una constante escrita a mano. */
    boom: (message: string) => Boom.Boom;
}

/** Devuelve el nombre del recurso afectado, si lo conocemos ("owner/repo" o un nombre suelto). */
function target(ctx?: ErrorContext): string | null {
    if (ctx?.resource) return ctx.resource;
    const joined = [ctx?.owner, ctx?.repo].filter(Boolean).join("/");
    return joined || null;
}

export const ERROR_CATALOG: Record<ErrorCatalogKey, ErrorCatalogEntry> = {
    VALIDATION_ERROR: {
        code: "VALIDATION_ERROR",
        title: "Datos inválidos",
        retryable: false,
        buildMessage: () => "Los datos enviados no son válidos.",
        hint: "Revisá los parámetros marcados y volvé a intentar con valores correctos.",
        boom: (m) => Boom.badRequest(m),
    },

    AUTH_ERROR: {
        code: "AUTH_ERROR",
        title: "Autenticación fallida",
        retryable: false,
        buildMessage: () => "El token de GitHub es inválido o expiró.",
        hint: "Verificá la variable GITHUB_TOKEN en tu archivo .env y que el token no esté vencido.",
        boom: (m) => Boom.unauthorized(m),
    },

    FORBIDDEN: {
        code: "GITHUB_API_ERROR",
        title: "Permisos insuficientes",
        retryable: false,
        buildMessage: (ctx) => {
            const t = target(ctx);
            return t
                ? `No tenés permisos suficientes para operar sobre "${t}".`
                : "No tenés permisos suficientes para esta operación.";
        },
        hint: "Regenerá el token incluyendo el scope 'repo' (y 'admin:org' si operás sobre una organización).",
        boom: (m) => Boom.forbidden(m),
    },

    NOT_FOUND: {
        code: "GITHUB_API_ERROR",
        title: "Recurso no encontrado",
        retryable: false,
        buildMessage: (ctx) => {
            const t = target(ctx);
            return t
                ? `El recurso "${t}" no fue encontrado.`
                : "El recurso solicitado no fue encontrado.";
        },
        hint: "Verificá que el owner y el nombre del repositorio estén bien escritos y que el token tenga acceso si es privado.",
        boom: (m) => Boom.notFound(m),
    },

    CONFLICT: {
        code: "GITHUB_API_ERROR",
        title: "Conflicto con el estado del repositorio",
        retryable: false,
        buildMessage: () =>
            "La operación choca con el estado actual del repositorio (por ejemplo, el repo está vacío o la rama cambió mientras se ejecutaba).",
        hint: "Si el repositorio está vacío, creá un primer commit (un README alcanza). Si la rama cambió, volvé a leer el historial y reintentá.",
        boom: (m) => Boom.conflict(m),
    },

    UNPROCESSABLE: {
        code: "GITHUB_API_ERROR",
        title: "GitHub rechazó los datos",
        retryable: false,
        // GitHub usa 422 para situaciones muy distintas según el endpoint: un
        // nombre de repo ya en uso, una rama que no existe o un SHA que no
        // pertenece al repositorio. El mensaje nombra las tres en vez de
        // afirmar una sola, que es lo que hacía antes y resultaba engañoso.
        buildMessage: (ctx) => {
            const t = target(ctx);
            return t
                ? `GitHub rechazó la operación sobre "${t}": el nombre puede estar en uso, o la rama o el commit indicados pueden no existir.`
                : "GitHub rechazó la operación: el nombre puede estar en uso, o la rama o el commit indicados pueden no existir.";
        },
        hint: "Verificá que el nombre no esté en uso y que la rama y el commit existan (podés confirmar el SHA con list_commits).",
        boom: (m) => Boom.badData(m),
    },

    RATE_LIMIT: {
        code: "GITHUB_API_ERROR",
        title: "Límite de peticiones alcanzado",
        retryable: true,
        buildMessage: () => "Se alcanzó el límite de peticiones de la API de GitHub.",
        hint: "Esperá unos minutos antes de reintentar. El servidor ya reintenta solo con backoff exponencial.",
        // GitHub responde 403 en este caso, pero el código HTTP correcto para
        // "demasiadas peticiones" es 429: el catálogo normaliza esa diferencia.
        boom: (m) => Boom.tooManyRequests(m),
    },

    NETWORK_ERROR: {
        code: "NETWORK_ERROR",
        title: "Error de red",
        retryable: true,
        buildMessage: () => "No se pudo establecer conexión con GitHub.",
        hint: "Revisá tu conexión a internet y reintentá en unos segundos.",
        boom: (m) => Boom.serverUnavailable(m),
    },

    GITHUB_SERVER_ERROR: {
        code: "GITHUB_API_ERROR",
        title: "Error en el servidor de GitHub",
        retryable: true,
        buildMessage: (ctx) =>
            `GitHub tuvo un problema interno al procesar la petición${ctx?.githubStatus ? ` (respondió ${ctx.githubStatus})` : ""}.`,
        hint: "Es un problema del lado de GitHub. Reintentá en unos minutos o revisá githubstatus.com.",
        boom: (m) => Boom.badGateway(m),
    },

    GITHUB_UNEXPECTED: {
        code: "GITHUB_API_ERROR",
        title: "Respuesta inesperada de GitHub",
        retryable: false,
        buildMessage: (ctx) =>
            `GitHub respondió con un error no contemplado${ctx?.githubStatus ? ` (status ${ctx.githubStatus})` : ""}.`,
        hint: "Revisá los parámetros enviados. Si se repite, consultá la documentación de la API de GitHub.",
        boom: (m) => Boom.badGateway(m),
    },

    UNKNOWN_ERROR: {
        code: "UNKNOWN_ERROR",
        title: "Error inesperado",
        retryable: false,
        buildMessage: () => "Ocurrió un error inesperado.",
        hint: "Reintentá la operación. Si persiste, revisá los logs del servidor (stderr) para más detalle.",
        boom: (m) => Boom.internal(m),
    },
};

/**
 * Construye el error Boom de una situación del catálogo.
 * Es el único punto donde se instancia la librería.
 */
export function buildBoom(key: ErrorCatalogKey, message: string): Boom.Boom {
    return ERROR_CATALOG[key].boom(message);
}

/**
 * Código HTTP canónico de una situación.
 * Se lo pedimos a Boom en vez de hardcodearlo: la librería garantiza que
 * cada factory semántica y su status estén siempre sincronizados.
 */
export function httpStatusFor(key: ErrorCatalogKey): number {
    return buildBoom(key, "status probe").output.statusCode;
}

/** Mensaje del catálogo, ya resuelto con el contexto disponible. */
export function messageFor(key: ErrorCatalogKey, ctx?: ErrorContext): string {
    return ERROR_CATALOG[key].buildMessage(ctx);
}
