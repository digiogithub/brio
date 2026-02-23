import { defineModule } from '@brio/extensions-sdk';
import ModuleAgeEncryption from './module.vue';

export default defineModule({
    id: 'age-encryption',
    name: 'Age Encryption',
    icon: 'vpn_key',
    routes: [
        {
            name: 'age-encryption-home',
            path: '',
            component: ModuleAgeEncryption,
        },
    ],
    preRegisterCheck(user) {
        return Boolean(user?.role?.admin_access === true || user?.admin_access === true);
    },
});
