import textwrap

from packages.engine.domain.document_pipeline import DocumentPreparationMixin
from packages.engine.sources import SourceSpec


class DummyDocumentPreparation(DocumentPreparationMixin):
    pass


def _write_html(tmp_path, name, content):
    path = tmp_path / name
    path.write_text(textwrap.dedent(content), encoding="utf-8")
    return path


def test_extract_matrix_announcements(tmp_path):
    html = """
    <html>
      <body>
        <table>
          <tr><th>公告日</th><th>工事</th><th>役務</th></tr>
          <tr>
            <td>令和7年4月1日</td>
            <td>
              <a href="doc1.pdf">工事A</a>
              <a href="doc2.pdf">工事B</a>
            </td>
            <td><a href="doc3.pdf">役務A</a></td>
          </tr>
        </table>
      </body>
    </html>
    """
    html_path = _write_html(tmp_path, "matrix.html", html)
    mixin = DummyDocumentPreparation()
    spec = SourceSpec(
        name="matrix-test",
        matrix_header_keywords=("公告日",),
        force_matrix=True,
    )

    announcements = mixin._extract_links_from_html(html_path, source_spec=spec)
    assert len(announcements) == 2
    titles = sorted(notice.title for notice in announcements)
    assert titles == ["工事A 工事B", "役務A"]
    doc_sets = [
        sorted(doc.label for doc in notice.documents)
        for notice in announcements
    ]
    assert sorted(doc_sets) == [["工事A", "工事B"], ["役務A"]]


def test_extract_row_announcements_with_nested_tables(tmp_path):
    html = """
    <html>
      <body>
        <table>
          <tr>
            <td>
              <table>
                <tr>
                  <td><a href="nested.pdf">内側資料</a></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <table>
          <tr>
            <td><a href="outer.pdf">外側公告</a></td>
          </tr>
        </table>
      </body>
    </html>
    """
    html_path = _write_html(tmp_path, "nested.html", html)
    mixin = DummyDocumentPreparation()

    announcements = mixin._extract_links_from_html(html_path, source_spec=None)
    titles = [notice.title for notice in announcements]
    assert titles == ["内側資料", "外側公告"]


def test_extract_row_announcements_single_row_without_headers(tmp_path):
    html = """
    <html>
      <body>
        <table>
          <tr>
            <td><a href="single.pdf">単独資料</a></td>
          </tr>
        </table>
      </body>
    </html>
    """
    html_path = _write_html(tmp_path, "single_row.html", html)
    mixin = DummyDocumentPreparation()

    announcements = mixin._extract_links_from_html(html_path, source_spec=None)
    assert len(announcements) == 1
    assert announcements[0].title == "単独資料"
    assert [doc.label for doc in announcements[0].documents] == ["単独資料"]
