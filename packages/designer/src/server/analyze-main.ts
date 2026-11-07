import { analyze } from "./analyze-worker.js";

process.stdout.write(JSON.stringify(analyze(process.argv[2]!)));
