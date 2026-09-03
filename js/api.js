/* API 访问封装 */
const API = {
  async get(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error((await safeJson(r)).error || `HTTP ${r.status}`);
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await safeJson(r);
    if (!r.ok) return { __httpError: true, status: r.status, ...data };
    return data;
  },
};
async function safeJson(r) {
  try { return await r.json(); } catch (e) { return {}; }
}
