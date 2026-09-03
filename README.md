# 432 统计学学习驾驶舱（Dashboard）

> 一个**本机自用**的考研统计学复习系统：SQLite 存放 11 年真题结构化数据（吉林财经大学 432 统计学），Flask 只读查库，前端原生 HTML/CSS/JS 展示命题规律、复习优先级、原题图片与期末习题。
>
> 本 README 面向**部署者（含 AI 助手）**，按顺序读完即可完整部署与二次开发。

---

## 1. 项目简介

- **用途**：分析目标院校 2015–2026 年考研真题（11 年，缺 2020）的知识点考频、章节分值分布、跨年相似题，为复习排优先级；并直接查看原题扫描图与期末计算题照片。
- **数据现状**：604 条证据、92 个知识点、37 条公式、124 道结构化真题题目、51 组跨年相似题、22 张期末计算题。
- **设计原则**：
  1. **数据库是唯一事实来源**——所有页面数字实时查询 SQLite，前端零硬编码；
  2. **只读**——本系统对数据库零写入；
  3. **不伪造**——个人学习数据/AI 回答尚未接入时如实显示"暂无数据"，不编造。

## 2. 快速部署

### 2.1 环境要求

- Python 3.10+（开发环境为 3.12.5）
- 依赖仅 3 个：`flask`、`pypdfium2`（PDF 按页渲染）、`pillow`

### 2.2 启动步骤

```bash
cd 本仓库根目录
pip install -r requirements.txt
python backend/app.py
# 浏览器打开 http://localhost:3000
```

Windows 用户可直接双击 `启动Dashboard.bat`（内部即上述两条命令）。

**服务绑定 `127.0.0.1:3000`，仅本机可访问**（刻意设计，无任何公网/远程/登录功能）。端口可用环境变量 `PORT` 覆盖。

### 2.3 可配置项（均有合理默认值）

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `DB_PATH` | `<仓库根>/database/exam_analysis.db` | SQLite 数据库路径 |
| `MATERIALS_DIR` | `<仓库根>/materials` | 原始素材根目录（见 §4） |
| `PORT` | `3000` | 监听端口 |

### 2.4 验证部署是否成功

1. `http://localhost:3000/api/overview` 返回 JSON，`counts.papers_exam` 应为 **11**；
2. 首页"数据库概览"卡片显示 11 套真题 / 96 道真题题目 / 604 条证据；
3. 打开任一 2015–2018 真题题目详情，"原题图片"卡片能显示 PDF 渲染页（首次访问会渲染并缓存，稍慢属正常）；
4. 左侧导航"期末习题"页能显示 22 张照片。

## 3. 目录结构

```
├── index.html                 # 前端入口（Hash 路由单页应用）
├── css/style.css               # 样式（响应式，PC侧边栏/手机底部导航）
├── js/api.js                   # fetch 封装
├── js/app.js                   # 全部页面渲染逻辑（路由表在文件末尾 render()）
├── backend/
│   ├── app.py                  # Flask：REST API + 静态托管 + 图片服务
│   ├── data_access.py          # 统一数据访问层（所有 SQL 集中在此）
│   ├── exercise_map.json       # 期末题 source_id → 语义文件名 映射
│   └── page_cache/             # PDF 渲染缓存（运行时生成，已 gitignore）
├── database/
│   └── exam_analysis.db        # SQLite 数据库（唯一事实来源）
├── materials/                  # 图片功能引用的原始素材（31 个文件，134MB）
├── docs/
│   └── AI使用指南.md            # 数据库字段级文档 + 写入流程 + 禁止事项
├── 启动Dashboard.bat           # Windows 一键启动
├── requirements.txt
└── README.md                   # 本文件
```

## 4. 素材目录说明（重要）

数据库 `sources.file_path` 存的是**相对 `materials/` 的路径**（历史原因，形如 `新建文件夹/吉林财经全部资料/2023真题回忆版.jpg`、`期末考试计算题（重要）/IMG_xxx.jpg`）。**路径原样保留、未做清洗**，因此：

- 图片服务 = `MATERIALS_DIR + sources.file_path` 拼接；
- 只要素材放在 `materials/` 下且与 DB 路径一致，图片功能即可用；
- 若你手里只有数据库没有素材，系统其余功能（全部统计、考频、优先级）**不受影响**，仅图片显示"原始文件不存在"。

仓库只收录了图片功能**实际引用**的 31 个文件（约 134MB）：2015–2018 真题合并 PDF、2019/2021–2026 回忆版图片/PDF、22 张期末计算题照片。其余 25 个资料源（笔记 PDF 231MB、思维导图、习题集 docx 等）**未收录**——它们只有证据记录（页码级引用），不出图。

## 5. 数据库核心口径（部署者必读）

完整字段级文档见 `docs/AI使用指南.md`，此处为最关键约定：

