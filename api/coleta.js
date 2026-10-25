// Vercel Function: "caixa de correio" da coleta. Os PCs coletores ENVIAM lotes de seções; o PC de casa BUSCA.
//   POST /api/coleta   {"parte": "2de3", "linhas": ["{...json...}", ...]}   -> guarda no fim da lista da parte
//   GET  /api/coleta?parte=2de3&desde=0                                    -> devolve até 2000 linhas a partir de 'desde'
// Exige "Authorization: Bearer <COLETA_TOKEN>" nos dois casos. COLETA_TOKEN é OUTRA senha (não a do painel):
// quem a tiver só consegue mandar/ler dados de coleta, nunca mudar o que o site mostra.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const LOTE_MAX = 2000;

async function cmd(arr) {                       // comando Redis genérico via REST da Upstash
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOK}`, "Content-Type": "application/json" },
    body: JSON.stringify(arr),
  });
  if (!r.ok) throw new Error(`redis ${r.status}: ${await r.text()}`);
  return (await r.json()).result;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOK) return res.status(500).json({ erro: "Redis não configurado" });
  const esperado = (process.env.COLETA_TOKEN || "").trim();
  const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!esperado)        // a variável não chegou nesta versão do site: faltou o Redeploy (ou ela está só em Preview)
    return res.status(401).json({ erro: "COLETA_TOKEN não está configurado NESTE deploy do site (faça Redeploy após criar a variável)" });
  if (auth !== esperado)
    return res.status(401).json({ erro: "senha da coleta diferente da configurada no site" });
  try {
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const parte = String(b.parte || "").replace(/[^0-9a-z_]/gi, "");
      const linhas = Array.isArray(b.linhas) ? b.linhas.map(String) : [];
      if (!parte || !linhas.length) return res.status(400).json({ erro: "faltam parte/linhas" });
      if (linhas.length > LOTE_MAX) return res.status(413).json({ erro: `no máximo ${LOTE_MAX} linhas por lote` });
      const total = await cmd(["RPUSH", `coleta:${parte}`, ...linhas]);
      return res.status(200).json({ ok: true, total });
    }
    if (req.method === "GET") {
      const parte = String(req.query.parte || "").replace(/[^0-9a-z_]/gi, "");
      const desde = Math.max(0, parseInt(req.query.desde || "0", 10) || 0);
      if (!parte) {                                   // sem parte: lista as partes e quantas linhas cada uma tem
        const chaves = (await cmd(["KEYS", "coleta:*"])) || [];
        const tam = {};
        for (const k of chaves) tam[k.slice(7)] = await cmd(["LLEN", k]);
        return res.status(200).json({ partes: tam });
      }
      const linhas = (await cmd(["LRANGE", `coleta:${parte}`, desde, desde + LOTE_MAX - 1])) || [];
      return res.status(200).json({ desde, linhas });
    }
    return res.status(405).json({ erro: "use GET ou POST" });
  } catch (e) {
    return res.status(502).json({ erro: String(e) });
  }
}
