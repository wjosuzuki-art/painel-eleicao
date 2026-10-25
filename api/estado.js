// Vercel Function: guarda e devolve o estado do painel (um JSON) no Upstash Redis.
//   GET  /api/estado              -> último estado publicado (o site lê isto a cada ~20 s)
//   POST /api/estado  (JSON)      -> o SEU PC publica um estado novo; exige "Authorization: Bearer <PUBLISH_TOKEN>"
//
// Variáveis de ambiente (Vercel > Project > Settings > Environment Variables):
//   PUBLISH_TOKEN                     : senha longa inventada por você (a mesma vai no publicar.py)
//   KV_REST_API_URL / KV_REST_API_TOKEN       (criadas pela integração Upstash da Vercel)  ou
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (se criar o Redis direto no site da Upstash)

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const CHAVE = "painel:estado";

async function redis(caminho, corpo) {
  const r = await fetch(`${URL_}/${caminho}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${TOK}` },
    body: corpo,
  });
  if (!r.ok) throw new Error(`redis ${r.status}: ${await r.text()}`);
  return r.json();
}

export default async function handler(req, res) {
  if (!URL_ || !TOK) return res.status(500).json({ erro: "Redis não configurado (veja as variáveis de ambiente)" });
  try {
    if (req.method === "GET") {
      const { result } = await redis(`get/${CHAVE}`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(result || "{}");
    }
    if (req.method === "POST") {
      const auth = req.headers.authorization || "";
      if (!process.env.PUBLISH_TOKEN || auth !== `Bearer ${process.env.PUBLISH_TOKEN}`)
        return res.status(401).json({ erro: "não autorizado" });
      const corpo = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      if (corpo.length > 900_000) return res.status(413).json({ erro: "estado grande demais" });
      await redis(`set/${CHAVE}`, corpo);
      return res.status(200).json({ ok: true, bytes: corpo.length });
    }
    return res.status(405).json({ erro: "use GET ou POST" });
  } catch (e) {
    return res.status(502).json({ erro: String(e) });
  }
}
