import { describe, expect, test } from "bun:test";
import {
  extractSkillBody,
  substituteArguments,
  injectSkillDirectory,
} from "./loader";

describe("extractSkillBody", () => {
  test("strips YAML frontmatter and returns body", () => {
    const content = `---
name: test-skill
description: A test skill
---
# Skill Body

This is the skill content with **markdown**.`;

    const body = extractSkillBody(content);
    expect(body).toBe(`# Skill Body

This is the skill content with **markdown**.`);
  });

  test("handles frontmatter with CRLF line endings", () => {
    const content =
      "---\r\nname: test\r\n---\r\nBody content\r\n";

    const body = extractSkillBody(content);
    expect(body).toBe("Body content");
  });

  test("returns trimmed content when no frontmatter", () => {
    const content = `No frontmatter here

With multiple lines`;

    const body = extractSkillBody(content);
    expect(body).toBe("No frontmatter here\n\nWith multiple lines");
  });

  test("handles empty frontmatter", () => {
    const content = `---
---
Body only`;

    const body = extractSkillBody(content);
    expect(body).toBe("Body only");
  });
});

describe("substituteArguments", () => {
  test("replaces $ARGUMENTS placeholder with args", () => {
    const body = "Run with $ARGUMENTS";
    const result = substituteArguments(body, "--quick --verbose");
    expect(result).toBe("Run with --quick --verbose");
  });

  test("replaces multiple occurrences", () => {
    const body = "$ARGUMENTS and again $ARGUMENTS";
    const result = substituteArguments(body, "foo");
    expect(result).toBe("foo and again foo");
  });

  test("replaces with empty string when args is undefined", () => {
    const body = "Args: $ARGUMENTS end";
    const result = substituteArguments(body, undefined);
    expect(result).toBe("Args:  end");
  });

  test("leaves body unchanged when no placeholder", () => {
    const body = "No placeholder here";
    const result = substituteArguments(body, "--test");
    expect(result).toBe("No placeholder here");
  });
});

describe("injectSkillDirectory", () => {
  test("prepends skill directory to body", () => {
    const body = "# Skill content";
    const result = injectSkillDirectory(body, "/repo/.skills/my-skill");
    expect(result).toBe("Skill directory: /repo/.skills/my-skill\n\n# Skill content");
  });

  test("preserves full body content", () => {
    const body = `---
name: test
---
# Body

Some content here.`;

    const result = injectSkillDirectory(body, "/path/to/skill");
    expect(result).toContain("Skill directory: /path/to/skill");
    expect(result).toContain("# Body");
    expect(result).toContain("Some content here.");
  });
});
