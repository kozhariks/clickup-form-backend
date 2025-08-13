export default async function handler(req, res) {
  // --- CORS (минимум, без лишних заголовков) ---
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  const reqHeaders = req.headers["access-control-request-headers"];
  res.setHeader(
    "Access-Control-Allow-Headers",
    reqHeaders || "Content-Type"
  );
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = process.env.CLICKUP_PERSONAL_TOKEN;
    if (!token) return res.status(500).json({ error: "Server misconfigured: missing token" });

    // ----- Парсим тело: поддерживаем application/json и text/plain -----
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body || "{}"); } catch { body = {}; }
    } else if (Buffer.isBuffer(body)) {
      try { body = JSON.parse(body.toString("utf8")); } catch { body = {}; }
    }
    body = body || {};

    const {
      listId = process.env.CLICKUP_DEFAULT_LIST_ID,
      name, email, phone, company, taskDescription
    } = body;

    if (!listId || !name || !email || !phone) {
      return res.status(400).json({ error: "Missing required fields: listId, name, email, phone" });
    }

    // ----- Таймаут на вызов ClickUp -----
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s

    const cuRes = await fetch(
      `https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}/task`,
      {
        method: "POST",
        headers: {
          // personal token — без 'Bearer'; для OAuth нужен 'Bearer <token>'
          "Authorization": token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: `Заявка с сайта: ${name}${company ? ` (${company})` : ""}`,
          description: taskDescription || [
            "Новая заявка с сайта",
            `Имя: ${name}`,
            `Email: ${email}`,
            `Телефон: ${phone}`,
            `Компания: ${company || "Не указано"}`,
            `Дата: ${new Date().toLocaleString("ru-RU")}`
          ].join("\n")
        }),
        signal: controller.signal
      }
    ).catch((err) => {
      if (err?.name === "AbortError") {
        return { ok: false, status: 504, json: async () => ({ error: "Upstream timeout" }) };
      }
      throw err;
    });

    clearTimeout(timeoutId);

    const cuJson = (cuRes && typeof cuRes.json === "function")
      ? await cuRes.json().catch(() => ({}))
      : {};

    if (!cuRes || !cuRes.ok) {
      console.error("ClickUp API error:", cuJson);
      const status = cuRes?.status || 502;
      return res.status(status).json({ error: "ClickUp API error", details: cuJson });
    }

    return res.status(200).json({ success: true, taskId: cuJson.id });
  } catch (e) {
    console.error("Server error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
