# Project Brio (project_id / user_id: brio)

This is a project for Brio BaaS and CMS.

This project is based on Directus, an open-source headless CMS and BaaS platform. The project aims to leverage Directus's capabilities to build a robust and scalable backend for Brio, providing content management and backend services. This project forks from the GPL-licensed Directus codebase ending with v9.26.0, and it will be customized and extended to meet the specific needs of Brio.

## Directus origins for Brio project

Directus v9.26.0 is the last version of Directus that is licensed under the GPL license, which allows us to fork and modify the codebase for our project Brio. We will use this version as the foundation for our project and build upon it to create a customized backend and CMS solution that meets the specific requirements of Brio.

Brio important breaking changes from Directus v9.26.0 and future changes:

- Brio runs over Bun.js instead of Node.js, which requires some adjustments in the codebase to ensure compatibility and performance optimizations.
- New features of the last versions of Directus like mcp server are implemented using extensions instead the codebase and progressively Brio migrates the frontend architecture based in Vue.js to React.js 


## Development

You have different tools to help you during development:
- Internet search with Brave, Google or Perplexity, and Context7 for libraries documentation and examples
- Knowledge base, facts, entities and code indexing with remembrances tools for getting context about the project for specific tasks or questions. Use always as user_id the project name "brio"
- Agents and tasks management with mesnada
- You have Directus Tools to interact with the Directus backend

* Use always English for any documentation or comments you write, although the main project language is Spanish.
* Always activate monitoring code of the project brio
* Always use hybrid search and knowledge base search, and code search using remembrances tools for getting context about the project for specific tasks or questions. Use always as user_id the project name "brio"
* At the end save always your work in remembrances knowledge base, and facts. Use always as user_id the project name "brio"

## Sub-agents tasks

You can create sub-agents to perform specific tasks related to the project. You can parallelize work using sub-agents for different features or components of the project.

When creating sub-agents, ensure they have access to the necessary context and tools to perform their tasks effectively. Also add the mcp config file normally in `.github/mcp-config.json` so they can use all the tools available for the main agent.

Share information using the Remembrances knowledge base, facts and entities, using always as user_id the project name "brio", send instructions to the sub-agents to use this information for their tasks.