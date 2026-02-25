/**
 * Validation utilities for Veridas scores and states.
 * Ported from mx-endpoints/src/services/idv/validation.ts
 */

import type { IdvEndpointsEnv } from '../config.js';
import type { IdvScores } from '../types.js';

export function isValidationStateCompleted(state: string): boolean {
    const s = String(state).trim().toLowerCase();
    if (!s) return false;
    return (
        s === 'completed' ||
        s === 'complete' ||
        s === 'finished' ||
        s === 'done' ||
        s.includes('completed') ||
        s.includes('complete') ||
        s.includes('finished') ||
        s.includes('success')
    );
}

export function hasAnyScorePayload(scores: unknown): boolean {
    if (!scores) return false;
    if (Array.isArray(scores)) return scores.length > 0;
    if (typeof scores === 'object') return Object.keys(scores as Record<string, unknown>).length > 0;
    return false;
}

export function shouldTreatAsNotReady(params: {
    env: IdvEndpointsEnv;
    validationState?: string;
    documentSignalsPresent: boolean;
    hasBiometryScores: boolean;
    lifeProofScore?: number;
}): boolean {
    const { env, validationState, documentSignalsPresent, hasBiometryScores, lifeProofScore } = params;

    // If we have all required data, consider it ready even if state != 'completed'
    const hasAllRequiredData =
        documentSignalsPresent && hasBiometryScores && typeof lifeProofScore === 'number';

    if (hasAllRequiredData) return false; // Ready!
    if (validationState && isValidationStateCompleted(validationState)) return false; // Ready!

    // If we have document but missing biometry/liveness, we're mid-flow
    if (
        !env.IDV_SKIP_SCORE_VALIDATION &&
        documentSignalsPresent &&
        !hasBiometryScores &&
        typeof lifeProofScore !== 'number'
    ) {
        return true; // Not ready yet
    }

    // If state is on_course but we don't have all data yet
    if (validationState && !isValidationStateCompleted(validationState)) return true;

    return false;
}

export function scoreByName(
    scores: any[] | Record<string, unknown> | undefined,
    name: string,
): number | undefined {
    if (!scores) return undefined;

    if (Array.isArray(scores)) {
        const s = scores.find((x) => String(x?.name ?? '') === name);
        const v = s?.value;
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string' && v.trim()) {
            const parsed = parseFloat(v);
            return Number.isFinite(parsed) ? parsed : undefined;
        }
        return undefined;
    }

    if (typeof scores === 'object') {
        const v = (scores as any)?.[name];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string' && v.trim()) {
            const parsed = parseFloat(v);
            return Number.isFinite(parsed) ? parsed : undefined;
        }
    }

    return undefined;
}

export function maxDefinedScore(values: Array<number | undefined>): number | undefined {
    const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (nums.length === 0) return undefined;
    return Math.max(...nums);
}

export function normalizeValidationState(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    return raw.trim().toLowerCase() || undefined;
}

/**
 * Extract scores from a ValiDas validation response payload.
 */
export function extractScores(raw: any): IdvScores {
    const document = raw?.document ?? {};
    const biometry = raw?.biometry ?? {};
    const integrity = raw?.integrity ?? {};
    const summary = raw?.summary?.scores;

    return {
        documentGlobal:
            scoreByName(document?.scores, 'Score-DocumentGlobal') ??
            scoreByName(summary, 'Score-DocumentGlobal'),
        lifeProof: maxDefinedScore([
            scoreByName(biometry?.scores, 'ValidasScoreLifeProof'),
            scoreByName(biometry?.scores, 'ValidasScoreVideoLifeProof'),
            scoreByName(summary, 'ValidasScoreLifeProof'),
            scoreByName(summary, 'ValidasScoreVideoLifeProof'),
        ]),
        photoId: maxDefinedScore([
            scoreByName(biometry?.scores, 'ValidasScorePhotoId'),
            scoreByName(summary, 'ValidasScorePhotoId'),
        ]),
        integrity:
            scoreByName(integrity?.scores, 'ValidasScoreIntegrity') ??
            scoreByName(summary, 'ValidasScoreIntegrity'),
    };
}

/**
 * Extract OCR person-level data from document nodes.
 */
export function extractOcrData(nodes: any[]): Record<string, string | undefined> {
    if (!Array.isArray(nodes)) return {};

    function pickNode(name: string): string | undefined {
        const node = nodes.find(
            (n) =>
                String(n?.name ?? '').toLowerCase() === name.toLowerCase() ||
                String(n?.id ?? '').toLowerCase() === name.toLowerCase(),
        );
        return node?.value ?? node?.text ?? undefined;
    }

    return {
        curp: pickNode('curp') ?? pickNode('CURP'),
        passportNumber: pickNode('mrz_number') ?? pickNode('passport_number') ?? pickNode('document_number'),
        nombres: pickNode('nombres') ?? pickNode('name') ?? pickNode('given_names'),
        apellidoPaterno: pickNode('apellido_paterno') ?? pickNode('first_surname'),
        apellidoMaterno: pickNode('apellido_materno') ?? pickNode('second_surname'),
        sexo: pickNode('sexo') ?? pickNode('sex') ?? pickNode('gender'),
        fechNac: pickNode('fecha_nacimiento') ?? pickNode('date_of_birth') ?? pickNode('birth_date'),
        nationality: pickNode('nationality') ?? pickNode('nationalidad'),
    };
}
