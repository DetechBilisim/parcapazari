import { initializeApp } from "./app.js";

const PORT = process.env.PORT || 4000;

async function start() {
  const app = await initializeApp();
  app.listen(PORT, () => {
    console.log(`🚀 ParçaPazar backend running on http://localhost:${PORT}`);
    console.log(`📊 GraphQL endpoint: http://localhost:${PORT}/graphql`);
  });
}

start().catch((err) => {
  console.error("Failed to start the server:", err);
  process.exit(1);
});