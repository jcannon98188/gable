import { describe, expect, it } from "vitest";
import { readSceneFile } from "./server/scene-index.js";
import { hostModule, scenarioModule } from "./server/vite-plugin.js";

const SCENES = `import type { ComponentScenes } from '@gable/core/tooling';
import { UserList } from './http-demo.js';
export default {
  component: UserList,
  scenes: {
    Loaded: { description: 'Three users', http: [{ url: '/api/users', reply: { body: [] } }, { url: '/api/me', reply: {} }] },
    Home: { url: '/active' },
  },
} satisfies ComponentScenes<UserList>;
`;

describe("page scenarios", () => {
  it("reads scene names, descriptions, mock counts and urls without running the file", () => {
    const f = readSceneFile("/src/http-demo.scenes.ts", SCENES);
    expect(f.scenes.map((s) => [s.name, s.mocks, s.url])).toEqual([
      ["Loaded", 2, null],
      ["Home", 0, "/active"],
    ]);
  });

  it("the scenario module imports the scenes file and installs root providers", () => {
    const m = scenarioModule("/src/http-demo.scenes.ts", "Loaded");
    expect(m).toContain("/src/http-demo.scenes.ts");
    expect(m).toContain("rootProviders");
    expect(m).toContain("__GABLE_PAGE_SCENARIO__");
  });

  it("the component host applies a scene's http mocks before its providers", () => {
    const m = hostModule("/src/http-demo.scenes.ts", null);
    expect(m).toContain("mockHttp");
    expect(m.indexOf("...mocks(scene)")).toBeLessThan(m.indexOf("...(scene.providers ?? [])"));
  });
});
