import { z } from "zod";

export const listCommitsSchema = z.object({
    owner: z.string().min(1, "El owner es obligatorio"),
    repo: z.string().min(1, "El repo es obligatorio"),
    branch: z.string().min(1).optional(),
    per_page: z
        .number()
        .int()
        .min(1, "Hay que pedir al menos 1 commit")
        .max(100, "GitHub no devuelve más de 100 commits por página")
        .optional()
        .default(10),
});
