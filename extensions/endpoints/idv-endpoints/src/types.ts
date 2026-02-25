import { z } from 'zod';

// ─── Directus context shape available inside extensions ───────────────────────

export type IdvEndpointContext = {
    env?: Record<string, any>;
    services?: {
        ItemsService?: any;
    };
    database?: any;
    getSchema?: () => Promise<any>;
    logger?: {
        info?: (...args: any[]) => void;
        warn?: (...args: any[]) => void;
        error?: (...args: any[]) => void;
    };
};

// ─── Veridas API response types ───────────────────────────────────────────────

export type XpressIdTokenResponse = {
    access_token: string;
    validation_id: string;
};

export type ValiDasValidationResponse = {
    data?: {
        data?: any;
        id?: string;
        documentType?: string;
        state?: string;
    };
};

// ─── Internal IDV types ───────────────────────────────────────────────────────

export type IdvStartResult = {
    accessToken: string;
    validationId: string;
    configSlug: string;
};

export type OcrPersonData = {
    nombres?: string;
    apellidoPaterno?: string;
    apellidoMaterno?: string;
    sexo?: string;
    fechNac?: string;
    nationality?: string;
};

export type IdvScores = {
    documentGlobal?: number;
    lifeProof?: number;
    photoId?: number;
    integrity?: number;
};

export type IdvDecision = {
    status: 'accepted' | 'rejected' | 'pending';
    reason?: string;
};

// ─── Request schemas (Zod) ────────────────────────────────────────────────────

export const startSchema = z.object({
    /** Caller-supplied correlation ID; becomes idv_processes.process_id */
    processId: z.string().uuid(),
    /** Slug of the `idv_configs` record to use */
    configSlug: z.string().min(1),
    /** Optional metadata stored on the idv_processes record */
    metadata: z.record(z.unknown()).optional(),
});

export const statusSchema = z.object({
    processId: z.string().uuid(),
});

export const resultSchema = z.object({
    processId: z.string().uuid(),
    /** Optionally pass validationId directly (e.g. from QR cross-device flow) */
    validationId: z.string().min(6).optional(),
});

export const importConfigSchema = z.object({
    name: z.string().min(1),
    slug: z.string().min(1).regex(/^[a-z0-9_]+$/, 'Slug must be lowercase alphanumeric with underscores'),
    description: z.string().optional(),
    config: z.record(z.unknown()),
});

export type StartInput = z.infer<typeof startSchema>;
export type StatusInput = z.infer<typeof statusSchema>;
export type ResultInput = z.infer<typeof resultSchema>;
export type ImportConfigInput = z.infer<typeof importConfigSchema>;
