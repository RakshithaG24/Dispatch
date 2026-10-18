// Copies non-TypeScript assets (the SQL schema) into dist after tsc runs.
import { cpSync } from "node:fs";
cpSync("src/db/schema.sql", "dist/db/schema.sql");
