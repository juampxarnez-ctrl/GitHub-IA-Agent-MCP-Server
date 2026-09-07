import { describe, it, expect, vi } from "vitest";
import { RequestError } from "@octokit/request-error";
import {
    ERROR_CATALOG,
    httpStatusFor,
    type ErrorCatalogKey,
} from "../src/errors/error-catalog.js";
import { mapGitHubError } from "../src/errors/map-github-error.js";
import { withRetry } from "../src/utils/retry.js";
import {
    errorFromCatalog,
    toAppError,
    AppError,
    ValidationError,
} from "../src/errors/app-errors.js";

function fakeRequestError(status: number, headers: Record<string, string> = {}) {
    return new RequestError("Simulated", status, {
        request: { method: "GET", url: "https://api.github.com/test", headers: {} },
        response: { status, url: "https://api.github.com/test", headers, data: {} },
    } as any);
}

describe("catálogo de errores: integridad", () => {
    const keys = Object.keys(ERROR_CATALOG) as ErrorCatalogKey[];

    it("toda entrada tiene mensaje y sugerencia no vacíos", () => {
        for (const key of keys) {
            const entry = ERROR_CATALOG[key];
            expect(entry.buildMessage(), `mensaje de ${key}`).not.toBe("");
            expect(entry.hint, `sugerencia de ${key}`).not.toBe("");
        }
    });

    it("toda entrada resuelve a un código HTTP válido provisto por Boom", () => {
        for (const key of keys) {
            const status = httpStatusFor(key);
            expect(status, `status de ${key}`).toBeGreaterThanOrEqual(400);
            expect(status, `status de ${key}`).toBeLessThan(600);
        }
    });

    it("asocia cada situación con el código HTTP semánticamente correcto", () => {
        expect(httpStatusFor("VALIDATION_ERROR")).toBe(400);
        expect(httpStatusFor("AUTH_ERROR")).toBe(401);
        expect(httpStatusFor("FORBIDDEN")).toBe(403);
        expect(httpStatusFor("NOT_FOUND")).toBe(404);
        expect(httpStatusFor("CONFLICT")).toBe(409);
        expect(httpStatusFor("UNPROCESSABLE")).toBe(422);
        expect(httpStatusFor("RATE_LIMIT")).toBe(429);
        expect(httpStatusFor("NETWORK_ERROR")).toBe(503);
    });
});

describe("AppError: salidas derivadas del catálogo", () => {
    it("toBoom() devuelve un error Boom con el statusCode y el payload correctos", () => {
        const err = errorFromCatalog("NOT_FOUND", { owner: "juampi", repo: "no-existe" });
        const boom = err.toBoom();

        expect(boom.isBoom).toBe(true);
        expect(boom.output.statusCode).toBe(404);
        expect(boom.output.payload.error).toBe("Not Found");
        expect(boom.output.payload.message).toContain("juampi/no-existe");
        expect((boom.data as any).retryable).toBe(false);
    });

    it("toUserMessage() incluye código de dominio, HTTP y sugerencia accionable", () => {
        const err = errorFromCatalog("AUTH_ERROR");
        const text = err.toUserMessage();

        expect(text).toContain("AUTH_ERROR");
        expect(text).toContain("HTTP 401");
        expect(text).toContain("Sugerencia:");
        expect(text).toContain("GITHUB_TOKEN");
    });

    it("avisa explícitamente cuando la operación se puede reintentar", () => {
        expect(errorFromCatalog("RATE_LIMIT").toUserMessage()).toContain("se puede reintentar");
        expect(errorFromCatalog("NOT_FOUND").toUserMessage()).not.toContain("se puede reintentar");
    });

    it("toUserMessage() enumera los campos que fallaron la validación", () => {
        const err = new ValidationError("Los datos no son válidos.", {
            issues: [{ path: ["sha"], message: "El SHA debe ser hexadecimal" }],
        });
        const text = err.toUserMessage();

        expect(text).toContain("Campos con problemas:");
        expect(text).toContain("sha: El SHA debe ser hexadecimal");
    });

    it("toPayload() expone la forma estructurada del error", () => {
        const payload = errorFromCatalog("RATE_LIMIT").toPayload();

        expect(payload).toMatchObject({
            code: "GITHUB_API_ERROR",
            catalogKey: "RATE_LIMIT",
            httpStatus: 429,
            retryable: true,
        });
        expect(payload.hint).not.toBe("");
    });

    it("toAppError() normaliza cualquier valor lanzado sin perder el original", () => {
        const result = toAppError(new Error("algo raro"));
        expect(result).toBeInstanceOf(AppError);
        expect(result.code).toBe("UNKNOWN_ERROR");
        expect(result.details).toMatchObject({ original: "algo raro" });
    });
});

