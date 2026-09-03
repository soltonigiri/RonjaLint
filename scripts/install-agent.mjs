#!/usr/bin/env node

import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hookRelativePath = ".agents/hooks/ronjalint.mjs";
const hookCommand = `node "$(git rev-parse --show-toplevel)/${hookRelativePath}"`;

const usage = `Usage: ronjalint-agent (--skill | --hooks) [options]

Options:
  --skill          Install the on-demand Skill
  --hooks          Install the always-on Hooks and their Skill dependency
  --target <dir>   Install into this project root (default: current directory)
  --force          Replace an existing RonjaLint Skill or Hook
  --dry-run        Show planned changes without writing files
  --help           Show this help
`;

const fail = (message) => {
    process.stderr.write(`${message}\n`);
    process.exit(2);
};

const parseArguments = (arguments_) => {
    const options = {
        dryRun: false,
        force: false,
        help: false,
        hooks: false,
        skill: false,
        target: process.cwd()
    };

    for (let index = 0; index < arguments_.length; index += 1) {
        const argument = arguments_[index];
        if (argument === "--skill") {
            options.skill = true;
        } else if (argument === "--hooks") {
            options.hooks = true;
            options.skill = true;
        } else if (argument === "--force") {
            options.force = true;
        } else if (argument === "--dry-run") {
            options.dryRun = true;
        } else if (argument === "--help" || argument === "-h") {
            options.help = true;
        } else if (argument === "--target") {
            const target = arguments_[index + 1];
            if (target === undefined || target.startsWith("--")) {
                fail("--target requires a directory.");
            }
            options.target = resolve(target);
            index += 1;
        } else {
            fail(`Unknown option: ${argument}`);
        }
    }

    return options;
};

const ronjaHook = (event) => ({
    ...(event === "SessionStart" ? { matcher: "startup|resume|clear|compact" } : {}),
    hooks: [
        {
            type: "command",
            command: hookCommand,
            timeout: event === "SessionStart" ? 10 : 30,
            statusMessage: event === "SessionStart" ? "Loading RonjaLint" : "Checking RonjaLint"
        }
    ]
});

const hasRonjaHook = (entries) =>
    Array.isArray(entries) && entries.some((entry) =>
        Array.isArray(entry?.hooks) && entry.hooks.some((hook) =>
            typeof hook?.command === "string" && hook.command.includes(hookRelativePath)
        )
    );

const createHookConfiguration = (path) => {
    let config = {
        description: "Apply RonjaLint to Japanese AI chat responses.",
        hooks: {}
    };

    if (existsSync(path)) {
        try {
            config = JSON.parse(readFileSync(path, "utf8"));
        } catch (error) {
            fail(`Cannot read ${path}: ${error instanceof Error ? error.message : "invalid JSON"}`);
        }
    }

    if (config === null || typeof config !== "object" || Array.isArray(config)) {
        fail(`${path} must contain a JSON object.`);
    }
    if (config.hooks === undefined) {
        config.hooks = {};
    }
    if (config.hooks === null || typeof config.hooks !== "object" || Array.isArray(config.hooks)) {
        fail(`${path} must contain a hooks object.`);
    }

    for (const event of ["SessionStart", "Stop"]) {
        const entries = config.hooks[event] ?? [];
        if (!Array.isArray(entries)) {
            fail(`${path} must contain an array at hooks.${event}.`);
        }
        if (!hasRonjaHook(entries)) {
            config.hooks[event] = [...entries, ronjaHook(event)];
        }
    }

    return `${JSON.stringify(config, null, 2)}\n`;
};

const options = parseArguments(process.argv.slice(2));
if (options.help) {
    process.stdout.write(usage);
    process.exit(0);
}
if (!options.skill && !options.hooks) {
    fail("Choose --skill or --hooks.\n\n" + usage);
}

const targetRoot = resolve(options.target);
const sourceSkill = resolve(packageRoot, ".agents/skills/ronjalint");
const sourceHook = resolve(packageRoot, hookRelativePath);
const targetSkill = resolve(targetRoot, ".agents/skills/ronjalint");
const targetHook = resolve(targetRoot, hookRelativePath);
const targetConfig = resolve(targetRoot, ".codex/hooks.json");

for (const [label, path] of [["Skill", sourceSkill], ["Hook", sourceHook]]) {
    if (!existsSync(path)) {
        fail(`${label} source is missing from the RonjaLint package: ${path}`);
    }
}

const collisions = [
    ...(options.skill && existsSync(targetSkill) ? [targetSkill] : []),
    ...(options.hooks && existsSync(targetHook) ? [targetHook] : [])
];
if (collisions.length > 0 && !options.force) {
    fail(`RonjaLint already exists at ${collisions.join(", ")}. Use --force to replace it.`);
}

const hookConfiguration = options.hooks ? createHookConfiguration(targetConfig) : undefined;
const display = (path) => relative(targetRoot, path) || ".";
const planned = [targetSkill, ...(options.hooks ? [targetHook, targetConfig] : [])];

if (options.dryRun) {
    for (const path of planned) {
        process.stdout.write(`Would write ${display(path)}\n`);
    }
    process.exit(0);
}

mkdirSync(targetRoot, { recursive: true });
if (existsSync(targetSkill)) {
    rmSync(targetSkill, { recursive: true, force: true });
}
mkdirSync(dirname(targetSkill), { recursive: true });
cpSync(sourceSkill, targetSkill, { recursive: true });

if (options.hooks) {
    mkdirSync(dirname(targetHook), { recursive: true });
    cpSync(sourceHook, targetHook);
    mkdirSync(dirname(targetConfig), { recursive: true });
    writeFileSync(targetConfig, hookConfiguration);
}

for (const path of planned) {
    process.stdout.write(`Wrote ${display(path)}\n`);
}
