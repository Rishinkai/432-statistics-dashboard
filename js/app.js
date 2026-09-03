/* 432 统计学学习驾驶舱 · 前端主逻辑（Hash 路由 + 页面渲染）
   所有统计数字来自后端 API（SQLite 实时查询），前端不硬编码任何数字。 */
(function () {
  "use strict";

  const main = document.getElementById("main");
  const dbTimeEl = document.getElementById("db-time");
  const dbPathEl = document.getElementById("db-path");

  // ---------------- 工具 ----------------
  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const num = (v) => (v == null ? "—" : v);
  const score = (v) => (v == null ? '<span class="na">—</span>' : esc(v));
  const fmtYears = (s) => {
    if (!s) return "—";
    const ys = String(s).split(",").map(Number).sort((a, b) => a - b);
    return ys.join("、");
  };
  const pill = (lv) => lv ? `<span class="pill ${esc(lv)}">${esc(lv)}</span>` : "";
  const na = (t) => `<span class="na">${t}</span>`;
  const srcNote = (t) => `<div class="src">数据来源：${t}</div>`;
  const scoreTag = (p) => {
    if (p.q_count > 0 && p.score_filled === 0)
      return `<span class="tag warn">未列分值</span>`;
    if (p.total_score && p.score_filled < p.total_score)
      return `<span class="tag warn">分值不完整（${p.score_filled}/${p.total_score}）</span>`;
    return `<span class="tag ok">分值完整</span>`;
  };

  function errorCard(e) {
    return `<div class="card"><div class="card-title">出错了</div>
      <p class="muted">${esc(e && e.message ? e.message : String(e))}</p>
      <p class="muted">请确认后端已启动且数据库文件存在。</p></div>`;
  }

  async function loadDbMeta() {
    try {
      const m = await API.get("/api/meta");
      dbTimeEl.textContent = m.db_mtime || "未知";
      dbPathEl.textContent = m.db_ok ? m.db_path : "数据库文件未找到：" + m.db_path;
      if (!m.db_ok) dbTimeEl.textContent = "数据库不可用";
    } catch (e) {
      dbTimeEl.textContent = "后端未连接";
    }
  }

  function setActiveNav(path) {
    const first = "/" + (path.split("/").filter(Boolean)[0] || "");
    document.querySelectorAll("[data-nav]").forEach(a => {
      a.classList.toggle("active", a.dataset.nav === first);
    });
  }

  // ---------------- 首页 ----------------
  async function pageHome() {
    const [ov, chapters, kps, sim, papers] = await Promise.all([
      API.get("/api/overview"), API.get("/api/chapters"),
      API.get("/api/knowledge?sort=freq"), API.get("/api/similar?limit=5"),
      API.get("/api/papers?type=考研真题"),
    ]);
    const c = ov.counts;
    const stat = (v, label, src, unit) => `
      <div class="stat"><div class="num">${esc(v)}${unit ? `<small>${esc(unit)}</small>` : ""}</div>
      <div class="label">${esc(label)}</div>${srcNote(src)}</div>`;

    // 章节条形图（按真题总分排序，动态计算）
    const maxSc = Math.max(...chapters.map(x => x.score_sum || 0), 1);
    const bars = chapters.filter(x => x.q_count > 0).map(x => `
      <div class="bar-row">
        <div class="bar-line1">
          <span class="bar-name" data-goto="#/chapters/${x.chapter_id}">${esc(x.chapter_name)}</span>
          <span class="bar-val">${x.q_count}题 · ${x.score_sum || 0}分 · 覆盖${x.year_count}年</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round((x.score_sum || 0) / maxSc * 100)}%"></div></div>
      </div>`).join("");

    const years = ov.exam_years || [];
    const gaps = [];
    if (years.length) for (let y = years[0]; y <= years[years.length - 1]; y++)
      if (!years.includes(y)) gaps.push(y);
    const recentPapers = [...papers].sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 6);

    const kpRow = (k) => `
      <div class="list-item">
        <span class="li-main"><a href="#/knowledge/${k.knowledge_id}">${pill(k.level)}${esc(k.knowledge_name)}</a></span>
        <span class="li-sub">${esc(k.chapter_name || "未分章")} ｜ 真题${k.exam_count}次 ${k.exam_score ? "· " + k.exam_score + "分" : ""} ｜ 覆盖${k.year_count}年 ｜ 最近${num(k.last_year)}</span>
      </div>`;

    const top10 = kps.slice(0, 10).map((k, i) => `
      <tr>
        <td class="num-cell">${i + 1}</td>
        <td><a href="#/knowledge/${k.knowledge_id}">${pill(k.level)}${esc(k.knowledge_name)}</a></td>
        <td class="num-cell">${k.exam_count}</td>
        <td>${fmtYears(k.year_list)}</td>
        <td class="num-cell">${score(k.exam_score)}</td>
        <td class="num-cell">${num(k.last_year)}</td>
      </tr>`).join("");

    const simCard = (s) => `
      <div class="sim-card">
        <div class="sim-pair">
          <div class="sim-q"><div class="q-head">${s.y1} ${esc(s.n1)}${s.sc1 != null ? "（" + s.sc1 + "分）" : ""}</div>
            <div class="q-text">${esc((s.kname1 || "") + " · " + (s.t1 || ""))}</div></div>
          <div class="sim-vs">↔</div>
          <div class="sim-q"><div class="q-head">${s.y2} ${esc(s.n2)}${s.sc2 != null ? "（" + s.sc2 + "分）" : ""}</div>
            <div class="q-text">${esc((s.kname2 || "") + " · " + (s.t2 || ""))}</div></div>
        </div>
        <div class="sim-meta"><span class="tag">${esc(s.similarity_type)}</span>
          相似度 ${s.similarity_score == null ? "—" : s.similarity_score} ｜
          <a href="#/question/${s.id1}?compare=${s.id2}">对比详情 →</a></div>
      </div>`;

    main.innerHTML = `
      <div class="page-head">
        <h1 class="page-title">432 统计学学习驾驶舱</h1>
        <p class="page-sub">目标院校命题规律 + 我的个人学习状态 ｜ 数据库更新：<span class="db-time-inline">${esc(ov.db_mtime)}</span></p>
      </div>

      <div class="card">
        <div class="card-title">数据库概览</div>
        <div class="card-note">真题口径 = paper_type"考研真题"（不含本科期末题/习题集），实时查询</div>
        <div class="stat-grid">
          ${stat(c.papers_exam, "考研真题（套）", "papers")}
          ${stat(c.questions_exam, "真题题目（道）", "questions")}
          ${stat(c.knowledge_points, "知识点（个）", "knowledge_points")}
          ${stat(c.evidence, "证据（条）", "knowledge_evidence")}
          ${stat(c.similar, "相似题（组）", "similar_questions")}
          ${stat(c.formulas, "公式（条）", "formulas")}
        </div>
      </div>

      <div class="card">
        <div class="card-title">章节复习优先级</div>
        <div class="card-note">依据：历史真题分值 + 题数 + 覆盖年数（实时统计，非模型常识排序）</div>
        ${bars || '<div class="empty">暂无真题数据</div>'}
      </div>

      <div class="card">
        <div class="card-title">复习优先级知识点（S / A）</div>
        <div class="card-note">S/A/B/C/D 表示基于现有资料的复习投入优先级，<b>不代表考试预测</b>。</div>
        <div class="card-title" style="font-size:13px;color:var(--s)">S 级 · 最值得优先投入</div>
        ${kps.filter(k => k.level === "S").map(kpRow).join("") || '<div class="empty">暂无 S 级知识点</div>'}
        <div class="card-title" style="font-size:13px;color:var(--a);margin-top:10px">A 级 · 重点掌握</div>
        ${kps.filter(k => k.level === "A").map(kpRow).join("") || '<div class="empty">暂无 A 级知识点</div>'}
        <a href="#/priority" class="chip" style="margin-top:10px">查看完整 S/A/B/C/D →</a>
      </div>

      <div class="card">
        <div class="card-title">Top 10 高频知识点</div>
        <div class="card-note">按覆盖年数优先、真题分值次之（来自 questions 实时统计）</div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>排名</th><th>知识点</th><th>出现次数</th><th>涉及年份</th><th>总分</th><th>最近出现</th></tr></thead>
          <tbody>${top10}</tbody>
        </table></div>
      </div>

      <div class="card">
        <div class="card-title">高相似真题（重复命题）</div>
        <div class="card-note">来自 similar_questions，按相似度降序前 5 组</div>
        ${sim.map(simCard).join("") || '<div class="empty">暂无相似题数据</div>'}
        <a href="#/similar" class="chip">查看全部 →</a>
      </div>

      <div class="card">
        <div class="card-title">最近真题</div>
        <div class="card-note">真题年份：${years.join("、") || "无"}${gaps.length ? "（缺 " + gaps.join("、") + "）" : ""}</div>
        <div class="chips">
          ${recentPapers.map(p => `<a class="chip" href="#/papers/${p.paper_id}">${p.year} 年</a>`).join("")}
          <a class="chip" href="#/exercises" style="border-style:dashed">期末习题补充 →</a>
        </div>
      </div>`;
  }

  // ---------------- 知识点列表 ----------------
  async function pageKnowledge(params) {
    const meta = await API.get("/api/meta");
    const state = {
      q: params.get("q") || "",
      chapter: params.get("chapter") || "",
      level: params.get("level") || "",
      sort: params.get("sort") || "freq",
    };
    main.innerHTML = `
      <div class="page-head">
        <h1 class="page-title">知识点</h1>
        <p class="page-sub">支持搜索 / 按章节、等级筛选 / 多种排序 ｜ 来自 knowledge_points 实时统计</p>
      </div>
      <div class="card">
        <div class="filter-bar">
          <input type="search" id="f-q" placeholder="搜索知识点…" value="${esc(state.q)}">
          <select id="f-ch"><option value="">全部章节</option>
            ${meta.chapter_options.map(o => `<option value="${o.chapter_id}" ${String(o.chapter_id) === state.chapter ? "selected" : ""}>${esc(o.chapter_name)}</option>`).join("")}
          </select>
          <select id="f-lv">
            <option value="">全部等级</option>
            ${["S", "A", "B", "C", "D"].map(l => `<option value="${l}" ${state.level === l ? "selected" : ""}>${l} 级</option>`).join("")}
          </select>
          <select id="f-sort">
            <option value="freq" ${state.sort === "freq" ? "selected" : ""}>按覆盖年数</option>
            <option value="score" ${state.sort === "score" ? "selected" : ""}>按真题分值</option>
            <option value="recent" ${state.sort === "recent" ? "selected" : ""}>按最近出现</option>
            <option value="evidence" ${state.sort === "evidence" ? "selected" : ""}>按证据数</option>
            <option value="name" ${state.sort === "name" ? "selected" : ""}>按名称</option>
          </select>
          <button id="f-go" class="btn-primary">筛选</button>
        </div>
        <div id="klist"><div class="loading">加载中…</div></div>
      </div>`;
    const reload = async () => {
      const qs = new URLSearchParams();
      if (state.q) qs.set("q", state.q);
      if (state.chapter) qs.set("chapter", state.chapter);
      if (state.level) qs.set("level", state.level);
      qs.set("sort", state.sort);
      const list = await API.get("/api/knowledge?" + qs);
      $("#klist").innerHTML = list.length ? list.map(k => `
        <div class="list-item">
          <span class="li-main"><a href="#/knowledge/${k.knowledge_id}">${pill(k.level)}${esc(k.knowledge_name)}</a></span>
          <span class="li-sub">${esc(k.chapter_name || "未分章")} ｜ 真题${k.exam_count}次 ${k.exam_score ? "· " + k.exam_score + "分" : ""} ｜ 覆盖${k.year_count}年 ｜ 最近${num(k.last_year)} ｜ 证据${k.evidence_count}条</span>
        </div>`).join("") : '<div class="empty">没有匹配的知识点</div>';
    };
    $("#f-go").addEventListener("click", async () => {
      state.q = $("#f-q").value.trim(); state.chapter = $("#f-ch").value;
      state.level = $("#f-lv").value; state.sort = $("#f-sort").value;
      $("#klist").innerHTML = '<div class="loading">加载中…</div>';
      await reload();
    });
    $("#f-q").addEventListener("keydown", e => { if (e.key === "Enter") $("#f-go").click(); });
    await reload();
  }

  // ---------------- 知识点详情 ----------------
  async function pageKnowledgeDetail(id) {
    const k = await API.get("/api/knowledge/" + id);
    const qRow = (q) => `
      <div class="q-card">
        <div class="q-head"><span class="q-num">${q.year} ${esc(q.question_number)}</span>
          <span class="tag">${esc(q.question_type || "—")}</span>
          <span class="muted">${q.score != null ? q.score + " 分" : na("未列分值")}</span>
          <span class="muted">难度 ${q.difficulty == null ? "—" : q.difficulty}</span>
          <a href="#/question/${q.question_id}">详情 →</a></div>
        <div class="q-text">${esc(q.question_text)}</div>
      </div>`;
    main.innerHTML = `
      <div class="page-head">
        <h1 class="page-title">${pill(k.level)}${esc(k.knowledge_name)}</h1>
        <p class="page-sub">${esc(k.chapter_name || "未分章")} ｜ 知识点 #${k.knowledge_id}</p>
      </div>

      <div class="card"><div class="card-title">① 基本信息</div>
        <dl class="kv">
          <dt>所属章节</dt><dd><a href="#/chapters/${k.chapter_id}">${esc(k.chapter_name || "—")}</a></dd>
          <dt>重要度</dt><dd>${pill(k.level)} ${esc(k.level)} 级（复习投入优先级，非考试预测）</dd>
          <dt>定级依据</dt><dd>${esc(k.rationale || "—（数据库未记录）")}</dd>
          <dt>描述</dt><dd>${esc(k.description || "—")}</dd>
        </dl>
      </div>

      <div class="card"><div class="card-title">② 真题统计</div>
        <div class="stat-grid">
          <div class="stat"><div class="num">${k.exam_count}<small>次</small></div><div class="label">真题出现</div>${srcNote("questions")}</div>
          <div class="stat"><div class="num">${score(k.exam_score)}</div><div class="label">真题总分</div>${srcNote("questions.score")}</div>
          <div class="stat"><div class="num">${k.year_count}<small>年</small></div><div class="label">覆盖年数</div>${srcNote("questions")}</div>
          <div class="stat"><div class="num">${k.similar.length}<small>组</small></div><div class="label">相似题</div>${srcNote("similar_questions")}</div>
        </div>
        <p class="card-note" style="margin-top:10px">覆盖年份：${fmtYears(k.year_list)}</p>
      </div>

      <div class="card"><div class="card-title">③ 历年真题（${k.questions.length} 题）</div>
        ${k.questions.length ? k.questions.map(qRow).join("") : '<div class="empty">该知识点暂无直接挂接的真题（可能以辅考点出现在其他题目中，见⑤证据）</div>'}
      </div>

      <div class="card"><div class="card-title">④ 相似题（${k.similar.length} 组）</div>
        ${k.similar.length ? k.similar.map(s => `
          <div class="list-item"><span class="li-main">
            <a href="#/question/${s.question_id}">本题</a> ↔ <a href="#/question/${s.other_id}">${s.other_year} ${esc(s.other_number)}</a></span>
            <span class="li-sub">${esc(s.similarity_type)} ｜ ${esc(s.explanation || "")}</span>
          </div>`).join("") : '<div class="empty">暂无相似题记录</div>'}
      </div>

      <div class="card"><div class="card-title">⑤ 证据（${k.evidence.length} 条 · 为什么认为这个知识点重要）</div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>年份</th><th>来源类型</th><th>文件</th><th>页码</th><th>证据描述</th></tr></thead>
          <tbody>${k.evidence.map(e => `
            <tr><td class="num-cell">${num(e.year)}</td><td>${esc(e.source_type || "—")}</td>
            <td title="${esc(e.file_path || "")}">${esc(e.file_name || "—")}</td>
            <td class="num-cell">${num(e.page)}</td><td>${esc(e.evidence_description)}</td></tr>`).join("")}
          </tbody></table></div>
        ${k.evidence.length ? "" : '<div class="empty">暂无证据</div>'}
      </div>

      <div class="card"><div class="card-title">⑥ 相关公式（${k.formulas.length} 条）</div>
        ${k.formulas.length ? k.formulas.map(f => `
          <div class="list-item"><span class="li-main">${f.key_point_flag ? "★ " : ""}${esc(f.formula_name)}</span>
            <span class="li-sub"><code>${esc(f.formula_text)}</code>${f.applicable_conditions ? " ｜ 适用：" + esc(f.applicable_conditions) : ""}</span>
          </div>`).join("") : '<div class="empty">数据库未收录该知识点的公式</div>'}
      </div>`;
  }

  // ---------------- 章节 ----------------
  async function pageChapters() {
    const rows = await API.get("/api/chapters");
    main.innerHTML = `
      <div class="page-head"><h1 class="page-title">章节分析</h1>
      <p class="page-sub">按真题总分排序 ｜ 来自 chapters × questions（考研真题口径）实时统计</p></div>
      <div class="card"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>章节</th><th>真题题数</th><th>真题总分</th><th>覆盖年数</th><th>出现年份</th><th>最近</th><th>S/A 知识点</th></tr></thead>
        <tbody>${rows.map(r => `
          <tr><td><a class="row-link" href="#/chapters/${r.chapter_id}">${esc(r.chapter_name)}</a></td>
          <td class="num-cell">${r.q_count}</td><td class="num-cell">${score(r.score_sum)}</td>
          <td class="num-cell">${r.year_count}</td><td>${r.q_count ? fmtYears(r.year_list) : "—"}</td>
          <td class="num-cell">${num(r.last_year)}</td>
          <td class="num-cell">${r.sa_kp_count} / ${r.kp_count}</td></tr>`).join("")}
        </tbody></table></div>
      </div>`;
  }

  async function pageChapterDetail(id) {
    const c = await API.get("/api/chapters/" + id);
    const maxT = Math.max(...c.trend.map(t => t.cnt), 1);
    main.innerHTML = `
      <div class="page-head"><h1 class="page-title">${esc(c.chapter_name)}</h1>
      <p class="page-sub">章节 #${c.chapter_id} ｜ 知识点 ${c.kp_count} 个</p></div>
      <div class="card"><div class="card-title">考频趋势（按年真题题数）</div>
        ${c.trend.length ? c.trend.map(t => `
          <div class="bar-row"><div class="bar-line1"><span class="bar-name">${t.year}</span><span class="bar-val">${t.cnt} 题</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round(t.cnt / maxT * 100)}%"></div></div></div>`).join("")
          : '<div class="empty">该章节暂无真题证据</div>'}
      </div>
      <div class="card"><div class="card-title">知识点（${c.knowledge.length} 个）</div>
        ${c.knowledge.length ? c.knowledge.map(k => `
          <div class="list-item"><span class="li-main"><a href="#/knowledge/${k.knowledge_id}">${pill(k.level)}${esc(k.knowledge_name)}</a></span>
          <span class="li-sub">真题${k.exam_count}次 ｜ ${k.exam_score ? k.exam_score + "分 ｜ " : ""}覆盖${k.year_count}年</span></div>`).join("")
          : '<div class="empty">暂无知识点</div>'}
      </div>
      <div class="card"><div class="card-title">历年相关真题（${c.questions.length} 题）</div>
        ${c.questions.length ? c.questions.map(q => `
          <div class="q-card"><div class="q-head"><span class="q-num">${q.year} ${esc(q.question_number)}</span>
            <span class="tag">${esc(q.question_type || "—")}</span>
            <span class="muted">${q.score != null ? q.score + " 分" : na("未列分值")}</span>
            ${q.knowledge_name ? `<span class="muted">${esc(q.knowledge_name)}</span>` : ""}
            <a href="#/question/${q.question_id}">详情 →</a></div>
          <div class="q-text">${esc(q.question_text)}</div></div>`).join("")
          : '<div class="empty">暂无真题</div>'}
      </div>`;
  }

  // ---------------- 试卷 ----------------
  async function pagePapers(params) {
    const meta = await API.get("/api/meta");
    const state = { type: params.get("type") || "", has_score: params.get("has_score") || "" };
    const renderList = (rows) => `
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>年份</th><th>类型</th><th>题目数</th><th>已录分值</th><th>完整度</th><th>说明</th></tr></thead>
        <tbody>${rows.map(p => `
          <tr><td class="num-cell"><a class="row-link" href="#/papers/${p.paper_id}">${p.year || "—"}</a></td>
          <td>${esc(p.paper_type)}</td><td class="num-cell">${p.q_count}</td>
          <td class="num-cell">${p.score_filled || 0}${p.total_score ? " / " + p.total_score : ""}</td>
          <td>${scoreTag(p)}</td><td class="muted">${esc((p.notes || "").slice(0, 40))}</td></tr>`).join("")}
        </tbody></table></div>`;
    main.innerHTML = `
      <div class="page-head"><h1 class="page-title">真题 / 试卷</h1>
      <p class="page-sub">考研真题与本科期末题明确区分 ｜ 来自 papers 实时统计 ｜ <a href="#/exercises">期末习题补充（不计权重）→</a></p></div>
      <div class="card">
        <div class="filter-bar">
          <select id="p-type"><option value="">全部类型</option>
            ${meta.paper_types.map(t => `<option value="${esc(t.paper_type)}" ${state.type === t.paper_type ? "selected" : ""}>${esc(t.paper_type)}</option>`).join("")}
          </select>
          <select id="p-score">
            <option value="">全部完整度</option>
            <option value="1" ${state.has_score === "1" ? "selected" : ""}>有分值</option>
            <option value="0" ${state.has_score === "0" ? "selected" : ""}>无分值</option>
          </select>
          <button id="p-go" class="btn-primary">筛选</button>
        </div>
        <div id="plist"><div class="loading">加载中…</div></div>
      </div>`;
    const reload = async () => {
      const qs = new URLSearchParams();
      if (state.type) qs.set("type", state.type);
      if (state.has_score) qs.set("has_score", state.has_score);
      const rows = await API.get("/api/papers?" + qs);
      $("#plist").innerHTML = rows.length ? renderList(rows) : '<div class="empty">没有匹配的试卷</div>';
    };
    $("#p-go").addEventListener("click", async () => {
      state.type = $("#p-type").value; state.has_score = $("#p-score").value;
      $("#plist").innerHTML = '<div class="loading">加载中…</div>';
      await reload();
    });
    await reload();
  }

  async function pagePaperDetail(id) {
    const [p, pages] = await Promise.all([
      API.get("/api/papers/" + id),
      API.get(`/api/papers/${id}/pages`).catch(() => null),
    ]);
    main.innerHTML = `
      <div class="page-head"><h1 class="page-title">${p.year ? p.year + " 年" : ""}${esc(p.paper_name || "试卷")}</h1>
      <p class="page-sub">${esc(p.paper_type)} ｜ 题目 ${p.q_count} 道 ｜ 满分 ${num(p.total_score)} ｜ ${esc(p.recognition_status || "")}</p></div>
      ${p.q_count > 0 && (!p.total_score || p.questions.every(q => q.score == null))
        ? '<div class="notice">该试卷为回忆版，原始资料未标注分值，故数据库未录入分值（不自动补全）。</div>' : ""}
      <div class="card"><div class="card-title">题目列表</div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>题号</th><th>题型</th><th>分值</th><th>知识点</th><th>难度</th><th>页码</th></tr></thead>
          <tbody>${p.questions.map(q => `
            <tr><td><a class="row-link" href="#/question/${q.question_id}">${esc(q.question_number)}</a></td>
            <td>${esc(q.question_type || "—")}</td>
            <td class="num-cell">${score(q.score)}</td>
            <td>${q.knowledge_name ? `<a href="#/knowledge/${q.knowledge_id}">${esc(q.knowledge_name)}</a>` : "—"}</td>
            <td class="num-cell">${num(q.difficulty)}</td><td class="num-cell">${num(q.source_page)}</td></tr>`).join("")}
          </tbody></table></div>
        <p class="card-note">来源文件：${esc(p.source_file || "—")}</p>
      </div>
      ${sourceImageBlock(pages, "原卷图片")}`;
  }

  // ---------------- 原题图片块 ----------------
  function sourceImageBlock(pg, title) {
    if (!pg || pg.kind === "none" || !pg.pages || !pg.pages.length) {
      const f = pg && pg.file ? `（来源：${esc(pg.file)}，暂不支持图片预览）` : "";
      return `<div class="card"><div class="card-title">${title}</div>
        <div class="empty">暂无原题图片${f}</div></div>`;
    }
    const hint = pg.kind === "pdf"
      ? `来源 PDF 第 ${pg.pages.join("、")} 页（点击放大）`
      : "来源图片（点击放大）";
    const imgs = pg.pages.map(n =>
      `<img class="src-img" src="/api/source/${pg.source_id}?page=${n}" alt="原题 第${n}页" loading="lazy" onclick="window.open(this.src)">`).join("");
    return `<div class="card"><div class="card-title">${title}</div>
      <div class="card-note">${esc(pg.file)} ｜ ${hint}</div>${imgs}</div>`;
  }

  // ---------------- 题目详情 ----------------
  async function pageQuestion(id, params) {
    const cmpId = params.get("compare");
    const [data, pages] = await Promise.all([
      API.get("/api/questions/" + id + (cmpId ? "?compare=" + cmpId : "")),
      API.get(`/api/questions/${id}/pages`).catch(() => null),
    ]);
    const q = data.question;
    const qCard = (x, head) => `
      <div class="q-card"><div class="q-head"><span class="q-num">${head}</span>
        <span class="tag">${esc(x.question_type || "—")}</span>
        <span class="muted">${x.score != null ? x.score + " 分" : na("未列分值")}</span>
        <span class="muted">难度 ${num(x.difficulty)}</span></div>
      <div class="q-text">${esc(x.question_text)}</div></div>`;
    const kv = (x) => `
      <dl class="kv">
        <dt>年份</dt><dd>${num(x.paper_year)}</dd>
        <dt>试卷</dt><dd>${esc(x.paper_name || "—")}（${esc(x.paper_type)}）</dd>
        <dt>题号</dt><dd>${esc(x.question_number)}</dd>
        <dt>题型</dt><dd>${esc(x.question_type || "—")}</dd>
        <dt>分值</dt><dd>${x.score != null ? x.score + " 分" : "数据库未录入分值"}</dd>
        <dt>章节</dt><dd>${x.chapter_name ? `<a href="#/chapters/${x.chapter_id}">${esc(x.chapter_name)}</a>` : "—"}</dd>
        <dt>知识点</dt><dd>${x.knowledge_name ? `<a href="#/knowledge/${x.knowledge_id}">${esc(x.knowledge_name)}</a>` : "—"}</dd>
        <dt>难度</dt><dd>${num(x.difficulty)} / 5</dd>
        <dt>来源文件</dt><dd>${esc(x.source_file || "—")}</dd>
        <dt>来源页码</dt><dd>${num(x.source_page)}</dd>
      </dl>`;
    main.innerHTML = `
      <div class="page-head"><h1 class="page-title">题目详情</h1>
      <p class="page-sub">${num(q.paper_year)} ${esc(q.question_number)} ｜ ${esc(q.paper_name || "")}</p></div>
      <div class="card"><div class="card-title">题目信息</div>${kv(q)}</div>
      <div class="card"><div class="card-title">题干</div><div class="q-text" style="white-space:pre-wrap">${esc(q.question_text)}</div></div>
      ${sourceImageBlock(pages, "原题图片")}
      <div class="card"><div class="card-title">解析</div>
        ${q.method ? `<div class="q-text">${esc(q.method)}</div>` : '<div class="empty">当前数据库没有收录解析。</div>'}
        ${q.notes ? `<p class="card-note" style="margin-top:8px">备注：${esc(q.notes)}</p>` : ""}
      </div>
      ${data.compare ? `
        <div class="card"><div class="card-title">题目对比</div>
          <div class="sim-pair">
            ${qCard(q, num(q.paper_year) + " " + esc(q.question_number))}
            <div class="sim-vs">↔</div>
            ${qCard(data.compare, num(data.compare.paper_year) + " " + esc(data.compare.question_number))}
          </div>
          ${data.similar ? `<div class="sim-meta" style="margin-top:10px">
            <span class="tag">${esc(data.similar.similarity_type)}</span>
            相似度 ${num(data.similar.similarity_score)} ｜ ${esc(data.similar.explanation || "")}</div>` : ""}
        </div>
        <div class="card"><div class="card-title">对比题目信息</div>${kv(data.compare)}</div>` : ""}
    `;
  }

  // ---------------- 相似题 ----------------
  async function pageSimilar(params) {
    const all = await API.get("/api/similar");
    const curType = params.get("type") || "";
    const rows = curType ? all.filter(r => r.similarity_type === curType) : all;
    const types = [...new Set(all.map(r => r.similarity_type))];
    main.innerHTML = `
      <div class="page-head"><h1 class="page-title">重复考点 · 高相似真题</h1>
      <p class="page-sub">共 ${all.length} 组，当前显示 ${rows.length} 组 ｜ 来自 similar_questions 实时统计</p></div>
      <div class="card">
        <div class="chips" style="margin-bottom:12px">
          <a class="chip" href="#/similar">全部（${all.length}）</a>
          ${types.map(t => `<a class="chip" href="#/similar?type=${encodeURIComponent(t)}">${esc(t)}（${all.filter(r => r.similarity_type === t).length}）</a>`).join("")}
        </div>
        ${rows.map(s => `
          <div class="sim-card">
            <div class="sim-pair">
              <div class="sim-q"><div class="q-head">${s.y1} ${esc(s.n1)}${s.sc1 != null ? "（" + s.sc1 + "分）" : ""}</div>
                <div class="q-text">${esc(s.kname1 || "")} ｜ ${esc(s.t1 || "")}</div>
                <a href="#/question/${s.id1}">题目详情 →</a></div>
              <div class="sim-vs">↔</div>
              <div class="sim-q"><div class="q-head">${s.y2} ${esc(s.n2)}${s.sc2 != null ? "（" + s.sc2 + "分）" : ""}</div>
                <div class="q-text">${esc(s.kname2 || "")} ｜ ${esc(s.t2 || "")}</div>
                <a href="#/question/${s.id2}">题目详情 →</a></div>
            </div>
            <div class="sim-meta"><span class="tag">${esc(s.similarity_type)}</span>
              相似度 ${num(s.similarity_score)} ｜ ${esc(s.explanation || "")}
              ｜ <a href="#/question/${s.id1}?compare=${s.id2}">对比详情 →</a></div>
          </div>`).join("")}
      </div>`;
  }

  // ---------------- 期末习题（不计权重） ----------------
  async function pageExercises() {
    const list = await API.get("/api/exercises");
    main.innerHTML = `
      <div class="page-head"><h1 class="page-title">期末习题补充</h1>
      <p class="page-sub">本科期末计算题 ${list.length} 张 ｜ 仅作练习补充，<b>不计入考频、分值权重与复习优先级</b></p></div>
      <div class="notice">说明：期末题与真题模板高度重合（如"回归+相关系数""变异系数比较代表性"），适合作为真题之外的加练材料；其对知识点定级的作用已沉淀在证据链中，本页不重复计算。</div>
      <div class="card">
        ${list.map(x => `
          <div class="q-card">
            <div class="q-head"><span class="q-num">${esc(x.display_name)}</span>
              <span class="tag">期末题</span>
              <span class="muted">关联证据 ${x.ev_count} 条</span></div>
            <div class="li-sub" style="margin-bottom:8px">
              ${x.topics.length ? x.topics.map(t => `<a class="tag" href="#/knowledge/${t.knowledge_id}" title="${esc(t.chapter_name)}">${esc(t.knowledge_name)}</a>`).join("") : '<span class="muted">暂无关联知识点</span>'}
            </div>
            <img class="src-img" src="/api/source/${x.source_id}" alt="${esc(x.display_name)}" loading="lazy" onclick="window.open(this.src)">
          </div>`).join("")}
      </div>`;
  }

  // ---------------- 复习优先级 ----------------
  async function pagePriority() {
    const p = await API.get("/api/priority");
    const sec = (title, note, rows) => `
      <div class="card"><div class="card-title">${title}</div><div class="card-note">${note}</div>
      ${rows && rows.length ? rows.map(k => `
        <div class="list-item"><span class="li-main"><a href="#/knowledge/${k.knowledge_id}">${pill(k.level)}${esc(k.knowledge_name)}</a></span>
        <span class="li-sub">真题${k.exam_count}次 ${k.exam_score ? "· " + k.exam_score + "分" : ""} ｜ 覆盖${k.year_count}年 ｜ 证据${k.evidence_count}条</span></div>`).join("")
        : '<div class="empty">暂无</div>'}
      </div>`;
    main.innerHTML = `
      <div class="page-head"><h1 class="page-title">复习优先级</h1>
      <p class="page-sub">基于资料库证据（真题+期末题+习题+笔记多源）的投入产出排序</p></div>
      <div class="notice">${esc(p.personal_note)} 掌握度分层（第一/二/三层）暂不可用，以下按资料库证据层级展示。</div>
      ${sec("第一优先级 · S 级知识点", "最高投入产出；个人掌握度数据接入后可再细分", p.levels.S)}
      ${sec("第二优先级 · A 级知识点", "重点掌握", p.levels.A)}
      <div class="card"><div class="card-title">第三优先级 · S/A 级长期未复习提醒</div>
        <div class="empty">需要个人学习数据（最近复习时间）才能计算，暂无数据，不伪造。</div></div>
      ${sec("第四优先级 · B 级重要知识点", "次重点，覆盖年数≥2 或证据充分", p.levels.B)}
      <div class="notice blue">S/A/B/C/D 表示基于现有资料的复习投入优先级，<b>不代表考试预测</b>。</div>`;
  }

  // ---------------- 我的学习 ----------------
  async function pageStudy() {
    const s = await API.get("/api/study");
    main.innerHTML = `
      <div class="page-head"><h1 class="page-title">我的学习</h1>
      <p class="page-sub">个人学习数据页（预留）</p></div>
      <div class="card"><div class="notice">${esc(s.message)}</div>
        <div class="card-title" style="font-size:14px">未来将支持（接口已预留）</div>
        <ul class="future-list">${s.future.map(f => `<li>${esc(f)}</li>`).join("")}</ul>
        <p style="margin-top:14px"><a class="chip" href="${esc(s.redirect)}">${esc(s.redirect_label)}</a></p>
      </div>`;
  }

  // ---------------- AI 学习 ----------------
  async function pageAi() {
    main.innerHTML = `
      <div class="page-head"><h1 class="page-title">AI 学习</h1>
      <p class="page-sub">AI 学习入口（接口已预留：POST /api/ai/chat）</p></div>
      <div class="card">
        <div class="ai-box">
          <textarea class="ai-input" id="ai-input" placeholder="例如：我今天有4小时，应该学习什么？"></textarea>
          <div class="ai-chips">
            ${["我今天有4小时，应该学习什么？", "教我一元线性回归方程", "分析我的这道错题", "给我出5道假设检验题"]
              .map(t => `<span class="chip" data-prompt="${esc(t)}">${esc(t)}</span>`).join("")}
          </div>
          <button id="ai-send" class="btn-primary" style="border-radius:8px;border:1px solid var(--accent);padding:9px 18px;font-size:14px;cursor:pointer;align-self:flex-start">发送</button>
          <div id="ai-out"></div>
        </div>
      </div>
      <div class="notice blue">说明：未配置任何 AI API 时不伪造回答；接口返回"尚未配置"。</div>`;
    const out = $("#ai-out");
    const send = async () => {
      const text = $("#ai-input").value.trim();
      out.innerHTML = '<div class="loading">请求中…</div>';
      const r = await API.post("/api/ai/chat", { message: text });
      out.innerHTML = `<div class="notice">${esc(r.message || (r.__httpError ? "AI 接口尚未配置（HTTP " + r.status + "）" : "未知响应"))}</div>`;
    };
    $("#ai-send").addEventListener("click", send);
    document.querySelectorAll("[data-prompt]").forEach(el =>
      el.addEventListener("click", () => { $("#ai-input").value = el.dataset.prompt; }));
  }

  // ---------------- 搜索 ----------------
  async function pageSearch(params) {
    const q = params.get("q") || "";
    const r = await API.get("/api/search?q=" + encodeURIComponent(q));
    const sec = (title, rows, render) => `
      <div class="card"><div class="card-title">${title}（${rows.length}）</div>
      ${rows.length ? rows.map(render).join("") : '<div class="empty">无结果</div>'}</div>`;
    main.innerHTML = `
      <div class="page-head"><h1 class="page-title">搜索：${esc(q)}</h1>
      <p class="page-sub">全局搜索（知识点 / 题目 / 章节 / 公式 / 文件）</p></div>
      ${sec("知识点", r.knowledge, k => `
        <div class="list-item"><span class="li-main"><a href="#/knowledge/${k.knowledge_id}">${pill(k.level)}${esc(k.knowledge_name)}</a></span>
        <span class="li-sub">${esc(k.chapter_name || "")}</span></div>`)}
      ${sec("题目", r.questions, q => `
        <div class="list-item"><span class="li-main"><a href="#/question/${q.question_id}">${num(q.year)} ${esc(q.question_number)}（${esc(q.question_type || "")}）</a></span>
        <span class="li-sub">${esc(String(q.question_text || "").slice(0, 60))}…</span></div>`)}
      ${sec("章节", r.chapters, c => `
        <div class="list-item"><span class="li-main"><a href="#/chapters/${c.chapter_id}">${esc(c.chapter_name)}</a></span></div>`)}
      ${sec("公式", r.formulas, f => `
        <div class="list-item"><span class="li-main">${esc(f.formula_name)}</span>
        <span class="li-sub"><code>${esc(f.formula_text)}</code>${f.applicable_conditions ? " ｜ " + esc(f.applicable_conditions) : ""}</span></div>`)}
      ${sec("文件", r.sources, s => `
        <div class="list-item"><span class="li-main">${esc(s.file_name)}</span>
        <span class="li-sub">${esc(s.source_type)}${s.year ? " ｜ " + s.year : ""} ｜ ${esc(s.file_path || "")}</span></div>`)}
      ${(r.knowledge.length + r.questions.length + r.chapters.length + r.formulas.length + r.sources.length) === 0
        ? '<div class="empty">没有找到相关内容，换个关键词试试</div>' : ""}`;
  }

  // ---------------- 路由 ----------------
  function parseHash() {
    const h = location.hash.slice(1) || "/";
    const idx = h.indexOf("?");
    const path = idx >= 0 ? h.slice(0, idx) : h;
    const params = new URLSearchParams(idx >= 0 ? h.slice(idx + 1) : "");
    return { path: path.replace(/\/+$/, "") || "/", params };
  }

  async function render() {
    const { path, params } = parseHash();
    setActiveNav(path);
    main.innerHTML = '<div class="loading">加载中…</div>';
    try {
      const seg = path.split("/").filter(Boolean);
      if (path === "/") await pageHome();
      else if (seg[0] === "knowledge" && seg[1]) await pageKnowledgeDetail(+seg[1]);
      else if (seg[0] === "knowledge") await pageKnowledge(params);
      else if (seg[0] === "chapters" && seg[1]) await pageChapterDetail(+seg[1]);
      else if (seg[0] === "chapters") await pageChapters();
      else if (seg[0] === "papers" && seg[1]) await pagePaperDetail(+seg[1]);
      else if (seg[0] === "papers") await pagePapers(params);
      else if (seg[0] === "exercises") await pageExercises();
      else if (seg[0] === "question" && seg[1]) await pageQuestion(+seg[1], params);
      else if (seg[0] === "similar") await pageSimilar(params);
      else if (seg[0] === "priority") await pagePriority();
      else if (seg[0] === "study") await pageStudy();
      else if (seg[0] === "ai") await pageAi();
      else if (seg[0] === "search") await pageSearch(params);
      else main.innerHTML = '<div class="empty">页面不存在：<code>' + esc(path) + '</code></div>';
    } catch (e) {
      main.innerHTML = errorCard(e);
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", render);
  document.getElementById("side-search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = document.getElementById("side-search-input").value.trim();
    if (v) location.hash = "#/search?q=" + encodeURIComponent(v);
  });

  loadDbMeta();
  render();
})();