describe("mapGitHubError: situaciones nuevas cubiertas por el catálogo", () => {
    it("normaliza el rate limit (que GitHub manda como 403) al HTTP 429 correcto", () => {
        const result = mapGitHubError(fakeRequestError(403, { "x-ratelimit-remaining": "0" }));

        expect(result.catalogKey).toBe("RATE_LIMIT");
        expect(result.status).toBe(429);
        expect(result.retryable).toBe(true);
        // Guardamos el status real de GitHub para no perder información de diagnóstico.
        expect(result.details).toMatchObject({ githubStatus: 403 });
    });

    it("traduce un 409 (repo vacío) a CONFLICT con sugerencia útil", () => {
        const result = mapGitHubError(fakeRequestError(409));

        expect(result.catalogKey).toBe("CONFLICT");
        expect(result.status).toBe(409);
        expect(result.hint).toMatch(/README|rama/i);
    });

    it("traduce un 422 a UNPROCESSABLE (no retryable)", () => {
        const result = mapGitHubError(fakeRequestError(422));

        expect(result.catalogKey).toBe("UNPROCESSABLE");
        expect(result.status).toBe(422);
        expect(result.retryable).toBe(false);
    });

    it("marca los 5xx de GitHub como retryable", () => {
        const result = mapGitHubError(fakeRequestError(502));

        expect(result.catalogKey).toBe("GITHUB_SERVER_ERROR");
        expect(result.retryable).toBe(true);
    });

    it("no vuelve a envolver un error que ya es del dominio", () => {
        const original = errorFromCatalog("NOT_FOUND", { resource: "x" });
        expect(mapGitHubError(original)).toBe(original);
    });

    it("el mensaje del 422 no afirma una sola causa: nombra las tres posibles", () => {
        const result = mapGitHubError(fakeRequestError(422), {
            owner: "juampi",
            repo: "test",
        });

        expect(result.message).toContain("juampi/test");
        expect(result.message).toMatch(/nombre/i);
        expect(result.message).toMatch(/rama/i);
        expect(result.message).toMatch(/commit/i);
    });
});

describe("withRetry conserva el contexto del error", () => {
    // Este es el bug que hacía que los 404 dijeran "El recurso solicitado no fue
    // encontrado" sin nombrarlo: withRetry traducía el error sin contexto y el
    // handler ya no podía enriquecerlo, porque mapGitHubError devuelve tal cual
    // lo que ya es un AppError.
    it("nombra el recurso cuando el error pasa por withRetry", async () => {
        const fn = vi.fn().mockRejectedValue(fakeRequestError(404));

        await expect(
            withRetry(fn, { context: { owner: "juampi", repo: "no-existe" } })
        ).rejects.toMatchObject({
            message: expect.stringContaining("juampi/no-existe"),
        });
    });

    it("sin contexto sigue funcionando, solo que con el mensaje genérico", async () => {
        const fn = vi.fn().mockRejectedValue(fakeRequestError(404));

        await expect(withRetry(fn)).rejects.toMatchObject({
            catalogKey: "NOT_FOUND",
        });
    });
});
