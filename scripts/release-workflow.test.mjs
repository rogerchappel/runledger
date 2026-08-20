import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");

function job(name, nextName) {
  const start = workflow.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `missing ${name} job`);
  const end = nextName ? workflow.indexOf(`  ${nextName}:`, start + 1) : workflow.length;
  assert.notEqual(end, -1, `missing ${nextName} job`);
  return workflow.slice(start, end);
}

const verify = job("verify", "npm-publish");
const npmPublish = job("npm-publish", "github-release");
const githubRelease = job("github-release");

assert.match(verify, /permissions:\n\s+contents: read/);
assert.doesNotMatch(verify, /contents: write|id-token: write/);
assert.match(verify, /actions\/upload-artifact@v4/);
assert.match(verify, /\*\.tgz[\s\S]*RELEASE_NOTES\.md/);
assert.match(verify, /if-no-files-found: error/);
assert.match(verify, /retention-days: 5/);

assert.match(npmPublish, /needs: verify/);
assert.match(npmPublish, /contents: read[\s\S]*id-token: write/);
assert.doesNotMatch(npmPublish, /contents: write|npm ci|npm pack|npm run build/);
assert.match(npmPublish, /actions\/download-artifact@v4[\s\S]*name: verified-release/);
assert.match(npmPublish, /npm publish \.\/\*\.tgz --provenance --access public/);

assert.match(githubRelease, /needs: verify/);
assert.match(githubRelease, /permissions:\n\s+contents: write/);
assert.doesNotMatch(githubRelease, /id-token: write|npm ci|npm pack|npm run build/);
assert.match(githubRelease, /actions\/download-artifact@v4[\s\S]*name: verified-release/);
assert.match(githubRelease, /gh release create[\s\S]*RELEASE_NOTES\.md[\s\S]*\.\/\*\.tgz/);

console.log("release workflow contract: ok");
