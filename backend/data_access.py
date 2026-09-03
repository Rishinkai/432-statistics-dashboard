# -*- coding: utf-8 -*-
"""432 统计学 Dashboard · 统一数据访问层
所有页面/接口的数据均从 SQLite 实时查询，禁止在此硬编码统计数字。"""
import sqlite3
import os
import json
import datetime

BASE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.normpath(os.path.join(BASE, ".."))
DB_PATH = os.environ.get(
    "DB_PATH",
    os.path.join(REPO_ROOT, "database", "exam_analysis.db"),
)

# 真题口径：只认 paper_type='考研真题'（不含本科期末题/习题集）
_EXAM_PAPERS = "SELECT paper_id FROM papers WHERE paper_type='考研真题'"
_EXAM = f"q.paper_id IN ({_EXAM_PAPERS})"


def get_conn():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def query(sql, args=()):
    con = get_conn()
    try:
        return [dict(r) for r in con.execute(sql, args).fetchall()]
    finally:
        con.close()


def query_one(sql, args=()):
    rs = query(sql, args)
    return rs[0] if rs else None


def db_mtime():
    return datetime.datetime.fromtimestamp(os.path.getmtime(DB_PATH)).strftime("%Y-%m-%d %H:%M")


# ---------------------------------------------------------------- 概览

def get_exam_stats():
    counts = {}
    for key, sql in [
        ("papers_total", "SELECT COUNT(*) AS v FROM papers"),
        ("papers_exam", "SELECT COUNT(*) AS v FROM papers WHERE paper_type='考研真题'"),
        ("questions_total", "SELECT COUNT(*) AS v FROM questions"),
        ("questions_exam", f"SELECT COUNT(*) AS v FROM questions q WHERE {_EXAM}"),
        ("knowledge_points", "SELECT COUNT(*) AS v FROM knowledge_points"),
        ("evidence", "SELECT COUNT(*) AS v FROM knowledge_evidence"),
        ("similar", "SELECT COUNT(*) AS v FROM similar_questions"),
        ("formulas", "SELECT COUNT(*) AS v FROM formulas"),
        ("sources", "SELECT COUNT(*) AS v FROM sources"),
    ]:
        counts[key] = query_one(sql)["v"]
    years = [r["year"] for r in query(
        "SELECT DISTINCT year FROM papers WHERE paper_type='考研真题' AND year IS NOT NULL ORDER BY year")]
    return {"db_mtime": db_mtime(), "db_path": DB_PATH, "counts": counts, "exam_years": years}


# ---------------------------------------------------------------- 章节

def get_chapter_stats():
    return query(f"""
        SELECT c.chapter_id, c.chapter_name,
               COUNT(q.question_id)                       AS q_count,
               COALESCE(SUM(q.score), 0)                  AS score_sum,
               COUNT(DISTINCT q.year)                      AS year_count,
               MAX(q.year)                                 AS last_year,
               SUM(CASE WHEN q.year >= 2024 THEN 1 ELSE 0 END) AS recent_count,
               GROUP_CONCAT(DISTINCT q.year)               AS year_list,
               (SELECT COUNT(*) FROM knowledge_points k JOIN knowledge_importance i USING(knowledge_id)
                 WHERE k.chapter_id = c.chapter_id AND i.final_level IN ('S','A')) AS sa_kp_count,
               (SELECT COUNT(*) FROM knowledge_points k WHERE k.chapter_id = c.chapter_id) AS kp_count
        FROM chapters c
        LEFT JOIN questions q ON q.chapter_id = c.chapter_id AND {_EXAM}
        GROUP BY c.chapter_id
        ORDER BY score_sum DESC, q_count DESC, c.chapter_id
    """)


