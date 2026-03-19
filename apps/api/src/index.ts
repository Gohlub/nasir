import { buildApiApp } from "./app";

async function main() {
  const app = buildApiApp();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "::";
  await app.listen({
    host,
    port
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
