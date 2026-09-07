import { describe, it, expect, vi, beforeEach } from "vitest";
import { RequestError } from "@octokit/request-error";

// Mockeamos el cliente de GitHub: los tests no tocan la red ni la API real.
vi.mock("../src/github/client.js", () => ({
    octokit: {
        git: {
            getRef: vi.fn(),
            createCommit: vi.fn(),
            updateRef: vi.fn(),
        },
        repos: {
            getCommit: vi.fn(),
            listCommits: vi.fn(),
        },
    },
}));

import { revertToCommit, getRepositoryCommits } from "../src/github/operations.js";
import { octokit } from "../src/github/client.js";
import { revertToCommitSchema } from "../src/schemas/revert-to-commit-schema.js";
import { listCommitsSchema } from "../src/schemas/list-commits-schema.js";

const HEAD_SHA = "dddddddddddddddddddddddddddddddddddddddd";
const TARGET_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TARGET_TREE = "tttttttttttttttttttttttttttttttttttttttt";
const NEW_SHA = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function mockHead(sha: string) {
    (octokit.git.getRef as any).mockResolvedValue({ data: { object: { sha } } });
}

function mockTargetCommit(sha: string, treeSha: string) {
    (octokit.repos.getCommit as any).mockResolvedValue({
        data: { sha, commit: { tree: { sha: treeSha } } },
    });
}

describe("revertToCommit", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("crea un commit nuevo con el árbol del commit destino y el HEAD actual como padre", async () => {
        mockHead(HEAD_SHA);
        mockTargetCommit(TARGET_SHA, TARGET_TREE);
        (octokit.git.createCommit as any).mockResolvedValue({ data: { sha: NEW_SHA } });
        (octokit.git.updateRef as any).mockResolvedValue({ data: {} });

        const result = await revertToCommit({
            owner: "juampi",
            repo: "test",
            branch: "main",
            sha: TARGET_SHA,
        });

        // El árbol es el del commit viejo, pero el padre es el HEAD actual:
        // eso es lo que hace que la operación NO reescriba la historia.
        expect(octokit.git.createCommit).toHaveBeenCalledWith(
            expect.objectContaining({ tree: TARGET_TREE, parents: [HEAD_SHA] })
        );
        expect(result.reverted).toBe(true);
        expect(result.newCommitSha).toBe(NEW_SHA);
        expect(result.previousHeadSha).toBe(HEAD_SHA);
    });

    it("mueve la rama al commit nuevo SIN force (no borra commits)", async () => {
        mockHead(HEAD_SHA);
        mockTargetCommit(TARGET_SHA, TARGET_TREE);
        (octokit.git.createCommit as any).mockResolvedValue({ data: { sha: NEW_SHA } });
        (octokit.git.updateRef as any).mockResolvedValue({ data: {} });

        await revertToCommit({ owner: "juampi", repo: "test", branch: "main", sha: TARGET_SHA });

        const updateRefArgs = (octokit.git.updateRef as any).mock.calls[0][0];
        expect(updateRefArgs.ref).toBe("heads/main");
        expect(updateRefArgs.sha).toBe(NEW_SHA);
        expect(updateRefArgs.force).toBeUndefined(); // nunca reescribimos la historia
    });

    it("no hace nada si la rama ya está en ese commit", async () => {
        mockHead(TARGET_SHA);
        mockTargetCommit(TARGET_SHA, TARGET_TREE);

        const result = await revertToCommit({
            owner: "juampi",
            repo: "test",
            branch: "main",
            sha: TARGET_SHA,
        });

        expect(result.reverted).toBe(false);
        expect(octokit.git.createCommit).not.toHaveBeenCalled();
        expect(octokit.git.updateRef).not.toHaveBeenCalled();
    });

    it("usa el mensaje de commit personalizado cuando se lo pasan", async () => {
        mockHead(HEAD_SHA);
        mockTargetCommit(TARGET_SHA, TARGET_TREE);
        (octokit.git.createCommit as any).mockResolvedValue({ data: { sha: NEW_SHA } });
        (octokit.git.updateRef as any).mockResolvedValue({ data: {} });

        await revertToCommit({
            owner: "juampi",
            repo: "test",
            branch: "main",
            sha: TARGET_SHA,
            message: "Deshacer el deploy roto",
        });

        expect(octokit.git.createCommit).toHaveBeenCalledWith(
            expect.objectContaining({ message: "Deshacer el deploy roto" })
        );
    });
});