def get_chapter_detail(chapter_id):
    info = query_one("""
        SELECT c.chapter_id, c.chapter_name,
               (SELECT COUNT(*) FROM knowledge_points k WHERE k.chapter_id = c.chapter_id) AS kp_count
        FROM chapters c WHERE c.chapter_id = ?""", (chapter_id,))
    if not info:
        return None
    info["questions"] = query(f"""
        SELECT q.question_id, q.year, q.question_number, q.question_type, q.score,
               q.question_text, q.difficulty, k.knowledge_name
        FROM questions q JOIN papers p USING(paper_id)
        LEFT JOIN knowledge_points k USING(knowledge_id)
        WHERE q.chapter_id = ? AND {_EXAM}
        ORDER BY q.year, q.question_id""", (chapter_id,))
    info["trend"] = query(f"""
        SELECT q.year, COUNT(*) AS cnt FROM questions q
        WHERE q.chapter_id = ? AND {_EXAM}
        GROUP BY q.year ORDER BY q.year""", (chapter_id,))
    info["knowledge"] = knowledge_rows("WHERE k.chapter_id = ?", (chapter_id,))
    return info


# ---------------------------------------------------------------- 知识点

def _kp_base_select():
    return f"""
        SELECT k.knowledge_id, k.knowledge_name, k.description,
               c.chapter_id, c.chapter_name,
               COALESCE(i.final_level, k.importance_level, 'C') AS level,
               i.rationale,
               (SELECT COUNT(*) FROM questions q WHERE q.knowledge_id = k.knowledge_id AND {_EXAM}) AS exam_count,
               (SELECT COALESCE(SUM(q.score), 0) FROM questions q
                 WHERE q.knowledge_id = k.knowledge_id AND q.score IS NOT NULL AND {_EXAM}) AS exam_score,
               (SELECT COUNT(DISTINCT q.year) FROM questions q WHERE q.knowledge_id = k.knowledge_id AND {_EXAM}) AS year_count,
               (SELECT MAX(q.year) FROM questions q WHERE q.knowledge_id = k.knowledge_id AND {_EXAM}) AS last_year,
               (SELECT GROUP_CONCAT(DISTINCT q.year) FROM questions q WHERE q.knowledge_id = k.knowledge_id AND {_EXAM}) AS year_list,
               (SELECT COUNT(*) FROM knowledge_evidence e WHERE e.knowledge_id = k.knowledge_id) AS evidence_count
        FROM knowledge_points k
        LEFT JOIN chapters c ON c.chapter_id = k.chapter_id
        LEFT JOIN knowledge_importance i ON i.knowledge_id = k.knowledge_id
    """


def knowledge_rows(where="WHERE 1=1", args=(), order=None, limit=None):
    sql = _kp_base_select() + where
    sql += " ORDER BY " + (order or "level ASC, exam_score DESC, exam_count DESC, year_count DESC")
    if limit:
        sql += f" LIMIT {int(limit)}"
    return query(sql, args)


def get_knowledge_list(level=None, chapter_id=None, q=None, sort="freq"):
    where, args = "WHERE 1=1", []
    if level:
        where += " AND COALESCE(i.final_level, k.importance_level, 'C') = ?"
        args.append(level)
    if chapter_id:
        where += " AND k.chapter_id = ?"
        args.append(int(chapter_id))
    if q:
        where += " AND (k.knowledge_name LIKE ? OR k.description LIKE ?)"
        args += [f"%{q}%", f"%{q}%"]
    order = {
        "freq": "year_count DESC, exam_score DESC, exam_count DESC",
        "score": "exam_score DESC, year_count DESC",
        "recent": "last_year DESC, year_count DESC",
        "name": "k.knowledge_name",
        "evidence": "evidence_count DESC",
    }.get(sort, "year_count DESC, exam_score DESC")
    return knowledge_rows(where, args, order)


