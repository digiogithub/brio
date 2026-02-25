import type { Request, Response, NextFunction } from 'express';
import { getEnv, assertEnv } from '../config.js';
import type { IdvEndpointContext, StartInput, ResultInput, StatusInput, ImportConfigInput } from '../types.js';
import { startSchema, resultSchema, statusSchema, importConfigSchema } from '../types.js';
import { requestXpressIdToken, getValiDasValidation, HttpError } from '../services/xpressid.js';
import { loadIdvConfig, evictConfigCache } from '../services/idv-config.ts';
import { createIdvProcess, updateIdvProcessResult, getIdvProcess } from '../services/idv-process.ts';
import { getSession, setSession, evictSession } from '../services/session.ts';
import { logIdvEvent, logIdvError } from '../services/logger.ts';
import {
    shouldTreatAsNotReady,
    hasAnyScorePayload,
    extractScores,
    extractOcrData,
    normalizeValidationState
} from '../services/validation.ts';

/**
 * Higher-order function to inject Context and handle async errors.
 */
export const wrap = (fn: (req: Request, res: Response, context: IdvEndpointContext) => Promise<void>, context: IdvEndpointContext) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            await fn(req, res, context);
        } catch (error: any) {
            const event = 'request_error';
            const status = error instanceof HttpError ? error.status : 500;
            const code = error.code ?? 'internal_server_error';

            logIdvError(event, error, { path: req.path, status, code }, context);

            res.status(status).json({
                error: {
                    message: error.message || 'An unexpected error occurred',
                    code,
                    details: error.details,
                }
            });
        }
    };
};

/**
 * POST /idv/start
 */
export async function startIdv(req: Request, res: Response, context: IdvEndpointContext): Promise<void> {
    const env = getEnv(context.env);
    assertEnv(env);

    const validated = startSchema.safeParse(req.body);
    if (!validated.success) {
        throw new HttpError('invalid_payload', 400, validated.error.format());
    }

    const { processId, configSlug, metadata } = validated.data;
    logIdvEvent('info', 'idv_start_requested', { processId, configSlug }, context);

    // 1. Load config from DB
    const xpressConfig = await loadIdvConfig(context, configSlug);

    // 2. Request token from Veridas
    const tokenResponse = await requestXpressIdToken(env, xpressConfig, processId);
    const { access_token, validation_id } = tokenResponse;

    // 3. Persist to DB
    const issuedAt = new Date().toISOString();
    await createIdvProcess({
        context,
        processId,
        configSlug,
        validationId: validation_id,
        accessToken: access_token,
        accessTokenIssuedAt: issuedAt,
        metadata,
    });

    // 4. Cache session in Redis/Memory for fast retrieval
    await setSession({
        processId,
        configSlug,
        validationId: validation_id,
        accessToken: access_token,
        accessTokenIssuedAt: issuedAt,
        status: 'pending',
        metadata,
    }, env);

    res.json({
        ok: true,
        accessToken: access_token,
        validationId: validation_id,
        processId,
    });
}

/**
 * POST /idv/status
 */
export async function getIdvStatus(req: Request, res: Response, context: IdvEndpointContext): Promise<void> {
    const env = getEnv(context.env);
    assertEnv(env);

    const validated = statusSchema.safeParse(req.body);
    if (!validated.success) {
        throw new HttpError('invalid_payload', 400, validated.error.format());
    }

    const { processId } = validated.data;

    // Check session store first
    const session = await getSession(processId, env);
    if (!session || !session.validationId) {
        // Try DB fallback
        const proc = await getIdvProcess(context, processId);
        if (!proc || !proc.validation_id) {
            throw new HttpError('process_not_found', 404, { processId });
        }

        // If DB says it's terminal, return immediately
        if (['completed', 'rejected', 'error', 'expired'].includes(proc.status as string)) {
            res.json({ ok: true, status: proc.status, decision: proc.decision_status });
            return;
        }

        // Pull from Veridas
        const validation = await getValiDasValidation(env, proc.validation_id as string);
        const state = normalizeValidationState(validation.data?.state);
        res.json({ ok: true, status: proc.status, validationState: state });
        return;
    }

    const validation = await getValiDasValidation(env, session.validationId);
    const state = normalizeValidationState(validation.data?.state);

    res.json({
        ok: true,
        status: session.status,
        validationState: state
    });
}

