import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Extract search-filter-bar
filter_match = re.search(r'(<div class="search-filter-bar">.*?</form>\s*</div>)', content, re.DOTALL)
filter_html = filter_match.group(1) if filter_match else ""

# 2. Extract view-request-detail inner content
detail_match = re.search(r'<section id="view-request-detail" class="page-view" style="display: none;">\s*(<div class="flex justify-between align-center mb-20">.*?)</section>', content, re.DOTALL)
detail_html = detail_match.group(1) if detail_match else ""

# 3. Replace view-requests section
view_requests_new = """
        <section id="view-requests" class="page-view" style="display: none; height: calc(100vh - 60px); flex-direction: column;">
          <div class="flex justify-between align-center mb-20" style="flex-shrink: 0;">
            <h1 style="font-size: 24px; font-weight: 700;">รายการใบแจ้งตรวจสอบห้องปฏิบัติการ</h1>
            <div class="flex gap-10">
              <button class="btn btn-secondary" onclick="App.openFilterModal()" style="border-color:var(--primary-color); color:var(--primary-color);">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                ค้นหา / กรองข้อมูล
              </button>
              <button class="btn btn-secondary" id="btn-admin-export" style="display: none; border-color:var(--primary-color); color:var(--primary-color);" onclick="App.exportRequestsExcel()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                ส่งออก Excel / CSV
              </button>
              <button class="btn btn-primary" id="btn-create-request" onclick="App.navigate('request-create')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                สร้างใบแจ้งตรวจสอบ
              </button>
            </div>
          </div>

          <div id="requests-split-layout" style="display: flex; flex-direction: column; gap: 20px; flex: 1; overflow: hidden;">
            <!-- Top Pane -->
            <div id="requests-master-pane" class="card" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; padding-top: 10px;">
              <div class="table-responsive" style="flex: 1; overflow-y: auto;">
                <table class="table">
                  <thead style="position: sticky; top: 0; background: white; z-index: 1;">
                    <tr>
                      <th>เลขที่ใบแจ้ง</th>
                      <th>วันที่ / เวลา</th>
                      <th>ลูกค้า</th>
                      <th>วัตถุดิบ</th>
                      <th>ผู้แจ้ง</th>
                      <th>สถานะ</th>
                      <th class="actions-column">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody id="requests-list-tbody">
                    <tr><td colspan="7" style="text-align:center; color:var(--text-muted);">กำลังโหลดข้อมูล...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Bottom Pane -->
            <div id="requests-detail-pane" class="card" style="flex: 1; display: none; flex-direction: column; overflow: hidden;">
              <div style="flex: 1; overflow-y: auto; padding: 20px;">
                <!-- INJECT DETAIL HTML HERE -->
                {DETAIL_HTML}
              </div>
            </div>
          </div>
        </section>
"""

view_requests_new = view_requests_new.replace('{DETAIL_HTML}', detail_html)

# 1. replace view-requests
content = re.sub(r'<section id="view-requests" class="page-view".*?<!-- 2\.5 DRAFTS LIST VIEW -->', view_requests_new + '\n\n        <!-- 2.5 DRAFTS LIST VIEW -->', content, flags=re.DOTALL)

# 2. remove view-request-detail
content = re.sub(r'<section id="view-request-detail" class="page-view".*?</section>', '', content, flags=re.DOTALL)

# 3. Add modal-search-filters at the end before </body>
modal_html = f"""
  <!-- Search Filter Modal -->
  <div id="modal-search-filters" class="modal-overlay">
    <div class="modal-container" style="max-width:800px;">
      <div class="modal-header">
        <h2>🔍 ค้นหา / กรองข้อมูล</h2>
        <button class="btn-close" onclick="App.closeFilterModal()">&times;</button>
      </div>
      <div class="modal-body">
        {filter_html}
      </div>
    </div>
  </div>
"""

content = content.replace('<!-- Change Own Password Modal -->', modal_html + '\n  <!-- Change Own Password Modal -->')

# Remove the 'ย้อนกลับ' button from detail html
content = re.sub(r'<button class="btn btn-secondary" onclick="App\.navigate\(\'requests\'\)">ย้อนกลับ</button>', '', content)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("done")
