import { defineHook } from '@brio/extensions-sdk';

/**
 * IDV Hooks Extension
 *
 * Provides a scheduled task to transition stale `idv_processes` from `pending` to `expired`.
 *
 * Configurable via environment variables:
 * - IDV_CLEANUP_CRON: Cron schedule for the cleanup job (default: '0 * * * *' = every hour)
 * - IDV_CLEANUP_TTL_HOURS: Hours since `date_created` to consider a process stale (default: 1)
 */

export default defineHook(({ schedule }, { database, logger, env }) => {
    const CRON_SCHEDULE = env.IDV_CLEANUP_CRON || '0 * * * *'; // Default: every hour
    const TTL_HOURS = parseInt(env.IDV_CLEANUP_TTL_HOURS || '1', 10);
    const COLLECTION = 'idv_processes';

    schedule(CRON_SCHEDULE, async () => {
        logger.info(`[idv-hooks] Starting scheduled cleanup for stale processes`);

        try {
            // Calculate cutoff time
            const cutoffDate = new Date();
            cutoffDate.setHours(cutoffDate.getHours() - TTL_HOURS);
            const cutoffIso = cutoffDate.toISOString();

            // Update stale 'pending' or 'in_progress' processes to 'expired'
            // We transition them instead of deleting as requested.
            const updatedCount = await database(COLLECTION)
                .whereIn('status', ['pending', 'in_progress'])
                .where('date_created', '<', cutoffIso)
                .update({
                    status: 'expired',
                    date_updated: new Date().toISOString(),
                });

            if (updatedCount > 0) {
                logger.info(`[idv-hooks] Cleanup completed: transitioned ${updatedCount} processes to 'expired'`);
            }
        } catch (error) {
            logger.error(
                `[idv-hooks] Cleanup failed`,
                {
                    error: error instanceof Error ? error.message : String(error),
                    timestamp: new Date().toISOString(),
                }
            );
        }
    });

    logger.info(
        `[idv-hooks] Scheduled cleanup registered: ${CRON_SCHEDULE} (TTL: ${TTL_HOURS}h)`,
    );
});