def get_knowledge_detail(kid):
    info = knowledge_rows("WHERE k.knowledge_id = ?", (kid,))
    if not info:
        return None
    info = info[0]
    info["questions"] = query(f"""
        SELECT q.question_id, q.year, q.question_number, q.question_type, q.score,
               q.question_text, q.difficulty, q.method, p.paper_type
        FROM questions q JOIN papers p USING(paper_id)
        WHERE q.knowledge_id = ? AND {_EXAM}
        ORDER BY q.year, q.question_id""", (kid,))
    info["similar"] = query("""
        SELECT s.similarity_type, s.similarity_score, s.explanation,
               CASE WHEN s.question_id_1 = ? THEN s.question_id_2 ELSE s.question_id_1 END AS other_id
        FROM similar_questions s
        WHERE s.question_id_1 = ? OR s.question_id_2 = ?""", (kid, kid, kid))
    other_ids = [r["other_id"] for r in info["similar"]]
    if other_ids:
        ph = ",".join("?" * len(other_ids))
        qmap = {r["question_id"]: r for r in query(
            f"SELECT question_id, year, question_number, question_type FROM questions WHERE question_id IN ({ph})", other_ids)}
        for r in info["similar"]:
            o = qmap.get(r["other_id"])
            r["other_year"] = o["year"] if o else None
            r["other_number"] = o["question_number"] if o else "?"
    info["evidence"] = query("""
        SELECT e.year, e.page, e.source_type, e.evidence_description,
               s.file_name, s.file_path
        FROM knowledge_evidence e
        LEFT JOIN sources s ON s.source_id = e.source_id
        WHERE e.knowledge_id = ?
        ORDER BY e.year DESC, e.evidence_id DESC""", (kid,))
    info["formulas"] = query("""
        SELECT formula_id, formula_name, formula_text, applicable_conditions, key_point_flag
        FROM formulas WHERE knowledge_id = ? ORDER BY key_point_flag DESC""", (kid,))
    return info


# ---------------------------------------------------------------- 试卷与题目

def get_papers_list(ptype=None, has_score=None):
    where, args = "WHERE 1=1", []
    if ptype:
        where += " AND p.paper_type = ?"
        args.append(ptype)
    sql = f"""
        SELECT p.paper_id, p.year, p.paper_type, p.paper_name, p.total_score,
               p.recognition_status, p.notes,
               (SELECT COUNT(*) FROM questions q WHERE q.paper_id = p.paper_id) AS q_count,
               (SELECT COALESCE(SUM(q.score),0) FROM questions q WHERE q.paper_id = p.paper_id AND q.score IS NOT NULL) AS score_filled
        FROM papers p {where}
        ORDER BY (p.year IS NULL), p.year DESC, p.paper_id DESC"""
    rows = query(sql, args)
    for r in rows:
        r["score_complete"] = bool(r["score_filled"]) and r["total_score"] and r["score_filled"] >= r["total_score"]
        r["no_item_score"] = r["q_count"] > 0 and r["score_filled"] == 0
    if has_score is not None:
        rows = [r for r in rows if (r["score_filled"] > 0) == bool(has_score)]
    return rows


def get_paper_detail(pid):
    p = query_one("""
        SELECT p.*, (SELECT COUNT(*) FROM questions q WHERE q.paper_id = p.paper_id) AS q_count
        FROM papers p WHERE p.paper_id = ?""", (pid,))
    if not p:
        return None
    p["questions"] = query("""
        SELECT q.question_id, q.year, q.question_number, q.question_type, q.score,
               q.question_text, q.difficulty, q.source_file, q.source_page,
               k.knowledge_id, k.knowledge_name, c.chapter_name
        FROM questions q
        LEFT JOIN knowledge_points k ON k.knowledge_id = q.knowledge_id
        LEFT JOIN chapters c ON c.chapter_id = q.chapter_id
        WHERE q.paper_id = ?
        ORDER BY q.question_id""", (pid,))
    return p


def get_question_detail(qid):
    q = query_one("""
        SELECT q.*, p.year AS paper_year, p.paper_name, p.paper_type,
               k.knowledge_id, k.knowledge_name, c.chapter_name
        FROM questions q
        JOIN papers p USING(paper_id)
        LEFT JOIN knowledge_points k ON k.knowledge_id = q.knowledge_id
        LEFT JOIN chapters c ON c.chapter_id = q.chapter_id
        WHERE q.question_id = ?""", (qid,))
    return q


def get_similar_relation(id1, id2):
    a, b = min(id1, id2), max(id1, id2)
    return query_one(
        "SELECT similarity_type, similarity_score, explanation FROM similar_questions WHERE question_id_1 = ? AND question_id_2 = ?",
        (a, b))


# ---------------------------------------------------------------- 相似题

