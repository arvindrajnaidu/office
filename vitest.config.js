import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["core", "whatsapp", "imessage", "telegram", "email"],
  },
});
