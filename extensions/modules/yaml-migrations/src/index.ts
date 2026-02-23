import { defineModule } from '@brio/extensions-sdk';
import ModuleYamlMigrations from './module.vue';

export default defineModule({
    id: 'yaml-migrations',
    name: 'YAML Migrations',
    icon: 'sync_alt',
    routes: [
        {
            name: 'yaml-migrations-home',
            path: '',
            component: ModuleYamlMigrations,
        },
    ],
});