/**
 * POST /idv/result
 */
export async function getIdvResult(req: Request, res: Response, context: IdvEndpointContext): Promise<void> {
    const env = getEnv(context.env);
    assertEnv(env);

    const validated = resultSchema.safeParse(req.body);
    if (!validated.success) {
        throw new HttpError('invalid_payload', 400, validated.error.format());
    }

    const { processId } = validated.data;

    // 1. Get process data
    const proc = await getIdvProcess(context, processId);
    if (!proc) {
        throw new HttpError('process_not_found', 404, { processId });
    }

    // 2. If already resolved, return cached result
    if (['completed', 'rejected'].includes(proc.status as string)) {
        res.json({
            ok: true,
            accepted: proc.decision_status === 'accepted',
            status: proc.status,
            scores: proc.scores,
            ocrData: proc.ocr_data,
        });
        return;
    }

    const validationId = (validated.data.validationId || proc.validation_id) as string;
    if (!validationId) {
        throw new HttpError('missing_validation_id', 400, { processId });
    }

    // 3. Fetch from Veridas
    const validation = await getValiDasValidation(env, validationId);
    const valData = validation.data;
    const valState = normalizeValidationState(valData?.state);

    // 4. Check if ready
    const docScores = valData?.data?.document?.scores;
    const bioScores = valData?.data?.biometry?.scores;
    const lifeProof = extractScores(valData?.data).lifeProof;

    if (shouldTreatAsNotReady({
        env,
        validationState: valState,
        documentSignalsPresent: hasAnyScorePayload(docScores),
        hasBiometryScores: hasAnyScorePayload(bioScores),
        lifeProofScore: lifeProof,
    })) {
        throw new HttpError('idv_result_not_ready', 425, { state: valState });
    }

    // 5. Process results
    const scores = extractScores(valData?.data);
    const ocrData = extractOcrData(valData?.data?.document?.nodes ?? []);

    // Simple heuristic decision (can be expanded based on env thresholds)
    let status: 'completed' | 'rejected' = 'completed';
    let reason = '';

    if (!env.IDV_SKIP_SCORE_VALIDATION) {
        if ((scores.documentGlobal ?? 0) < 0.5) { status = 'rejected'; reason = 'low_document_global_score'; }
        else if ((scores.lifeProof ?? 0) < 0.5) { status = 'rejected'; reason = 'low_lifeproof_score'; }
    }

    const decision = status === 'completed' ? 'accepted' : 'rejected';

    // 6. Persist
    await updateIdvProcessResult({
        context,
        processId,
        status,
        reason,
        scores: scores as any,
        ocrData: ocrData as any,
    });

    // 7. Cleanup session
    await evictSession(processId, env);

    res.json({
        ok: true,
        accepted: decision === 'accepted',
        status,
        reason,
        scores,
        ocrData,
    });
}

/**
 * POST /idv/config/import (Backoffice use case)
 */
export async function importConfig(req: Request, res: Response, context: IdvEndpointContext): Promise<void> {
    const validated = importConfigSchema.safeParse(req.body);
    if (!validated.success) {
        throw new HttpError('invalid_payload', 400, validated.error.format());
    }

    const { name, slug, description, config } = validated.data;

    const schema = await context.getSchema?.();
    const ItemsService = context.services?.ItemsService;
    if (!schema || !ItemsService || !schema?.collections?.idv_configs) {
        throw new HttpError('service_unavailable', 503, { message: 'idv_configs collection not available' });
    }

    const svc = new ItemsService('idv_configs', { schema, accountability: { admin: true } });

    const existing = await svc.readByQuery({ filter: { slug: { _eq: slug } }, limit: 1, fields: ['id'] });
    const id = existing[0]?.id;

    const payload = {
        name,
        slug,
        description,
        xpressid_config: config,
        status: 'published',
    };

    if (id) {
        await svc.updateOne(id, payload);
    } else {
        await svc.createOne(payload);
    }

    evictConfigCache(slug);

    res.json({ ok: true, slug, action: id ? 'updated' : 'created' });
}

/**
 * GET /idv/healthcheck
 */
export async function healthcheck(_req: Request, res: Response): Promise<void> {
    res.json({ ok: true, service: 'idv-endpoints', timestamp: new Date().toISOString() });
}
