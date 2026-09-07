import { z } from "zod";

export const revertToCommitSchema = z.object({
    owner: z.string().min(1, "El owner es obligatorio"),
    repo: z.string().min(1, "El repo es obligatorio"),
    branch: z.string().min(1).optional().default("main"),
    // Un SHA de Git es hexadecimal: 7 caracteres (forma corta) a 40 (completo).
    // Validarlo acá evita una llamada a la API que sabemos de antemano que va a fallar.
    sha: z
        .string()
        .regex(
            /^[0-9a-fA-F]{7,40}$/,
            "El SHA debe ser hexadecimal y tener entre 7 y 40 caracteres"
        ),
    message: z
        .string()
        .min(1, "El mensaje del commit no puede estar vacío")
        .optional(),
});