describe("getRepositoryCommits", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("mapea el historial a DTOs con sha, mensaje, autor, fecha y url", async () => {
        (octokit.repos.listCommits as any).mockResolvedValue({
            data: [
                {
                    sha: TARGET_SHA,
                    html_url: "https://github.com/juampi/test/commit/bbbb",
                    commit: {
                        message: "Primer commit",
                        author: { name: "Juampi", date: "2026-01-01T00:00:00Z" },
                    },
                },
            ],
        });

        const result = await getRepositoryCommits("juampi", "test", { branch: "dev", perPage: 5 });

        expect(octokit.repos.listCommits).toHaveBeenCalledWith(
            expect.objectContaining({ sha: "dev", per_page: 5 })
        );
        expect(result[0]).toMatchObject({
            sha: TARGET_SHA,
            message: "Primer commit",
            author: "Juampi",
            url: "https://github.com/juampi/test/commit/bbbb",
        });
    });

    it("no rompe si el commit no trae autor", async () => {
        (octokit.repos.listCommits as any).mockResolvedValue({
            data: [{ sha: "abc1234", html_url: "u", commit: { message: "m", author: null } }],
        });

        const result = await getRepositoryCommits("juampi", "test");
        expect(result[0].author).toBe("Unknown");
        expect(result[0].date).toBe("");
    });

    it("cuando el repo no existe, el error nombra el repo (no un 'recurso solicitado')", async () => {
        (octokit.repos.listCommits as any).mockRejectedValue(
            new RequestError("Not Found", 404, {
                request: { method: "GET", url: "https://api.github.com/test", headers: {} },
                response: { status: 404, url: "https://api.github.com/test", headers: {}, data: {} },
            } as any)
        );

        await expect(getRepositoryCommits("juampi", "no-existe")).rejects.toMatchObject({
            message: expect.stringContaining("juampi/no-existe"),
        });
    });

    it("cuando la rama no existe, el error nombra la rama", async () => {
        (octokit.repos.listCommits as any).mockRejectedValue(
            new RequestError("Not Found", 404, {
                request: { method: "GET", url: "https://api.github.com/test", headers: {} },
                response: { status: 404, url: "https://api.github.com/test", headers: {}, data: {} },
            } as any)
        );

        await expect(
            getRepositoryCommits("juampi", "test", { branch: "rama-fantasma" })
        ).rejects.toMatchObject({
            message: expect.stringContaining("rama rama-fantasma"),
        });
    });
});

describe("schemas de las tools nuevas", () => {
    it("revertToCommitSchema rechaza un SHA que no es hexadecimal", () => {
        const result = revertToCommitSchema.safeParse({
            owner: "juampi",
            repo: "test",
            sha: "no-es-un-sha",
        });
        expect(result.success).toBe(false);
    });

    it("revertToCommitSchema acepta un SHA corto (7 caracteres) y aplica branch='main'", () => {
        const result = revertToCommitSchema.safeParse({
            owner: "juampi",
            repo: "test",
            sha: "a1b2c3d",
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.branch).toBe("main");
        }
    });

    it("listCommitsSchema aplica per_page=10 por defecto y rechaza más de 100", () => {
        const ok = listCommitsSchema.safeParse({ owner: "juampi", repo: "test" });
        expect(ok.success).toBe(true);
        if (ok.success) expect(ok.data.per_page).toBe(10);

        const tooMany = listCommitsSchema.safeParse({
            owner: "juampi",
            repo: "test",
            per_page: 500,
        });
        expect(tooMany.success).toBe(false);
    });
});