def get_similar_list(limit=None, similarity_type=None):
    where, args = "WHERE 1=1", []
    if similarity_type:
        where += " AND s.similarity_type = ?"
        args.append(similarity_type)
    sql = f"""
        SELECT s.relation_id, s.similarity_type, s.similarity_score, s.explanation,
               a.question_id AS id1, a.year AS y1, a.question_number AS n1, a.question_type AS t1, a.score AS sc1,
               b.question_id AS id2, b.year AS y2, b.question_number AS n2, b.question_type AS t2, b.score AS sc2,
               ka.knowledge_name AS kname1, kb.knowledge_name AS kname2
        FROM similar_questions s
        JOIN questions a ON a.question_id = s.question_id_1
        JOIN questions b ON b.question_id = s.question_id_2
        LEFT JOIN knowledge_points ka ON ka.knowledge_id = a.knowledge_id
        LEFT JOIN knowledge_points kb ON kb.knowledge_id = b.knowledge_id
        {where}
        ORDER BY s.similarity_score DESC, s.relation_id"""
    if limit:
        sql += f" LIMIT {int(limit)}"
    return query(sql, args)


# ---------------------------------------------------------------- 优先级 / 学习 / AI

def get_priority():
    """个人学习数据表（student_knowledge 等）尚未建立时，仅按资料库证据分层。"""
    levels = {}
    for lv in ("S", "A", "B", "C", "D"):
        rows = knowledge_rows("WHERE COALESCE(i.final_level, k.importance_level, 'C') = ?", (lv,),
                              order="exam_score DESC, exam_count DESC, year_count DESC")
        if rows:
            levels[lv] = rows
    return {
        "personal_enabled": False,
        "personal_note": "个人学习数据尚未建立：数据库中不存在 student_knowledge / study_sessions / practice_records 表。",
        "levels": levels,
    }


def get_study():
    return {
        "enabled": False,
        "message": "学习记录功能尚未启用（数据库暂无个人学习表）。",
        "future": ["student_knowledge（知识点掌握度）", "study_sessions（学习时长）",
                   "practice_records（做题记录与正确率）", "错题本", "自动学习计划", "复习提醒"],
        "redirect": "#/priority",
        "redirect_label": "先去复习优先级页，从 S 级知识点开始",
    }


def ai_chat_unavailable():
    return {
        "configured": False,
        "message": "AI 接口尚未配置。前端与接口结构已预留（POST /api/ai/chat），配置真实模型 API 后即可启用。",
    }


# ---------------------------------------------------------------- 搜索

def search_all(q):
    like = f"%{q}%"
    return {
        "query": q,
        "knowledge": query(f"""
            SELECT k.knowledge_id, k.knowledge_name, c.chapter_name,
                   COALESCE(i.final_level, k.importance_level, 'C') AS level
            FROM knowledge_points k LEFT JOIN chapters c USING(chapter_id)
            LEFT JOIN knowledge_importance i USING(knowledge_id)
            WHERE k.knowledge_name LIKE ? OR k.description LIKE ?
            ORDER BY level, k.knowledge_name LIMIT 30""", (like, like)),
        "questions": query("""
            SELECT q.question_id, q.year, q.question_number, q.question_type, q.score,
                   q.question_text, p.paper_type
            FROM questions q JOIN papers p USING(paper_id)
            WHERE q.question_text LIKE ? OR q.method LIKE ?
            ORDER BY q.year DESC LIMIT 30""", (like, like)),
        "chapters": query("SELECT chapter_id, chapter_name FROM chapters WHERE chapter_name LIKE ? LIMIT 20", (like,)),
        "formulas": query("""
            SELECT formula_id, formula_name, formula_text, applicable_conditions
            FROM formulas WHERE formula_name LIKE ? OR formula_text LIKE ? LIMIT 20""", (like, like)),
        "sources": query("""
            SELECT source_id, file_name, file_path, source_type, year
            FROM sources WHERE file_name LIKE ? OR title LIKE ? LIMIT 20""", (like, like)),
    }


# ---------------------------------------------------------------- 章节选项（筛选用）

def get_chapter_options():
    return query("SELECT chapter_id, chapter_name FROM chapters ORDER BY chapter_id")


