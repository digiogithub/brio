import { Permission } from '@brio/types';

export const appRecommendedPermissions: Partial<Permission>[] = [
	{
		collection: 'brio_files',
		action: 'create',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_files',
		action: 'read',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_files',
		action: 'update',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_files',
		action: 'delete',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_dashboards',
		action: 'create',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_dashboards',
		action: 'read',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_dashboards',
		action: 'update',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_dashboards',
		action: 'delete',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_panels',
		action: 'create',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_panels',
		action: 'read',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_panels',
		action: 'update',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_panels',
		action: 'delete',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_folders',
		action: 'create',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_folders',
		action: 'read',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_folders',
		action: 'update',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_folders',
		action: 'delete',
		permissions: {},
	},
	{
		collection: 'brio_users',
		action: 'read',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_users',
		action: 'update',
		permissions: {
			id: {
				_eq: '$CURRENT_USER',
			},
		},
		fields: [
			'first_name',
			'last_name',
			'email',
			'password',
			'location',
			'title',
			'description',
			'avatar',
			'language',
			'theme',
			'tfa_secret',
		],
	},
	{
		collection: 'brio_roles',
		action: 'read',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_shares',
		action: 'read',
		permissions: {
			_or: [
				{
					role: {
						_eq: '$CURRENT_ROLE',
					},
				},
				{
					role: {
						_null: true,
					},
				},
			],
		},
		fields: ['*'],
	},
	{
		collection: 'brio_shares',
		action: 'create',
		permissions: {},
		fields: ['*'],
	},
	{
		collection: 'brio_shares',
		action: 'update',
		permissions: {
			user_created: {
				_eq: '$CURRENT_USER',
			},
		},
		fields: ['*'],
	},
	{
		collection: 'brio_shares',
		action: 'delete',
		permissions: {
			user_created: {
				_eq: '$CURRENT_USER',
			},
		},
		fields: ['*'],
	},
	{
		collection: 'brio_flows',
		action: 'read',
		permissions: {
			trigger: {
				_eq: 'manual',
			},
		},
		fields: ['id', 'name', 'icon', 'color', 'options', 'trigger'],
	},
];

export const appMinimalPermissions: Partial<Permission>[] = [
	{
		collection: 'brio_activity',
		action: 'read',
		permissions: {
			user: {
				_eq: '$CURRENT_USER',
			},
		},
	},
	{
		collection: 'brio_activity',
		action: 'create',
		validation: {
			comment: {
				_nnull: true,
			},
		},
	},
	{
		collection: 'brio_collections',
		action: 'read',
	},
	{
		collection: 'brio_fields',
		action: 'read',
	},
	{
		collection: 'brio_permissions',
		action: 'read',
		permissions: {
			role: {
				_eq: '$CURRENT_ROLE',
			},
		},
	},
	{
		collection: 'brio_presets',
		action: 'read',
		permissions: {
			_or: [
				{
					user: {
						_eq: '$CURRENT_USER',
					},
				},
				{
					_and: [
						{
							user: {
								_null: true,
							},
						},
						{
							role: {
								_eq: '$CURRENT_ROLE',
							},
						},
					],
				},
				{
					_and: [
						{
							user: {
								_null: true,
							},
						},
						{
							role: {
								_null: true,
							},
						},
					],
				},
			],
		},
	},
	{
		collection: 'brio_presets',
		action: 'create',
		validation: {
			user: {
				_eq: '$CURRENT_USER',
			},
		},
	},
	{
		collection: 'brio_presets',
		action: 'update',
		permissions: {
			user: {
				_eq: '$CURRENT_USER',
			},
		},
	},
	{
		collection: 'brio_presets',
		action: 'delete',
		permissions: {
			user: {
				_eq: '$CURRENT_USER',
			},
		},
	},
	{
		collection: 'brio_relations',
		action: 'read',
	},
	{
		collection: 'brio_roles',
		action: 'read',
		permissions: {
			id: {
				_eq: '$CURRENT_ROLE',
			},
		},
	},
	{
		collection: 'brio_settings',
		action: 'read',
	},
	{
		collection: 'brio_shares',
		action: 'read',
		permissions: {
			user_created: {
				_eq: '$CURRENT_USER',
			},
		},
	},
	{
		collection: 'brio_users',
		action: 'read',
		permissions: {
			id: {
				_eq: '$CURRENT_USER',
			},
		},
		fields: [
			'id',
			'first_name',
			'last_name',
			'last_page',
			'email',
			'password',
			'location',
			'title',
			'description',
			'tags',
			'preferences_divider',
			'avatar',
			'language',
			'theme',
			'tfa_secret',
			'status',
			'role',
		],
	},
];
