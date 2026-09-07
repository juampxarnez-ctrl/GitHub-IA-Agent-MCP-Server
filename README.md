# GitHub IA Agent — MCP Server

Un **MCP Server** (Model Context Protocol) en Node.js + TypeScript que expone herramientas (*tools*) para automatizar operaciones comunes en GitHub. Diseñado para conectarse a un host como **Antigravity**, permite que un agente de IA (Gemini, Claude u otro LLM) ejecute acciones reales en GitHub a partir de comandos en lenguaje natural.

---

## ¿Qué hace?

Este servidor traduce pedidos en lenguaje natural del usuario en llamadas verificables a la API de GitHub. En lugar de entrar a la web de GitHub y hacer las cosas a mano, el usuario le pide al agente algo como *"creá un repo llamado mi-proyecto"* y el agente ejecuta la acción real, devolviendo evidencia (URLs, números de issue, SHAs de commit).

### Casos de uso

- Automatizar la creación de repositorios de trabajo para nuevos proyectos.
- Abrir issues para registrar tareas o reportar bugs sin salir del IDE.
- Consultar el estado de repositorios e issues (backlog).
- Agregar o modificar archivos y commitearlos de forma programática.
- Revisar el historial de commits de un repositorio sin salir del IDE.
- Deshacer cambios volviendo el contenido de una rama a un commit anterior, sin reescribir la historia.
- Integrar la gestión de GitHub dentro de un flujo asistido por IA.

---

## Requisitos del sistema

- **Node.js 18+**
- **npm**
- Una cuenta de GitHub con un **Personal Access Token (classic)**
- Opcional: **Antigravity** (u otro host MCP) para el uso con lenguaje natural

---

## Instalación paso a paso

```bash
# 1. Clonar el repositorio
git clone https://github.com/juampxarnez-ctrl/github-ia-agent-m5.git
cd github-ia-agent-m5

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno (ver sección siguiente)
cp .env.example .env
# Editar .env y pegar tu GITHUB_TOKEN

# 4. Compilar TypeScript a JavaScript
npm run build
```

---

## Configuración

### 1. Obtener un GitHub Personal Access Token

1. Ir a GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**.
2. Hacer clic en **"Generate new token (classic)"**.
3. Darle un nombre descriptivo, por ejemplo `mcp-github-agent`.
4. Seleccionar una fecha de expiración.
5. Marcar los scopes necesarios (ver siguiente punto).
6. Generar y **copiar el token inmediatamente** (GitHub no lo vuelve a mostrar).

### 2. Scopes necesarios

El token debe tener los siguientes scopes:

- **`repo`** — control total de repositorios (necesario para crear repos, issues y commits).
- **`user`** — acceso a datos del usuario autenticado.
- **`admin:org`** — para operar sobre organizaciones.

> Se aplica el **principio de mínimo privilegio**: se otorgan solo los permisos que las tools necesitan, para reducir el riesgo en caso de que el token se filtre.

### 3. Configurar el archivo `.env`

Crear un archivo `.env` en la raíz del proyecto (basado en `.env.example`):

```
GITHUB_TOKEN=ghp_tuTokenAqui
```

> **Importante:** el archivo `.env` está en `.gitignore` y nunca debe subirse al repositorio. Un token filtrado debe considerarse comprometido y regenerarse.

### 4. Configurar el MCP Server en Antigravity

1. Abrir Antigravity → **MCP Servers** → **Manage** → **View raw config**.
2. Confirmar cuál es el archivo de configuración efectivo (normalmente `mcp_config.json`).
3. Agregar el siguiente bloque:

```json
{
  "mcpServers": {
    "github-ia-agent": {
      "command": "node",
      "args": ["/ruta/absoluta/a/github-ia-agent-m5/dist/index.js"]
    }
  }
}
```

4. Guardar y verificar que el servidor aparezca listado en el panel de MCP Servers.

> Reemplazar `/ruta/absoluta/...` por la ruta real del proyecto en tu máquina. Para desarrollo, se puede usar `"command": "npx"` con `"args": ["tsx", "/ruta/a/src/index.ts"]`.

