export default async function handler(req, res) {
  // CORS helper
  const setCORS = () => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  };

  setCORS();
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = process.env.CLICKUP_PERSONAL_TOKEN;
    if (!token) return res.status(500).json({ error: 'Server misconfigured: missing token' });

    const {
      listId = process.env.CLICKUP_DEFAULT_LIST_ID,
      name, email, phone, company, taskDescription
    } = req.body || {};

    // простая валидация
    if (!listId || !name || !email || !phone) {
      return res.status(400).json({ error: 'Missing required fields: listId, name, email, phone' });
    }

    // формируем задачу в ClickUp
    const cuRes = await fetch(`https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}/task`, {
      method: 'POST',
      headers: {
        // для personal token — без "Bearer"
        'Authorization': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `Заявка с сайта: ${name}${company ? ` (${company})` : ''}`,
        description: taskDescription || [
          'Новая заявка с сайта',
          `Имя: ${name}`,
          `Email: ${email}`,
          `Телефон: ${phone}`,
          `Компания: ${company || 'Не указано'}`,
          `Дата: ${new Date().toLocaleString('ru-RU')}`
        ].join('\n')
        // status не указываем, чтобы не схлопотать "Invalid status"
      })
    });

    const cuJson = await cuRes.json().catch(() => ({}));
    if (!cuRes.ok) {
      console.error('ClickUp API error:', cuJson);
      return res.status(502).json({ error: 'ClickUp API error', details: cuJson });
    }

    return res.status(200).json({ success: true, taskId: cuJson.id });
  } catch (e) {
    console.error('Server error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
