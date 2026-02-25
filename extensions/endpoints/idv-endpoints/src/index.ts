import { defineEndpoint } from '@brio/extensions-sdk';
import { wrap, startIdv, getIdvStatus, getIdvResult, importConfig, healthcheck } from './routes/idv.js';

export default defineEndpoint((router, context) => {
    router.get('/healthcheck', wrap(healthcheck, context));

    // Core flow
    router.post('/start', wrap(startIdv, context));
    router.post('/status', wrap(getIdvStatus, context));
    router.post('/result', wrap(getIdvResult, context));

    // Administration
    router.post('/config/import', wrap(importConfig, context));
});
