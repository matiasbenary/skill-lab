import { api } from "./api.ts";

const port = Number(process.env.PORT ?? 8787);
api.listen(port, "127.0.0.1", () => console.log(`skill-lab api → http://127.0.0.1:${port}`));
