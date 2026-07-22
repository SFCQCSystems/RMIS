// CORE APP CONTROLLER
// Handles application logic, DOM interactions, routing, printing, and file exports.

const App = (function () {
  // --- APPLICATION STATE ---
  const state = {
    currentUser: null,
    currentView: 'login',
    currentRequestId: null,
    activeRequestItems: [],
    filters: {
      requestNo: '',
      customerName: '',
      productName: '',
      batchNumber: '',
      rmNo: '',
      status: '',
      startDate: '',
      endDate: ''
    },
    historyFilters: {
      productName: '',
      batchNumber: '',
      rmNo: '',
      requestNo: '',
      testResult: '',
      startDate: '',
      endDate: ''
    }
  };

  // --- VIEW CONTAINERS MAP ---
  const VIEWS = {
    login: 'login-screen',
    dashboard: 'view-dashboard',
    requests: 'view-requests',
    drafts: 'view-drafts',
    'request-create': 'view-request-form',
    'request-edit': 'view-request-form',
    'request-detail': 'view-request-detail',
    history: 'view-history',
    'edit-requests': 'view-edit-requests',
    'daily-report': 'view-daily-report',
    signatures: 'view-signatures',
    users: 'view-users'
  };

  // --- INITIALIZATION ---
  async function init() {
    console.log('Initializing LRMS Application...');
    
    // Initialize list with empty placeholder
    const listBody = document.getElementById('requests-list-tbody');
    if (listBody) {
      listBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:30px;">กรุณากดปุ่ม "ค้นหา / กรองข้อมูล" เพื่อแสดงรายการ</td></tr>`;
    }

    // 1. Set connection badge status
    updateConnectionBadge();

    // 1.5. Setup Supabase Session Listener
    setupSessionListener();

    // 2. Add event listener to form edits in item lists
    setupGlobalListeners();

    // 3. Setup Split Layout Resizer
    setupSplitResizer();

    // 4. Setup Resizable Columns
    initResizableColumns();

    // 3. Attempt auto-login with existing session
    try {
      const user = await window.DB.getCurrentUser();
      if (user) {
        state.currentUser = user;
        updateUIForUser();
        initRealtime();
        navigate('dashboard');
      } else {
        navigate('login');
      }
    } catch (e) {
      console.error('Session retrieval failed, defaulting to Login screen:', e);
      navigate('login');
    }
  }

  // Set visual status indicator for database connection type
  function updateConnectionBadge() {
    const badge = document.getElementById('conn-status-badge');
    if (!badge) return;

    const config = window.AppConfig.load();
    if (window.AppConfig.isSupabaseConfigured(config)) {
      badge.innerHTML = `
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:#38bdf8; box-shadow:0 0 8px #0284c7;"></span>
        <span style="color:#0284c7; white-space:nowrap;">Supabase Cloud Connected</span>
      `;
    } else {
      badge.innerHTML = `
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:#ef4444; box-shadow:0 0 8px #dc2626;"></span>
        <span style="color:#dc2626; font-weight:600;">Supabase Config Required</span>
      `;
    }
  }

  function setupSessionListener() {
    if (typeof supabase !== 'undefined' && window.AppConfig) {
      const config = window.AppConfig.load();
      if (config.supabaseUrl && config.supabaseAnonKey) {
        const client = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
        client.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_OUT') {
            state.currentUser = null;
            navigate('login');
          } else if (event === 'TOKEN_REFRESHED') {
            console.log('Session token refreshed.');
          }
        });
      }
    }
  }

  function setupSplitResizer() {
    const resizer = document.getElementById('pane-resizer');
    const topPane = document.getElementById('requests-master-pane');
    const bottomPane = document.getElementById('requests-detail-pane');
    const container = document.getElementById('requests-split-layout');
    
    if (!resizer || !topPane || !bottomPane || !container) return;

    let isResizing = false;

    resizer.addEventListener('mousedown', function(e) {
      isResizing = true;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', function(e) {
      if (!isResizing) return;
      
      const containerRect = container.getBoundingClientRect();
      let newHeight = e.clientY - containerRect.top;
      
      // Add minimum height constraints for both panes
      if (newHeight < 150) newHeight = 150;
      if (newHeight > containerRect.height - 150) newHeight = containerRect.height - 150;
      
      topPane.style.flex = 'none';
      topPane.style.height = newHeight + 'px';
    });

    document.addEventListener('mouseup', function(e) {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  function setupGlobalListeners() {
    // Esc key closes modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeConfigModal();
        closeBatchTraceModal();
        closeCreateUserModal();
        closeChangePasswordModal();
      }
      // Prevent Enter key from submitting forms unintentionally (except in textarea)
      if (e.key === 'Enter' && e.target && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
      }
    });

    // Handle side nav toggle on mobile viewports
    document.addEventListener('click', (e) => {
      const sidebar = document.getElementById('sidebar');
      const toggleBtn = document.querySelector('.mobile-menu-toggle');
      if (sidebar && sidebar.classList.contains('open')) {
        if (!sidebar.contains(e.target) && (!toggleBtn || !toggleBtn.contains(e.target))) {
          sidebar.classList.remove('open');
        }
      }
    });
  }

  // --- ROUTING / VIEW NAVIGATOR ---
  function navigate(viewName, params = {}) {
    console.log(`Navigating to: ${viewName}`, params);

    // Handle split pane view for request-detail
    let actualViewName = viewName;
    if (viewName === 'request-detail') {
      actualViewName = 'requests'; // Act as if navigating to requests list
      setTimeout(() => {
        const detailPane = document.getElementById('requests-detail-pane');
        if (detailPane) {
          detailPane.style.display = 'flex';
          // Ensure it scrolls into view on mobile
          if (window.innerWidth < 768) {
              detailPane.scrollIntoView({ behavior: 'smooth' });
          }
        }
      }, 50);
    } else if (viewName === 'requests') {
      // Show detail pane initially but keep it empty
      const detailPane = document.getElementById('requests-detail-pane');
      const resizer = document.getElementById('pane-resizer');
      if (resizer) resizer.style.display = 'flex';
      if (detailPane) {
        detailPane.style.display = 'flex';
        // Clear its content to empty placeholders
        document.getElementById('detail-no').innerText = '-';
        document.getElementById('detail-datetime').innerText = '-';
        document.getElementById('detail-customer').innerText = '-';
        document.getElementById('detail-po-number').innerText = '-';
        document.getElementById('detail-requester').innerText = '-';
        document.getElementById('detail-status-badge').innerText = '-';
        document.getElementById('detail-status-badge').className = 'badge';
        document.getElementById('detail-car-plate').innerText = '-';
        document.getElementById('detail-seal-no').innerText = '-';
        document.getElementById('detail-container-no').innerText = '-';
        document.getElementById('detail-items-tbody').innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">กรุณาเลือกรายการใบแจ้งเพื่อดูรายละเอียด</td></tr>';
        document.getElementById('detail-notes').innerText = '-';
        document.getElementById('detail-lab-comments').innerText = '-';
        document.getElementById('btn-detail-print')?.style && (document.getElementById('btn-detail-print').style.display = 'none');
        document.getElementById('btn-detail-modify')?.style && document.getElementById('btn-detail-modify').style.setProperty('display', 'none', 'important');
        document.getElementById('btn-detail-remove')?.style && document.getElementById('btn-detail-remove').style.setProperty('display', 'none', 'important');
        const arc = document.getElementById('approve-reject-btn-container'); if (arc) arc.innerHTML = '';
        document.getElementById('detail-approval-card').style.display = 'none';
      }
    }

    // Security check: restrict admin/lab views
    if (state.currentUser) {
      if (viewName === 'users' && state.currentUser.role !== 'admin') {
        showToast('คุณไม่มีสิทธิ์เข้าใช้งานเมนูนี้', 'error');
        navigate('dashboard');
        return;
      }
      if (viewName === 'signatures' && state.currentUser.role !== 'admin') {
        showToast('เฉพาะ Admin เท่านั้นที่สามารถจัดการลายเซ็นได้', 'error');
        navigate('dashboard');
        return;
      }
      if (viewName === 'history' && !['admin', 'lab'].includes(state.currentUser.role)) {
        showToast('คุณไม่มีสิทธิ์เข้าใช้งานเมนูนี้', 'error');
        navigate('dashboard');
        return;
      }
    }

    // Hide all view screens
    Object.values(VIEWS).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    // Update active nav highlights in sidebar
    const navItems = {
      dashboard: 'nav-dashboard',
      requests: 'nav-requests',
      'request-create': 'nav-requests',
      'request-edit': 'nav-requests',
      'request-detail': 'nav-requests',
      drafts: 'nav-drafts',
      history: 'nav-history',
      'edit-requests': 'nav-edit-requests',
      'daily-report': 'nav-daily-report',
      signatures: 'nav-settings',
      users: 'nav-settings' // Keep active on settings tab when managing users/signatures
    };

    document.querySelectorAll('.sidebar-menu .menu-item').forEach(el => el.classList.remove('active'));
    const activeNavId = navItems[actualViewName] || navItems[viewName];
    if (activeNavId) {
      const navEl = document.getElementById(activeNavId);
      if (navEl) navEl.classList.add('active');
    }

    // Handle shell layout toggle based on login
    const shell = document.getElementById('app-shell');
    const loginScreen = document.getElementById('login-screen');

    if (viewName === 'login') {
      if (shell) shell.style.display = 'none';
      if (loginScreen) loginScreen.style.display = 'flex';
      state.currentUser = null;
      state.currentRequestId = null;
    } else {
      if (loginScreen) loginScreen.style.display = 'none';
      if (shell) shell.style.display = 'flex';
    }

    state.currentView = viewName;
    const viewEl = document.getElementById(VIEWS[actualViewName]);
    if (viewEl) {
      if (VIEWS[actualViewName] === 'view-requests') {
        viewEl.style.display = 'flex';
      } else {
        viewEl.style.display = 'block';
      }
    }

    // Toggle mobile sidebar state closed on navigate
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');

    // Run loaders depending on page view target
    switch (viewName) {
      case 'dashboard':
        loadDashboard();
        break;
      case 'requests':
        // The user wants the list to be initially empty until they click search
        break;
      case 'drafts':
        loadDraftsList();
        break;
      case 'request-create':
        prepareRequestForm(null);
        break;
      case 'request-edit':
        prepareRequestForm(params.id);
        break;
      case 'request-detail':
        // we might not have loaded the list if jumping straight to detail
        if (state.currentView === 'request-detail' && document.getElementById('requests-list-tbody').innerText.includes('กำลังโหลด')) {
           loadRequestsList();
        }
        loadRequestDetail(params.id);
        break;
      case 'history':
        loadMaterialHistory();
        break;
      case 'edit-requests':
        loadEditRequests();
        break;
      case 'signatures':
        loadSignaturesManager();
        break;
      case 'users':
        loadUsersManager();
        break;
    }

    // Scroll view back to top
    window.scrollTo(0, 0);
    
    // Re-apply role-based UI restrictions on every navigation
    if (state.currentUser) updateUIForUser();
  }

  // --- FILTER MODAL LOGIC ---
  function openFilterModal() {
    const modal = document.getElementById('modal-search-filters');
    if (modal) {
      modal.classList.add('open');
    }
  }

  function closeFilterModal() {
    const modal = document.getElementById('modal-search-filters');
    if (modal) {
      modal.classList.remove('open');
    }
  }

  function toggleSidebar() {
    document.body.classList.toggle('sidebar-collapsed');
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
  }

  // --- LOGIN & LOGOUT CONTROL ---
  async function handleLogin(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const errorMsg = document.getElementById('login-error-msg');
    
    if (!usernameInput || !passwordInput) return;
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    errorMsg.style.display = 'none';

    try {
      showLoadingButton(e.submitter, true, 'กำลังตรวจสอบ...');
      const user = await window.DB.login(username, password);
      state.currentUser = user;
      
      // Seed UI elements
      updateUIForUser();
      initRealtime();
      showToast(`ยินดีต้อนรับคุณ ${user.display_name}`, 'success');
      
      passwordInput.value = '';
      usernameInput.value = '';

      navigate('dashboard');
    } catch (err) {
      console.error(err);
      errorMsg.innerText = err.message || 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง';
      errorMsg.style.display = 'block';
    } finally {
      showLoadingButton(e.submitter, false, 'เข้าสู่ระบบ');
    }
  }

  async function logout() {
    try {
      await window.DB.cleanupRealtimeNotifications();
      await window.DB.logout();
      showToast('ออกจากระบบเรียบร้อย', 'info');
    } catch (e) {
      console.error('Logout failed:', e);
    }
    navigate('login');
  }

  function updateUIForUser() {
    if (!state.currentUser) return;
    
    const nameEl = document.getElementById('sidebar-user-name');
    const roleEl = document.getElementById('sidebar-user-role');
    const exportBtn = document.getElementById('btn-admin-export');
    const settingsBtn = document.getElementById('setting-btn-system');
    
    if (settingsBtn) {
      settingsBtn.style.display = state.currentUser.role === 'admin' ? 'block' : 'none';
    }
    
    if (nameEl) nameEl.innerText = state.currentUser.display_name;
    if (roleEl) {
      if (state.currentUser.role === 'admin') {
        roleEl.innerText = 'LAB Admin';
        roleEl.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
        roleEl.style.color = '#f87171';
      } else if (state.currentUser.role === 'lab') {
        roleEl.innerText = 'LAB Staff';
        roleEl.style.backgroundColor = 'rgba(168, 85, 247, 0.2)';
        roleEl.style.color = '#c084fc';
      } else if (state.currentUser.role === 'base_oil') {
        roleEl.innerText = 'Base Oil';
        roleEl.style.backgroundColor = 'rgba(245, 158, 11, 0.2)';
        roleEl.style.color = '#fbbf24';
      } else {
        roleEl.innerText = 'Requester';
        roleEl.style.backgroundColor = 'rgba(2, 132, 199, 0.2)';
        roleEl.style.color = '#38bdf8';
      }
    }

    // Role features visibility
    const isUserAdmin = state.currentUser.role === 'admin';
    const isUserLab = state.currentUser.role === 'lab';
    const isBaseOil = state.currentUser.role === 'base_oil';
    
    // Sidebar nav nodes
    const navHistory = document.getElementById('nav-history');
    const navEditRequests = document.getElementById('nav-edit-requests');
    const navDailyReport = document.getElementById('nav-daily-report');
    const navSignatures = document.getElementById('setting-nav-signatures');
    const navUsers = document.getElementById('setting-nav-users');
    
    if (navDailyReport) navDailyReport.style.display = (isUserAdmin || isUserLab) ? 'block' : 'none';
    const navDrafts = document.getElementById('nav-drafts');
    
    if (navHistory) navHistory.style.display = (isUserAdmin || isUserLab) ? 'block' : 'none';
    if (navEditRequests) {
      // Admin, Lab, Requester can see Edit Requests (everyone except Base Oil)
      navEditRequests.style.display = !isBaseOil ? 'block' : 'none';
    }
    if (navSignatures) navSignatures.style.display = isUserAdmin ? 'block' : 'none';
    if (navUsers) navUsers.style.display = isUserAdmin ? 'block' : 'none';
    if (navDrafts) {
      const isRequester = state.currentUser.role === 'requester';
      navDrafts.style.display = (isRequester || isUserAdmin) ? 'block' : 'none';
      
      const draftCard = document.getElementById('stat-card-draft');
      if (draftCard) {
        draftCard.style.display = (isRequester || isUserAdmin) ? 'flex' : 'none';
      }
    }

    // Remove or show action buttons based on role
    if (isBaseOil) {
      // Physically remove buttons from DOM for Base Oil - they should never appear
      ['btn-admin-import', 'btn-admin-export', 'btn-create-request', 'file-import-excel',
       'btn-dashboard-create-request', 'btn-detail-modify', 'btn-detail-remove'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
    } else {
      if (exportBtn) exportBtn.style.display = isUserAdmin ? 'inline-flex' : 'none';
      const importBtn = document.getElementById('btn-admin-import');
      if (importBtn) importBtn.style.display = isUserAdmin ? 'inline-flex' : 'none';
      const createBtn = document.getElementById('btn-create-request');
      if (createBtn) createBtn.style.display = 'inline-flex';
    }
    
    // Kick off async background update for drafts
    updateDraftCountsInBackground();
  }

  // --- BACKGROUND DATA LOADERS ---
  async function updateDraftCountsInBackground() {
    const isRequester = state.currentUser?.role === 'requester';
    const isAdmin = state.currentUser?.role === 'admin';
    if (!isRequester && !isAdmin) return;

    try {
      const draftRequests = await window.DB.getRequests({ isDraft: true });
      const draftCount = draftRequests.length;
      
      const sidebarDraftCount = document.getElementById('sidebar-draft-count');
      const draftStat = document.getElementById('stat-drafts');
      
      if (draftStat) draftStat.innerText = draftCount;
      if (sidebarDraftCount) {
        if (draftCount > 0) {
          sidebarDraftCount.style.display = 'inline-block';
          sidebarDraftCount.innerText = draftCount;
        } else {
          sidebarDraftCount.style.display = 'none';
        }
      }
    } catch (err) {
      console.error('Failed to load background drafts:', err);
      // Optional: Update UI to show error state, but menu remains visible
    }
  }

  // --- 1. DASHBOARD CARD LOADER ---
  async function loadDashboard() {
    try {
      const requests = await window.DB.getRequests({});
      
      const total = requests.length;
      const pending = requests.filter(r => r.status === 'Pending').length;
      const inProcess = requests.filter(r => r.status === 'In Process').length;
      const complete = requests.filter(r => r.status === 'Complete').length;
      const rejected = requests.filter(r => r.status === 'Rejected').length;


      document.getElementById('stat-total').innerText = total;
      document.getElementById('stat-pending').innerText = pending;
      // stat-in-progress id retained for backward compatibility
      const inProgressEl = document.getElementById('stat-in-progress');
      if (inProgressEl) inProgressEl.innerText = inProcess;
      document.getElementById('stat-completed').innerText = complete;
      const rejectedEl = document.getElementById('stat-rejected');
      if (rejectedEl) rejectedEl.innerText = rejected;

      // Populate recent request table (Max 5 items)
      const recentBody = document.getElementById('dashboard-recent-tbody');
      recentBody.innerHTML = '';

      const recents = requests.slice(0, 5);
      if (recents.length === 0) {
        recentBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">ไม่มีข้อมูลรายการล่าสุด</td></tr>`;
        return;
      }

      recents.forEach(r => {
        const tr = document.createElement('tr');
        const formattedDate = formatThaiDate(r.request_date);
        const formattedTime = r.request_time.slice(0, 5);
        const statusBadge = getStatusBadgeClass(r.status);

        let productText = '-';
        let tooltip = '';
        if (r.request_items && r.request_items.length > 0) {
          const itemsList = r.request_items.map(i => i.product_name);
          tooltip = escapeHtml(itemsList.join('\n'));
          if (itemsList.length === 1) {
            productText = escapeHtml(itemsList[0]);
          } else {
            productText = escapeHtml(itemsList[0]) + ` <span style="color:var(--text-muted); font-size:12px; font-weight:normal;">(+${itemsList.length - 1} รายการ)</span>`;
          }
        }

        tr.style.cursor = 'pointer';
        tr.style.transition = 'background 0.15s';
        tr.onmouseover = () => tr.style.background = 'var(--bg-secondary)';
        tr.onmouseout = () => tr.style.background = 'transparent';
        tr.onclick = () => navigate('request-detail', {id: r.id});
        tr.innerHTML = `
          <td style="white-space: nowrap;"><strong>${r.request_no}/${r.request_year}</strong></td>
          <td style="white-space: nowrap;">${formattedDate} ${formattedTime} น.</td>
          <td style="white-space: nowrap;">${escapeHtml(r.customer_name)}</td>
          <td title="${tooltip}" class="truncate-mobile" style="font-weight:500;">${productText}</td>
          <td style="white-space: nowrap;"><span class="badge ${statusBadge}">${r.status}</span></td>
          <td class="actions-column" style="white-space: nowrap;">
            <button class="btn-icon" onclick="App.navigate('request-detail', {id: '${r.id}'})" title="ดูรายละเอียด">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
          </td>
        `;
        recentBody.appendChild(tr);
      });
    } catch (e) {
      console.error('Error loading dashboard statistics:', e);
      showToast('ไม่สามารถโหลดข้อมูลสถิติแดชบอร์ดได้', 'error');
    }
  }

  // --- 2. REQUESTS LIST LOADER & FILTERS ---
  async function loadRequestsList() {
    const listBody = document.getElementById('requests-list-tbody');
    showLoading();

    try {
      const requests = await window.DB.getRequests(state.filters);
      listBody.innerHTML = '';

      if (requests.length === 0) {
        listBody.innerHTML = getEmptyStateHtml('ไม่พบรายการใบแจ้งตรวจสอบที่ตรงกับเงื่อนไขการค้นหา');
        hideLoading();
        return;
      }

      requests.forEach(r => {
        const tr = document.createElement('tr');
        const formattedDate = formatThaiDate(r.request_date);
        const formattedTime = r.request_time.slice(0, 5);
        const statusBadge = getStatusBadgeClass(r.status);

        let productText = '-';
        let tooltip = '';
        if (r.request_items && r.request_items.length > 0) {
          const itemsList = r.request_items.map(i => i.product_name);
          tooltip = escapeHtml(itemsList.join('\n'));
          if (itemsList.length === 1) {
            productText = escapeHtml(itemsList[0]);
          } else {
            productText = escapeHtml(itemsList[0]) + ` <span style="color:var(--text-muted); font-size:12px; font-weight:normal;">(+${itemsList.length - 1} รายการ)</span>`;
          }
        }

        tr.style.cursor = 'pointer';
        tr.style.transition = 'background 0.15s';
        tr.onmouseover = () => tr.style.background = 'var(--bg-secondary)';
        tr.onmouseout = () => tr.style.background = 'transparent';
        tr.onclick = (e) => {
          // Prevent double navigation if they clicked the button directly
          if (!e.target.closest('button')) {
            navigate('request-detail', {id: r.id});
          }
        };

        tr.innerHTML = `
          <td style="white-space: nowrap;"><strong>${r.request_no}/${r.request_year}</strong></td>
          <td style="white-space: nowrap;">${formattedDate} ${formattedTime} น.</td>
          <td style="white-space: nowrap;">${escapeHtml(r.customer_name)}</td>
          <td title="${tooltip}" class="truncate-mobile" style="font-weight:500;">${productText}</td>
          <td style="white-space: nowrap;">${escapeHtml(r.requester_name)}</td>
          <td style="white-space: nowrap;"><span class="badge ${statusBadge}">${r.status}</span></td>
          <td class="actions-column" style="white-space: nowrap;">
            <button class="btn-icon" onclick="App.navigate('request-detail', {id: '${r.id}'})" title="ดูรายละเอียด">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
          </td>
        `;
        listBody.appendChild(tr);
      });
      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      console.error(e);
      listBody.innerHTML = getEmptyStateHtml(`เกิดข้อผิดพลาดในการดึงข้อมูล: ${e.message}`);
    } finally {
      hideLoading();
    }
  }

  function handleFilterSubmit(e) {
    e.preventDefault();
    state.filters = {
      requestNo: document.getElementById('filter-no').value.trim(),
      customerName: document.getElementById('filter-customer').value.trim(),
      productName: document.getElementById('filter-product').value.trim(),
      batchNumber: document.getElementById('filter-batch').value.trim(),
      poNumber: document.getElementById('filter-po') ? document.getElementById('filter-po').value.trim() : '',
      rmNo: document.getElementById('filter-rm').value.trim(),
      status: document.getElementById('filter-status').value,
      startDate: document.getElementById('filter-start-date').value,
      endDate: document.getElementById('filter-end-date').value
    };
    closeFilterModal();
    loadRequestsList();
  }

  function clearFilters() {
    document.getElementById('filter-no').value = '';
    document.getElementById('filter-customer').value = '';
    document.getElementById('filter-product').value = '';
    document.getElementById('filter-batch').value = '';
    const filterPo = document.getElementById('filter-po');
    if (filterPo) filterPo.value = '';
    document.getElementById('filter-rm').value = '';
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-start-date').value = '';
    document.getElementById('filter-end-date').value = '';

    state.filters = {
      requestNo: '', customerName: '', productName: '', batchNumber: '', poNumber: '', rmNo: '', status: '', startDate: '', endDate: ''
    };
    loadRequestsList();
  }

  // --- 2.5 DRAFTS LIST LOADER ---
  async function loadDraftsList() {
    const listBody = document.getElementById('drafts-list-tbody');
    showLoading();

    try {
      const filters = { isDraft: true };
      
      const customerFilter = document.getElementById('draft-filter-customer').value.trim().toLowerCase();
      const productFilter = document.getElementById('draft-filter-product').value.trim().toLowerCase();
      const batchFilter = document.getElementById('draft-filter-batch').value.trim().toLowerCase();
      const poFilter = document.getElementById('draft-filter-po').value.trim().toLowerCase();

      let requests = await window.DB.getRequests(filters);

      if (customerFilter) requests = requests.filter(r => (r.customer_name || '').toLowerCase().includes(customerFilter));
      if (poFilter) requests = requests.filter(r => (r.po_number || '').toLowerCase().includes(poFilter));
      
      if (productFilter || batchFilter) {
        requests = requests.filter(r => {
          if (!r.request_items) return false;
          const matchProduct = productFilter ? r.request_items.some(i => (i.product_name || '').toLowerCase().includes(productFilter)) : true;
          const matchBatch = batchFilter ? r.request_items.some(i => (i.batch_number || '').toLowerCase().includes(batchFilter)) : true;
          return matchProduct && matchBatch;
        });
      }

      listBody.innerHTML = '';

      if (requests.length === 0) {
        listBody.innerHTML = getEmptyStateHtml('ไม่พบรายการแบบร่างที่ตรงกับเงื่อนไข');
        hideLoading();
        return;
      }

      requests.forEach(r => {
        const tr = document.createElement('tr');
        
        const createdDateStr = formatThaiDate(r.created_at.split('T')[0]);
        let itemsStr = '-';
        if (r.request_items && r.request_items.length > 0) {
          itemsStr = r.request_items[0].product_name;
          if (r.request_items.length > 1) {
            itemsStr += ` (+${r.request_items.length - 1} รายการ)`;
          }
        }
        
        const tooltip = r.request_items && r.request_items.length > 0 
          ? r.request_items.map(i => `${i.product_name} (${i.quantity})`).join('\n')
          : '';

        tr.innerHTML = `
          <td style="white-space: nowrap;">${createdDateStr}</td>
          <td style="white-space: nowrap;">${formatThaiDate(r.request_date)} ${r.request_time.slice(0, 5)} น.</td>
          <td style="white-space: nowrap;">${escapeHtml(r.customer_name || '-')}</td>
          <td style="white-space: nowrap;">${escapeHtml(r.po_number || '-')}</td>
          <td title="${escapeHtml(tooltip)}" class="truncate-mobile" style="font-weight:500;">${escapeHtml(itemsStr)}</td>
          <td style="white-space: nowrap;">${escapeHtml(r.requester_name || '-')}</td>
          <td class="actions-column" style="white-space: nowrap;">
            <button class="btn-icon" onclick="App.navigate('request-edit', {id: '${r.id}'})" title="แก้ไขแบบร่าง">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn-icon" style="color:var(--text-danger);" onclick="if(confirm('ยืนยันการลบแบบร่างนี้หรือไม่?')) App.deleteRequest('${r.id}')" title="ลบแบบร่าง">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </td>
        `;
        listBody.appendChild(tr);
      });
      hideLoading();

    } catch (e) {
      console.error(e);
      listBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-danger); padding:30px;">ไม่สามารถโหลดข้อมูลแบบร่างได้: ${escapeHtml(e.message)}</td></tr>`;
      showToast('ไม่สามารถดึงข้อมูลรายการแบบร่างได้: ' + e.message, 'error');
      hideLoading();
    }
  }

  // --- 3. CREATE / EDIT REQUEST CONTROLLER ---
  async function prepareRequestForm(requestId = null) {
    const titleEl = document.getElementById('request-form-title');
    const form = document.getElementById('request-main-form');
    const formIdInput = document.getElementById('form-request-id');
    const customerInput = document.getElementById('form-customer');
    const requesterInput = document.getElementById('form-requester-display');
    const carPlateInput = document.getElementById('form-car-plate');
    const sealInput = document.getElementById('form-seal-no');
    const containerInput = document.getElementById('form-container-no');
    const notesInput = document.getElementById('form-notes');
    const commentsInput = document.getElementById('form-lab-comments');
    const tbody = document.getElementById('form-items-tbody');
    const poInput = document.getElementById('form-po-number');
    const needBaseOilCheck = document.getElementById('form-need-base-oil');
    const statusSelect = document.getElementById('form-status');
    const baseOilSection = document.getElementById('form-base-oil-section');
    const statusSection = document.getElementById('form-status-section');

    const adminNoBlock = document.getElementById('form-admin-no-edit');
    const formReqNo = document.getElementById('form-request-no');
    const formReqYear = document.getElementById('form-request-year');

    // Clean form elements
    form.reset();
    tbody.innerHTML = '';
    state.activeRequestItems = [];

    const isEditMode = requestId !== null;
    state.currentRequestId = requestId;
    formIdInput.value = requestId || '';

    // Handle user role fields visibility
    const isAdmin = state.currentUser.role === 'admin';
    const isLab = state.currentUser.role === 'lab';
    const isRequester = state.currentUser.role === 'requester';
    const isBaseOil = state.currentUser.role === 'base_oil';
    const isAdminOrLab = isAdmin || isLab;
    
    // Scope to the form section only (NOT the whole document) to avoid hiding top-bar buttons
    const formSection = document.getElementById('view-request-form') || document;

    formSection.querySelectorAll('.admin-field').forEach(el => {
      el.style.display = isAdmin ? 'block' : 'none';
    });

    formSection.querySelectorAll('.admin-lab-field').forEach(el => {
      const isTableCell = el.tagName === 'TH' || el.tagName === 'TD';
      el.style.display = isAdminOrLab ? (isTableCell ? 'table-cell' : 'block') : 'none';
    });

    // Show Base Oil sharing checkbox and Status dropdown for admin/lab in edit mode
    if (baseOilSection) baseOilSection.style.display = isAdminOrLab ? 'block' : 'none';
    if (statusSection) statusSection.style.display = isAdminOrLab ? 'block' : 'none';

    if (isEditMode) {
      titleEl.innerText = 'แก้ไขใบแจ้งตรวจสอบ';
      
      try {
        const details = await window.DB.getRequestDetail(requestId);
        
        customerInput.value = details.customer_name;
        requesterInput.value = details.requester_name;
        carPlateInput.value = details.car_plate || '';
        sealInput.value = details.seal_no || '';
        containerInput.value = details.container_no || '';
        notesInput.value = details.notes || '';
        commentsInput.value = details.lab_comments || '';
        if (poInput) poInput.value = details.po_number || '';
        if (needBaseOilCheck) needBaseOilCheck.checked = !!details.need_base_oil_view;
        if (statusSelect) statusSelect.value = details.status || 'Pending';

        // Show fields to manually edit request no and request year
        if (isAdminOrLab && adminNoBlock && formReqNo && formReqYear) {
          adminNoBlock.style.display = 'grid';
          formReqNo.value = details.request_no;
          formReqYear.value = details.request_year;

          const dateInput = document.getElementById('form-request-date');
          const timeInput = document.getElementById('form-request-time');
          if (dateInput) dateInput.value = details.request_date || '';
          if (timeInput) timeInput.value = details.request_time ? details.request_time.slice(0, 5) : '';

          formReqNo.required = true;
          formReqYear.required = true;
        } else if (adminNoBlock) {
          adminNoBlock.style.display = 'none';
        }

        // Add item rows
        details.items.forEach(item => addFormItemRow(item));

      } catch (e) {
        console.error(e);
        showToast('ไม่สามารถดึงข้อมูลรายละเอียดมาทำการแก้ไขได้: ' + e.message, 'error');
        navigate('requests');
      }
    } else {
      titleEl.innerText = 'สร้างใบแจ้งตรวจสอบห้องปฏิบัติการ';
      requesterInput.value = state.currentUser.display_name;

      const now = new Date();
      const pad = n => n.toString().padStart(2, '0');
      const localDate = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
      const localTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

      const dateInput = document.getElementById('form-request-date');
      const timeInput = document.getElementById('form-request-time');
      if (dateInput) dateInput.value = localDate;
      if (timeInput) timeInput.value = localTime;

      if (adminNoBlock) adminNoBlock.style.display = 'none';
      if (formReqNo) { formReqNo.required = false; formReqNo.value = ''; }
      if (formReqYear) { formReqYear.required = false; formReqYear.value = ''; }

      // Insert first row automatically for convenience
      addFormItemRow();
    }

    // Setup inputs readOnly/disabled state based on Role & Mode
    const nonLabInputs = [
      customerInput, carPlateInput, sealInput, containerInput, notesInput,
      formReqNo, formReqYear, document.getElementById('form-request-date'), document.getElementById('form-request-time')
    ];

    const isDraftStatus = statusSelect ? statusSelect.value === 'Draft' : false;
    const readonlyForLabOrRequester = (isLab && !isAdmin) || (isBaseOil && !isAdmin) || (isRequester && !isDraftStatus);
    nonLabInputs.forEach(input => {
      if (input) {
        if (isEditMode) {
          input.disabled = readonlyForLabOrRequester;
          input.readOnly = readonlyForLabOrRequester;
        } else {
          input.disabled = false;
          input.readOnly = false;
        }
      }
    });

    if (commentsInput) {
      commentsInput.disabled = !isEditMode || isRequester || isBaseOil;
    }
    if (statusSelect) {
      statusSelect.disabled = !isAdminOrLab;
    }

    const addItemBtn = document.querySelector('button[onclick="App.addFormItemRow()"]');
    if (addItemBtn) {
      addItemBtn.style.display = isEditMode && (isLab || isRequester || isBaseOil) && (!statusSelect || statusSelect.value !== 'Draft') ? 'none' : 'inline-flex';
    }
    
    // Toggle Save Draft vs Submit Request buttons based on role and edit state
    let saveDraftBtn = document.getElementById('btn-save-draft');
    
    // Show save draft only if it's a new request, and user is requester or admin
    if (!isEditMode && (isRequester || isAdmin)) {
      if (!saveDraftBtn) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'btn-save-draft';
        btn.className = 'btn btn-secondary';
        btn.onclick = () => App.saveDraft();
        btn.innerText = 'Save Draft';
        
        // Insert before Submit Request button
        const submitBtn = document.getElementById('btn-submit-request');
        if (submitBtn && submitBtn.parentNode) {
          submitBtn.parentNode.insertBefore(btn, submitBtn);
        }
      }
    } else {
      if (saveDraftBtn) {
        saveDraftBtn.remove();
      }
    }
  }

  function addFormItemRow(item = {}) {
    const tbody = document.getElementById('form-items-tbody');
    const rowId = 'item-row-' + Math.random().toString(36).slice(2, 9);
    const tr = document.createElement('tr');
    tr.id = rowId;

    const isAdmin = state.currentUser.role === 'admin';
    const isLab = state.currentUser.role === 'lab';
    const isRequester = state.currentUser.role === 'requester';
    const isAdminOrLab = isAdmin || isLab;

    // Populate values
    const id = item.id || '';
    const name = item.product_name || '';
    const batch = item.batch_number || '';
    const qty = item.quantity || '';
    const rm = item.rm_no || '';
    const result = item.test_result || 'In Process';
    const comment = item.item_comment || '';

    const isEditMode = state.currentRequestId !== null;
    const statusSelect = document.getElementById('form-status');
    const isDraftStatus = statusSelect ? statusSelect.value === 'Draft' : false;
    const disableInputs = isEditMode && ((isLab && !isAdmin) || (isRequester && !isDraftStatus));
    const showDelete = !disableInputs;

    tr.innerHTML = `
      <td>
        <input type="hidden" class="item-form-id" value="${id}">
        <input type="text" class="item-form-name" required placeholder="เช่น Hydraulic Oil AW 68" value="${escapeHtml(name)}" ${disableInputs ? 'disabled readonly style="background-color:#f1f5f9; cursor:not-allowed;"' : ''}>
      </td>
      <td>
        <input type="text" class="item-form-batch" required placeholder="เช่น B-260510-1" value="${escapeHtml(batch)}" ${disableInputs ? 'disabled readonly style="background-color:#f1f5f9; cursor:not-allowed;"' : ''}>
      </td>
      <td>
        <input type="text" class="item-form-qty" required placeholder="เช่น 10 Drums หรือ 5000L" value="${escapeHtml(qty)}" ${disableInputs ? 'disabled readonly style="background-color:#f1f5f9; cursor:not-allowed;"' : ''}>
      </td>
      <td class="admin-lab-field" style="display:${isAdminOrLab ? 'table-cell' : 'none'};">
        <input type="text" class="item-form-rm" placeholder="เช่น RM-HYD-01" value="${escapeHtml(rm)}" ${isRequester ? 'disabled readonly' : ''}>
      </td>
      <td class="admin-lab-field" style="display:${isAdminOrLab ? 'table-cell' : 'none'};">
        <select class="item-form-result" style="padding: 8px 10px;" ${isRequester ? 'disabled' : ''}>
          <option value="In Process" ${result === 'In Process' ? 'selected' : ''}>In Process</option>
          <option value="Pass" ${result === 'Pass' ? 'selected' : ''}>Pass</option>
          <option value="Fail" ${result === 'Fail' ? 'selected' : ''}>Fail</option>
          <option value="Hold" ${result === 'Hold' ? 'selected' : ''}>Hold</option>
        </select>
      </td>
      <td class="admin-lab-field" style="display:${isAdminOrLab ? 'table-cell' : 'none'};">
        <input type="text" class="item-form-comment" placeholder="หมายเหตุ" value="${escapeHtml(comment)}" ${isRequester ? 'disabled readonly' : ''}>
      </td>
      <td style="text-align:center;">
        ${showDelete ? `
        <button type="button" class="btn btn-secondary btn-sm" style="color:var(--text-danger); border-color:#fee2e2; padding:6px; min-width:32px;" onclick="App.removeFormItemRow('${rowId}')" title="ลบรายการนี้">
          &times;
        </button>
        ` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  }

  function removeFormItemRow(rowId) {
    const tbody = document.getElementById('form-items-tbody');
    // Prevent deleting the only remaining row
    if (tbody.children.length <= 1) {
      showToast('ต้องมีสินค้าอย่างน้อย 1 รายการในใบแจ้งตรวจสอบ', 'warning');
      return;
    }
    const row = document.getElementById(rowId);
    if (row) row.remove();
  }

  let isSaving = false; // guard to prevent double submissions

  async function handleRequestFormSubmit(e) {
    e.preventDefault();

    if (isSaving) {
      showToast('กำลังบันทึกข้อมูลอยู่ โปรดรอ...', 'warning');
      return;
    }
    isSaving = true;

    const customerName = document.getElementById('form-customer').value.trim();
    const carPlate = document.getElementById('form-car-plate').value.trim();
    const sealNo = document.getElementById('form-seal-no').value.trim();
    const containerNo = document.getElementById('form-container-no').value.trim();
    const notes = document.getElementById('form-notes').value.trim();
    const labComments = document.getElementById('form-lab-comments').value.trim();

    // Compile dynamic items from table rows
    const itemRows = document.querySelectorAll('#form-items-tbody tr');
    const itemsData = [];

    for (let row of itemRows) {
      const pName = row.querySelector('.item-form-name').value.trim();
      const pBatch = row.querySelector('.item-form-batch').value.trim();
      const pQty = row.querySelector('.item-form-qty').value.trim();
      
      const idVal = row.querySelector('.item-form-id').value;
      const rmInput = row.querySelector('.item-form-rm');
      const resultSelect = row.querySelector('.item-form-result');
      const commentInput = row.querySelector('.item-form-comment');

      const pRm = rmInput ? rmInput.value.trim() : '';
      const pResult = resultSelect ? resultSelect.value : 'In Process';
      const pComment = commentInput ? commentInput.value.trim() : '';

      if (!pName || !pBatch || !pQty) {
        showToast('กรุณากรอกข้อมูลสินค้าให้ครบถ้วนในทุกแถว', 'warning');
        isSaving = false;
        return;
      }

      itemsData.push({
        id: idVal || undefined,
        product_name: pName,
        batch_number: pBatch,
        quantity: pQty,
        rm_no: pRm,
        test_result: pResult,
        item_comment: pComment
      });
    }

    if (itemsData.length === 0) {
      showToast('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ', 'warning');
      isSaving = false;
      return;
    }

    const poNumber = document.getElementById('form-po-number');
    const needBaseOilCheck = document.getElementById('form-need-base-oil');
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const localDateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    const localTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const requestDate = document.getElementById('form-request-date').value || localDateStr;
    const requestTime = document.getElementById('form-request-time').value || localTimeStr;

    const statusSelect = document.getElementById('form-status');
    const requestData = {
      customer_name: customerName,
      po_number: poNumber ? poNumber.value.trim() : '',
      need_base_oil_view: needBaseOilCheck ? needBaseOilCheck.checked : false,
      car_plate: carPlate,
      seal_no: sealNo,
      container_no: containerNo,
      notes: notes,
      lab_comments: labComments,
      request_date: requestDate,
      request_time: requestTime
    };

    let isSubmittingDraft = false;
    if (statusSelect && statusSelect.value) {
      requestData.status = statusSelect.value;
    }

    if (requestData.status === 'Draft') {
      requestData.status = 'Pending';
      isSubmittingDraft = true;
    }

    // If Admin or Lab is editing, include the manual request numbers if provided
    const isAdmin = state.currentUser.role === 'admin';
    const isLab = state.currentUser.role === 'lab';
    const isAdminOrLab = isAdmin || isLab;
    const formReqNo = document.getElementById('form-request-no');
    const formReqYear = document.getElementById('form-request-year');
    if (isAdminOrLab && formReqNo && formReqYear && formReqNo.value) {
      requestData.request_no = formReqNo.value;
      requestData.request_year = formReqYear.value;
    }

    try {
      showLoadingButton(e.submitter, true, 'กำลังบันทึกข้อมูล...');
      
      if (state.currentRequestId) {
        if (isSubmittingDraft) {
          // Submit Draft (Draft -> Pending)
          const submitted = await window.DB.submitDraft(state.currentRequestId, requestData, itemsData);
          showToast('ส่งใบแจ้งตรวจสอบเรียบร้อยแล้ว', 'success');
          navigate('request-detail', { id: submitted.id });
        } else {
          // Update request (Admin/Lab)
          const updated = await window.DB.updateRequest(state.currentRequestId, requestData, itemsData);
          showToast('แก้ไขข้อมูลใบแจ้งตรวจสอบเรียบร้อยแล้ว', 'success');
          
          if (currentFulfillingEditRequestId) {
            await window.DB.updateEditRequestStatus(currentFulfillingEditRequestId, 'Approved', state.currentUser.id);
            currentFulfillingEditRequestId = null;
            showToast('ตอบรับและบันทึกคำขอแก้ไขข้อมูลเรียบร้อยแล้ว', 'success');
          }

          navigate('request-detail', { id: updated.id });
        }
      } else {
        // Create request directly
        const created = await window.DB.createRequest(requestData, itemsData);
        showToast('บันทึกใบแจ้งตรวจสอบส่งแล็บเรียบร้อยแล้ว', 'success');
        navigate('request-detail', { id: created.id });
      }
    } catch (err) {
      console.error(err);
      showToast('ไม่สามารถบันทึกข้อมูลได้: ' + err.message, 'error');
    } finally {
      isSaving = false;
      showLoadingButton(e.submitter, false, 'Submit Request');
    }
  }

  async function saveDraft() {
    if (isSaving) return;
    isSaving = true;
    const btn = document.getElementById('btn-save-draft');
    showLoadingButton(btn, true, 'Saving Draft...');

    try {
      const customerName = document.getElementById('form-customer').value.trim();
      const carPlate = document.getElementById('form-car-plate').value.trim();
      const sealNo = document.getElementById('form-seal-no').value.trim();
      const containerNo = document.getElementById('form-container-no').value.trim();
      const notes = document.getElementById('form-notes').value.trim();
      
      const itemRows = document.querySelectorAll('#form-items-tbody tr');
      const itemsData = [];
      for (let row of itemRows) {
        itemsData.push({
          id: row.querySelector('.item-form-id').value || undefined,
          product_name: row.querySelector('.item-form-name').value.trim() || '-',
          batch_number: row.querySelector('.item-form-batch').value.trim() || '-',
          quantity: row.querySelector('.item-form-qty').value.trim() || '-',
          test_result: 'In Process'
        });
      }

      if (itemsData.length === 0) {
        itemsData.push({ product_name: '-', batch_number: '-', quantity: '-', test_result: 'In Process' });
      }

      const poNumber = document.getElementById('form-po-number');
      const needBaseOilCheck = document.getElementById('form-need-base-oil');
      
      // We will set status = 'Draft'
      const requestData = {
        customer_name: customerName || 'Draft Customer',
        po_number: poNumber ? poNumber.value.trim() : '',
        need_base_oil_view: needBaseOilCheck ? needBaseOilCheck.checked : false,
        car_plate: carPlate,
        seal_no: sealNo,
        container_no: containerNo,
        notes: notes,
        status: 'Draft',
        request_date: document.getElementById('form-request-date').value,
        request_time: document.getElementById('form-request-time').value
      };

      if (state.currentRequestId) {
        await window.DB.updateDraft(state.currentRequestId, requestData, itemsData);
      } else {
        await window.DB.createRequest(requestData, itemsData);
      }

      showToast('บันทึกแบบร่างเรียบร้อย', 'success');
      navigate('drafts');
    } catch (err) {
      console.error(err);
      showToast('ไม่สามารถบันทึกแบบร่างได้: ' + err.message, 'error');
    } finally {
      isSaving = false;
      showLoadingButton(btn, false, 'Save Draft');
    }
  }

  // --- 4. REQUEST DETAIL CONTROLLER & PRINT WRITER ---
  async function loadRequestDetail(id) {
    state.currentRequestId = id;
    
    // Clear detail display values
    document.getElementById('detail-no').innerText = 'Loading...';
    document.getElementById('detail-datetime').innerText = '';
    document.getElementById('detail-customer').innerText = '';
    document.getElementById('detail-requester').innerText = '';
    
    const itemsTbody = document.getElementById('detail-items-tbody');
    itemsTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">กำลังโหลดข้อมูลรายการสินค้า...</td></tr>`;

    try {
      const details = await window.DB.getRequestDetail(id);
      
      // Update details fields
      document.getElementById('detail-no').innerText = `${details.request_no}/${details.request_year}`;
      document.getElementById('detail-datetime').innerText = `${formatThaiDate(details.request_date)} เวลา ${details.request_time.slice(0, 5)} น.`;
      document.getElementById('detail-customer').innerText = details.customer_name;
      document.getElementById('detail-requester').innerText = details.requester_name;

      // Status Badge
      const statusBadge = document.getElementById('detail-status-badge');
      statusBadge.innerText = details.status;
      statusBadge.className = `badge ${getStatusBadgeClass(details.status)}`;

      // PO Number
      const poEl = document.getElementById('detail-po-number');
      if (poEl) poEl.innerText = details.po_number || '-';

      // Transport values
      document.getElementById('detail-car-plate').innerText = details.car_plate || 'ไม่ระบุ';
      document.getElementById('detail-seal-no').innerText = details.seal_no || 'ไม่ระบุ';
      document.getElementById('detail-container-no').innerText = details.container_no || 'ไม่ระบุ';

      // Notes and comments
      document.getElementById('detail-notes').innerText = details.notes || 'ไม่มีหมายเหตุ';
      document.getElementById('detail-lab-comments').innerText = details.lab_comments || 'ไม่มีความคิดเห็นจากห้องปฏิบัติการ';

      // Items table
      itemsTbody.innerHTML = '';
      details.items.forEach(item => {
        const tr = document.createElement('tr');
        
        const isRequester = state.currentUser.role === 'requester';
        const isPendingItem = item.test_result === 'In Process';
        
        // Hide if requester and item is pending
        const showBlank = isRequester && isPendingItem;
        
        const displayRm = showBlank ? '' : (item.rm_no || '');
        let displayRes = showBlank ? '' : item.test_result;
        
        let resClass = 'result-progress';
        if (showBlank) {
          resClass = '';
        } else {
          if (item.test_result === 'Pass') resClass = 'result-pass';
          if (item.test_result === 'Fail') resClass = 'result-fail';
          if (item.test_result === 'Hold') resClass = 'result-hold';
        }

        // Sticker print button — item-level eligibility (admin/lab only)
        let stickerBtnHtml = '';
        if (['admin', 'lab', 'requester'].includes(state.currentUser.role)) {
          const r = (item.test_result || '').toLowerCase().trim();
          const canPrint = (r === 'pass' || r === 'hold' || r === 'fail');
          if (canPrint) {
            // Encode item data for inline call
            const safeProduct = escapeHtml(item.product_name).replace(/'/g, '&#39;');
            const safeBatch = escapeHtml(item.batch_number).replace(/'/g, '&#39;');
            stickerBtnHtml = `
              <button class="btn-icon" style="font-size:16px;" title="🖨️ พิมพ์สติกเกอร์"
                onclick="App.openStickerPreviewDirect('${item.test_result}','${safeProduct}','${safeBatch}','${details.request_date || ''}','${item.inspection_date || ''}', '${item.id}')">
                🖨️
              </button>`;
          } else {
            stickerBtnHtml = `
              <button class="btn-icon" style="color:var(--text-muted); opacity:0.4; cursor:not-allowed; font-size:16px;" disabled
                title="วัตถุดิบรายการนี้ยังตรวจสอบไม่เสร็จ จึงไม่สามารถพิมพ์สติกเกอร์ได้">
                🔒
              </button>`;
          }
        }

        // Inspection Date Column
        let inspectionDateHtml = '-';
        if (item.inspection_date) {
            inspectionDateHtml = _formatRecDate(item.inspection_date);
        }
        if (state.currentUser.role === 'admin') {
            inspectionDateHtml += ` <button onclick="App.editInspectionDate('${item.id}', '${item.inspection_date || ''}')" style="background:none;border:none;cursor:pointer;color:var(--primary-color);" title="แก้ไขวันที่ตรวจสอบ">✏️</button>`;
        }

        tr.innerHTML = `
          <td><strong>${escapeHtml(item.product_name)}</strong></td>
          <td>
            ${['admin', 'lab'].includes(state.currentUser.role) 
              ? `<a href="#" style="font-weight:500;" onclick="App.traceBatch('${escapeHtml(item.batch_number)}'); return false;" title="คลิกเพื่อตรวจสอบประวัติของ Batch นี้">${escapeHtml(item.batch_number)}</a>`
              : `<span>${escapeHtml(item.batch_number)}</span>`
            }
          </td>
          <td>${escapeHtml(item.quantity)}</td>
          <td>${displayRm ? `<code>${escapeHtml(displayRm)}</code>` : ''}</td>
          <td>${displayRes ? `<span class="badge ${resClass}">${displayRes}</span>` : ''}</td>
          <td style="text-align:center;">${inspectionDateHtml}</td>
          <td style="text-align:center;">${stickerBtnHtml}</td>
          <td style="color:#666; font-size:13px; max-width:150px; word-wrap:break-word;">${escapeHtml(item.item_comment || '')}</td>
        `;
        itemsTbody.appendChild(tr);
      });

      // Show/Hide action buttons according to rules
      const isAdmin = state.currentUser.role === 'admin';
      const isLab = state.currentUser.role === 'lab';
      const isBaseOil = state.currentUser.role === 'base_oil';
      const printBtn = document.getElementById('btn-detail-print');
      const editBtn = document.getElementById('btn-detail-modify');
      const deleteBtn = document.getElementById('btn-detail-remove');

      const isApproved = details.approved === true || (details.status && details.status.trim().toLowerCase() === 'approved');
      
      if (printBtn) printBtn.style.setProperty('display', 'inline-flex', 'important');
      
      if (isBaseOil || isApproved) {
        if (editBtn) editBtn.style.setProperty('display', 'none', 'important');
        if (deleteBtn) deleteBtn.style.setProperty('display', 'none', 'important');
      } else {
        if (editBtn) editBtn.style.setProperty('display', (isAdmin || isLab) ? 'inline-flex' : 'none', 'important');
        if (deleteBtn) deleteBtn.style.setProperty('display', isAdmin ? 'inline-flex' : 'none', 'important');
      }

      // Dynamically render Approve/Reject buttons ONLY when status is Complete
      const approveRejectContainer = document.getElementById('approve-reject-btn-container');
      if (approveRejectContainer) {
        if (details.status && details.status.trim().toLowerCase() === 'complete' && (isAdmin || isLab)) {
          approveRejectContainer.innerHTML = `
            <button class="btn btn-sm" id="btn-detail-approve" style="background-color:#16a34a; color:white; border:none;" onclick="App.approveRequest()">
              <i data-lucide="check-circle"></i> Approve
            </button>
            <button class="btn btn-sm" id="btn-detail-reject" style="background-color:#dc2626; color:white; border:none;" onclick="App.rejectRequest()">
              <i data-lucide="x-circle"></i> Reject
            </button>
          `;
          if (window.lucide) window.lucide.createIcons();
        } else {
          approveRejectContainer.innerHTML = '';
        }
      }

      // Document Approval Card Logic
      const approvalCard = document.getElementById('detail-approval-card');
      if (approvalCard) {
        // Only show to Admin and Lab
        if (isAdmin || isLab) {
          approvalCard.style.display = 'block';
          const badge = document.getElementById('approval-status-badge');
          
          if (details.approved) {
            badge.innerText = 'Approved';
            badge.className = 'badge approved';
            document.getElementById('approval-pending-state').style.display = 'none';
            document.getElementById('approval-done-state').style.display = 'flex';
            
            document.getElementById('approval-name-display').innerText = details.approved_name || '-';
            document.getElementById('approval-role-display').innerText = details.approved_role || '-';
            
            const dt = details.approved_at ? new Date(details.approved_at) : null;
            document.getElementById('approval-date-display').innerText = dt ? `${formatThaiDate(dt.toISOString().split('T')[0])} ${dt.toTimeString().slice(0, 5)} น.` : '-';
            
            const sigImg = document.getElementById('approval-signature-img');
            const noSig = document.getElementById('approval-no-sig-text');
            if (details.approved_signature_snapshot) {
              sigImg.src = details.approved_signature_snapshot;
              sigImg.style.display = 'block';
              noSig.style.display = 'none';
            } else {
              sigImg.style.display = 'none';
              noSig.style.display = 'block';
            }

            document.getElementById('reopen-action-container').style.display = isAdmin ? 'block' : 'none';

          } else {
            badge.innerText = 'Waiting for Approval';
            badge.className = 'badge pending';
            document.getElementById('approval-pending-state').style.display = 'flex';
            document.getElementById('approval-done-state').style.display = 'none';
            
            // Validation msg hidden initially, check handled on click
            const msgEl = document.getElementById('approval-validation-msg');
            if (msgEl) msgEl.style.display = 'none';
          }
        } else {
          approvalCard.style.display = 'none';
        }
      }

      // PREPARE A4 PRINT LAYOUT TEMPLATE
      populateA4PrintTemplate(details);

    } catch (e) {
      console.error(e);
      showToast('ไม่สามารถดึงข้อมูลรายละเอียดใบแจ้งได้: ' + e.message, 'error');
      navigate('requests');
    }
  }

  function populateA4PrintTemplate(details) {
    document.getElementById('print-no').innerText = `${details.request_no}/${details.request_year}`;
    document.getElementById('print-date').innerText = formatThaiDate(details.request_date);
    document.getElementById('print-time').innerText = `${details.request_time.slice(0, 5)} น.`;
    document.getElementById('print-customer').innerText = details.customer_name;
    document.getElementById('print-requester').innerText = details.requester_name;

    const poPrintEl = document.getElementById('print-po-number');
    if (poPrintEl) poPrintEl.innerText = details.po_number || '-';

    // Approved by info
    const approvedNameEl = document.getElementById('print-approved-name');
    const approvedDateEl = document.getElementById('print-approved-date');
    const waitingEl = document.getElementById('print-waiting-approval');
    const sigBox = document.getElementById('print-signature-img-box');
    
    // Clear old images
    if (sigBox) {
      const imgs = sigBox.querySelectorAll('img');
      imgs.forEach(i => i.remove());
    }

    if (details.approved) {
      if (waitingEl) waitingEl.style.display = 'none';
      if (approvedNameEl) approvedNameEl.innerText = details.approved_name || '';
      if (approvedDateEl && details.approved_at) {
        const dt = new Date(details.approved_at);
        approvedDateEl.innerText = `อนุมัติเมื่อ: ${formatThaiDate(dt.toISOString().split('T')[0])} เวลา ${dt.toTimeString().slice(0, 5)} น.`;
      }
      
      // Signature image
      if (sigBox && details.approved_signature_snapshot) {
        const img = document.createElement('img');
        img.src = details.approved_signature_snapshot;
        img.style.cssText = 'max-height:60px; max-width:160px; object-fit:contain; position:relative; z-index:2;';
        sigBox.appendChild(img);
      }
    } else {
      if (waitingEl) waitingEl.style.display = 'block';
      if (approvedNameEl) approvedNameEl.innerText = '';
      if (approvedDateEl) approvedDateEl.innerText = '';
    }

    document.getElementById('print-car-plate').innerText = details.car_plate || '-';
    document.getElementById('print-seal-no').innerText = details.seal_no || '-';
    document.getElementById('print-container-no').innerText = details.container_no || '-';

    document.getElementById('print-notes').innerText = details.notes || '';
    document.getElementById('print-lab-comments').innerText = details.lab_comments || '';

    const printTbody = document.getElementById('print-items-tbody');
    printTbody.innerHTML = '';
    
    const isRequester = state.currentUser.role === 'requester';
    
    details.items.forEach((item, idx) => {
      const tr = document.createElement('tr');
      const showBlank = isRequester && item.test_result === 'In Process';
      const displayRm = showBlank ? '' : (item.rm_no || '-');
      const displayRes = showBlank ? '' : item.test_result;
      
      tr.innerHTML = `
        <td style="text-align:center;">${idx + 1}</td>
        <td>${escapeHtml(item.product_name)}</td>
        <td>${escapeHtml(item.batch_number)}</td>
        <td>${escapeHtml(item.quantity)}</td>
        <td>${escapeHtml(displayRm)}</td>
        <td style="text-align:center; font-weight:bold; color:${displayRes === 'Pass' ? '#16a34a' : (displayRes === 'Fail' ? '#dc2626' : (displayRes === 'Hold' ? '#d97706' : '#64748b'))}">${displayRes}</td>
      `;
      printTbody.appendChild(tr);
    });
  }

  function editCurrentRequest() {
    if (state.currentRequestId) {
      navigate('request-edit', { id: state.currentRequestId });
    }
  }

  async function deleteCurrentRequest() {
    if (!state.currentRequestId) return;
    
    if (confirm('คุณแน่ใจว่าต้องการลบใบแจ้งตรวจสอบห้องปฏิบัติการใบนี้ใช่หรือไม่? การลบจะไม่สามารถกู้ข้อมูลกลับมาได้')) {
      try {
        await window.DB.deleteRequest(state.currentRequestId);
        showToast('ลบข้อมูลใบแจ้งตรวจสอบเรียบร้อยแล้ว', 'success');
        navigate('requests');
      } catch (e) {
        console.error(e);
        showToast('ไม่สามารถลบใบแจ้งได้: ' + e.message, 'error');
      }
    }
  }

  async function deleteRequest(id) {
    if (!confirm('ยืนยันการลบข้อมูลนี้? การกระทำนี้ไม่สามารถย้อนกลับได้')) return;
    try {
      await window.DB.deleteRequest(id);
      showToast('ลบแบบร่างเรียบร้อยแล้ว', 'success');
      loadDraftsList();
    } catch (e) {
      console.error(e);
      showToast('ไม่สามารถลบแบบร่างได้: ' + e.message, 'error');
    }
  }

  // --- 5. MATERIAL HISTORY AUDIT LOADER (ADMIN ONLY) ---
  async function loadMaterialHistory() {
    const listBody = document.getElementById('history-list-tbody');
    // Pre-populate input values with filters state
    document.getElementById('hist-product').value = state.historyFilters.productName;
    document.getElementById('hist-batch').value = state.historyFilters.batchNumber;
    document.getElementById('hist-rm').value = state.historyFilters.rmNo;
    document.getElementById('hist-request-no').value = state.historyFilters.requestNo;
    document.getElementById('hist-result').value = state.historyFilters.testResult;
    document.getElementById('hist-start-date').value = state.historyFilters.startDate;
    document.getElementById('hist-end-date').value = state.historyFilters.endDate;

    listBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:30px;">กำลังโหลดประวัติวัตถุดิบ...</td></tr>`;

    try {
      const history = await window.DB.getMaterialHistory(state.historyFilters);
      state.historyList = history;
      listBody.innerHTML = '';

      if (history.length === 0) {
        listBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:30px;">ไม่พบประวัติการส่งทดสอบของชิ้นงาน/วัตถุดิบนี้</td></tr>`;
        return;
      }

      history.forEach(h => {
        const tr = document.createElement('tr');
        const formattedDate = formatThaiDate(h.request_date);
        const formattedTime = h.request_time.slice(0, 5);
        
        let resClass = 'result-process';
        if (h.test_result === 'Pass') resClass = 'result-pass';
        if (h.test_result === 'Fail') resClass = 'result-fail';
        if (h.test_result === 'Hold') resClass = 'result-hold';

        const statusBadge = getStatusBadgeClass(h.status);
        const s = (h.status || '').toLowerCase().trim();

        // ตรวจสอบสิทธิ์พิมพ์จากผลการตรวจระดับรายการ (test_result) ไม่ใช่สถานะใบ Request
        let printBtnHtml = '';
        if (state.currentUser && ['admin', 'lab'].includes(state.currentUser.role)) {
          const r = (h.test_result || '').toLowerCase().trim();
          const canPrint = (r === 'pass' || r === 'hold' || r === 'fail');
          if (canPrint) {
            printBtnHtml = `
              <button class="btn-icon" style="color:var(--text-color); font-size:16px;" onclick="App.openStickerPreview('${h.id}')" title="🖨 พิมพ์สติกเกอร์">
                🖨
              </button>
            `;
          } else {
            printBtnHtml = `
              <button class="btn-icon" style="color:var(--text-muted); cursor:not-allowed; font-size:16px; opacity:0.4;" disabled title="วัตถุดิบรายการนี้ยังตรวจสอบไม่เสร็จ จึงไม่สามารถพิมพ์สติกเกอร์ได้">
                🔒
              </button>
            `;
          }
        }

        // Inspection Date Column
        let inspectionDateHtml = '-';
        if (h.inspection_date) {
            inspectionDateHtml = _formatRecDate(h.inspection_date);
        }
        if (state.currentUser.role === 'admin') {
            inspectionDateHtml += ` <button onclick="App.editInspectionDate('${h.item_id}', '${h.inspection_date || ''}')" style="background:none;border:none;cursor:pointer;color:var(--primary-color);" title="แก้ไขวันที่ตรวจสอบ">✏️</button>`;
        }

        tr.innerHTML = `
          <td style="white-space: nowrap;"><strong>${h.request_no}/${h.request_year}</strong></td>
          <td style="white-space: nowrap;">${formattedDate} ${formattedTime} น.</td>
          <td>${escapeHtml(h.product_name)}</td>
          <td style="white-space: nowrap;">
            <a href="#" style="font-weight:500;" onclick="App.traceBatch('${escapeHtml(h.batch_number)}'); return false;" title="คลิกดูประวัติทั้งหมดของ Batch นี้">
              ${escapeHtml(h.batch_number)}
            </a>
          </td>
          <td style="white-space: nowrap;">${h.rm_no ? `<code>${escapeHtml(h.rm_no)}</code>` : '<em style="color:var(--text-muted);">ว่าง</em>'}</td>
          <td style="white-space: nowrap;"><span class="badge ${resClass}">${h.test_result}</span></td>
          <td style="white-space: nowrap; text-align:center;">${inspectionDateHtml}</td>
          <td style="color:#666; font-size:13px; max-width:150px; word-wrap:break-word;">${escapeHtml(h.item_comment || '')}</td>
          <td style="white-space: nowrap;">${escapeHtml(h.requester_name)}</td>
          <td style="white-space: nowrap;"><span class="badge ${statusBadge}">${h.status}</span></td>
          <td style="display: flex; justify-content: center; align-items: center; gap: 8px; white-space: nowrap;">
            <button class="btn-icon" onclick="App.navigate('request-detail', {id: '${h.request_id}'})" title="ดูรายละเอียดใบแจ้ง">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            ${printBtnHtml}
          </td>
        `;
        listBody.appendChild(tr);
      });
    } catch (e) {
      console.error(e);
      listBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-danger); padding:30px;">เกิดข้อผิดพลาดในการโหลดประวัติวัตถุดิบ: ${e.message}</td></tr>`;
    }
  }

  function handleHistoryFilter(e) {
    e.preventDefault();
    state.historyFilters = {
      productName: document.getElementById('hist-product').value.trim(),
      batchNumber: document.getElementById('hist-batch').value.trim(),
      rmNo: document.getElementById('hist-rm').value.trim(),
      requestNo: document.getElementById('hist-request-no').value.trim(),
      testResult: document.getElementById('hist-result').value,
      startDate: document.getElementById('hist-start-date').value,
      endDate: document.getElementById('hist-end-date').value
    };
    loadMaterialHistory();
  }

  function clearHistoryFilters() {
    state.historyFilters = {
      productName: '', batchNumber: '', rmNo: '', requestNo: '', testResult: '', startDate: '', endDate: ''
    };
    loadMaterialHistory();
  }

  // --- BATCH TRACE POPUP LOADER (ADMIN ONLY) ---
  async function traceBatch(batchNumber) {
    console.log('Tracing batch:', batchNumber);
    const modal = document.getElementById('modal-batch-trace');
    const title = document.getElementById('batch-trace-title');
    const tbody = document.getElementById('batch-trace-tbody');

    if (!modal || !title || !tbody) return;

    title.innerText = `ประวัติการตรวจสอบของ Batch: ${batchNumber}`;
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:20px;">กำลังสืบค้นประวัติ...</td></tr>`;
    
    modal.classList.add('open');

    try {
      const traceLogs = await window.DB.getBatchHistory(batchNumber);
      tbody.innerHTML = '';

      if (traceLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:20px;">ไม่พบประวัติสำหรับ Batch: ${batchNumber}</td></tr>`;
        return;
      }

      traceLogs.forEach(h => {
        const tr = document.createElement('tr');
        const formattedDate = formatThaiDate(h.request_date);
        const formattedTime = h.request_time.slice(0, 5);

        let resClass = 'result-process';
        if (h.test_result === 'Pass') resClass = 'result-pass';
        if (h.test_result === 'Fail') resClass = 'result-fail';
        if (h.test_result === 'Hold') resClass = 'result-hold';

        const statusBadge = getStatusBadgeClass(h.status);

        tr.innerHTML = `
          <td style="white-space: nowrap;"><strong>${h.request_no}/${h.request_year}</strong></td>
          <td style="white-space: nowrap;">${formattedDate} ${formattedTime} น.</td>
          <td>${escapeHtml(h.product_name)}</td>
          <td style="white-space: nowrap;">${h.rm_no ? `<code>${escapeHtml(h.rm_no)}</code>` : '<em style="color:var(--text-muted);">ว่าง</em>'}</td>
          <td style="white-space: nowrap;"><span class="badge ${resClass}">${h.test_result}</span></td>
          <td style="white-space: nowrap;">${escapeHtml(h.requester_name)}</td>
          <td style="white-space: nowrap;"><span class="badge ${statusBadge}">${h.status}</span></td>
          <td style="white-space: nowrap;">
            <a href="#" onclick="App.closeBatchTraceModal(); App.navigate('request-detail', {id: '${h.request_id}'}); return false;">ดูรายละเอียด &rarr;</a>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-danger); padding:20px;">ไม่สามารถดึงข้อมูลประวัติได้: ${e.message}</td></tr>`;
    }
  }

  function closeBatchTraceModal() {
    const modal = document.getElementById('modal-batch-trace');
    if (modal) modal.classList.remove('open');
  }

  // --- 6. USER ACCOUNT MANAGER (ADMIN ONLY) ---
  async function loadUsersManager() {
    const listBody = document.getElementById('users-list-tbody');
    listBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:30px;">กำลังโหลดรายชื่อผู้ใช้งาน...</td></tr>`;

    try {
      const users = await window.DB.getUsers();
      listBody.innerHTML = '';

      if (users.length === 0) {
        listBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:30px;">ไม่มีผู้ใช้งานระบบในขณะนี้</td></tr>`;
        return;
      }

      users.forEach(u => {
        const tr = document.createElement('tr');
        
        let roleBadgeClass = 'badge result-progress'; // default
        let roleText = 'Requester';
        if (u.role === 'admin') {
          roleBadgeClass = 'badge result-fail'; // red
          roleText = 'Admin';
        } else if (u.role === 'lab') {
          roleBadgeClass = 'badge result-hold'; // amber
          roleText = 'Lab';
        } else if (u.role === 'base_oil') {
          roleBadgeClass = 'badge in-process';
          roleText = 'Base Oil';
        }

        const createdDate = u.created_at ? formatThaiDate(u.created_at.split('T')[0]) : '-';

        // Check if user row is current user (to prevent self deletion)
        const isSelf = u.id === state.currentUser.id;

        tr.innerHTML = `
          <td><strong>${escapeHtml(u.username)}</strong></td>
          <td>${escapeHtml(u.display_name)}</td>
          <td><span class="${roleBadgeClass}" style="text-transform:none;">${roleText}</span></td>
          <td>${createdDate}</td>
          <td style="text-align:center; display:flex; justify-content:center; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="App.openChangePasswordModal('${u.id}', '${escapeHtml(u.username)}')" style="padding:4px 8px;">
              เปลี่ยนรหัสผ่าน
            </button>
            <button class="btn btn-logout btn-sm" onclick="App.deleteUserAccount('${u.id}', '${escapeHtml(u.username)}')" style="padding:4px 8px; border-radius:var(--radius-sm); ${isSelf ? 'opacity:0.3; cursor:not-allowed;' : ''}" ${isSelf ? 'disabled' : ''}>
              ลบ
            </button>
          </td>
        `;
        listBody.appendChild(tr);
      });
    } catch (e) {
      console.error(e);
      listBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-danger); padding:30px;">ไม่สามารถดึงรายชื่อผู้ใช้ได้: ${e.message}</td></tr>`;
    }
  }

  function openCreateUserModal() {
    const modal = document.getElementById('modal-create-user');
    if (modal) {
      document.getElementById('create-user-form').reset();
      modal.classList.add('open');
    }
  }

  function closeCreateUserModal() {
    const modal = document.getElementById('modal-create-user');
    if (modal) modal.classList.remove('open');
  }

  async function handleCreateUserSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('user-username').value.trim();
    const displayName = document.getElementById('user-display-name').value.trim();
    const department = document.getElementById('user-dept').value.trim();
    const password = document.getElementById('user-password').value;
    const role = document.getElementById('user-role').value;

    if (password.length < 6) {
      showToast('รหัสผ่านจำเป็นต้องมีความยาวไม่ต่ำกว่า 6 อักขระ', 'warning');
      return;
    }

    // Validate username characters
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      showToast('ชื่อผู้ใช้งานสามารถใช้ตัวอักษรภาษาอังกฤษ ตัวเลข และเครื่องหมาย _ เท่านั้น', 'warning');
      return;
    }

    const fullDisplayName = department ? `${displayName} (${department})` : displayName;

    try {
      showLoadingButton(e.submitter, true, 'กำลังบันทึก...');
      await window.DB.createUser(username, password, fullDisplayName, role);
      showToast(`สร้างบัญชีผู้ใช้ ${username} สำเร็จแล้ว`, 'success');
      closeCreateUserModal();
      loadUsersManager();
    } catch (err) {
      console.error(err);
      showToast('ไม่สามารถสร้างบัญชีผู้ใช้งานได้: ' + err.message, 'error');
    } finally {
      showLoadingButton(e.submitter, false, 'สร้างผู้ใช้');
    }
  }

  // --- SETTINGS MODAL (all roles) ---
  function openSettingsModal() {
    const modal = document.getElementById('modal-settings');
    if (modal) modal.classList.add('open');
  }

  function closeSettingsModal() {
    const modal = document.getElementById('modal-settings');
    if (modal) modal.classList.remove('open');
  }

  function openChangeOwnPasswordModal() {
    closeSettingsModal();
    const form = document.getElementById('change-own-password-form');
    if (form) form.reset();
    const errEl = document.getElementById('own-pwd-error');
    if (errEl) errEl.style.display = 'none';
    const modal = document.getElementById('modal-change-own-password');
    if (modal) modal.classList.add('open');
  }

  function closeChangeOwnPasswordModal() {
    const modal = document.getElementById('modal-change-own-password');
    if (modal) modal.classList.remove('open');
  }

  function togglePwdVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.innerHTML = isHidden ? '&#128683;' : '&#128065;'; // closed-eye / open-eye
  }

  async function handleChangeOwnPasswordSubmit(e) {
    e.preventDefault();
    const errEl = document.getElementById('own-pwd-error');
    const showErr = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };
    errEl.style.display = 'none';

    const currentPwd  = document.getElementById('own-pwd-current').value;
    const newPwd      = document.getElementById('own-pwd-new').value;
    const confirmPwd  = document.getElementById('own-pwd-confirm').value;

    // --- Validation ---
    if (!currentPwd || !newPwd || !confirmPwd) {
      return showErr('กรุณากรอกข้อมูลให้ครบถ้วนทุกช่อง');
    }
    if (newPwd.length < 4) {
      return showErr('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร');
    }
    if (newPwd !== confirmPwd) {
      return showErr('รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน');
    }
    if (newPwd === currentPwd) {
      return showErr('รหัสผ่านใหม่ต้องไม่ซ้ำกันกับรหัสผ่านเดิม');
    }

    const submitBtn = document.getElementById('own-pwd-submit-btn');
    try {
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'กำลังบันทึก...'; }
      await window.DB.changeOwnPassword(currentPwd, newPwd);
      closeChangeOwnPasswordModal();
      showToast('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว ✅', 'success');
    } catch (err) {
      console.error(err);
      showErr(err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '💾 บันทึกรหัสผ่านใหม่'; }
    }
  }

  // --- ADMIN: change password for another user ---
  function openChangePasswordModal(userId, username) {
    const modal = document.getElementById('modal-change-password');
    if (modal) {
      document.getElementById('change-password-form').reset();
      document.getElementById('change-pwd-userid').value = userId;
      document.getElementById('change-pwd-title').innerText = `เปลี่ยนรหัสผ่านสำหรับผู้ใช้: ${username}`;
      modal.classList.add('open');
    }
  }

  function closeChangePasswordModal() {
    const modal = document.getElementById('modal-change-password');
    if (modal) modal.classList.remove('open');
  }

  async function handleChangePasswordSubmit(e) {
    e.preventDefault();
    const userId = document.getElementById('change-pwd-userid').value;
    const newPassword = document.getElementById('change-pwd-new').value;

    if (newPassword.length < 6) {
      showToast('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 อักขระ', 'warning');
      return;
    }

    try {
      showLoadingButton(e.submitter, true, 'กำลังบันทึก...');
      await window.DB.updateUserPassword(userId, newPassword);
      showToast('เปลี่ยนรหัสผ่านเสร็จสิ้นแล้ว', 'success');
      closeChangePasswordModal();
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน: ' + err.message, 'error');
    } finally {
      showLoadingButton(e.submitter, false, 'บันทึกรหัสผ่านใหม่');
    }
  }

  async function deleteUserAccount(userId, username) {
    if (confirm(`คุณแน่ใจหรือว่าต้องการลบบัญชีผู้ใช้ ${username} ใช่หรือไม่? รายการใบแจ้งตรวจสอบของผู้ใช้นี้จะไม่หายไป แต่ผู้ใช้นี้จะไม่สามารถเข้าระบบได้อีกต่อไป`)) {
      try {
        await window.DB.deleteUser(userId);
        showToast(`ลบบัญชีผู้ใช้ ${username} เรียบร้อยแล้ว`, 'success');
        loadUsersManager();
      } catch (e) {
        console.error(e);
        showToast('ไม่สามารถลบบัญชีผู้ใช้งานได้: ' + e.message, 'error');
      }
    }
  }

  // --- DATABASE CONNECTION CONFIG ---
  function openConfigModal() {
    const modal = document.getElementById('modal-config');
    if (!modal) return;
    
    // Load config state
    const config = window.AppConfig.load();
    document.getElementById('config-db-mode').value = config.dbMode;
    document.getElementById('config-sb-url').value = config.supabaseUrl || '';
    document.getElementById('config-sb-key').value = config.supabaseAnonKey || '';
    
    const soundToggle = document.getElementById('config-sound-enabled');
    if (soundToggle) soundToggle.checked = config.soundEnabled !== false;
    
    // Show/hide fields
    handleConfigModeChange();
    modal.classList.add('open');
  }

  function closeConfigModal() {
    const modal = document.getElementById('modal-config');
    if (modal) modal.classList.remove('open');
  }

  function handleConfigModeChange() {
    const mode = document.getElementById('config-db-mode').value;
    const fields = document.getElementById('supabase-config-fields');
    if (fields) {
      fields.style.display = mode === 'supabase' ? 'block' : 'none';
    }
  }

  function saveDatabaseConfig() {
    const mode = document.getElementById('config-db-mode').value;
    const url = document.getElementById('config-sb-url').value.trim();
    const key = document.getElementById('config-sb-key').value.trim();

    if (mode === 'supabase' && (!url || !key)) {
      showToast('กรุณากรอกข้อมูล Supabase URL และ Anon Key ให้ครบถ้วน', 'warning');
      return;
    }

    const config = {
      dbMode: mode,
      supabaseUrl: url,
      supabaseAnonKey: key
    };

    if (window.AppConfig.save(config)) {
      showToast('บันทึกการตั้งค่าการเชื่อมต่อสำเร็จแล้ว ระบบกำลังรีเฟรชฐานข้อมูล...', 'success');
      closeConfigModal();
      
      // Update badge status and logout active user sessions because DB provider has changed
      updateConnectionBadge();
      logout();
    } else {
      showToast('ไม่สามารถบันทึกการตั้งค่าลงเครื่องได้', 'error');
    }
  }

  // --- EXPORT TO EXCEL & CSV ---
  async function handleImportExcel(event) {
    if (state.currentUser.role !== 'admin') {
      showToast('เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถนำเข้าข้อมูลได้', 'error');
      return;
    }

    const file = event.target.files[0];
    if (!file) return;

    showToast('กำลังนำเข้าข้อมูล กรุณารอสักครู่...', 'info');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rawData = XLSX.utils.sheet_to_json(worksheet);
        
        if (!rawData || rawData.length === 0) {
          throw new Error('ไม่พบข้อมูลในไฟล์ Excel');
        }

        const requestsToImport = [];
        const itemsToImport = [];
        const requestGroups = {};

        // Fetch users to map Requester Name to ID
        const allUsers = await window.DB.getUsers();
        const userMap = {};
        if (allUsers) {
          allUsers.forEach(u => {
            if (u.display_name) userMap[u.display_name.trim().toLowerCase()] = u.id;
          });
        }

        // Group by Request Ref
        // Function to convert excel time fraction to HH:MM:SS
        const parseExcelTime = (time) => {
          if (typeof time === 'number') {
            let totalSeconds = Math.round(time * 86400);
            let hours = Math.floor(totalSeconds / 3600);
            let minutes = Math.floor((totalSeconds % 3600) / 60);
            let seconds = totalSeconds % 60;
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          }
          return String(time).trim();
        };

        const parseExcelDate = (date) => {
          if (typeof date === 'number') {
            const d = new Date(Math.round((date - 25569) * 86400 * 1000));
            return d.toISOString().split('T')[0];
          }
          return String(date).trim();
        };

        rawData.forEach(row => {
          const reqRef = String(row['Request Ref'] || '').trim();
          if (!reqRef) return; 

          if (!requestGroups[reqRef]) {
            let parsedYear = parseInt(row['Request Year']);
            if (isNaN(parsedYear)) parsedYear = new Date().getFullYear();
            
            // Format dates
            let reqDate = row['Request Date'] ? parseExcelDate(row['Request Date']) : new Date().toISOString().split('T')[0];
            let reqTime = row['Request Time'] ? parseExcelTime(row['Request Time']) : new Date().toTimeString().split(' ')[0];

            // Resolve Requester ID from name
            const reqName = String(row['Requester Name'] || '').trim().toLowerCase();
            let resolvedRequesterId = state.currentUser.id; // fallback to admin
            if (reqName && userMap[reqName]) {
              resolvedRequesterId = userMap[reqName];
            }

            requestGroups[reqRef] = {
              metadata: {
                request_no: String(row['Request No'] || '').trim(), 
                request_year: parsedYear,
                customer_name: String(row['Customer Name'] || '').trim(),
                request_date: reqDate,
                request_time: reqTime,
                po_number: String(row['PO Number'] || '').trim(),
                car_plate: String(row['Car Plate'] || '').trim(),
                seal_no: String(row['Seal No'] || '').trim(),
                container_no: String(row['Container No'] || '').trim(),
                notes: String(row['Notes'] || '').trim(),
                lab_comments: String(row['Lab Comments'] || '').trim(),
                status: 'Approved', 
                requester_id: resolvedRequesterId, 
                need_base_oil_view: false,
                created_at: new Date().toISOString()
              },
              items: []
            };
          }

          let itemInspectionDate = null;
          if (row['Inspection Date']) {
            itemInspectionDate = parseExcelDate(row['Inspection Date']);
          }

          requestGroups[reqRef].items.push({
            product_name: String(row['Product Name'] || '').trim(),
            batch_number: String(row['Batch Number'] || '').trim(),
            quantity: String(row['Quantity'] || '').trim(),
            rm_no: String(row['RM No'] || '').trim(),
            test_result: String(row['Test Result'] || 'Pass').trim(), 
            item_comment: String(row['Item Comment'] || '').trim(),
            inspection_date: itemInspectionDate
          });
        });

        // Generate UUIDs
        const generateUUID = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });

        for (const [ref, group] of Object.entries(requestGroups)) {
          const requestId = generateUUID();
          
          requestsToImport.push({
            id: requestId,
            ...group.metadata
          });

          group.items.forEach(item => {
            itemsToImport.push({
              id: generateUUID(),
              request_id: requestId,
              ...item
            });
          });
        }

        if (requestsToImport.length === 0) {
          throw new Error('ไม่พบข้อมูลที่จัดกลุ่ม (ตรวจสอบคอลัมน์ "Request Ref")');
        }

        await window.DB.bulkImportRequests(requestsToImport, itemsToImport);
        
        showToast(`นำเข้าสำเร็จ ${requestsToImport.length} ใบแจ้ง (${itemsToImport.length} รายการ)`, 'success');
        event.target.value = ''; 
        
        if (state.currentView === 'requests') {
          renderRequestsList();
        }
      } catch (err) {
        console.error('Import Error:', err);
        showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
        event.target.value = '';
      }
    };
    
    reader.readAsArrayBuffer(file);
  }

  async function exportRequestsExcel() {
    if (state.currentUser.role !== 'admin') {
      showToast('เฉพาะผู้ดูแลระบบเท่านั้นที่มีสิทธิ์ส่งออกข้อมูลได้', 'error');
      return;
    }

    try {
      showToast('กำลังจัดเตรียมข้อมูลสำหรับการส่งออก...', 'info');

      // 1. Fetch matching requests based on current filters
      const requests = await window.DB.getRequests(state.filters);
      if (requests.length === 0) {
        showToast('ไม่พบข้อมูลที่จะส่งออก', 'warning');
        return;
      }

      // 2. Fetch details for each request to compile its sub-items
      const flattenedData = [];

      for (let r of requests) {
        try {
          const detail = await window.DB.getRequestDetail(r.id);
          
          if (detail.items && detail.items.length > 0) {
            detail.items.forEach(item => {
              flattenedData.push({
                'เลขที่ใบแจ้ง (Request No)': `${detail.request_no}/${detail.request_year}`,
                'วันที่แจ้ง (Date)': detail.request_date,
                'เวลาที่แจ้ง (Time)': detail.request_time,
                'ชื่อลูกค้า (Customer)': detail.customer_name,
                'ผู้แจ้ง (Requester)': detail.requester_name,
                'ทะเบียนรถ (Car Plate)': detail.car_plate || '',
                'หมายเลขซีล (Seal No)': detail.seal_no || '',
                'หมายเลขตู้ (Container No)': detail.container_no || '',
                'หมายเหตุ (Notes)': detail.notes || '',
                'ความคิดเห็นห้องปฏิบัติการ (Lab Comments)': detail.lab_comments || '',
                'สถานะใบแจ้ง (Request Status)': detail.status,
                'ชื่อสินค้า (Product Name)': item.product_name,
                'Batch Number': item.batch_number,
                'Quantity (จำนวน)': item.quantity,
                'RM No.': item.rm_no || '',
                'ผลการทดสอบ (Test Result)': item.test_result
              });
            });
          } else {
            // Append parent details if request has no product items
            flattenedData.push({
              'เลขที่ใบแจ้ง (Request No)': `${detail.request_no}/${detail.request_year}`,
              'วันที่แจ้ง (Date)': detail.request_date,
              'เวลาที่แจ้ง (Time)': detail.request_time,
              'ชื่อลูกค้า (Customer)': detail.customer_name,
              'ผู้แจ้ง (Requester)': detail.requester_name,
              'ทะเบียนรถ (Car Plate)': detail.car_plate || '',
              'หมายเลขซีล (Seal No)': detail.seal_no || '',
              'หมายเลขตู้ (Container No)': detail.container_no || '',
              'หมายเหตุ (Notes)': detail.notes || '',
              'ความคิดเห็นห้องปฏิบัติการ (Lab Comments)': detail.lab_comments || '',
              'สถานะใบแจ้ง (Request Status)': detail.status,
              'ชื่อสินค้า (Product Name)': '',
              'Batch Number': '',
              'Quantity (จำนวน)': '',
              'RM No.': '',
              'ผลการทดสอบ (Test Result)': ''
            });
          }
        } catch (itemErr) {
          console.warn(`Failed to fetch items for request ${r.request_no}:`, itemErr);
        }
      }

      // 3. Export data logic
      // Check if SheetJS library is loaded successfully via CDN
      if (typeof XLSX !== 'undefined') {
        const worksheet = XLSX.utils.json_to_sheet(flattenedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Laboratory Requests');
        
        // Generate download name
        const timestamp = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(workbook, `LRMS_Export_${timestamp}.xlsx`);
        showToast('ส่งออกไฟล์ Excel (.xlsx) สำเร็จแล้ว', 'success');
      } else {
        // Fallback to CSV generation if CDN fails or runs completely offline
        console.warn('XLSX library not loaded. Falling back to CSV export.');
        triggerCSVDownload(flattenedData);
      }

    } catch (e) {
      console.error('Export failed:', e);
      showToast('การส่งออกข้อมูลล้มเหลว: ' + e.message, 'error');
    }
  }

  function triggerCSVDownload(data) {
    if (data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];

    data.forEach(row => {
      const values = headers.map(header => {
        const escaped = ('' + (row[header] || '')).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    });

    // Excel compatibility for Thai characters: prepend UTF-8 BOM (\uFEFF)
    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const timestamp = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `LRMS_Export_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('ส่งออกไฟล์ CSV สำเร็จแล้ว (เนื่องจากระบบออฟไลน์)', 'success');
  }

  // --- HELPER: Get CSS class for status badge ---
  function getStatusBadgeClass(status) {
    switch (status) {
      case 'Pending': return 'pending';
      case 'In Process': return 'in-process';
      case 'Complete': return 'complete';
      case 'Approved': return 'approved';
      case 'Rejected': return 'rejected';
      case 'Completed': return 'complete'; // backward compat
      case 'In Progress': return 'in-process'; // backward compat
      default: return 'pending';
    }
  }

  // --- APPROVE / REJECT CURRENT REQUEST ---
  let isApproving = false;

  async function approveRequest() {
    if (!state.currentRequestId) {
      showToast('ไม่พบ ID ของใบแจ้ง กรุณาลองเปิดใบแจ้งใหม่อีกครั้ง', 'error');
      return;
    }
    if (isApproving) return;

    // Validation
    const details = await window.DB.getRequestDetail(state.currentRequestId);
    if (!details) return;
    
    if (details.status !== 'Complete') {
      const msgEl = document.getElementById('approval-validation-msg');
      if (msgEl) {
        msgEl.innerText = 'ไม่สามารถอนุมัติได้ เนื่องจากข้อมูลการตรวจสอบยังไม่สมบูรณ์ (Status ต้องเป็น Complete)';
        msgEl.style.display = 'block';
      }
      return;
    }

    let allComplete = true;
    for (let item of details.items) {
      if (!item.test_result || item.test_result === 'In Process' || item.test_result === '') {
        allComplete = false; break;
      }
    }
    if (!allComplete) {
      const msgEl = document.getElementById('approval-validation-msg');
      if (msgEl) {
        msgEl.innerText = 'ไม่สามารถอนุมัติได้ เนื่องจากยังมีรายการที่ตรวจสอบไม่เสร็จสิ้น';
        msgEl.style.display = 'block';
      }
      return;
    }

    if (!confirm('ยืนยันการอนุมัติเอกสารนี้หรือไม่?\nหลังอนุมัติ จะไม่สามารถแก้ไขผลการตรวจสอบได้')) return;
    
    isApproving = true;
    const btn = document.getElementById('btn-approve-doc');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังอนุมัติ...'; }
    
    try {
      const updated = await window.DB.approveRequest(state.currentRequestId);
      showToast('อนุมัติเอกสารสำเร็จ สถานะเปลี่ยนเป็น Approved', 'success');
      await loadRequestDetail(state.currentRequestId);
    } catch (e) {
      console.error('approveRequest error:', e);
      showToast('ไม่สามารถอนุมัติได้: ' + e.message, 'error');
    } finally {
      isApproving = false;
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-circle"></i> Approve Document'; }
    }
  }

  async function reopenRequest() {
    if (!state.currentRequestId) return;
    if (isApproving) return;
    
    if (!confirm('ยืนยันการยกเลิกการอนุมัติ (Reopen) หรือไม่?\nสถานะจะกลับเป็น Complete และสามารถแก้ไขข้อมูลได้อีกครั้ง')) return;
    
    isApproving = true;
    try {
      await window.DB.reopenRequest(state.currentRequestId);
      showToast('Reopen เอกสารสำเร็จ', 'success');
      await loadRequestDetail(state.currentRequestId);
    } catch (e) {
      console.error('reopenRequest error:', e);
      showToast('ไม่สามารถ Reopen ได้: ' + e.message, 'error');
    } finally {
      isApproving = false;
    }
  }

  async function rejectRequest() {
    if (!state.currentRequestId) {
      showToast('ไม่พบ ID ของใบแจ้ง กรุณาลองเปิดใบแจ้งใหม่อีกครั้ง', 'error');
      return;
    }
    if (isApproving) return;
    if (!confirm('คุณต้องการ Reject ใบแจ้งนี้ใช่หรือไม่?\nสถานะจะเปลี่ยนเป็น Rejected')) return;
    
    isApproving = true;
    const btn = document.getElementById('btn-detail-reject');
    if (btn) { btn.disabled = true; btn.innerText = 'กำลังปฏิเสธ...'; }
    
    try {
      const updated = await window.DB.rejectRequest(state.currentRequestId);
      showToast('Reject ใบแจ้งเรียบร้อยแล้ว สถานะเปลี่ยนเป็น Rejected', 'success');
      await loadRequestDetail(state.currentRequestId);
    } catch (e) {
      console.error('rejectRequest error:', e);
      showToast('ไม่สามารถ Reject ได้: ' + e.message, 'error');
    } finally {
      isApproving = false;
      if (btn) { btn.disabled = false; btn.innerText = 'Reject'; }
    }
  }

  // --- DAILY LABORATORY REPORT ---
  async function generateDailyReportPDF() {
    const dateInput = document.getElementById('daily-report-date');
    if (!dateInput || !dateInput.value) {
      showToast('กรุณาเลือกวันที่', 'warning');
      return;
    }
    const dateStr = dateInput.value;

    try {
      const history = await window.DB.getMaterialHistory();
      // Filter items for the selected date and exclude drafts, then sort by request_no ascending
      const dateItems = history.filter(item => item.request_date === dateStr && item.status !== 'Draft')
                               .sort((a, b) => parseInt(a.request_no || 0) - parseInt(b.request_no || 0));

      const tbody = document.getElementById('print-daily-tbody');
      tbody.innerHTML = '';

      if (dateItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:15px; border:1px solid #cbd5e1;">ไม่มีข้อมูลรายการวัตถุดิบสำหรับวันที่เลือก</td></tr>`;
      } else {
        dateItems.forEach((item, index) => {
          let badgeColor = '#333';
          if (item.test_result === 'PASS') badgeColor = '#16a34a';
          else if (item.test_result === 'FAIL') badgeColor = '#dc2626';
          else if (item.test_result === 'HOLD') badgeColor = '#ca8a04';

          const displayResult = item.test_result || (item.status === 'Pending' || item.status === 'In Process' ? item.status : '');

          const [year, month, day] = item.request_date.split('-');
          const reqDateFmt = `${day}/${month}/${year}`;

          tbody.innerHTML += `
            <tr>
              <td style="border:1px solid #cbd5e1; padding:6px; text-align:center;">${index + 1}</td>
              <td style="border:1px solid #cbd5e1; padding:6px;">${item.request_no || ''}</td>
              <td style="border:1px solid #cbd5e1; padding:6px;">${reqDateFmt}</td>
              <td style="border:1px solid #cbd5e1; padding:6px;">${item.customer_name || '-'}</td>
              <td style="border:1px solid #cbd5e1; padding:6px;">${item.product_name || '-'}</td>
              <td style="border:1px solid #cbd5e1; padding:6px;">${item.batch_number || '-'}</td>
              <td style="border:1px solid #cbd5e1; padding:6px;">${item.quantity || '-'}</td>
              <td style="border:1px solid #cbd5e1; padding:6px; text-align:center; font-weight:600; color:${badgeColor};">${displayResult}</td>
            </tr>
          `;
        });
      }

      // Update Header info
      const [y, m, d] = dateStr.split('-');
      document.getElementById('print-daily-date-range').innerText = `ประจำวันที่: ${d}/${m}/${y}`;
      document.getElementById('print-daily-timestamp').innerText = `วันที่พิมพ์: ${new Date().toLocaleString('th-TH')}`;
      document.getElementById('print-daily-by').innerText = `ผู้พิมพ์: ${state.currentUser ? state.currentUser.display_name : 'ระบบ'}`;

      // Temporarily change document title to ensure correct PDF filename
      const originalTitle = document.title;
      document.title = `รายงานการตรวจสอบวัตถุดิบ_${dateStr}`;
      
      // Add a class to body to ensure only the daily report template is printed
      document.body.classList.remove('print-mode-detail');
      document.body.classList.add('print-mode-daily');
      
      // Allow DOM to update before triggering print dialog
      setTimeout(() => {
        window.print();
        
        // Restore title
        document.title = originalTitle;
      }, 300);

    } catch (error) {
      console.error(error);
      showToast('เกิดข้อผิดพลาดในการดึงข้อมูลรายงาน', 'error');
    }
  }

  // --- PRINT / PDF PREVIEW (window.print) ---
  function exportPDF() {
    // Ensure the print template has been populated
    const element = document.getElementById('a4-print-template');
    if (!element) {
      showToast('ไม่พบแม่แบบ A4 สำหรับการพิมพ์', 'error');
      return;
    }
    // Check that data has been loaded (print-no is not empty)
    const reqNoEl = document.getElementById('print-no');
    if (!reqNoEl || !reqNoEl.innerText.trim()) {
      showToast('ยังไม่มีข้อมูลใบแจ้ง กรุณาเปิดรายละเอียดใบแจ้งก่อน', 'warning');
      return;
    }
    
    // Add class for detail print mode
    document.body.classList.remove('print-mode-daily');
    document.body.classList.add('print-mode-detail');
    
    // Trigger browser native print dialog (Print Preview)
    window.print();
  }

  // --- LAB SIGNATURES MANAGER ---
  async function loadSignaturesManager() {
    const tbody = document.getElementById('signatures-list-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:30px;">กำลังโหลดข้อมูลลายเซ็น...</td></tr>`;

    try {
      const sigUsers = await window.DB.getSignatures();
      tbody.innerHTML = '';

      if (sigUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:30px;">ไม่มีเจ้าหน้าที่ Lab หรือ Admin ในระบบ</td></tr>`;
        return;
      }

      sigUsers.forEach(u => {
        const tr = document.createElement('tr');
        const hasSig = !!u.signature_url;
        tr.innerHTML = `
          <td>
            <strong>${escapeHtml(u.display_name)}</strong>
            <span class="badge ${u.role === 'admin' ? 'result-fail' : 'result-hold'}" style="margin-left:8px; font-size:10px;">${u.role}</span>
          </td>
          <td style="text-align:center;">
            ${hasSig
              ? `<img src="${u.signature_url}" style="max-height:50px; max-width:120px; object-fit:contain; border:1px solid var(--border-color); padding:4px; border-radius:4px;" alt="Signature">` 
              : `<span style="color:var(--text-muted); font-size:12px;">ยังไม่มีลายเซ็น</span>`
            }
          </td>
          <td style="text-align:center; display:flex; justify-content:center; gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="App.openSignatureModal('${u.id}', '${escapeHtml(u.display_name)}')" style="padding:4px 10px;">
              ${hasSig ? 'แก้ไขลายเซ็น' : 'อัปโหลดลายเซ็น'}
            </button>
            ${hasSig ? `
            <button class="btn btn-logout btn-sm" onclick="App.deleteSignatureConfirm('${u.id}', '${escapeHtml(u.display_name)}')" style="padding:4px 8px; border-radius:var(--radius-sm);">
              ลบ
            </button>` : ''}
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-danger); padding:30px;">เกิดข้อผิดพลาด: ${e.message}</td></tr>`;
    }
  }

  function openSignatureModal(userId, displayName) {
    const modal = document.getElementById('modal-upload-signature');
    if (!modal) return;
    document.getElementById('sig-upload-userid').value = userId;
    document.getElementById('sig-upload-title').innerText = `อัปโหลดลายเซ็น: ${displayName}`;
    document.getElementById('sig-upload-file').value = '';
    document.getElementById('sig-preview').innerHTML = '';
    
    // Preview on file change
    const fileInput = document.getElementById('sig-upload-file');
    fileInput.onchange = function() {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        document.getElementById('sig-preview').innerHTML = `<img src="${e.target.result}" style="max-height:100px; max-width:200px; border:1px solid #e2e8f0; padding:4px;">`;
      };
      reader.readAsDataURL(file);
    };
    modal.classList.add('open');
  }

  function closeSignatureModal() {
    const modal = document.getElementById('modal-upload-signature');
    if (modal) modal.classList.remove('open');
  }

  async function uploadSignature() {
    const userId = document.getElementById('sig-upload-userid').value;
    const fileInput = document.getElementById('sig-upload-file');
    if (!fileInput.files || !fileInput.files[0]) {
      showToast('กรุณาเลือกไฟล์ลายเซ็น', 'warning');
      return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async function(e) {
      const dataUrl = e.target.result;
      try {
        await window.DB.saveSignature(userId, dataUrl);
        showToast('บันทึกลายเซ็นเรียบร้อยแล้ว', 'success');
        closeSignatureModal();
        loadSignaturesManager();
      } catch (err) {
        console.error(err);
        showToast('ไม่สามารถบันทึกลายเซ็นได้: ' + err.message, 'error');
      }
    };
    reader.readAsDataURL(file);
  }

  async function deleteSignatureConfirm(userId, displayName) {
    if (!confirm(`ต้องการลบลายเซ็นของ ${displayName} ใช่หรือไม่?`)) return;
    try {
      await window.DB.deleteSignature(userId);
      showToast('ลบลายเซ็นเรียบร้อยแล้ว', 'success');
      loadSignaturesManager();
    } catch (e) {
      console.error(e);
      showToast('ไม่สามารถลบลายเซ็นได้: ' + e.message, 'error');
    }
  }

  // --- HELPERS & COMPASSIONATE UI ELEMENTS ---
  // --- GLOBAL ERROR TRANSLATOR ---
  function translateErrorMessage(msg) {
    if (!msg) return 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
    const lowerMsg = String(msg).toLowerCase();
    
    // Database / SQL Errors
    if (lowerMsg.includes('invalid input syntax for type date')) return 'รูปแบบวันที่ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง';
    if (lowerMsg.includes('duplicate key value violates unique constraint')) return 'มีข้อมูลซ้ำซ้อนในระบบ กรุณาตรวจสอบข้อมูลอีกครั้ง';
    if (lowerMsg.includes('violates row-level security policy')) return 'คุณไม่มีสิทธิ์ในการเข้าถึงหรือแก้ไขข้อมูลนี้';
    if (lowerMsg.includes('syntax error') || lowerMsg.includes('postgres') || lowerMsg.includes('relation') || lowerMsg.includes('column')) {
      return 'เกิดข้อผิดพลาดในระบบฐานข้อมูล กรุณาติดต่อผู้ดูแลระบบ';
    }
    
    // Auth / Connection Errors
    if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('network error')) return 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ต';
    if (lowerMsg.includes('jwt expired') || lowerMsg.includes('session expired')) return 'เซสชันของคุณหมดอายุ กรุณาเข้าสู่ระบบใหม่';
    if (lowerMsg.includes('unauthenticated')) return 'กรุณาเข้าสู่ระบบก่อนทำรายการ';
    
    // Auth Edge Cases
    if (lowerMsg.includes('invalid login credentials')) return 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
    if (lowerMsg.includes('user not found')) return 'ไม่พบข้อมูลผู้ใช้ในระบบ';
    
    return msg; // Fallback to original message
  }

  function showToast(message, type = 'info', options = {}) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    if (type === 'error') {
      message = translateErrorMessage(message);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    if (options.onClick) {
      toast.style.cursor = 'pointer';
      toast.onclick = () => {
        options.onClick();
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      };
    }
    
    // Choose icons
    let icon = '';
    if (type === 'success') icon = '<span style="color:#10b981; font-weight:bold;">&check;</span>';
    else if (type === 'error') icon = '<span style="color:#ef4444; font-weight:bold;">&#x26A0;</span>';
    else if (type === 'warning') icon = '<span style="color:#f59e0b; font-weight:bold;">!</span>';
    else icon = '<span style="color:#0284c7; font-weight:bold;">i</span>';

    toast.innerHTML = `
      <div style="font-size:16px;">${icon}</div>
      <div style="line-height:1.3;">${message}</div>
    `;

    container.appendChild(toast);

    // Fade in
    setTimeout(() => toast.classList.add('show'), 50);

    // Fade out and remove
    const duration = options.duration || 4000;
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  }

  function showLoadingButton(button, isLoading, text) {
    if (!button) return;
    if (isLoading) {
      button.disabled = true;
      button.style.opacity = '0.7';
      button.innerText = text;
    } else {
      button.disabled = false;
      button.style.opacity = '1';
      button.innerText = text;
    }
  }

  function showLoading() {
    const el = document.getElementById('global-spinner-overlay');
    if (el) el.classList.add('active');
  }
  
  function hideLoading() {
    const el = document.getElementById('global-spinner-overlay');
    if (el) el.classList.remove('active');
  }

  function getEmptyStateHtml(message = 'ไม่พบข้อมูลในขณะนี้') {
    return `
      <tr>
        <td colspan="100%" style="text-align: center; padding: 48px 24px; border-bottom: none;">
          <div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted);">
            <i data-lucide="file-x" style="width: 48px; height: 48px; color: #cbd5e1; margin-bottom: 16px;"></i>
            <h3 style="font-size: 16px; font-weight: 600; color: var(--text-main); margin: 0 0 8px 0;">ไม่มีข้อมูล</h3>
            <p style="font-size: 14px; max-width: 300px; margin: 0 auto;">${message}</p>
          </div>
        </td>
      </tr>
    `;
  }

  function formatThaiDate(dateStr) {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      
      const year = parseInt(parts[0]) + 543; // Convert AD to BE
      const monthNames = [
        'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
      ];
      const month = monthNames[parseInt(parts[1]) - 1];
      const day = parseInt(parts[2]);

      return `${day} ${month} ${year}`;
    } catch (e) {
      return dateStr;
    }
  }

  function escapeHtml(unsafe) {
    if (unsafe === undefined || unsafe === null) return '';
    return unsafe.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --- REALTIME NOTIFICATIONS ---
  let audioCtx = null;
  let isPlayingSound = false;

  function playNotificationSound() {
    const config = window.AppConfig.load();
    if (config.soundEnabled === false) return; // Silent if disabled
    
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
          if (audioCtx.state === 'suspended') {
            showToast('กรุณาคลิกที่หน้าเว็บ 1 ครั้ง เพื่อเปิดใช้งานเสียงแจ้งเตือน', 'warning', { duration: 5000 });
            return;
          }
          triggerMelody();
        });
      } else {
        triggerMelody();
      }
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  }

  function triggerMelody() {
    if (!audioCtx || isPlayingSound) return;
    isPlayingSound = true;
    
    const time = audioCtx.currentTime;
    const masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
    masterGain.gain.value = 0.6; // Master volume

    // MS Teams style positive/soft corporate chime (A Major Arpeggio)
    // Fast consecutive notes that ring over each other
    const notes = [
      { freq: 659.25,  start: 0.00, duration: 1.0 }, // E5
      { freq: 880.00,  start: 0.15, duration: 1.2 }, // A5
      { freq: 1108.73, start: 0.30, duration: 1.5 }  // C#6
    ];

    notes.forEach((note) => {
      // 1. Sine Wave (The soft body of the bell)
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, time + note.start);
      
      gain.gain.setValueAtTime(0, time + note.start);
      gain.gain.linearRampToValueAtTime(0.6, time + note.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + note.start + note.duration);
      
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(time + note.start);
      osc.stop(time + note.start + note.duration);

      // 2. Triangle Wave (The glassy "strike" of the bell)
      const oscTri = audioCtx.createOscillator();
      const gainTri = audioCtx.createGain();
      oscTri.type = 'triangle';
      oscTri.frequency.setValueAtTime(note.freq, time + note.start);
      
      gainTri.gain.setValueAtTime(0, time + note.start);
      gainTri.gain.linearRampToValueAtTime(0.15, time + note.start + 0.01); // Quick sharp attack
      gainTri.gain.exponentialRampToValueAtTime(0.001, time + note.start + 0.3); // Quick decay
      
      oscTri.connect(gainTri);
      gainTri.connect(masterGain);
      oscTri.start(time + note.start);
      oscTri.stop(time + note.start + 0.4);
    });

    // Unlock sound player after sounds finish ringing
    setTimeout(() => {
      isPlayingSound = false;
    }, 1800);
  }

  function testNotificationSound() {
    const config = window.AppConfig.load();
    if (config.soundEnabled === false) {
      showToast('กรุณาเปิดสวิตช์ "เปิดเสียงแจ้งเตือนระบบ" ก่อนทำการทดสอบ', 'warning');
      return;
    }
    playNotificationSound();
  }

  function initRealtime() {
    if (!state.currentUser) return;
    const role = state.currentUser.role;
    
    window.DB.setupRealtimeNotifications(
      // onInsert (New Request)
      async (newRecord) => {
        if (newRecord.status === 'Draft') return;
        if (role === 'admin' || role === 'lab') {
          playNotificationSound();
          const requesterName = await window.DB.fetchRequesterName(newRecord.requester_id);
          showToast(
            `<b>🔔 มีใบ Request ใหม่</b><br/>Request No. : ${newRecord.request_no || 'ยังไม่มี'}<br/>Customer : ${newRecord.customer_name || '-'}<br/>จาก : ${requesterName}`,
            'info',
            {
              duration: 5000,
              onClick: () => navigate('request-detail', { id: newRecord.id })
            }
          );
        }
      },
      // onUpdate (Status changed to Pending OR Shared with Base Oil)
      async (newRecord, oldRecord) => {
        // Case 1: Draft -> Pending (Submitted)
        if (oldRecord.status === 'Draft' && newRecord.status !== 'Draft') {
          if (role === 'admin' || role === 'lab') {
            playNotificationSound();
            const requesterName = await window.DB.fetchRequesterName(newRecord.requester_id);
            showToast(
              `<b>🔔 มีใบ Request ใหม่</b><br/>Request No. : ${newRecord.request_no || 'ยังไม่มี'}<br/>Customer : ${newRecord.customer_name || '-'}<br/>จาก : ${requesterName}`,
              'info',
              {
                duration: 5000,
                onClick: () => navigate('request-detail', { id: newRecord.id })
              }
            );
          }
        }
        
        // Case 2: Shared with Base Oil
        if (oldRecord.need_base_oil_view === false && newRecord.need_base_oil_view === true) {
          if (role === 'base_oil') {
            playNotificationSound();
            showToast(
              `<b>🔔 มีใบ Request ที่แชร์มายัง Base Oil</b><br/>Request No. : ${newRecord.request_no || 'ยังไม่มี'}`,
              'info',
              {
                duration: 5000,
                onClick: () => navigate('request-detail', { id: newRecord.id })
              }
            );
          }
        }
      }
    );
  }

  // Bind init to window load event
  window.addEventListener('DOMContentLoaded', init);

  window.addEventListener('edit_request_inserted', async (e) => {
    const payload = e.detail;
    const role = state.currentUser?.role;
    if (role === 'admin' && payload.status === 'Pending') {
      const requesterName = await window.DB.fetchRequesterName(payload.requester_id);
      playNotificationSound();
      showToast(
        `<b>📝 มีคำขอแก้ไขข้อมูลใหม่</b><br/>จาก: ${requesterName}<br/>เหตุผล: ${payload.reason}`,
        'info',
        {
          duration: 10000,
          onClick: () => {
            navigate('edit-requests');
          }
        }
      );
      // Auto refresh if already on edit-requests view
      if (document.getElementById('view-edit-requests').style.display !== 'none') {
        loadEditRequests();
      }
    }
  });

  // Expose module APIs
  // --- STICKER PRINTING HELPERS ---

  function _formatRecDate(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
  }

  function _buildStickerPreviewHtml(testResult, productName, batchNumber, requestDate) {
    const resText = (testResult || 'PENDING').toUpperCase();
    const recDate = _formatRecDate(requestDate);
    return `
      <div style="border:2px solid black; padding:12px 14px; width:300px; font-family:monospace; background:white; color:black; box-sizing:border-box;">
        <div style="text-align:center; border-bottom:2px solid black; padding-bottom:8px; margin-bottom:10px;">
          <div style="font-size:36px; font-weight:bold; letter-spacing:4px;">${resText}</div>
        </div>
        <div style="font-size:13px; line-height:1.8; color:black;">
          <div><strong>Product :</strong> ${escapeHtml(productName)}</div>
          <div><strong>Batch &nbsp;&nbsp;:</strong> ${escapeHtml(batchNumber)}</div>
          <div><strong>Pass Date:</strong> ${recDate}</div>
        </div>
      </div>
    `;
  }

  function _showStickerModal(previewHtml, stickerData) {
    state.currentStickerItem = stickerData;
    let modal = document.getElementById('modal-sticker-preview');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-sticker-preview';
      document.body.appendChild(modal);
    }
    
    // Determine default date (today) in local timezone
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000; 
    const defaultDate = new Date(today.getTime() - tzOffset).toISOString().split('T')[0];

    // If stickerData doesn't have a specific inspection_date, set it to today
    if (!stickerData.inspection_date) {
      stickerData.inspection_date = defaultDate;
    }
    // Rebuild preview HTML with the default date
    previewHtml = _buildStickerPreviewHtml(stickerData.test_result, stickerData.product_name, stickerData.batch_number, stickerData.inspection_date);

    // Determine if date should be editable
    const isRequester = state.currentUser && state.currentUser.role === 'requester';
    const dateDisabled = isRequester ? 'disabled' : '';

    modal.style.cssText = [
      'display:flex', 'position:fixed', 'top:0', 'left:0',
      'width:100vw', 'height:100vh', 'background:rgba(0,0,0,0.6)',
      'z-index:99999', 'align-items:center', 'justify-content:center'
    ].join(';');
    modal.innerHTML = `
      <div style="background:white;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.4);width:440px;max-width:95vw;overflow:hidden;font-family:'Sarabun',sans-serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e0e0e0;">
          <h2 style="margin:0;font-size:18px;color:#1a1a2e;">🏷️ Preview สติกเกอร์วัตถุดิบ</h2>
          <button onclick="App.closeStickerModal()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;line-height:1;">&times;</button>
        </div>
        <div style="padding:20px;">
          <div id="sticker-preview-container" style="display:flex;justify-content:center;margin-bottom:20px;">${previewHtml}</div>
          <div style="margin-bottom:12px;">
            <label style="display:block;margin-bottom:6px;font-weight:600;color:#333;">วันที่ผ่าน (Passed Date):</label>
            <input type="date" id="sticker-passed-date" value="${stickerData.inspection_date}" onchange="App.updateStickerPreviewDate(this.value)"
              style="width:100%;padding:8px 12px;border:1px solid #ccc;border-radius:8px;font-size:15px;box-sizing:border-box;" ${dateDisabled}>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;padding:16px 20px;border-top:1px solid #e0e0e0;">
          ${!isRequester ? `<button onclick="App.saveStickerDate()" style="padding:8px 20px;background:#10b981;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">💾 บันทึก</button>` : ''}
          <button onclick="App.closeStickerModal()"
            style="padding:8px 20px;border:1px solid #ccc;background:white;border-radius:8px;cursor:pointer;font-size:14px;">ยกเลิก</button>
          <button onclick="App.confirmPrintSticker()"
            style="padding:8px 20px;background:#1a73e8;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">🖨 พิมพ์</button>
        </div>
      </div>
    `;
  }

  function updateStickerPreviewDate(dateStr) {
    if (!state.currentStickerItem) return;
    state.currentStickerItem.inspection_date = dateStr;
    const previewHtml = _buildStickerPreviewHtml(
      state.currentStickerItem.test_result, 
      state.currentStickerItem.product_name, 
      state.currentStickerItem.batch_number, 
      dateStr
    );
    const container = document.getElementById('sticker-preview-container');
    if (container) container.innerHTML = previewHtml;
  }

  // Used by Material History page (looks up item from state.historyList by id)
  function openStickerPreview(itemId) {
    if (!state.historyList) return;
    const item = state.historyList.find(i => i.id === itemId || i.id === Number(itemId));
    if (!item) return;
    const previewHtml = _buildStickerPreviewHtml(item.test_result, item.product_name, item.batch_number, item.inspection_date || item.request_date);
    _showStickerModal(previewHtml, item);
  }

  // Used by Request Detail page (data passed directly from row)
  function openStickerPreviewDirect(testResult, productName, batchNumber, requestDate, testedDate, itemId) {
    const stickerData = { 
      id: itemId,
      test_result: testResult, 
      product_name: productName, 
      batch_number: batchNumber, 
      request_date: requestDate,
      inspection_date: testedDate 
    };
    const previewHtml = _buildStickerPreviewHtml(testResult, productName, batchNumber, testedDate || requestDate);
    _showStickerModal(previewHtml, stickerData);
  }

  function closeStickerModal() {
    const modal = document.getElementById('modal-sticker-preview');
    if (modal) modal.style.display = 'none';
    state.currentStickerItem = null;
  }

  async function saveStickerDate() {
    const item = state.currentStickerItem;
    if (!item || !item.id) {
      showToast('ไม่สามารถบันทึกได้ เนื่องจากไม่พบรหัสรายการ', 'error');
      return;
    }
    const dateInput = document.getElementById('sticker-passed-date');
    if (!dateInput || !dateInput.value) return;
    
    try {
      const btn = document.querySelector('#modal-sticker-preview button[onclick="App.saveStickerDate()"]');
      if (btn) { btn.disabled = true; btn.innerText = 'กำลังบันทึก...'; }
      
      await window.DB.updateRequestItemInspectionDate(item.id, dateInput.value);
      
      item.inspection_date = dateInput.value;
      
      showToast('บันทึกวันที่สำเร็จ', 'success');
      
      if (btn) { btn.disabled = false; btn.innerText = '💾 บันทึก'; }
      
      // Refresh the detail table to update the HTML onclick handlers with the new date
      if (state.currentRequestId) {
        await loadRequestDetail(state.currentRequestId);
      }
    } catch (err) {
      console.error('Error saving tested date:', err);
      showToast('เกิดข้อผิดพลาดในการบันทึก: ' + err.message, 'error');
      const btn = document.querySelector('#modal-sticker-preview button[onclick="App.saveStickerDate()"]');
      if (btn) { btn.disabled = false; btn.innerText = '💾 บันทึก'; }
    }
  }

  function confirmPrintSticker() {
    if (!state.currentStickerItem) return;
    const copies = 1;
    const dateStr = document.getElementById('sticker-passed-date').value;
    const item = state.currentStickerItem;

    let resText = item.test_result ? item.test_result.toUpperCase() : 'PENDING';
    let recDate = _formatRecDate(dateStr);

    const singleSticker = `
      <div class="sticker-page" style="page-break-after: always; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
        <div style="border: 2px solid black; padding: 10px; width: 300px; font-family: monospace; background: white; color: black; box-sizing: border-box;">
          <div style="text-align: center; border-bottom: 2px solid black; padding-bottom: 5px; margin-bottom: 10px;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold; color: black;">${resText}</h1>
          </div>
          <div style="font-size: 14px; line-height: 1.5; color: black;">
            <div>Product : ${escapeHtml(item.product_name)}</div>
            <div>Batch &nbsp;&nbsp;: ${escapeHtml(item.batch_number)}</div>
            <div>Pass Date: ${recDate}</div>
          </div>
        </div>
      </div>
    `;

    let allStickers = '';
    for (let i = 0; i < copies; i++) {
      allStickers += singleSticker;
    }

    // Create a hidden iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write('<html><head><title>Print Label</title>');
    doc.write(`
      <style>
        @media print {
          @page { size: auto; margin: 0; }
          body { background-color: white !important; margin: 0 !important; padding: 0 !important; }
        }
        body { margin: 0; padding: 0; background: white; }
      </style>
    `);
    doc.write('</head><body>');
    doc.write(allStickers);
    doc.write('</body></html>');
    doc.close();

    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 10000);
      }, 200);
    };

    closeStickerModal();
  }

  /* =========================================================================
     RESIZABLE COLUMNS & TOOLTIPS (Global Logic)
     ========================================================================= */

  function initResizableColumns() {
    if (window.innerWidth <= 768) return; // Disable on mobile

    const tables = document.querySelectorAll('.table, .item-table');
    tables.forEach(table => {
      const ths = table.querySelectorAll('th');
      ths.forEach(th => {
        if (th.querySelector('.resizer')) return; // Already initialized
        
        const resizer = document.createElement('div');
        resizer.classList.add('resizer');
        th.appendChild(resizer);

        let startX, startWidth;

        resizer.addEventListener('mousedown', function(e) {
          e.preventDefault();
          e.stopPropagation();

          // Before resizing, freeze all columns to their current auto-calculated widths
          const allThs = table.querySelectorAll('th');
          allThs.forEach(t => {
            if (!t.style.width) {
              t.style.width = t.offsetWidth + 'px';
            }
          });
          
          table.style.tableLayout = 'fixed';
          table.style.width = 'max-content';
          table.style.minWidth = '100%';

          startX = e.pageX;
          startWidth = th.offsetWidth;
          resizer.classList.add('resizing');
          
          function onMouseMove(moveEvent) {
            const newWidth = startWidth + (moveEvent.pageX - startX);
            if (newWidth > 30) {
              th.style.width = newWidth + 'px';
            }
          }

          function onMouseUp() {
            resizer.classList.remove('resizing');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
          }

          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        });
      });
    });
  }

  // Auto Tooltips for truncated text
  document.body.addEventListener('mouseover', function(e) {
    const target = e.target;
    if (target.tagName === 'TD' || target.tagName === 'TH') {
      if (target.offsetWidth < target.scrollWidth) {
        if (!target.hasAttribute('title')) {
          target.setAttribute('title', target.innerText.trim());
        }
      }
    }
  });

  let editRequestsData = [];
  let currentFulfillingEditRequestId = null;

  async function loadEditRequests() {
    try {
      editRequestsData = await window.DB.fetchEditRequests();
      renderEditRequestsTable();
    } catch (error) {
      console.error('Failed to load edit requests', error);
      alert('Failed to load edit requests: ' + error.message);
      // Even if it fails, try to render the button if possible
      renderEditRequestsTable();
    }
  }

  function renderEditRequestsTable() {
    const tbody = document.getElementById('edit-requests-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (!state.currentUser) return;
    const role = state.currentUser.role;
    const isBaseOil = role === 'baseoil';
    if (isBaseOil) return; 
    
    const isAdmin = role === 'admin';
    
    const searchQuery = (document.getElementById('search-edit-requests')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('filter-edit-request-status')?.value || '';
    
    let filteredData = editRequestsData;
    
    if (statusFilter) {
      filteredData = filteredData.filter(er => er.status === statusFilter);
    }
    
    if (searchQuery) {
      filteredData = filteredData.filter(er => {
        const req = er.requests || {};
        const pNames = (req.request_items || []).map(i => i.product_name || '').join(' ');
        return (req.request_no || '').toLowerCase().includes(searchQuery) ||
               (req.customer_name || '').toLowerCase().includes(searchQuery) ||
               pNames.toLowerCase().includes(searchQuery) ||
               (er.reason || '').toLowerCase().includes(searchQuery);
      });
    }
    
    const btnCreate = document.getElementById('btn-create-edit-request');
    if (btnCreate) {
      btnCreate.style.display = (role === 'requester' || isAdmin) ? 'inline-flex' : 'none';
    }
    
    if (filteredData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:30px;">ไม่มีข้อมูลคำขอแก้ไข</td></tr>';
      return;
    }
    
    filteredData.forEach(er => {
      const tr = document.createElement('tr');
      const req = er.requests || {};
      const customerName = req.customer_name || '-';
      const productName = (req.request_items && req.request_items.length > 0) ? req.request_items.map(i => i.product_name).join(', ') : '-';
      
      const statusBadge = er.status === 'Approved' 
        ? '<span class="badge approved" style="background:#10b981; color:white; padding:4px 8px; border-radius:12px; font-size:12px;">ดำเนินการแล้ว</span>' 
        : '<span class="badge pending" style="background:#f59e0b; color:white; padding:4px 8px; border-radius:12px; font-size:12px;">รอดำเนินการ</span>';
      
      const createdDate = new Date(er.created_at).toLocaleString('th-TH');
      const actionedDate = er.actioned_at ? new Date(er.actioned_at).toLocaleString('th-TH') : '-';
      
      let actionHtml = '';
      if (isAdmin && er.status === 'Pending') {
        actionHtml += `<button class="btn btn-sm btn-primary" onclick="App.fulfillEditRequest('${er.id}', '${er.request_id}')">เปิดใบ Request</button>`;
      }
      if (isAdmin) {
        actionHtml += `<button class="btn btn-sm" style="background:#ef4444;color:white;margin-left:5px;" onclick="App.deleteEditRequest('${er.id}')">ลบ</button>`;
      }
      
      tr.innerHTML = `
        <td>${createdDate}</td>
        <td style="font-weight:600;">${req.request_no || '-'}</td>
        <td>${customerName}</td>
        <td>${productName}</td>
        <td>${er.requester?.display_name || '-'}</td>
        <td style="max-width:200px; white-space:normal;">${er.reason} <br><small style="color:gray">${er.note || ''}</small></td>
        <td>${statusBadge}</td>
        <td>${actionedDate}</td>
        <td>${er.actioned_user?.display_name || '-'}</td>
        <td style="text-align:center">${actionHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function filterEditRequests() {
    renderEditRequestsTable();
  }

  function sortEditRequests(field) {
    editRequestsData.reverse();
    renderEditRequestsTable();
  }

  async function openCreateEditRequestModal() {
    try {
      const select = document.getElementById('edit-req-select');
      if(select) select.innerHTML = '<option value="">-- เลือกใบแจ้งตรวจสอบ --</option>';
      
      const role = state.currentUser.role;
      let eligibleRequests = state.requests || [];
      
      // Fallback if state.requests is empty
      if (eligibleRequests.length === 0) {
        try {
           const fetchFilters = role === 'requester' ? { requesterId: state.currentUser.id } : {};
           eligibleRequests = await window.DB.getRequests(fetchFilters);
           state.requests = eligibleRequests;
        } catch(e) {
           console.warn("Could not fetch requests on the fly", e);
        }
      }

      if (role === 'requester') {
        eligibleRequests = eligibleRequests.filter(r => r.requester_id === state.currentUser.id);
      }
      
      eligibleRequests.sort((a,b) => {
        const da = a.request_date ? new Date(a.request_date) : new Date(0);
        const db = b.request_date ? new Date(b.request_date) : new Date(0);
        return db - da;
      });
      
      eligibleRequests.forEach(req => {
        const opt = document.createElement('option');
        opt.value = req.id;
        const pName = (req.request_items && req.request_items.length > 0) ? req.request_items[0].product_name : '-';
        opt.textContent = `${req.request_no} - ${req.customer_name} (${pName})`;
        if(select) select.appendChild(opt);
      });
      
      document.getElementById('edit-req-supplier').textContent = '-';
      document.getElementById('edit-req-product').textContent = '-';
      document.getElementById('edit-req-date').textContent = '-';
      document.getElementById('edit-req-status').textContent = '-';
      
      const reasonEl = document.getElementById('edit-req-reason');
      if (reasonEl) reasonEl.value = '';
      
      const noteEl = document.getElementById('edit-req-note');
      if (noteEl) noteEl.value = '';
      
      const modal = document.getElementById('modal-create-edit-request');
      if (modal) {
        modal.classList.add('open');
      } else {
        alert('Modal element not found');
      }
    } catch (e) {
      console.error(e);
      alert('Error opening modal: ' + e.message);
    }
  }

  function closeCreateEditRequestModal() {
    const modal = document.getElementById('modal-create-edit-request');
    if (modal) modal.classList.remove('open');
  }

  async function searchEditRequest() {
    const input = document.getElementById('edit-req-search-input').value.trim();
    const errorEl = document.getElementById('edit-req-search-error');
    const detailsContainer = document.getElementById('edit-req-details-container');
    
    errorEl.style.display = 'none';
    detailsContainer.style.display = 'none';
    state.currentEditTargetRequest = null;
    
    if (!input) return;
    
    // Check if input is a valid request number (number or contains a valid request no format)
    const btn = document.querySelector('#modal-create-edit-request .btn-primary');
    const oldText = btn.innerText;
    btn.innerText = 'กำลังค้นหา...';
    btn.disabled = true;

    try {
      // Search from DB directly by requestNo (No requesterId filter so it searches ALL)
      const reqs = await window.DB.getRequests({ requestNo: input });
      
      // Find the best match (exact match first)
      let match = reqs.find(r => r.request_no === input);
      if (!match && reqs.length > 0) {
        match = reqs[0];
      }

      if (!match) {
        errorEl.style.display = 'block';
      } else {
        state.currentEditTargetRequest = match;
        
        document.getElementById('edit-req-supplier').textContent = match.customer_name || '-';
        const pNames = (match.request_items && match.request_items.length > 0) ? match.request_items.map(i => i.product_name).join(', ') : '-';
        document.getElementById('edit-req-product').textContent = pNames;
        document.getElementById('edit-req-date').textContent = match.request_date ? new Date(match.request_date).toLocaleDateString('th-TH') : '-';
        document.getElementById('edit-req-status').textContent = match.status;
        
        detailsContainer.style.display = 'block';
      }
    } catch(e) {
      console.error(e);
      errorEl.innerText = 'เกิดข้อผิดพลาด: ' + e.message;
      errorEl.style.display = 'block';
    } finally {
      btn.innerText = oldText;
      btn.disabled = false;
    }
  }

  async function handleCreateEditRequestSubmit(e) {
    e.preventDefault();
    if (!state.currentEditTargetRequest) {
      alert('กรุณาค้นหาและระบุใบแจ้งตรวจสอบที่ต้องการแก้ไข');
      return;
    }
    const reqId = state.currentEditTargetRequest.id;
    const reason = document.getElementById('edit-req-reason').value;
    const note = document.getElementById('edit-req-note').value;
    
    if (!reqId || !reason) return;
    
    try {
      showLoadingButton(e.submitter, true, 'กำลังส่ง...');
      await window.DB.createEditRequest({
        request_id: reqId,
        requester_id: state.currentUser.id,
        reason: reason,
        note: note
      });
      closeCreateEditRequestModal();
      showToast('ส่งคำขอแก้ไขข้อมูลเรียบร้อยแล้ว', 'success');
      loadEditRequests();
    } catch (err) {
      console.error(err);
      let errMsg = err.message || err.error_description || String(err);
      if (err.details) errMsg += ' ' + err.details;
      alert('เกิดข้อผิดพลาด: ' + errMsg);
      showToast('เกิดข้อผิดพลาดในการส่งคำขอ: ' + errMsg, 'error');
    } finally {
      showLoadingButton(e.submitter, false, 'ส่งคำขอ');
    }
  }

  async function fulfillEditRequest(editReqId, reqId) {
    currentFulfillingEditRequestId = editReqId;
    showToast('เข้าสู่โหมดแก้ไขข้อมูลเพื่อตอบรับคำขอ', 'info');
    navigate('request-edit', {id: reqId});
  }

  async function deleteEditRequest(id) {
    if (!confirm('ยืนยันการลบคำขอแก้ไขข้อมูลนี้? การกระทำนี้ไม่สามารถย้อนกลับได้')) return;
    try {
      await window.DB.deleteEditRequest(id);
      showToast('ลบคำขอแก้ไขข้อมูลแล้ว', 'success');
      loadEditRequests();
    } catch(e) {
      console.error(e);
      showToast('เกิดข้อผิดพลาดในการลบคำขอ', 'error');
    }
  }

  // --- INSPECTION DATE EDITOR (ADMIN ONLY) ---
  async function editInspectionDate(itemId, currentDate) {
    const newDate = prompt("แก้ไขวันที่ตรวจสอบ (YYYY-MM-DD):", currentDate || "");
    if (newDate === null) return; // User cancelled
    
    // Validate format roughly
    if (newDate && !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      showToast('รูปแบบวันที่ไม่ถูกต้อง กรุณาใช้ YYYY-MM-DD', 'error');
      return;
    }

    try {
      await window.DB.updateRequestItemInspectionDate(itemId, newDate || null);
      showToast('อัปเดตวันที่ตรวจสอบสำเร็จ', 'success');
      
      // Refresh the view depending on what is currently active
      if (state.currentView === 'requests' && state.currentRequestId) {
        loadRequestDetail(state.currentRequestId);
      } else if (state.currentView === 'history') {
        loadMaterialHistory();
      }
    } catch (err) {
      console.error('Error updating inspection date:', err);
      showToast('เกิดข้อผิดพลาดในการอัปเดต: ' + err.message, 'error');
    }
  }

  return {
    initResizableColumns,
    navigate,
    toggleSidebar,
    handleLogin,
    editInspectionDate,
    logout,
    handleFilterSubmit,
    clearFilters,
    addFormItemRow,
    removeFormItemRow,
    handleRequestFormSubmit,
    testNotificationSound,
    openStickerPreview,
    openStickerPreviewDirect,
    closeStickerModal,
    updateStickerPreviewDate,
    saveStickerDate,
    confirmPrintSticker,
    clearDraftFilters: () => {
      document.getElementById('draft-filter-customer').value = '';
      document.getElementById('draft-filter-product').value = '';
      document.getElementById('draft-filter-batch').value = '';
      document.getElementById('draft-filter-po').value = '';
      loadDraftsList();
    },
    printRequest: () => {
      const statusBadge = document.getElementById('detail-status-badge');
      if (statusBadge && statusBadge.innerText === 'Draft') {
        alert('ไม่สามารถพิมพ์ PDF ได้ เนื่องจากใบ Request ยังเป็นแบบร่าง');
        return;
      }
      
      const printTemplate = document.getElementById('a4-print-template');
      if (!printTemplate) return;

      showToast('กำลังเตรียมข้อมูลสำหรับพิมพ์...', 'info');

      // Create a hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write('<html><head><title>Print Report</title>');
      
      // Copy stylesheets from main document
      const styleSheets = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'));
      styleSheets.forEach(node => {
        doc.write(node.outerHTML);
      });

      // Force print styles for the iframe
      doc.write(`
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          body { 
            background-color: white !important; 
            color: black !important; 
            font-size: 12px !important; 
            font-family: 'Sarabun', 'Segoe UI', sans-serif !important; 
            margin: 0 !important; 
            padding: 0 !important; 
          }
          .a4-print-layout { display: block !important; }
        </style>
      `);

      doc.write('</head><body>');
      doc.write('<div id="a4-print-template" class="a4-print-layout">');
      doc.write(printTemplate.innerHTML);
      doc.write('</div>');
      doc.write('</body></html>');
      doc.close();

      // Wait for iframe resources to load before triggering print
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          // Cleanup after 10 seconds to ensure print dialog doesn't break
          setTimeout(() => document.body.removeChild(iframe), 10000);
        }, 500); // 0.5s buffer for font rendering
      };
    },
    editCurrentRequest,
    deleteCurrentRequest,
    deleteRequest,
    approveRequest,
    reopenRequest,
    rejectRequest,
    exportPDF,
    generateDailyReportPDF,
    handleHistoryFilter,
    clearHistoryFilters,
    traceBatch,
    closeBatchTraceModal,
    loadSignaturesManager,
    openSignatureModal,
    closeSignatureModal,
    uploadSignature,
    deleteSignatureConfirm,
    openCreateUserModal,
    closeCreateUserModal,
    handleCreateUserSubmit,
    openSettingsModal,
    closeSettingsModal,
    openChangeOwnPasswordModal,
    closeChangeOwnPasswordModal,
    togglePwdVisibility,
    handleChangeOwnPasswordSubmit,
    openChangePasswordModal,
    closeChangePasswordModal,
    handleChangePasswordSubmit,
    deleteUserAccount,
    openConfigModal,
    closeConfigModal,
    saveDatabaseConfig,
    handleConfigModeChange,
    handleImportExcel,
    exportRequestsExcel,
    showToast,
    saveDraft,
    openFilterModal,
    closeFilterModal,
    loadEditRequests,
    filterEditRequests,
    sortEditRequests,
    openCreateEditRequestModal,
    closeCreateEditRequestModal,
    searchEditRequest,
    handleCreateEditRequestSubmit,
    fulfillEditRequest,
    deleteEditRequest
  };
})();
