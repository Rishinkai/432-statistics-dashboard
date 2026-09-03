# 432 统计学 AI 研究系统 · 数据库使用指南（AI 专用）

> 本文档供 AI 助手（你）直接使用。目标：让你在不了解项目历史的情况下，安全、准确地查询和扩展这个数据库。
> 最后校准：2026-09-03（STEP 17，含 2023–2026 真题补录后全量核对）

***

## 1. 数据库定位

- **文件**：`c:\caida\432统计学_AI研究系统\06_数据库\exam_analysis.db`（SQLite 单文件）

- **用途**：吉林财经大学 432 统计学考研资料的"知识点-证据"库。已把 56 个原始文件（11 年真题、22 张期末题照片、学校复习资料、习题集、49 页笔记等）识别、结构化为可查询数据。

- **规模**：13 试卷 ｜ 124 题目 ｜ 12 章节 ｜ 92 知识点 ｜ 604 证据 ｜ 51 相似题关系 ｜ 37 公式 ｜ 56 资料源

- **原始文件**：仍在 `c:\caida` 原位置（`新建文件夹\`、`吉财期末考试题\`、`统计学整理\`），另有语义化副本在 `432统计学_AI研究系统\01~03` 分类目录。**数据库中的** **`file_path`** **指原始路径**。

### 连接方式

```python
import sqlite3
con = sqlite3.connect(r"c:\caida\432统计学_AI研究系统\06_数据库\exam_analysis.db")
con.row_factory = sqlite3.Row  # 需要按列名取值时必须设置
```

只读查询无需备份。**任何写入操作前，先备份数据库到** **`06_数据库\backups\`**（命名如 `exam_analysis_before_<操作名>_<日期>.db`）。

***

## 2. 概念模型（表关系）

```
sources (56个原始文件)
   └─< question_sources >─┐                          papers (13套试卷)
                          │                            └─< questions (124道题)
knowledge_evidence (604条证据) ──> knowledge_points (92知识点) ──> chapters (12章)
                          │              │
formulas (37条公式) ──────┘              └─< knowledge_importance (S/A/B/C定级)