def get_paper_types():
    return query("SELECT DISTINCT paper_type FROM papers ORDER BY paper_type")


# ---------------------------------------------------------------- 原题图片定位

_IMG_EXT = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif")


def _parse_pages(spec):
    """source_page 形如 '5' 或 '5-6'，返回页码列表"""
    if spec is None:
        return []
    s = str(spec).strip()
    if not s:
        return []
    try:
        if "-" in s:
            a, b = s.split("-", 1)
            return list(range(int(a), int(b) + 1))
        return [int(float(s))]
    except ValueError:
        return []


def _locate_source(file_path):
    r = query_one("SELECT source_id, file_path FROM sources WHERE file_path = ?", (file_path,))
    if r:
        return r["source_id"]
    # 回退：按文件名匹配
    base = os.path.basename(file_path)
    r = query_one("SELECT source_id FROM sources WHERE file_name = ?", (base,))
    return r["source_id"] if r else None


def get_question_pages(qid):
    """题目 → 原题所在文件与页码（供前端拼 /api/source/<sid>?page=N）"""
    q = query_one("SELECT source_file, source_page FROM questions WHERE question_id = ?", (qid,))
    if not q or not q["source_file"]:
        return {"kind": "none"}
    f = q["source_file"]
    sid = _locate_source(f)
    if sid is None:
        return {"kind": "none", "file": f}
    if f.lower().endswith(_IMG_EXT):
        return {"kind": "image", "source_id": sid, "file": f, "pages": [1]}
    if f.lower().endswith(".pdf"):
        pages = _parse_pages(q["source_page"])
        return {"kind": "pdf", "source_id": sid, "file": f, "pages": pages}
    return {"kind": "none", "file": f}


def get_paper_pages(pid):
    """试卷 → 原卷页码范围（取该卷全部题目所在页的并集）"""
    p = query_one("SELECT source_file, page_count FROM papers WHERE paper_id = ?", (pid,))
    if not p or not p["source_file"]:
        return {"kind": "none"}
    f = p["source_file"]
    sid = _locate_source(f)
    if sid is None:
        return {"kind": "none", "file": f}
    if f.lower().endswith(_IMG_EXT):
        return {"kind": "image", "source_id": sid, "file": f, "pages": [1]}
    if f.lower().endswith(".pdf"):
        rows = query("""SELECT DISTINCT source_page FROM questions
            WHERE paper_id = ? AND source_page IS NOT NULL ORDER BY source_page""", (pid,))
        pages = [r["source_page"] for r in rows]
        return {"kind": "pdf", "source_id": sid, "file": f, "pages": pages}
    return {"kind": "none", "file": f}


# ---------------------------------------------------------------- 期末习题（不计权重）

_EX_MAP_CACHE = None


def _exercise_map():
    global _EX_MAP_CACHE
    if _EX_MAP_CACHE is None:
        try:
            with open(os.path.join(BASE, "exercise_map.json"), encoding="utf-8") as f:
                _EX_MAP_CACHE = json.load(f)
        except Exception:
            _EX_MAP_CACHE = {}
    return _EX_MAP_CACHE


def get_exercises():
    """本科期末计算题 22 张：仅作习题补充展示，不参与考频/权重/优先级统计。"""
    m = _exercise_map()
    rows = query("""
        SELECT s.source_id, s.file_path, s.title, s.notes,
               (SELECT COUNT(*) FROM knowledge_evidence e WHERE e.source_id = s.source_id) AS ev_count
        FROM sources s
        WHERE s.source_type = '本科期末题' AND s.file_path LIKE '%.jpg'
        ORDER BY s.source_id""")
    for r in rows:
        r["display_name"] = m.get(str(r["source_id"])) or os.path.basename(r["file_path"])
        r["topics"] = query("""
            SELECT DISTINCT k.knowledge_id, k.knowledge_name, COALESCE(c.chapter_name, '') AS chapter_name
            FROM knowledge_evidence e
            JOIN knowledge_points k USING(knowledge_id)
            LEFT JOIN chapters c USING(chapter_id)
            WHERE e.source_id = ?
            ORDER BY k.knowledge_name""", (r["source_id"],))
    return rows
