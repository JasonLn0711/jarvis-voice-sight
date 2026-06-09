import { loadConfig } from "./config/env.js";
import { buildServer, createDependencies } from "./server.js";

const config = loadConfig();
const server = await buildServer(createDependencies(config));

await server.listen({
  port: config.PORT,
  host: "0.0.0.0"
});