similar_questions：questions 之间的跨年相似关系（51组）
```

核心思想：**每个"某知识点在某份资料某页/某年真题出现过"的事实 = 一条 knowledge\_evidence**。所有考频、定级、复习优先级结论都从该表派生。

***

## 3. 表结构速查（实测字段与约束）

### papers（试卷）

| 字段                                                      | 类型            | 说明                                                                |
| ------------------------------------------------------- | ------------- | ----------------------------------------------------------------- |
| paper\_id                                               | INTEGER PK    | <br />                                                            |
| year                                                    | INTEGER       | 考试年份；习题集/论述答案类为 NULL                                              |
| paper\_type                                             | TEXT          | **CHECK 生效**：`考研真题/本科期末题/模拟题/其他`。存量：考研真题 11 套 + 其他 2 套（习题集、论述题答案） |
| paper\_name / source\_file / total\_score / page\_count | TEXT/REAL/INT | <br />                                                            |
| recognition\_status                                     | TEXT          | **CHECK 生效**：`待处理/处理中/已完成/部分完成/无法识别`。⚠️ "已识别"是非法值，会报错             |
| notes                                                   | TEXT          | <br />                                                            |

### questions（题目）

| 字段                                  | 类型                | 说明                                               |
| ----------------------------------- | ----------------- | ------------------------------------------------ |
| question\_id                        | INTEGER PK        | <br />                                           |
| paper\_id                           | INTEGER FK→papers | NOT NULL                                         |
| year                                | INTEGER           | 与试卷年份一致                                          |
| question\_number                    | TEXT              | 如 `'一、1'` 或 `'5'`，非纯数字                           |
| question\_type                      | TEXT              | 见下方"枚举坑"                                         |
| score                               | REAL              | **2024–2026 回忆版全部为 NULL**（原资料未列分值）；2015–2023 有分值 |
| question\_text                      | TEXT              | 题干原文（回忆版为回忆文本）                                   |
| chapter\_id / knowledge\_id         | INTEGER FK        | 知识点为**主考点**；辅考点通过 knowledge\_evidence 挂接         |
| method                              | TEXT              | 解题方法摘要（如"大样本→Z统计量"）                              |
| difficulty                          | INTEGER           | 1–5                                              |
| recognition\_confidence             | REAL              | 0–1；2024/2025 材料分析题为 0.5–0.6（回忆者未记内容）            |
| source\_file / source\_page / notes | <br />            | notes 常存题型判定依据                                   |

**⚠️ 枚举坑（实测）**：建表语句中 question\_type 的 CHECK 约束**实际未生效**（历史表重建遗留，已实测：任意字符串可插入；`PRAGMA integrity_check` 为 ok）。**插入时请自律使用存量规范值**：`填空/选择/简答/计算/分析/论述/资料解读`。不要使用"名词解释""综合"等（存量无）。2024 回忆版的"名词解释"题已归入"简答"并在 notes 标注。

### knowledge\_points（知识点）

| 字段                    | 说明                                                                     |
| --------------------- | ---------------------------------------------------------------------- |
| knowledge\_id         | PK                                                                     |
| chapter\_id           | FK→chapters                                                            |
| knowledge\_name       | 全库唯一语义名，如 `一元线性回归方程`、`变异系数（标准差系数）`。**挂接前先按名称模糊查重**                     |
| parent\_knowledge\_id | 自引用，基本未用                                                               |
| importance\_level     | CHECK：S/A/B/C/D/NULL。为**初判值**，最终定级看 knowledge\_importance.final\_level |

### knowledge\_evidence（证据，核心表）

| 字段                    | 说明                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------- |
| evidence\_id          | PK                                                                                 |
| knowledge\_id         | FK→knowledge\_points，NOT NULL                                                      |
| source\_type          | **CHECK 生效**：`考研真题/考研真题答案/本科期末题/学校复习资料/章节习题/教材/二手分析资料/其他`。注意比 sources 表多一个"二手分析资料" |
| source\_id            | →sources.source\_id（未建 FK 约束，但语义对应）                                                |
| year                  | 带年份证据填年份；无年份（如笔记页）为 NULL                                                           |
| question\_id          | 关联题目（若证据来自试卷题目）                                                                    |
| page                  | 原文件页码                                                                              |
| evidence\_description | 证据描述，格式惯例 `2023一、5 求相关系数、建立回归方程（20分）`                                              |

### sources（资料源）

| 字段                          | 说明                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| source\_id                  | PK                                                                                                |
| file\_name / file\_path     | file\_path 相对 `c:\caida`，**UNIQUE**（重复登记会报错）                                                      |
| source\_type                | **CHECK 生效**：`考研真题/考研真题答案/本科期末题/学校复习资料/章节习题/教材/其他`。⚠️ **无"二手分析资料"**（该值只允许出现在 knowledge\_evidence） |
| year / page / title / notes | notes 存扫描状态、页数、重复说明                                                                               |

### similar\_questions（跨年相似题）

| 字段                               | 说明                                                             |
| -------------------------------- | -------------------------------------------------------------- |
| question\_id\_1, question\_id\_2 | **CHECK 强制** **`question_id_1 < question_id_2`**，插入前必须小 ID 在前  |
| similarity\_type                 | **CHECK 生效**：`原题重复/数值变化/题干变化/方法相同/知识点相同/高度相似`。⚠️ "同题型""相似"是非法值 |
| similarity\_score                | 0–1                                                            |
| explanation                      | 相似依据                                                           |

### knowledge\_importance（定级，派生表）

- 由脚本 `08_脚本\fill_importance.py` **全量重算生成**（DELETE 后重插）。

- **不要手工 UPDATE 本表——重跑脚本会覆盖你的修改**；要改定级请改脚本规则。

- `final_level`：S/A/B/C/D；`rationale`：可追溯定级依据。

- 当前定级逻辑（2026-09-03 版）：`ys>=5 且 sc>=100 → S`；`(ys>=3 且 ec>=1) 或 sc>=45 → A`；`ys>=2 或 ev_all>=10 → B`；否则 C。其中 ys=带年份证据的覆盖年数，sc=真题累计分，ec=真题主考次数。

### formulas（公式）

| 字段                                                        | 说明                                        |
| --------------------------------------------------------- | ----------------------------------------- |
| formula\_name / formula\_text                             | 名称与表达式（text 为 Unicode 混排，如 `Vσ = σ / x̄`） |
| key\_point\_flag                                          | 1=必背关键公式                                  |
| knowledge\_id / chapter\_id / source\_file / source\_page | 可追溯定位                                     |
| applicable\_conditions                                    | 适用条件（如"大样本、总体方差未知"）                       |

### chapters（章节）

- `chapter_name` 唯一：统计学导论、统计调查与整理、综合指标、时间序列分析、统计指数、抽样与参数估计、假设检验、方差分析、非参数统计、相关与回归分析、统计综合应用、统计图示（序号非教材章号）。

***

## 4. 立即可用的查询模板

```sql
-- Q1 查某知识点的全部证据（哪年考过、哪份资料哪页讲过）
SELECT e.year, e.page, e.evidence_description, s.source_type, s.file_path
FROM knowledge_evidence e
JOIN knowledge_points k ON k.knowledge_id = e.knowledge_id
LEFT JOIN sources s ON s.source_id = e.source_id
WHERE k.knowledge_name LIKE '%回归%'
ORDER BY e.year;

-- Q2 S/A 级知识点清单（复习优先级）
SELECT k.knowledge_name, i.final_level, i.exam_count, i.exam_score_sum, i.rationale
FROM knowledge_importance i JOIN knowledge_points k USING(knowledge_id)
WHERE i.final_level IN ('S','A')
ORDER BY CASE i.final_level WHEN 'S' THEN 0 ELSE 1 END, i.exam_score_sum DESC;

-- Q3 按章节抽题自测（真题口径）
SELECT q.year, q.question_number, q.question_type, q.score, q.question_text, q.method
FROM questions q JOIN papers p USING(paper_id)
WHERE p.paper_type = '考研真题' AND q.chapter_id = 8
ORDER BY q.year, q.question_number;