**No hace falta declarar el token en el config.** El servidor localiza el `.env` a partir de la ubicación de su propio módulo, no del directorio desde el que se lo lanzó, así que lo encuentra igual aunque el host arranque el proceso con otro `cwd`. El token queda en un solo archivo, el que ya está en `.gitignore`.

Si aun así se quiere pasar por configuración (por ejemplo, para usar un token distinto al del `.env`), se puede agregar un bloque `env` con el valor literal. Ese valor tiene prioridad sobre el archivo:

```json
"env": { "GITHUB_TOKEN": "ghp_tuTokenAqui" }
```

> **Cuidado con las plantillas de variables.** Escribir `"GITHUB_TOKEN": "${GITHUB_TOKEN}"` solo funciona si el host expande esa sintaxis. Si no la expande, al servidor le llega el texto literal `${GITHUB_TOKEN}` como token: arranca sin errores y todas las llamadas fallan con 401, mientras el `.env` correcto queda ignorado por tener prioridad más baja. Al iniciar, el servidor loguea a stderr desde qué archivo cargó las variables, lo que permite detectar este caso de inmediato.

---

## Documentación de las tools

El servidor expone **7 tools** para operar sobre GitHub, más `ping` y `health_check` para diagnóstico.

### `create_repository`

Crea un nuevo repositorio en la cuenta autenticada.

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `name` | string | Sí | Nombre del repo (3-100 caracteres; letras, números, `-`, `_`, `.`) |
| `description` | string | No | Descripción breve |
| `private` | boolean | No | Si el repo es privado (default: `false`) |

**Prompt de ejemplo:** *"Creá un repositorio llamado mi-nuevo-proyecto con la descripción 'proyecto de prueba'."*

---

### `list_repositories`

Lista los repositorios de la cuenta autenticada.

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `visibility` | enum (`all`, `public`, `private`) | No | Filtrar por visibilidad (default: `all`) |
| `sort` | enum (`created`, `updated`, `pushed`, `full_name`) | No | Criterio de orden (default: `updated`) |
| `per_page` | number | No | Cantidad a traer, máx 100 (default: 30) |

**Prompt de ejemplo:** *"Listame mis repositorios públicos ordenados por fecha de actualización."*

---

### `create_issue`

Crea un nuevo issue en un repositorio.

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `owner` | string | Sí | Dueño del repositorio |
| `repo` | string | Sí | Nombre del repositorio |
| `title` | string | Sí | Título del issue |
| `body` | string | No | Cuerpo/descripción del issue |

**Prompt de ejemplo:** *"Abrí un issue en juampxarnez-ctrl/test-mcp-repo-1 con el título 'Actualizar dependencias' y el cuerpo 'Revisar versiones de producción'."*

---

### `list_issues`

Lista los issues de un repositorio.

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `owner` | string | Sí | Dueño del repositorio |
| `repo` | string | Sí | Nombre del repositorio |
| `state` | enum (`open`, `closed`, `all`) | No | Filtrar por estado (default: `open`) |

**Prompt de ejemplo:** *"Mostrame los issues abiertos de juampxarnez-ctrl/test-mcp-repo-1."*

---

### `create_commit`

Crea un commit agregando o modificando un archivo en un repositorio. Ejecuta el flujo completo de bajo nivel de Git (obtener ref → obtener commit base → crear blob → crear tree → crear commit → actualizar ref).

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `owner` | string | Sí | Dueño del repositorio |
| `repo` | string | Sí | Nombre del repositorio |
| `branch` | string | No | Rama destino (default: `main`) |
| `path` | string | Sí | Ruta del archivo dentro del repo |
| `content` | string | Sí | Contenido del archivo en texto plano |
| `message` | string | Sí | Mensaje del commit |

**Prompt de ejemplo:** *"Agregá el archivo docs/notas.md con el contenido '# Notas' al repo juampxarnez-ctrl/test-mcp-repo-1 y commiteá con el mensaje 'Agregar notas'."*

> **Nota:** el repositorio destino debe estar inicializado (tener al menos un commit). Un repo vacío devuelve un error 409.

---

### `list_commits`

