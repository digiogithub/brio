exports.seed = async function (knex) {
	if (process.env.TEST_LOCAL) {
		await knex('brio_collections').del();
		await knex('brio_relations').del();
		await knex('brio_roles').del();
		await knex('brio_users').del();
	}
};
