import app from "./app.js";
import { env } from "./lib/env.js";

app.listen(env.port, () => {
  console.log(`Backend listening on http://localhost:${env.port}`);
});
