import { defineInterface } from '@brio/extensions-sdk';
import InterfaceAgeEncrypted from './interface.vue';

export default defineInterface({
    id: 'age-encrypted',
    name: 'Age Encrypted',
    description: 'Stores ciphertext in the database (age armor). Plaintext is encrypted on write.',
    icon: 'lock',
    types: ['string', 'text'],
    group: 'standard',
    component: InterfaceAgeEncrypted,
    options: [
        {
            field: 'multiline',
            name: 'Multiline',
            type: 'boolean',
            meta: {
                interface: 'boolean',
                width: 'half',
            },
        },
    ],
});
