# -*- coding: utf-8 -*-
"""432 统计学学习驾驶舱 · Flask 后端
只读取 SQLite，不写库。前端静态文件由本服务一并托管。"""
import os
import sqlite3

import pypdfium2 as pdfium
from flask import Flask, jsonify, request, send_from_directory, send_file, abort

import data_access as da

BASE = os.path.dirname(os.path.abspath(__file__))
FRONTEND_ROOT = os.path.normpath(os.path.join(BASE, ".."))
PAGE_CACHE = os.path.join(BASE, "page_cache")
# 素材根目录：数据库 sources.file_path 均为相对该根的路径（如 新建文件夹/...）
MATERIALS_DIR = os.environ.get("MATERIALS_DIR", os.path.join(FRONTEND_ROOT, "materials"))

app = Flask(__name__, static_folder=FRONTEND_ROOT, static_url_path="")
app.config["JSON_AS_ASCII"] = False


@app.route("/")
def index():
    return send_from_directory(FRONTEND_ROOT, "index.html")


@app.get("/api/overview")
def api_overview():
    return jsonify(da.get_exam_stats())


@app.get("/api/chapters")
def api_chapters():
    return jsonify(da.get_chapter_stats())


@app.get("/api/chapters/<int:cid>")
def api_chapter_detail(cid):
    r = da.get_chapter_detail(cid)
    if r is None:
        return jsonify({"error": "章节不存在"}), 404
    return jsonify(r)


@app.get("/api/knowledge")
def api_knowledge():
    return jsonify(da.get_knowledge_list(
        level=request.args.get("level") or None,
        chapter_id=request.args.get("chapter") or None,
        q=request.args.get("q") or None,
        sort=request.args.get("sort") or "freq",
    ))


@app.get("/api/knowledge/<int:kid>")
def api_knowledge_detail(kid):
    r = da.get_knowledge_detail(kid)
    if r is None:
        return jsonify({"error": "知识点不存在"}), 404
    return jsonify(r)


@app.get("/api/papers")
def api_papers():
    has_score = request.args.get("has_score")
    has_score = None if has_score in (None, "", "all") else has_score == "1"
    return jsonify(da.get_papers_list(
        ptype=request.args.get("type") or None,
        has_score=has_score,
    ))


@app.get("/api/papers/<int:pid>")
def api_paper_detail(pid):
    r = da.get_paper_detail(pid)
    if r is None:
        return jsonify({"error": "试卷不存在"}), 404
    return jsonify(r)


@app.get("/api/questions/<int:qid>")
def api_question_detail(qid):
    q = da.get_question_detail(qid)
    if q is None:
        return jsonify({"error": "题目不存在"}), 404
    out = {"question": q, "compare": None, "similar": None}
    cmp_id = request.args.get("compare", type=int)
    if cmp_id:
        c = da.get_question_detail(cmp_id)
        if c is None:
            return jsonify({"error": "对比题目不存在"}), 404
        out["compare"] = c
        out["similar"] = da.get_similar_relation(qid, cmp_id)
    return jsonify(out)


@app.get("/api/similar")
def api_similar():
    limit = request.args.get("limit", type=int)
    return jsonify(da.get_similar_list(limit=limit,
                                       similarity_type=request.args.get("type") or None))


@app.get("/api/search")
def api_search():
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"query": "", "knowledge": [], "questions": [],
                        "chapters": [], "formulas": [], "sources": []})
    return jsonify(da.search_all(q))


@app.get("/api/priority")
def api_priority():
    return jsonify(da.get_priority())


@app.get("/api/study")
def api_study():
    return jsonify(da.get_study())


@app.post("/api/ai/chat")
def api_ai_chat():
    return jsonify(da.ai_chat_unavailable()), 501


@app.get("/api/meta")
def api_meta():
    return jsonify({
        "db_mtime": da.db_mtime(),
        "db_path": da.DB_PATH,
        "db_ok": os.path.exists(da.DB_PATH),
        "chapter_options": da.get_chapter_options(),
        "paper_types": da.get_paper_types(),
    })


# ---------------------------------------------------------------- 原题图片

def _render_pdf_page(pdf_path, page_no, scale=2.0):
    os.makedirs(PAGE_CACHE, exist_ok=True)
    cache = os.path.join(PAGE_CACHE, f"{os.path.basename(pdf_path)}.p{page_no}.png")
    if not os.path.exists(cache):
        doc = pdfium.PdfDocument(pdf_path)
        try:
            if page_no < 1 or page_no > len(doc):
                return None
            img = doc[page_no - 1].render(scale=scale).to_pil()
            img.save(cache, format="PNG")
        finally:
            doc.close()
    return cache


@app.get("/api/source/<int:sid>")
def api_source_image(sid):
    s = da.query_one("SELECT file_path, file_name FROM sources WHERE source_id = ?", (sid,))
    if not s:
        return jsonify({"error": "资料源不存在"}), 404
    path = os.path.join(MATERIALS_DIR, s["file_path"])
    if not os.path.exists(path):
        return jsonify({"error": "原始文件不存在", "file_path": s["file_path"]}), 404
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        page = request.args.get("page", default=1, type=int)
        img = _render_pdf_page(path, page)
        if img is None:
            return jsonify({"error": f"页码超出范围（page={page}）"}), 400
        return send_file(img, mimetype="image/png", max_age=86400)
    if ext in (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"):
        mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                "webp": "image/webp", "bmp": "image/bmp", "gif": "image/gif"}[ext[1:]]
        return send_file(path, mimetype=mime, max_age=86400)
    return jsonify({"error": f"该资料类型不支持图片预览（{ext or '未知'}）"}), 415


@app.get("/api/questions/<int:qid>/pages")
def api_question_pages(qid):
    return jsonify(da.get_question_pages(qid))


@app.get("/api/papers/<int:pid>/pages")
def api_paper_pages(pid):
    return jsonify(da.get_paper_pages(pid))


# ---------------------------------------------------------------- 期末习题（不计权重）

@app.get("/api/exercises")
def api_exercises():
    return jsonify(da.get_exercises())


@app.errorhandler(sqlite3.Error)
def db_error(e):
    return jsonify({"error": f"数据库错误：{e}"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    print(f"432 统计学学习驾驶舱已启动： http://localhost:{port}  （仅本机访问，不暴露网络）")
    app.run(host="127.0.0.1", port=port, debug=False)
