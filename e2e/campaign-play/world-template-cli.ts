import { runCampaignWorldTemplateCli } from "./world-template.js";

runCampaignWorldTemplateCli().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
