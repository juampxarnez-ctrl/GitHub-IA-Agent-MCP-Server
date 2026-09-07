import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { toAppError } from "../errors/app-errors.js";
import { logger } from "./logger.js";

/**
 * Convierte cualquier error en la respuesta de error de una tool MCP.
 *
 * Antes cada tool repetía el mismo bloque catch con su propio string ("Error: ...").
 * Centralizarlo acá garantiza que las 8 tools respondan con el mismo formato:
 * título, código de dominio, código HTTP, causa y sugerencia accionable.
 * Además deja el log estructurado en un solo lugar.
 */
export function toolErrorResponse(err: unknown, tool: string): CallToolResult {
    const appError = toAppError(err);

    // Siempre a stderr: stdout está reservado para el protocolo MCP (JSON-RPC).
    logger.error(`Tool "${tool}" falló`, { tool, ...appError.toPayload() });

    return {
        content: [{ type: "text", text: appError.toUserMessage() }],
        isError: true,
    };
}
