import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { resolveEnvPathFrom, parseEnvContent } from "../src/config/env.js";

describe("resolveEnvPathFrom", () => {
    // El bug que arregla: el .env se buscaba en process.cwd(), o sea donde se
    // paró quien lanzó el proceso. Cuando el servidor lo lanza un host MCP, ese
    // cwd no es la carpeta del proyecto y el .env queda invisible.
    it("resuelve la raíz del proyecto desde el build compilado", () => {
        const ruta = resolveEnvPathFrom("/proyecto/dist/config");
        expect(ruta).toBe(resolve("/proyecto/.env"));
    });

    it("resuelve la misma raíz corriendo desde el código fuente con tsx", () => {
        const ruta = resolveEnvPathFrom("/proyecto/src/config");
        expect(ruta).toBe(resolve("/proyecto/.env"));
    });

    it("no depende del cwd: misma entrada, misma salida siempre", () => {
        // La función no recibe ni lee el cwd, así que no hay forma de que el
        // resultado cambie según desde dónde se ejecute el proceso.
        const primera = resolveEnvPathFrom("/otro/lugar/dist/config");
        const segunda = resolveEnvPathFrom("/otro/lugar/dist/config");

        expect(primera).toBe(segunda);
        expect(primera).toBe(resolve("/otro/lugar/.env"));
    });
});

describe("parseEnvContent", () => {
    it("parsea pares clave=valor", () => {
        expect(parseEnvContent("GITHUB_TOKEN=ghp_abc123")).toEqual({
            GITHUB_TOKEN: "ghp_abc123",
        });
    });

    it("ignora comentarios y líneas vacías", () => {
        const content = `
# esto es un comentario
GITHUB_TOKEN=ghp_abc123

LOG_LEVEL=debug
`;
        expect(parseEnvContent(content)).toEqual({
            GITHUB_TOKEN: "ghp_abc123",
            LOG_LEVEL: "debug",
        });
    });

    it("saca las comillas envolventes, simples o dobles", () => {
        expect(parseEnvContent('A="con dobles"\nB=\'con simples\'')).toEqual({
            A: "con dobles",
            B: "con simples",
        });
    });

    it("no rompe el valor si contiene un signo igual", () => {
        // Solo el primer '=' separa la clave del valor: un token en base64
        // puede terminar en '=' y no debe cortarse.
        expect(parseEnvContent("TOKEN=abc=def==")).toEqual({ TOKEN: "abc=def==" });
    });

    it("ignora líneas sin signo igual", () => {
        expect(parseEnvContent("esto no es una variable\nA=1")).toEqual({ A: "1" });
    });
});
