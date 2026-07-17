"""
从 epub 语料构建行级章节标题分类的训练数据。

epub 自带结构化目录（toc.ncx / nav），是独立于规则正则的 ground truth：
把 epub 正文按 spine 顺序拍平成纯文本行，凡是命中目录条目标题的行标 1（是标题），
其余标 0。产出 JSONL，每条含目标行 + 上下文窗口，供 mDeBERTa 逐行分类微调。

只用标准库，无需 pip 安装即可运行与验证。

用法:
    python3 build_dataset.py <corpusDir> --out out/dataset.jsonl [--report]
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree as ET


def normalize(text: str) -> str:
    """统一全角/半角、压缩空白，用于标题匹配与去噪。"""
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def strip_html(fragment: str) -> str:
    """极简 HTML → 文本：块级标签转换行，其余标签删除，再解码实体。"""
    fragment = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", "", fragment)
    fragment = re.sub(r"(?i)<(p|div|h[1-6]|br|li|tr)\b[^>]*>", "\n", fragment)
    fragment = re.sub(r"(?i)</(p|div|h[1-6]|li|tr)>", "\n", fragment)
    fragment = re.sub(r"<[^>]+>", "", fragment)
    return html.unescape(fragment)


@dataclass
class Epub:
    titles: set[str]
    lines: list[str]


def _ns(tag: str) -> str:
    """去掉 XML 命名空间前缀。"""
    return tag.rsplit("}", 1)[-1]


def read_opf_spine(zf: zipfile.ZipFile, opf_name: str) -> list[str]:
    """按 spine 顺序返回正文 html 的内部路径。opf 命名空间不规范时回退正则解析。"""
    raw = zf.read(opf_name)
    base = opf_name.rsplit("/", 1)[0] if "/" in opf_name else ""
    manifest: dict[str, str] = {}
    spine: list[str] = []
    try:
        root = ET.fromstring(raw)
        for el in root.iter():
            tag = _ns(el.tag)
            if tag == "item":
                manifest[el.attrib.get("id", "")] = el.attrib.get("href", "")
            elif tag == "itemref":
                idref = el.attrib.get("idref", "")
                if idref:
                    spine.append(idref)
    except ET.ParseError:
        text = raw.decode("utf-8", "ignore")
        for m in re.finditer(r"<item\b[^>]*\bid=\"([^\"]+)\"[^>]*\bhref=\"([^\"]+)\"", text):
            manifest[m.group(1)] = m.group(2)
        for m in re.finditer(r"<item\b[^>]*\bhref=\"([^\"]+)\"[^>]*\bid=\"([^\"]+)\"", text):
            manifest[m.group(2)] = m.group(1)
        for m in re.finditer(r"<itemref\b[^>]*\bidref=\"([^\"]+)\"", text):
            spine.append(m.group(1))
    out: list[str] = []
    for idref in spine:
        href = manifest.get(idref)
        if not href:
            continue
        path = f"{base}/{href}" if base else href
        out.append(path.split("#", 1)[0])
    return out


def read_toc_titles(zf: zipfile.ZipFile, names: list[str]) -> set[str]:
    """从 toc.ncx 或 nav.xhtml 抽取所有目录条目标题（归一化）。"""
    titles: set[str] = set()
    for name in names:
        low = name.lower()
        if low.endswith(".ncx"):
            try:
                root = ET.fromstring(zf.read(name))
            except ET.ParseError:
                continue
            for el in root.iter():
                if _ns(el.tag) == "text" and el.text:
                    titles.add(normalize(el.text))
        elif low.endswith(("nav.xhtml", "nav.html")):
            text = zf.read(name).decode("utf-8", "ignore")
            for m in re.findall(r"(?is)<a[^>]*>(.*?)</a>", text):
                titles.add(normalize(strip_html(m)))
    return {t for t in titles if t}


def find_opf(zf: zipfile.ZipFile) -> str | None:
    try:
        container = zf.read("META-INF/container.xml").decode("utf-8", "ignore")
    except KeyError:
        return None
    m = re.search(r'full-path="([^"]+)"', container)
    return m.group(1) if m else None


def parse_epub(path: Path) -> Epub | None:
    try:
        zf = zipfile.ZipFile(path)
    except zipfile.BadZipFile:
        return None
    names = zf.namelist()
    opf = find_opf(zf) or ("content.opf" if "content.opf" in names else None)
    if not opf or opf not in names:
        return None
    titles = read_toc_titles(zf, names)
    if len(titles) < 3:
        return None  # 目录太少，无法提供有效标签
    lines: list[str] = []
    for html_path in read_opf_spine(zf, opf):
        if html_path not in names:
            continue
        raw = zf.read(html_path).decode("utf-8", "ignore")
        for line in strip_html(raw).split("\n"):
            norm = normalize(line)
            if norm:
                lines.append(norm)
    if not lines:
        return None
    return Epub(titles=titles, lines=lines)


def build_records(epub: Epub, book_id: str) -> list[dict]:
    """逐行打标签：命中目录标题的行为正样本，其余为负样本，附前后各一行上下文。"""
    records = []
    for i, line in enumerate(epub.lines):
        # 标题通常较短；过长的行几乎不可能是目录条目，直接判负，避免正文误匹配
        is_title = len(line) <= 40 and line in epub.titles
        records.append(
            {
                "book": book_id,
                "prev": epub.lines[i - 1] if i > 0 else "",
                "text": line,
                "next": epub.lines[i + 1] if i + 1 < len(epub.lines) else "",
                "label": 1 if is_title else 0,
            }
        )
    return records


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("corpus")
    ap.add_argument("--out", default="out/dataset.jsonl")
    ap.add_argument("--report", action="store_true", help="只统计不写文件")
    args = ap.parse_args()

    corpus = Path(args.corpus)
    epubs = sorted(corpus.rglob("*.epub"))
    print(f"发现 {len(epubs)} 个 epub", file=sys.stderr)

    all_records: list[dict] = []
    parsed = 0
    skipped = 0
    pos_samples: list[str] = []
    for path in epubs:
        epub = parse_epub(path)
        if epub is None:
            skipped += 1
            continue
        parsed += 1
        recs = build_records(epub, path.stem)
        all_records.extend(recs)
        for r in recs:
            if r["label"] == 1 and len(pos_samples) < 30:
                pos_samples.append(r["text"])

    pos = sum(r["label"] for r in all_records)
    neg = len(all_records) - pos
    print(f"\n解析成功 {parsed} 本, 跳过 {skipped} 本（无目录/损坏）")
    print(f"总行数 {len(all_records)}  正样本(标题) {pos}  负样本 {neg}")
    if all_records:
        print(f"正样本占比 {pos / len(all_records) * 100:.2f}%  正负比 1:{neg / max(pos, 1):.0f}")
    print("\n正样本示例（这些正是规则正则接不住的语义标题）:")
    for s in pos_samples[:25]:
        print("  +", repr(s))

    if not args.report:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open("w", encoding="utf-8") as f:
            for r in all_records:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"\n已写入 {out} ({len(all_records)} 行)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
