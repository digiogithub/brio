/**
 * CLI tool to import Veridas XpressID configurations into Brio.
 * Usage:
 *   bun run src/cli/import.ts --file path/to/config.json --slug my_slug --name "My Config" --url http://localhost:8055 --token YOUR_TOKEN
 */

import { parseArgs } from 'util';
import { readFile } from 'fs/promises';

async function run() {
    const { values } = parseArgs({
        args: Bun.argv.slice(2),
        options: {
            file: { type: 'string' },
            slug: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            url: { type: 'string', default: 'http://localhost:8055' },
            token: { type: 'string' },
        },
        strict: true,
    });

    const { file, slug, name, url, token } = values;

    if (!file || !slug || !name || !token) {
        console.error('Usage: bun run import.ts --file <json_file> --slug <slug> --name <name> --token <admin_token> [--url <brio_url>]');
        process.exit(1);
    }

    console.log(`Reading configuration from ${file}...`);
    let config: any;
    try {
        const content = await readFile(file, 'utf8');
        config = JSON.parse(content);
    } catch (err: any) {
        console.error(`Error reading file: ${err.message}`);
        process.exit(1);
    }

    const apiUrl = `${url.replace(/\/$/, '')}/idv-endpoints/idv/config/import`;
    console.log(`Importing to ${apiUrl}...`);

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                name,
                slug,
                description: values.description,
                config,
            }),
        });

        const result = await response.json() as any;

        if (!response.ok) {
            console.error(`Import failed [${response.status}]:`, result.error || result);
            process.exit(1);
        }

        console.log(`Successfully ${result.action} configuration '${name}' (slug: ${slug})`);
    } catch (err: any) {
        console.error(`Network error: ${err.message}`);
        process.exit(1);
    }
}

run();
