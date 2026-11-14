import { createApp } from "./app.js";
import { createDb } from "./db.js";

const port = Number(process.env["PORT"] ?? 3000);
const jwtSecret = process.env["JWT_SECRET"];
if (!jwtSecret) {
  console.error("Falta la variable de entorno JWT_SECRET");
  process.exit(1);
}
const db = createDb(process.env["DATABASE_PATH"] ?? "snap.db");

createApp({ db, jwtSecret }).listen(port, () => {
  console.log(`Snap escuchando en http://localhost:${port}`);
});