Consulta el historial de commits de un repositorio, del más nuevo al más viejo. Devuelve SHA, mensaje, autor, fecha y URL de cada commit.

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `owner` | string | Sí | Dueño del repositorio |
| `repo` | string | Sí | Nombre del repositorio |
| `branch` | string | No | Rama a consultar (default: la rama por defecto del repo) |
| `per_page` | number | No | Cantidad de commits, entre 1 y 100 (default: 10) |

**Prompt de ejemplo:** *"Mostrame los últimos 5 commits de juampxarnez-ctrl/github-ia-agent-m5."*

---

### `revert_to_commit`

Vuelve el contenido de una rama al estado de un commit anterior.

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `owner` | string | Sí | Dueño del repositorio |
| `repo` | string | Sí | Nombre del repositorio |
| `branch` | string | No | Rama a revertir (default: `main`) |
| `sha` | string | Sí | SHA del commit destino (7 a 40 caracteres hexadecimales) |
| `message` | string | No | Mensaje del commit de revert |

**Prompt de ejemplo:** *"Volvé el repo juampxarnez-ctrl/test-mcp-repo-1 al estado del commit a1b2c3d."*

#### Cómo funciona (y por qué así)

La tool **no reescribe la historia**. En vez de mover la rama hacia atrás con un `force push` —que dejaría commits huérfanos y rompería el repo de cualquiera que ya lo hubiera clonado— crea un **commit nuevo** cuyo árbol de archivos es el del commit destino y cuyo padre es el HEAD actual:

```
antes:    A ── B ── C ── D (HEAD)
después:  A ── B ── C ── D ── E (HEAD)
                              └── árbol de archivos idéntico al de B
```

Consecuencias de esta decisión:

- El contenido del repo vuelve exactamente al estado anterior.
- **Nada se pierde:** los commits C y D siguen en el historial y se pueden inspeccionar.
- **La operación es reversible:** para deshacer el revert, se revierte al SHA que la tool devuelve como `previousHeadSha`.
- Es seguro sobre una rama compartida: es un avance normal del historial, no una reescritura.

Si la rama ya está en el commit pedido, la tool no crea ningún commit vacío: informa que no hacía falta hacer nada.

> **Flujo típico:** primero `list_commits` para obtener el SHA al que se quiere volver, después `revert_to_commit` con ese SHA.

---

## Manejo de errores

