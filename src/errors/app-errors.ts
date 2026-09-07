// src/errors/app-errors.ts
import Boom from "@hapi/boom";
import {
    ERROR_CATALOG,
    buildBoom,
    httpStatusFor,
    messageFor,
    type ErrorCatalogKey,
    type ErrorContext,
} from "./error-catalog.js";

export type ErrorCode =
    | "VALIDATION_ERROR"
    | "AUTH_ERROR"
    | "GITHUB_API_ERROR"
    | "NETWORK_ERROR"
    | "UNKNOWN_ERROR";

/** Forma serializable de un error, pensada para mostrarle al usuario o loguear. */
export interface ToolErrorPayload {
    code: ErrorCode;
    catalogKey: ErrorCatalogKey;
    title: string;
    httpStatus: number;
    message: string;
    hint: string;
    retryable: boolean;
    details?: Record<string, unknown>;
}

// Clase base: todos los errores del dominio heredan de esta.
export class AppError extends Error {
    public readonly code: ErrorCode;
    public readonly status?: number;
    public readonly retryable: boolean;
    public readonly details?: Record<string, unknown>;
    /** Situación del catálogo a la que corresponde este error. */
    public readonly catalogKey: ErrorCatalogKey;

    constructor(opts: {
        code: ErrorCode;
        message: string;
        status?: number;
        retryable?: boolean;
        details?: Record<string, unknown>;
        catalogKey?: ErrorCatalogKey;
    }) {
        super(opts.message);
        this.name = "AppError";
        this.code = opts.code;
        this.catalogKey = opts.catalogKey ?? "UNKNOWN_ERROR";
        // El status ya no se escribe a mano: sale del catálogo (vía Boom),
        // salvo que el llamador pase uno explícito.
        this.status = opts.status ?? httpStatusFor(this.catalogKey);
        this.retryable = opts.retryable ?? ERROR_CATALOG[this.catalogKey].retryable;
        this.details = opts.details;
    }

    /** Sugerencia accionable para el usuario, tomada del catálogo. */
    get hint(): string {
        return ERROR_CATALOG[this.catalogKey].hint;
    }

    /** Etiqueta corta y legible de la situación. */
    get title(): string {
        return ERROR_CATALOG[this.catalogKey].title;
    }

    /**
     * Convierte el error a un error Boom.
     * Sirve si mañana este mismo dominio se expone por HTTP (Express/Fastify):
     * `boom.output` ya trae statusCode y payload listos para responder.
     */
    toBoom(): Boom.Boom {
        const boom = buildBoom(this.catalogKey, this.message);
        boom.data = {
            code: this.code,
            retryable: this.retryable,
            hint: this.hint,
            details: this.details,
        };
        return boom;
    }

    /** Forma estructurada del error (para logs o para devolverlo como JSON). */
    toPayload(): ToolErrorPayload {
        return {
            code: this.code,
            catalogKey: this.catalogKey,
            title: this.title,
            httpStatus: this.status ?? httpStatusFor(this.catalogKey),
            message: this.message,
            hint: this.hint,
            retryable: this.retryable,
            details: this.details,
        };
    }

    /**
     * Lista legible de los campos que fallaron la validación de Zod.
     * Sin esto, un "revisá los parámetros" no le dice al usuario cuál corregir.
     */
    private fieldErrors(): string[] {
        const issues = this.details?.issues;
        if (!Array.isArray(issues)) return [];

        return issues.map((issue) => {
            const { path, message } = issue as { path?: unknown[]; message?: string };
            const field = Array.isArray(path) && path.length ? path.join(".") : "(raíz)";
            return `  - ${field}: ${message ?? "valor inválido"}`;
        });
    }

    /** Texto final que ve el usuario. Formato consistente para todas las tools. */
    toUserMessage(): string {
        const lines = [
            `${this.title} [${this.code} · HTTP ${this.status}]`,
            this.message,
        ];

        const fields = this.fieldErrors();
        if (fields.length) {
            lines.push("Campos con problemas:", ...fields);
        }

        lines.push(`Sugerencia: ${this.hint}`);

        if (this.retryable) {
            lines.push("Esta operación se puede reintentar.");
        }
        return lines.join("\n");
    }
}

// Input inválido (falló el schema de Zod). Nunca retryable: el problema es del input.
export class ValidationError extends AppError {
    constructor(message: string, details?: Record<string, unknown>) {
        super({
            code: "VALIDATION_ERROR",
            message,
            retryable: false,
            details,
            catalogKey: "VALIDATION_ERROR",
        });
        this.name = "ValidationError";
    }
}

// Credenciales ausentes o inválidas (token). No se reintenta: hay que arreglar el token.
export class AuthenticationError extends AppError {
    constructor(message = messageFor("AUTH_ERROR")) {
        super({
            code: "AUTH_ERROR",
            message,
            retryable: false,
            catalogKey: "AUTH_ERROR",
        });
        this.name = "AuthenticationError";
    }
}

// Fallo transitorio de red (timeout, ECONNRESET). Sí retryable.
export class NetworkError extends AppError {
    constructor(
        message = messageFor("NETWORK_ERROR"),
        details?: Record<string, unknown>
    ) {
        super({
            code: "NETWORK_ERROR",
            message,
            retryable: true,
            details,
            catalogKey: "NETWORK_ERROR",
        });
        this.name = "NetworkError";
    }
}

// La API de GitHub respondió con un rechazo (404, 403, 422, 5xx...).
// El status y el retryable salen del catálogo según la situación concreta.
export class GitHubAPIError extends AppError {
    constructor(
        message: string,
        opts?: {
            status?: number;
            retryable?: boolean;
            details?: Record<string, unknown>;
            catalogKey?: ErrorCatalogKey;
        }
    ) {
        const catalogKey = opts?.catalogKey ?? "GITHUB_UNEXPECTED";
        super({
            code: "GITHUB_API_ERROR",
            message,
            status: opts?.status,
            retryable: opts?.retryable,
            details: opts?.details,
            catalogKey,
        });
        this.name = "GitHubAPIError";
    }
}

/**
 * Fabrica el error de dominio que corresponde a una situación del catálogo.
 * Es el atajo que usa `mapGitHubError`: una línea por situación, sin repetir
 * mensajes, status ni flags de retry en cada `case`.
 */
export function errorFromCatalog(
    key: ErrorCatalogKey,
    ctx?: ErrorContext,
    details?: Record<string, unknown>
): AppError {
    const entry = ERROR_CATALOG[key];
    const message = entry.buildMessage(ctx);

    switch (entry.code) {
        case "VALIDATION_ERROR":
            return new ValidationError(message, details);
        case "AUTH_ERROR":
            return new AuthenticationError(message);
        case "NETWORK_ERROR":
            return new NetworkError(message, details);
        case "GITHUB_API_ERROR":
            return new GitHubAPIError(message, { details, catalogKey: key });
        default:
            return new AppError({
                code: entry.code,
                message,
                details,
                catalogKey: key,
            });
    }
}

/** Normaliza cualquier valor lanzado a un AppError, sin perder información. */
export function toAppError(err: unknown): AppError {
    if (err instanceof AppError) return err;
    return new AppError({
        code: "UNKNOWN_ERROR",
        message: messageFor("UNKNOWN_ERROR"),
        catalogKey: "UNKNOWN_ERROR",
        details: { original: err instanceof Error ? err.message : String(err) },
    });
}