-- Q4 跨年相似题（重复命题模板）
SELECT a.year||a.question_number AS 题1, b.year||b.question_number AS 题2,
       s.similarity_type, s.explanation
FROM similar_questions s
JOIN questions a ON a.question_id = s.question_id_1
JOIN questions b ON b.question_id = s.question_id_2
ORDER BY s.similarity_type, 题1;

-- Q5 公式速查
SELECT f.formula_name, f.formula_text, f.applicable_conditions, f.key_point_flag
FROM formulas f JOIN knowledge_points k USING(knowledge_id)
WHERE k.knowledge_name LIKE '%检验%' ORDER BY f.key_point_flag DESC;

-- Q6 某年真题全套
SELECT q.question_number, q.question_type, q.score, q.question_text
FROM questions q JOIN papers p USING(paper_id)
WHERE p.year = 2023 ORDER BY q.question_id;
```

**"真题口径"过滤条件**：`paper_type='考研真题'`（11 套，2015–2019、2021–2026，缺 2020）。不要用 `year IS NOT NULL` 替代（会把习题集/论述答案卷算进来）。

***

## 5. 数据边界（引用结论前必读）

1. **缺 2020 真题**；2022 缺 30 分内容；2026 资料分析题内容缺失（仅确认存在）。覆盖 11/12 年。
2. **回忆版质量分级**：2019/2021/2023 题+分值完整 ≈ 正式卷；2022 八成；2024/2025 材料分析题仅记答题策略（confidence 0.5–0.6）；2024–2026 全部无分值。
3. **分值口径**：所有涉及分值的统计只算 2015–2023（合计 1170 分）；次数/覆盖年数按全部 11 年。
4. **方差分析、非参数统计**：11 年 0 真题证据 → 只能说"历史未考"，不能说"不考"。
5. 抽样与参数估计 2019 后真题未再出现，但期末题/习题证据充分，用户问"考不考"时不要建议放弃。
6. S/A 定级含义是**复习投入产出比**，不是"今年必考"。

***

## 6. 写入流程（新增资料时）

**场景 A：新增一套真题（回忆版/正式版）**

1. 备份数据库 → `06_数据库\backups\`
2. 图片/PDF 复制到 `c:\caida\新建文件夹\吉林财经全部资料\`（原文件区），路径写相对形式 `新建文件夹/吉林财经全部资料/<文件名>`
3. `INSERT sources`（file\_path 唯一，source\_type='考研真题'）
4. `INSERT papers`（recognition\_status='已完成'）
5. 逐题 `INSERT questions`（题干、题型用规范枚举、分值无则 NULL）+ `INSERT question_sources`
6. 每题挂 knowledge\_evidence：主考点 + 辅考点各一条（source\_type='考研真题'，year 填考试年）
7. 跨年相似题：查同知识点历史题，`INSERT similar_questions`（小 ID 在前，type 用合法枚举）
8. 重跑 `python 08_脚本\fill_importance.py` 刷新定级
9. 在 `05_AI分析结果\logs\processing_log.md` 顶部追加一条 STEP 记录
10. 若新知识点不存在：先 `INSERT knowledge_points`（挂对 chapter\_id，先查重避免近似名重复建点）

**场景 B：新增其他资料**：同上，但 source\_type 按实际（sources 表合法值），回忆版之外的资料通常只产生 knowledge\_evidence（无 questions）。

**参考脚本**：`08_脚本\batch11_2023.py`（单年真题完整示例）、`batch12_242526.py`（多年批量）。

***

## 7. 禁止事项

- ❌ 不要移动/重命名/删除 `c:\caida` 原位置的原始文件（数据库 file\_path 依赖）

- ❌ 不要手工 UPDATE `knowledge_importance`（会被脚本覆盖）

- ❌ 不要删除任何 evidence/questions/papers 记录（全部有日志追溯价值）

- ❌ 写入不要跳过备份

- ❌ 插入 sources 时不要用"二手分析资料"类型（CHECK 会拦）

- ❌ 不要凭空生成 evidence\_description —— 必须来自对原始文件的识别

***

## 8. 项目周边文件（需要更多上下文时）

| 文件                                                     | 内容                             |
| ------------------------------------------------------ | ------------------------------ |
| `05_AI分析结果\reports\00_资料清单.md`                         | 56 个原始文件明细                     |
| `05_AI分析结果\reports\02_章节考频分析.md`                       | 11 年章节考频（人读版）                  |
| `05_AI分析结果\reports\03_知识点考频分析.md`                      | 知识点 TOP30 / S-A 定级（人读版）        |
| `05_AI分析结果\reports\04_usage-guide\04_usage-guide.html` | 面向考生的系统使用指南                    |
| `05_AI分析结果\logs\processing_log.md`                     | 全部 17 个 STEP 的处理台账（含每次批次的识别细节） |
| `08_脚本\`                                               | 历史批次脚本与取数脚本，可直接改造复用            |

