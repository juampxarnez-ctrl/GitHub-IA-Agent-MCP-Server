import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listRepositoriesHandler } from "./handlers/list-repositories.handler.js";
import { createRepositoryHandler } from "./handlers/create-repository.handler.js";
import { createCommitHandler } from "./handlers/create-commit.handler.js";
import { listIssuesHandler } from "./handlers/list-issues.handler.js";
import { createIssueHandler } from "./handlers/create-issue.handler.js";
import { listCommitsHandler } from "./handlers/list-commits.handler.js";
import { revertToCommitHandler } from "./handlers/revert-to-commit.handler.js";
import { healthCheckHandler } from "./handlers/health-check.handler.js";
import { toolErrorResponse } from "./utils/tool-error-response.js";

const server = new McpServer({
    name: "github-ia-agent",
    version: "1.0.0",
});

// Tool mínima de health-check para validar que el server responde.
server.registerTool(
    "ping",
    {
        description:
            "Health-check del servidor. Devuelve 'pong' para confirmar que el MCP server está vivo y respondiendo.",
        inputSchema: {
            message: z.string().optional().describe("Mensaje opcional a devolver"),
        },
    },
    async ({ message }) => ({
        content: [
            {
                type: "text",
                text: message ? `pong: ${message}` : "pong",
            },
        ],
    })
);

// Tool: health check — verifica conectividad y autenticación con GitHub.
server.registerTool(
    "health_check",
    {
        description:
            "Verifica que el servidor puede conectarse a GitHub y que el token es válido. Devuelve el usuario autenticado si todo está OK. Usar para diagnosticar problemas de conexión o autenticación.",
        inputSchema: {},
    },
    async () => {
        try {
            const result = await healthCheckHandler();
            return {
                content: [
                    {
                        type: "text",
                        text: `Conexión OK. Autenticado como: ${result.user}`,
                    },
                ],
            };
        } catch (err) {
            return toolErrorResponse(err, "health_check");
        }
    }
);

// Tool: crear un repositorio en la cuenta autenticada.
server.registerTool(
    "create_repository",
    {
        description:
            "Crea un nuevo repositorio en la cuenta autenticada de GitHub. Usar cuando el usuario quiere crear/inicializar un repo nuevo. Requiere un nombre válido (3-100 caracteres, sin espacios).",
        inputSchema: {
            name: z.string().describe("Nombre del repositorio (3-100 caracteres, letras, números, - _ .)"),
            description: z.string().optional().describe("Descripción breve del repositorio"),
            private: z.boolean().optional().describe("Si el repo debe ser privado (default: false)"),
        },
    },
    async (args) => {
        try {
            const repo = await createRepositoryHandler(args);
            return {
                content: [
                    {
                        type: "text",
                        text: `Repositorio creado: ${repo.fullName}\nURL: ${repo.url}`,
                    },
                ],
            };
        } catch (err) {
            return toolErrorResponse(err, "create_repository");
        }
    }
);

// Tool: listar repositorios del usuario autenticado.
server.registerTool(
    "list_repositories",
    {
        description:
            "Lista los repositorios de la cuenta autenticada de GitHub. Usar cuando el usuario quiere ver, listar o descubrir sus repos. Permite filtrar por visibilidad y ordenar.",
        inputSchema: {
            visibility: z.enum(["all", "public", "private"]).optional().describe("Filtrar por visibilidad (default: all)"),
            sort: z.enum(["created", "updated", "pushed", "full_name"]).optional().describe("Criterio de orden (default: updated)"),
            per_page: z.number().int().optional().describe("Cantidad de repos a traer, máx 100 (default: 30)"),
        },
    },
    async (args) => {
        try {
            const repos = await listRepositoriesHandler(args);
            const text = repos.length
                ? repos.map((r) => `- ${r.fullName} (${r.url})`).join("\n")
                : "No se encontraron repositorios.";
            return {
                content: [{ type: "text", text: `Repositorios (${repos.length}):\n${text}` }],
            };
        } catch (err) {
            return toolErrorResponse(err, "list_repositories");
        }
    }
);

// Tool: crear un issue en un repositorio.
server.registerTool(
    "create_issue",
    {
        description:
            "Crea un nuevo issue en un repositorio de GitHub. Usar cuando el usuario quiere abrir un issue, reportar un bug o registrar una tarea. Requiere owner, repo y título.",
        inputSchema: {
            owner: z.string().describe("Dueño del repositorio (usuario u organización)"),
            repo: z.string().describe("Nombre del repositorio"),
            title: z.string().describe("Título del issue"),
            body: z.string().optional().describe("Descripción/cuerpo del issue (opcional)"),
        },
    },
    async (args) => {
        try {
            const issue = await createIssueHandler(args);
            return {
                content: [
                    {
                        type: "text",
                        text: `Issue #${issue.number} creado: ${issue.title}\nURL: ${issue.url}`,
                    },
                ],
            };
        } catch (err) {
            return toolErrorResponse(err, "create_issue");
        }
    }
);

