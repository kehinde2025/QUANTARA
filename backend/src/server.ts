import { createApp } from "./app.js";
import { marketService } from "./market/index.js";

const port = Number(process.env.PORT ?? 4000);

marketService.start();

const server = createApp().listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});

function shutdown() {
  marketService.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);