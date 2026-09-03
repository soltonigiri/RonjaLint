import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));

test("grammar specification has stable identities and valid references", () => {
    const spec = readJson("grammar/ronjalint.json");
    const sourceIds = new Set(spec.sources.map((source) => source.id));
    const featureIds = new Set(spec.features.map((feature) => feature.id));
    const statuses = new Set(["normative", "common", "contextual", "project-policy", "historical"]);
    const mechanicalLevels = new Set(["error", "review", "none"]);

    assert.equal(sourceIds.size, spec.sources.length);
    assert.equal(featureIds.size, spec.features.length);
    assert.deepEqual(Object.keys(spec.profiles).sort(), [
        "canonical-current",
        "custom",
        "ronja-chat"
    ]);
    assert.equal([...sourceIds].length >= 5, true);

    for (const source of spec.sources) {
        assert.match(source.url, /^https:\/\//u);
        assert.match(source.checkedAt, /^\d{4}-\d{2}-\d{2}$/u);
    }

    for (const feature of spec.features) {
        assert.equal(typeof feature.summary, "string");
        assert.equal(typeof feature.useWhen, "string");
        assert.equal(typeof feature.avoidWhen, "string");
        assert.equal(typeof feature.agentInstruction, "string");
        assert.equal(statuses.has(feature.status), true, `${feature.id}: ${feature.status}`);
        assert.equal(mechanicalLevels.has(feature.mechanical), true, `${feature.id}: ${feature.mechanical}`);
        assert.equal(
            feature.sources.length > 0 || feature.status === "project-policy",
            true,
            feature.id
        );
        for (const source of feature.sources) {
            assert.equal(sourceIds.has(source), true, `${feature.id}: ${source}`);
        }
    }
});

test("generated agent guidance and profile defaults are current", () => {
    const result = spawnSync(process.execPath, ["scripts/generate.mjs", "--check"], {
        cwd: repoRoot,
        encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
});
