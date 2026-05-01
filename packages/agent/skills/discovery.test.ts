import { describe, expect, test } from "bun:test";
import { parseSkillFrontmatter } from "./discovery";

describe("parseSkillFrontmatter", () => {
  test("parses valid frontmatter with name and description", () => {
    const content = `---
name: review
description: Review code changes
---
# Skill Body`;

    const result = parseSkillFrontmatter(content);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("review");
      expect(result.data.description).toBe("Review code changes");
    }
  });

  test("parses quoted string values with colons", () => {
    const content = `---
name: my-skill
description: "Handles URLs like https://example.com"
---
Body`;

    const result = parseSkillFrontmatter(content);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("Handles URLs like https://example.com");
    }
  });

  test("parses boolean values", () => {
    const content = `---
name: test
description: A test
disable-model-invocation: true
user-invocable: false
---
Body`;

    const result = parseSkillFrontmatter(content);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data["disable-model-invocation"]).toBe(true);
      expect(result.data["user-invocable"]).toBe(false);
    }
  });

  test("returns error when no frontmatter", () => {
    const content = `# No frontmatter
Just body content`;

    const result = parseSkillFrontmatter(content);
    expect(result.success).toBe(false);
  });

  test("handles CRLF line endings", () => {
    const content = "---\r\nname: crlf-test\r\ndescription: Test\r\n---\r\nBody";

    const result = parseSkillFrontmatter(content);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("crlf-test");
    }
  });

  test("ignores comment lines", () => {
    const content = `---
name: commented
description: Test
# This is a comment
---
Body`;

    const result = parseSkillFrontmatter(content);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("commented");
    }
  });

  test("handles single-quoted values", () => {
    const content = `---
name: sq-test
description: 'Single quoted value'
---
Body`;

    const result = parseSkillFrontmatter(content);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("Single quoted value");
    }
  });
});