1. **真题口径**：统计"考研真题"一律过滤 `papers.paper_type='考研真题'`（13 套卷中有 11 套是考研真题，其余是本科期末题/习题集，不计入考频权重）。
2. **分值口径**：2015–2023 录入分值；**2024–2026 回忆版未列分值，`questions.score` 为 NULL**——做分值统计必须处理 NULL，前端显示"—"。
3. **知识点定级**：`knowledge_importance.final_level`（S/A/B/C/D）由 `fill_importance.py` 脚本按"真题年数×分值×多源证据"计算，是**复习投入优先级，不是考试预测**（前端页面已注明）。
4. **已知坑**：`questions.question_type` 的 CHECK 约束因历史重建实际未生效；`similar_questions` 强制小 ID 在前（`question_id_1 < question_id_2`）。
5. **数据边界**（如实展示，勿自动补全）：缺 2020 真题；2022 卷缺 30 分内容；2026 资料分析题内容缺失。

## 6. API 一览（全部 GET，除 AI 外无副作用）

| 端点 | 用途 |
|---|---|
| `/api/overview` | 总览计数 + 真题年份列表 |
| `/api/chapters[/<id>]` | 章节统计 / 章节详情（含趋势、题目） |
| `/api/knowledge[/<id>]` | 知识点列表（支持 `level/chapter/q/sort` 参数）/ 详情（真题、相似题、证据、公式） |
| `/api/papers[/<id>]` | 试卷列表（`type/has_score` 筛选）/ 试卷详情 |
| `/api/questions/<id>[?compare=<id>]` | 题目详情，可带双题对比 |
| `/api/questions/<id>/pages` · `/api/papers/<id>/pages` | 原题所在文件与页码定位 |
| `/api/source/<sid>?page=N` | 图片服务：jpg/png 直出，PDF 按页渲染 PNG（pypdfium2，缓存于 page_cache） |
| `/api/similar[?type=]` | 跨年相似题 51 组 |
| `/api/exercises` | 期末习题 22 张（**不计权重**，仅补充练习） |
| `/api/priority` | S/A/B/C/D 分层（个人掌握度未接入，如实说明） |
| `/api/search?q=` | 全局搜索（知识点/题目/章节/公式/文件） |
| `/api/study` · `POST /api/ai/chat` | 预留接口：前者"学习记录未启用"，后者返回 501"AI 未配置" |

## 7. 页面功能对照

| 页面（Hash 路由） | 功能 |
|---|---|
| `#/` 首页 | 概览卡片、章节优先级条形图、S/A 级知识点、Top10 高频、高相似真题 |
| `#/knowledge` | 知识点检索（章节/等级/排序/搜索） |
| `#/knowledge/<id>` | 详情：真题统计、历年真题、**证据全表（可追溯为什么重要）**、公式 |
| `#/chapters[/<id>]` | 章节分析、考频趋势 |
| `#/papers[/<id>]` | 试卷列表/详情 + **原卷图片** |
| `#/question/<id>` | 题目详情 + **原题图片** + `?compare=` 双题并排对比 |
| `#/exercises` | 期末习题 22 张（明确标注不计入考频/权重/优先级） |
| `#/similar` | 重复考点（按类型筛选） |
| `#/priority` | S/A/B/C/D 复习优先级 |
| `#/study` · `#/ai` | 预留页（如实显示"未启用/未配置"） |

## 8. 二次开发指南

- **改数据查询**：只动 `backend/data_access.py`（所有 SQL 集中于此），API 层 `app.py` 与前端不重复写 SQL。
- **改页面**：`js/app.js` 中每个 `pageXxx()` 函数对应一个路由，模板为 JS 模板字符串。
- **接入个人学习数据**（最有价值的扩展）：建 `student_knowledge`（掌握度）、`practice_records`（做题记录）等表后，在 `data_access.py` 的 `get_study()/get_priority()` 填充查询，前端 `#/study`、`#/priority` 结构已预留。
- **接入 AI**：实现 `POST /api/ai/chat`（当前返回 501 占位），前端 `#/ai` 页输入框已就绪。
- **补录新真题**（如 2027 回忆版）：流程见 `docs/AI使用指南.md` §7——登记 sources → 建 papers/questions/knowledge_evidence/similar_questions → 重跑定级。**新素材记得放入 `materials/` 对应路径。**

## 9. 已知限制

- 仅本机使用，无登录/多用户/公网能力（刻意设计）；
- 个人学习功能未实现（数据库无对应表，页面如实标注）；
- AI 功能未配置（接口 501 占位）；
- PDF 渲染为懒加载，首次打开某页需 1–2 秒（之后走缓存）；
- 期末题 22 张原图共 96MB，未压缩（保留原始清晰度，可自行压缩替换 `materials/` 内同名文件）。

---

**数据边界重申**：缺 2020 年真题；2024–2026 分值未录；S/A/B/C/D 是复习优先级而非考试预测。做任何基于本数据的结论时，请先读 `docs/AI使用指南.md`。
