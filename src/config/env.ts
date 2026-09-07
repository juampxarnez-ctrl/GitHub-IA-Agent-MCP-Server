import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Carga de variables de entorno desde un archivo .env.
 *
 * El punto delicado acá es DÓNDE se busca ese archivo. La versión anterior lo
 * buscaba en `process.cwd()`, que es el directorio desde el que se lanzó el
 * proceso, no donde vive el código. Eso funciona cuando uno corre `npm run dev`
 * parado en la raíz del proyecto, pero falla cuando el servidor lo lanza un
 * host MCP (Antigravity, Claude Desktop, un cron): esos procesos arrancan con
 * su propio cwd y el .env queda invisible.
 *
 * Ahora la ruta se calcula a partir de la ubicación de este módulo, así que el
 * .env se encuentra sin importar quién lance el proceso ni desde dónde.
 */

/**
 * Dado el directorio donde vive este módulo, devuelve la ruta del .env.
 *
 * Compilado queda en `dist/config/env.js` y en desarrollo se ejecuta desde
 * `src/config/env.ts`: en los dos casos subir dos niveles llega a la raíz del
 * proyecto, que es donde vive el .env.
 *
 * Se exporta por separado, y recibe el directorio como parámetro en vez de
 * leerlo de `import.meta`, para poder testearla como función pura: sin ejecutar
 * la carga real ni tocar el cwd del proceso de tests.
 */
export function resolveEnvPathFrom(moduleDir: string): string {
    return resolve(moduleDir, "..", "..", ".env");
}

/**
 * Parsea el contenido de un .env a pares clave/valor.
 * Ignora líneas vacías y comentarios, y saca las comillas envolventes.
 */
export function parseEnvContent(content: string): Record<string, string> {
    const vars: Record<string, string> = {};

    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;

        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        vars[key] = value;
    }

    return vars;
}

/**
 * Carga el .env de la primera ruta que exista y devuelve cuál usó.
 *
 * Las variables ya definidas en el entorno NO se pisan: si el host MCP pasa el
 * token por configuración, ese valor manda sobre el del archivo. Es el
 * comportamiento estándar (el mismo de dotenv) y el esperable: lo que viene de
 * afuera del repo tiene prioridad sobre lo que está en disco.
 */
function cargarEnv(rutas: string[]): string | null {
    for (const ruta of rutas) {
        let content: string;
        try {
            content = readFileSync(ruta, "utf8");
        } catch {
            continue; // este no existe: probamos la siguiente ruta
        }

        for (const [key, value] of Object.entries(parseEnvContent(content))) {
            if (!(key in process.env)) {
                process.env[key] = value;
            }
        }

        return ruta;
    }

    return null;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));

const rutaCargada = cargarEnv([
    // Raíz del proyecto: funciona lance quien lance el proceso.
    resolveEnvPathFrom(moduleDir),
    // Fallback al comportamiento anterior, por si alguien ejecuta el servidor
    // desde otra carpeta con su propio .env al lado.
    resolve(process.cwd(), ".env"),
]);

// Diagnóstico a stderr (nunca a stdout: ahí va el protocolo MCP).
// Sin esta línea, un .env que no se encuentra falla en silencio y el síntoma
// recién aparece en la primera llamada a la API, como un 401 sin explicación.
if (rutaCargada) {
    console.error(`[env] Variables cargadas desde ${rutaCargada}`);
} else {
    console.error(
        "[env] No se encontró ningún archivo .env. " +
        "Se usarán solo las variables de entorno del proceso."
    );
}

export const env = {
    githubToken: process.env.GITHUB_TOKEN,
};