Todos los errores del servidor pasan por un **catálogo centralizado** (`src/errors/error-catalog.ts`) construido sobre **[@hapi/boom](https://hapi.dev/module/boom/)**. El catálogo es el único lugar donde se define, para cada situación de fallo:

- el **código HTTP** correspondiente,
- si la operación es **reintentable**,
- el **mensaje** que ve el usuario,
- la **sugerencia accionable** para resolverlo.

El código HTTP no se escribe a mano en ningún lado: lo aporta Boom a través de sus factories semánticas (`Boom.notFound()` → 404, `Boom.tooManyRequests()` → 429), de modo que la situación y su status no pueden desincronizarse.

### Catálogo de situaciones

| Situación | HTTP | Código de dominio | ¿Reintentable? | Cuándo aparece |
|-----------|------|-------------------|----------------|----------------|
| `VALIDATION_ERROR` | 400 | `VALIDATION_ERROR` | No | El input no pasó el schema de Zod |
| `AUTH_ERROR` | 401 | `AUTH_ERROR` | No | Token ausente, inválido o vencido |
| `FORBIDDEN` | 403 | `GITHUB_API_ERROR` | No | Al token le faltan scopes |
| `NOT_FOUND` | 404 | `GITHUB_API_ERROR` | No | Owner, repo o commit inexistente |
| `CONFLICT` | 409 | `GITHUB_API_ERROR` | No | Repo vacío o la rama cambió durante la operación |
| `UNPROCESSABLE` | 422 | `GITHUB_API_ERROR` | No | GitHub rechazó los datos: nombre en uso, o rama o commit inexistente |
| `RATE_LIMIT` | 429 | `GITHUB_API_ERROR` | **Sí** | Se agotó el límite de peticiones |
| `NETWORK_ERROR` | 503 | `NETWORK_ERROR` | **Sí** | No se pudo conectar (ECONNRESET, ETIMEDOUT...) |
| `GITHUB_SERVER_ERROR` | 502 | `GITHUB_API_ERROR` | **Sí** | GitHub respondió 5xx |
| `GITHUB_UNEXPECTED` | 502 | `GITHUB_API_ERROR` | No | Status HTTP no contemplado |
| `UNKNOWN_ERROR` | 500 | `UNKNOWN_ERROR` | No | Cualquier otra cosa |

> **Nota sobre el rate limit:** GitHub lo devuelve como `403`, pero el código HTTP correcto para "demasiadas peticiones" es `429`. El catálogo normaliza esa diferencia y conserva el status original de GitHub en `details.githubStatus` para no perder información de diagnóstico.

### Qué ve el usuario

Todas las tools responden los errores con el mismo formato:

```
Recurso no encontrado [GITHUB_API_ERROR · HTTP 404]
El recurso "juampxarnez-ctrl/repo-inexistente" no fue encontrado.
Sugerencia: Verificá que el owner y el nombre del repositorio estén bien escritos y que el token tenga acceso si es privado.
```

Cuando falla la validación, además se listan los campos concretos que hay que corregir:

```
Datos inválidos [VALIDATION_ERROR · HTTP 400]
Los datos para volver a un commit anterior no son válidos.
Campos con problemas:
  - sha: El SHA debe ser hexadecimal y tener entre 7 y 40 caracteres
Sugerencia: Revisá los parámetros marcados y volvé a intentar con valores correctos.
```

Y cuando el error es transitorio, se le avisa explícitamente que puede reintentar. En paralelo, el error completo (con `details` y el status real de GitHub) se loguea de forma estructurada a **stderr** —nunca a stdout, que está reservado para el protocolo JSON-RPC—.

> **Detalle de implementación:** `withRetry` recibe el contexto del recurso (`{ owner, repo, resource }`) y se lo pasa al traductor de errores. Es necesario ahí y no solo en el handler: `withRetry` tiene que traducir el error para saber si es reintentable, y una vez traducido a `AppError` el handler ya no puede enriquecerlo. Sin eso, todo error que pasa por el retry pierde el nombre del recurso y el usuario recibe un "no fue encontrado" que no dice qué.

### Por qué una librería y no constantes propias

`@hapi/boom` está pensada exactamente para esto: mantener el catálogo de errores HTTP y su representación. Aporta el status correcto por construcción, un `output.payload` estándar (`{ statusCode, error, message }`) y un objeto `data` para metadatos propios. Además, `AppError.toBoom()` deja el proyecto listo para exponer el mismo dominio por HTTP (Express, Fastify) sin reescribir el manejo de errores: la respuesta ya viene armada.

Toda la dependencia de Boom vive en un solo archivo (`error-catalog.ts`): cambiar de librería implica tocar ese módulo y ninguno más.

---

## Diagrama de arquitectura

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Antigravity │────▶│  LLM Client  │────▶│   MCP Server     │────▶│  GitHub API  │
│    (Host)    │     │ (Gemini/etc) │     │ (github-ia-agent)│     │   (Octokit)  │
└──────────────┘     └──────────────┘     └──────────────────┘     └──────────────┘
      │                     │                      │                       │
  El usuario          Decide qué tool         Valida inputs (Zod),    Ejecuta la
  escribe en          llamar y con qué        ejecuta la operación    acción real y
  lenguaje natural    parámetros              y traduce errores       devuelve datos
```

La comunicación entre el Host y el MCP Server se realiza vía **stdio** usando el protocolo **JSON-RPC 2.0**.

### Estructura del proyecto

```
src/
├── index.ts                 # Entry point: registra las tools y conecta el transport stdio
├── types.ts                 # Tipos e interfaces compartidos (DTOs)
├── config/
│   └── env.ts               # Carga de variables de entorno
├── errors/
│   ├── error-catalog.ts     # Catálogo central: situación → HTTP + mensaje + sugerencia (@hapi/boom)
│   ├── app-errors.ts        # Jerarquía de errores custom, alimentada por el catálogo
│   └── map-github-error.ts  # Clasifica el error crudo y lo traduce a una situación del catálogo
├── github/
│   ├── client.ts            # Configuración de Octokit
│   └── operations.ts        # Funciones que llaman a la API de GitHub
├── schemas/                 # Schemas de Zod (uno por tool)
├── handlers/                # Handlers que orquestan validación + operación + errores
└── utils/
    ├── logger.ts            # Log estructurado a stderr
    ├── retry.ts             # Reintentos con backoff exponencial para errores transitorios
    └── tool-error-response.ts  # Respuesta de error uniforme para todas las tools
```

---

## Cómo ejecutar los tests

El proyecto usa **Vitest** con Octokit mockeado (los tests nunca tocan la red ni la API real).

```bash
npm test          # Ejecuta todos los tests una vez
npm run test:watch  # Modo watch (re-ejecuta al cambiar archivos)
```

Los tests cubren:

- **Validación de schemas:** inputs válidos pasan, inválidos fallan (incluido el formato del SHA en `revert_to_commit`).
- **Transformación de errores:** cada código HTTP (401, 403, 404, 409, 422, 429, 5xx, red) se traduce al error tipado correcto con mensaje en lenguaje natural.
- **Integridad del catálogo:** ninguna situación puede quedar sin mensaje, sin sugerencia o con un status HTTP inválido.
- **Operations con Octokit mockeado:** se verifica que las funciones llaman a la API con los argumentos correctos y mapean la respuesta al DTO esperado.
- **Revert seguro:** se verifica que el commit de revert use el árbol del commit destino con el HEAD actual como padre, que `updateRef` nunca se llame con `force`, y que no se cree un commit vacío si la rama ya está en el commit pedido.

---

## Scripts disponibles

| Script | Descripción |
|--------|-------------|
| `npm run build` | Compila TypeScript a JavaScript (`dist/`) |
| `npm run dev` | Ejecuta el servidor en modo desarrollo (con `tsx`) |
| `npm start` | Ejecuta el servidor compilado (`dist/index.js`) |
| `npm test` | Ejecuta los tests con Vitest |

---

## Troubleshooting

| Error | Causa probable | Solución |
|-------|----------------|----------|
| **AUTH_ERROR** / "token inválido" | `GITHUB_TOKEN` ausente, expirado o mal configurado | Verificar el token en `.env` y sus scopes |
| **401 desde el host MCP, pero funciona por terminal** | El host pasa el token por `env` sin expandir la plantilla, y ese valor tiene prioridad sobre el `.env` | Sacar el bloque `env` del config del host, o poner el token literal |
| **Al iniciar: "No se encontró ningún archivo .env"** | Falta el archivo en la raíz del proyecto | Crearlo a partir de `.env.example` |
| **"No tenés permisos suficientes"** (403) | El token no tiene el scope `repo` | Regenerar el token con los scopes correctos |
| **"El recurso no fue encontrado"** (404) | Owner/repo mal escrito o inexistente | Verificar el nombre del repositorio |
| **Error 409 en create_commit** | El repositorio está vacío (sin commits) | Inicializar el repo con un README antes de commitear |
| **"Rate limit alcanzado"** (429) | Se superó el límite de peticiones de GitHub | Esperar unos minutos y reintentar (el servidor ya reintenta solo con backoff) |
| **404 en `revert_to_commit`** | El SHA no existe en ese repositorio | Obtener el SHA correcto con `list_commits` |
| **"El SHA debe ser hexadecimal"** | Se pasó un texto que no es un SHA de Git | Usar el SHA que devuelve `list_commits` (7 a 40 caracteres) |
| **422 en `revert_to_commit`** | La rama indicada no existe | Verificar el nombre de la rama (default: `main`) |
| El servidor no aparece en Antigravity | Ruta incorrecta en `mcp_config.json` o build no generado | Verificar la ruta absoluta y correr `npm run build` |

---

## Licencia

Este proyecto está licenciado bajo la **Licencia MIT**. Ver el archivo [LICENSE](./LICENSE) para más detalles.
