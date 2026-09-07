// src/errors/map-github-error.ts
import { RequestError } from "@octokit/request-error";
import { AppError, errorFromCatalog } from "./app-errors.js";
import type { ErrorCatalogKey, ErrorContext } from "./error-catalog.js";

/** Códigos de error de red de Node que consideramos fallos transitorios. */
const TRANSIENT_NETWORK_CODES = new Set([
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "ECONNREFUSED",
    "EAI_AGAIN",
]);

/**
 * Decide QUÉ situación del catálogo corresponde a una respuesta HTTP de GitHub.
 * Esta función solo clasifica: el mensaje, el status y el retryable los pone
 * el catálogo. Así, agregar un caso nuevo es agregar una línea acá y una
 * entrada allá, sin tocar nada más.
 */
function classifyHttpStatus(err: RequestError): ErrorCatalogKey {
    const status = err.status;

    switch (status) {
        case 401:
            return "AUTH_ERROR";
        case 403: {
            // Un 403 de GitHub puede ser rate limit o falta de permisos.
            // El header x-ratelimit-remaining es lo que los distingue.
            const remaining = err.response?.headers?.["x-ratelimit-remaining"];
            return remaining === "0" ? "RATE_LIMIT" : "FORBIDDEN";
        }
        case 404:
            return "NOT_FOUND";
        case 409:
            return "CONFLICT";
        case 422:
            return "UNPROCESSABLE";
        case 429:
            return "RATE_LIMIT";
        default:
            return status >= 500 ? "GITHUB_SERVER_ERROR" : "GITHUB_UNEXPECTED";
    }
}

/**
 * Traduce cualquier error crudo (Octokit, red, desconocido) al error de dominio
 * correspondiente, con su código HTTP, su mensaje al usuario y su sugerencia.
 */
export function mapGitHubError(err: unknown, context?: ErrorContext): AppError {
    // Ya es un error nuestro: lo dejamos pasar tal cual.
    if (err instanceof AppError) {
        return err;
    }

    // Errores de red (antes de recibir una respuesta HTTP).
    if (err instanceof Error && "code" in err) {
        const netCode = (err as { code?: string }).code;
        if (netCode && TRANSIENT_NETWORK_CODES.has(netCode)) {
            return errorFromCatalog("NETWORK_ERROR", context, { networkCode: netCode });
        }
    }

    // Errores con respuesta HTTP de GitHub (Octokit).
    if (err instanceof RequestError) {
        const key = classifyHttpStatus(err);
        return errorFromCatalog(
            key,
            { ...context, githubStatus: err.status },
            {
                // Guardamos el status real de GitHub aunque el catálogo exponga
                // otro código canónico (ej: rate limit llega como 403 y se
                // normaliza a 429).
                githubStatus: err.status,
                errors: (err.response?.data as { errors?: unknown })?.errors,
            }
        );
    }

    // Cualquier otra cosa.
    return errorFromCatalog("UNKNOWN_ERROR", context, {
        original: err instanceof Error ? err.message : String(err),
    });
}
