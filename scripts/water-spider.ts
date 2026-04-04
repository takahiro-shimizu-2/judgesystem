import { runWaterSpiderContinuityController, writeWaterSpiderArtifacts } from './automation/water-spider/continuity-controller.js';

interface WaterSpiderCliArgs {
  issueNumber: number;
  rootDir: string;
  summaryJsonPath: string;
  runUrl: string;
  triggerSource: string;
  outMarkdownPath?: string;
  outJsonPath?: string;
}

export async function runWaterSpiderCli(argv = process.argv, env = process.env) {
  const args = parseArgs(argv);
  const decision = await runWaterSpiderContinuityController({
    issueNumber: args.issueNumber,
    rootDir: args.rootDir,
    summaryJsonPath: args.summaryJsonPath,
    runUrl: args.runUrl,
    triggerSource: args.triggerSource,
    env,
  });
  const artifacts = writeWaterSpiderArtifacts({
    rootDir: args.rootDir,
    decision,
    markdownPath: args.outMarkdownPath,
    jsonPath: args.outJsonPath,
  });

  console.log(
    JSON.stringify(
      {
        ...decision,
        markdownPath: artifacts.markdownPath,
        jsonPath: artifacts.jsonPath,
      },
      null,
      2,
    ),
  );
}

function parseArgs(argv: string[]): WaterSpiderCliArgs {
  const issueNumber = parseNumberFlag(argv, '--issue');
  const rootDir = parseStringFlag(argv, '--root') || process.cwd();
  const summaryJsonPath = parseStringFlag(argv, '--summary-json');
  const runUrl = parseStringFlag(argv, '--run-url') || '';
  const triggerSource = parseStringFlag(argv, '--trigger-source') || 'unknown';
  const outMarkdownPath = parseStringFlag(argv, '--out-md') || undefined;
  const outJsonPath = parseStringFlag(argv, '--out-json') || undefined;

  if (!issueNumber) {
    throw new Error('Water Spider requires --issue <number>.');
  }

  if (!summaryJsonPath) {
    throw new Error('Water Spider requires --summary-json <path>.');
  }

  if (!runUrl) {
    throw new Error('Water Spider requires --run-url <url>.');
  }

  return {
    issueNumber,
    rootDir,
    summaryJsonPath,
    runUrl,
    triggerSource,
    outMarkdownPath,
    outJsonPath,
  };
}

function parseStringFlag(argv: string[], flag: string) {
  const inline = argv.find((value) => value.startsWith(`${flag}=`));
  if (inline) {
    return inline.slice(flag.length + 1);
  }

  const index = argv.findIndex((value) => value === flag);
  if (index >= 0 && index + 1 < argv.length) {
    return argv[index + 1];
  }

  return null;
}

function parseNumberFlag(argv: string[], flag: string) {
  const value = parseStringFlag(argv, flag);
  if (!value) {
    return null;
  }

  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

if (require.main === module) {
  runWaterSpiderCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
