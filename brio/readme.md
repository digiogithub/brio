# Brio

**Brio is a free and open-source Backend as a Service (BaaS) and headless Content Management System (CMS).**

It can be installed on top of any new or existing SQL database, instantly providing a dynamic API (REST+GraphQL) and
accompanying App for managing content. Built entirely in TypeScript, Brio is completely modular and end-to-end
extensible, with absolutely no paywalls or artificial limitations.

Modern and intuitive, the Brio App enables no-code data discovery, allowing for even the most non-technical users to
view, author, and manage your raw database content. Our performant and flexible API is able to adapt to any relational
schema, and includes rule-based permissions, event/web hooks, custom endpoints, numerous auth options, configurable
storage adapters, and much more.

Current database support includes: PostgreSQL, MySQL, SQLite, MS-SQL Server, OracleDB, MariaDB, and variants such as AWS
Aurora/Redshift or Google Cloud Platform SQL.

## Installing

Brio runs on Bun.js. Create a new project:

```
bun create brio-project my-project
```

The above command will create a directory with your project name, then walk you through the database configuration and
creation of your first admin user.

## Contributing

Please report any and all issues on our GitHub.

Pull-requests are more than welcome, and always appreciated. Please be sure to read our Contributors Guide before
starting work on a new feature/fix.

## Fork Attribution

Brio is a fork of [Directus v9.26.0](https://github.com/directus/directus) (GPL-3.0).
Copyright (C) 2004-2023 Monospace Inc. We acknowledge and thank all original Directus contributors.

## License

Brio is released under the [GPLv3 license](./license).
Copyright (C) 2024-present Brio contributors.
Copyright (C) 2004-2023 Monospace Inc.