// Tool: listar issues de un repositorio.
server.registerTool(
    "list_issues",
    {
        description:
            "Lista los issues de un repositorio de GitHub. Por defecto muestra los abiertos. Usar cuando el usuario quiere ver el backlog o los issues de un repo. Requiere owner y repo.",
        inputSchema: {
            owner: z.string().describe("Dueño del repositorio"),
            repo: z.string().describe("Nombre del repositorio"),
            state: z.enum(["open", "closed", "all"]).optional().describe("Filtrar por estado (default: open)"),
        },
    },
    async (args) => {
        try {
            const issues = await listIssuesHandler(args);
            const text = issues.length
                ? issues.map((i: any) => `- #${i.number} [${i.state}] ${i.title} (${i.url})`).join("\n")
                : "No se encontraron issues.";
            return {
                content: [{ type: "text", text: `Issues (${issues.length}):\n${text}` }],
            };
        } catch (err) {
            return toolErrorResponse(err, "list_issues");
        }
    }
);

// Tool: crear un commit agregando o modificando un archivo.
server.registerTool(
    "create_commit",
    {
        description:
            "Crea un commit agregando o modificando un archivo en un repositorio de GitHub. Usar cuando el usuario quiere agregar/editar un archivo y commitear el cambio. Requiere owner, repo, path del archivo, contenido y mensaje de commit.",
        inputSchema: {
            owner: z.string().describe("Dueño del repositorio"),
            repo: z.string().describe("Nombre del repositorio"),
            branch: z.string().optional().describe("Rama destino (default: main)"),
            path: z.string().describe("Ruta del archivo dentro del repo, ej: docs/README.md"),
            content: z.string().describe("Contenido del archivo en texto plano"),
            message: z.string().describe("Mensaje del commit"),
        },
    },
    async (args) => {
        try {
            const result = await createCommitHandler(args);
            return {
                content: [
                    {
                        type: "text",
                        text: `Commit creado: ${result.commitSha}\nURL: ${result.commitUrl}`,
                    },
                ],
            };
        } catch (err) {
            return toolErrorResponse(err, "create_commit");
        }
    }
);

// Tool: consultar el historial de commits de un repositorio.
server.registerTool(
    "list_commits",
    {
        description:
            "Consulta el historial de commits de un repositorio de GitHub. Devuelve SHA, mensaje, autor, fecha y URL de cada commit, del más nuevo al más viejo. Usar cuando el usuario quiere ver el historial, saber qué se cambió y cuándo, o necesita el SHA de un commit anterior (por ejemplo, antes de revertir). Requiere owner y repo.",
        inputSchema: {
            owner: z.string().describe("Dueño del repositorio"),
            repo: z.string().describe("Nombre del repositorio"),
            branch: z.string().optional().describe("Rama a consultar (default: la rama por defecto del repo)"),
            per_page: z.number().int().optional().describe("Cantidad de commits a traer, entre 1 y 100 (default: 10)"),
        },
    },
    async (args) => {
        try {
            const commits = await listCommitsHandler(args);
            const text = commits.length
                ? commits
                    .map(
                        (c) =>
                            `- ${c.sha.slice(0, 7)} · ${c.message.split("\n")[0]}\n  ${c.author} · ${c.date}\n  ${c.url}`
                    )
                    .join("\n")
                : "No se encontraron commits.";
            return {
                content: [{ type: "text", text: `Commits (${commits.length}):\n${text}` }],
            };
        } catch (err) {
            return toolErrorResponse(err, "list_commits");
        }
    }
);

// Tool: volver el contenido de una rama al estado de un commit anterior.
server.registerTool(
    "revert_to_commit",
    {
        description:
            "Vuelve el contenido de una rama al estado de un commit anterior. NO borra ni reescribe la historia: crea un commit nuevo con el árbol de archivos del commit indicado, así que la operación es segura y reversible. Usar cuando el usuario quiere deshacer cambios y volver a un estado anterior del repositorio. Requiere owner, repo y el SHA del commit destino (se puede obtener con list_commits).",
        inputSchema: {
            owner: z.string().describe("Dueño del repositorio"),
            repo: z.string().describe("Nombre del repositorio"),
            branch: z.string().optional().describe("Rama a revertir (default: main)"),
            sha: z.string().describe("SHA del commit al que se quiere volver (7 a 40 caracteres hexadecimales)"),
            message: z.string().optional().describe("Mensaje del commit de revert (default: 'Revert: volver al estado del commit <sha>')"),
        },
    },
    async (args) => {
        try {
            const result = await revertToCommitHandler(args);

            if (!result.reverted) {
                return {
                    content: [{ type: "text", text: `${result.message} No hizo falta hacer nada.` }],
                };
            }

            return {
                content: [
                    {
                        type: "text",
                        text:
                            `Rama "${result.branch}" revertida al estado del commit ${result.targetSha.slice(0, 7)}.\n` +
                            `Commit de revert: ${result.newCommitSha}\n` +
                            `URL: ${result.newCommitUrl}\n` +
                            `El historial quedó intacto: para deshacer esto, volvé al commit ${result.previousHeadSha.slice(0, 7)}.`,
                    },
                ],
            };
        } catch (err) {
            return toolErrorResponse(err, "revert_to_commit");
        }
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);

}

main().catch((err) => {
    console.error("[fatal]", err);
    process.exit(1);
});
