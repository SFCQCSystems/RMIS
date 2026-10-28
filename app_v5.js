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
      endDate: '',
      page: 1,
      pageSize: 20
    },
    historyFilters: {
      productName: '',
      batchNumber: '',
      rmNo: '',
      requestNo: '',
      testResult: '',
      startDate: '',
      endDate: '',
      page: 1,
      pageSize: 20,
      _hasSearched: false
    },
    mixTankFilters: {
      docNo: '',
      tank: '',
      product: '',
      status: '',
      startDate: '',
      endDate: '',
      page: 1,
      pageSize: 20
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
    'data-management': 'view-data-management',
    'edit-requests': 'view-edit-requests',
    'daily-report': 'view-daily-report',
    signatures: 'view-signatures',
    users: 'view-users',
    settings: 'view-settings',
    'mix-tank': 'view-mix-tank',
    'mix-tank-form': 'view-mix-tank-form'
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

    // 5. Attempt auto-login with existing session
    try {
      const user = await window.DB.getCurrentUser();
      if (user) {
        state.currentUser = user;
        updateUIForUser();
        initRealtime();
        
        // Check hash for direct URL routing
        const hash = window.location.hash.substring(1);
        if (hash) {
          if (hash.includes('?')) {
            const [view, qs] = hash.split('?');
            const params = Object.fromEntries(new URLSearchParams(qs));
            navigate(view, params);
          } else {
            navigate(hash);
          }
        } else {
          navigate('dashboard');
        }
      } else {
        navigate('login');
      }
    } catch (e) {
      console.error('Session retrieval failed, defaulting to Login screen:', e);
      navigate('login');
    }

    // Listen for back/forward buttons
    window.addEventListener('hashchange', () => {
      if (!state.currentUser) return; // Prevent navigation if not logged in
      const hash = window.location.hash.substring(1);
      if (!hash) return navigate('dashboard');
      
      if (hash.includes('?')) {
        const [view, qs] = hash.split('?');
        const params = Object.fromEntries(new URLSearchParams(qs));
        if (view !== state.currentView || (params.id && params.id !== state.currentRequestId)) {
          navigate(view, params, true);
        }
      } else {
        if (hash !== state.currentView) {
          navigate(hash, {}, true);
        }
      }
    });
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
    function bindResizer(resizerId, topPaneId, bottomPaneId, containerId) {
      const resizer = document.getElementById(resizerId);
      const topPane = document.getElementById(topPaneId);
      const bottomPane = document.getElementById(bottomPaneId);
      const container = document.getElementById(containerId);
      
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

    bindResizer('pane-resizer', 'requests-master-pane', 'requests-detail-pane', 'requests-split-layout');
    bindResizer('mix-tank-pane-resizer', 'mix-tank-master-pane', 'mix-tank-detail-pane', 'mix-tank-split-layout');
  }

  function setupGlobalListeners() {
    // Esc key closes modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeConfigModal();
        closeBatchTraceModal();
        closeCreateUserModal();
        closeChangePasswordModal();
        closeNotesAlertModal();
      }
      // Prevent Enter key from submitting forms unintentionally (except in textarea & login form)
      if (e.key === 'Enter' && e.target && e.target.tagName !== 'TEXTAREA') {
        if (e.target.closest('#login-form') || e.target.closest('#history-filter-form') || e.target.closest('#filter-form')) {
          return;
        }
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
  function navigate(viewName, params = {}, skipPushState = false) {
    console.log(`Navigating to: ${viewName}`, params);

    // Update URL hash without triggering hashchange
    if (!skipPushState && viewName !== 'login') {
      const qs = new URLSearchParams(params).toString();
      const newHash = qs ? `#${viewName}?${qs}` : `#${viewName}`;
      if (window.location.hash !== newHash) {
        window.history.pushState(null, '', newHash);
      }
    }

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
      if (viewName === 'history' && !['admin', 'lab', 'requester'].includes(state.currentUser.role)) {
        showToast('คุณไม่มีสิทธิ์เข้าใช้งานเมนูนี้', 'error');
        navigate('dashboard');
        return;
      }
      if (viewName === 'data-management' && state.currentUser.role !== 'admin') {
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
      'mix-tank': 'nav-mix-tank',
      'mix-tank-form': 'nav-mix-tank',
      drafts: 'nav-drafts',
      history: 'nav-history',
      'edit-requests': 'nav-edit-requests',
      'daily-report': 'nav-daily-report',
      signatures: 'nav-settings',
      users: 'nav-settings', // Keep active on settings tab when managing users/signatures
      settings: 'nav-settings',
      'data-management': 'nav-settings'
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
      if (shell) shell.style.setProperty('display', 'none', 'important');
      if (loginScreen) loginScreen.style.setProperty('display', 'flex', 'important');
      state.currentUser = null;
      state.currentRequestId = null;
    } else {
      if (loginScreen) loginScreen.style.setProperty('display', 'none', 'important');
      if (shell) shell.style.setProperty('display', 'flex', 'important');
    }

    state.currentView = viewName;
    const viewEl = document.getElementById(VIEWS[actualViewName]);
    if (viewEl) {
      if (VIEWS[actualViewName] === 'view-requests' || VIEWS[actualViewName] === 'view-mix-tank' || VIEWS[actualViewName] === 'login-screen') {
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
      case 'settings':
        loadSettingsView();
        break;
      case 'mix-tank':
        clearMixTankDetailPane();
        loadMixTankList();
        break;
      case 'mix-tank-form':
        prepareMixTankForm(params.id, params.mode);
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
    if (window.innerWidth <= 768) {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.toggle('open');
    } else {
      document.body.classList.toggle('sidebar-collapsed');
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('open');
    }
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
      NotificationService.cleanup();
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

    // Set body role class for bulletproof CSS hiding
    document.body.classList.remove('role-admin', 'role-lab', 'role-requester', 'role-base_oil');
    const currentRole = (state.currentUser.role || 'requester').toLowerCase();
    document.body.classList.add('role-' + currentRole);

    const mtEditBtn = document.getElementById('btn-mt-detail-edit');
    const mtDelBtn = document.getElementById('btn-mt-detail-delete');
    if (currentRole === 'requester' || currentRole === 'base_oil') {
      if (mtEditBtn) mtEditBtn.style.setProperty('display', 'none', 'important');
      if (mtDelBtn) mtDelBtn.style.setProperty('display', 'none', 'important');
    }
    
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
    const isRequester = state.currentUser.role === 'requester';
    const isBaseOil = state.currentUser.role === 'base_oil';
    
    // Sidebar nav nodes
    const navHistory = document.getElementById('nav-history');
    const navEditRequests = document.getElementById('nav-edit-requests');
    const navDailyReport = document.getElementById('nav-daily-report');
    const navSignatures = document.getElementById('setting-nav-signatures');
    const navUsers = document.getElementById('setting-nav-users');
    
    if (navDailyReport) navDailyReport.style.display = (!isBaseOil) ? 'block' : 'none';
    const navDrafts = document.getElementById('nav-drafts');
    
    if (navHistory) navHistory.style.display = (isUserAdmin || isUserLab || isRequester) ? 'block' : 'none';
    if (navEditRequests) {
      // Admin, Lab, Requester can see Edit Requests (everyone except Base Oil)
      navEditRequests.style.display = !isBaseOil ? 'block' : 'none';
    }
    if (navSignatures) navSignatures.style.display = isUserAdmin ? 'block' : 'none';
    if (navUsers) navUsers.style.display = isUserAdmin ? 'block' : 'none';

    const navPush = document.getElementById('setting-nav-push');
    if (navPush) {
      navPush.style.display = 'block';
      checkPushSubscriptionStatus();
    }
    if (navDrafts) {
      const isRequester = state.currentUser.role === 'requester';
      navDrafts.style.display = (isRequester || isUserAdmin) ? 'block' : 'none';
      
      const draftCard = document.getElementById('stat-card-draft');
      if (draftCard) {
        draftCard.style.display = (isRequester || isUserAdmin) ? 'flex' : 'none';
      }
    }

    // Show/hide action buttons based on role safely without removing DOM nodes
    const exportBtnNode = document.getElementById('btn-admin-export');
    const importBtnNode = document.getElementById('btn-admin-import');
    const createBtnNode = document.getElementById('btn-create-request');
    const dashCreateBtnNode = document.getElementById('btn-dashboard-create-request');
    const detailModifyBtnNode = document.getElementById('btn-detail-modify');
    const detailRemoveBtnNode = document.getElementById('btn-detail-remove');

    if (createBtnNode) createBtnNode.style.display = !isBaseOil ? 'inline-flex' : 'none';
    if (dashCreateBtnNode) dashCreateBtnNode.style.display = !isBaseOil ? 'inline-flex' : 'none';
    if (detailModifyBtnNode) detailModifyBtnNode.style.setProperty('display', 'none', 'important');
    if (detailRemoveBtnNode) detailRemoveBtnNode.style.setProperty('display', 'none', 'important');
    
    // Kick off async background update for drafts
    updateDraftCountsInBackground();
  }

  // --- BACKGROUND DATA LOADERS ---
  let isUpdatingDraftCounts = false;
  async function updateDraftCountsInBackground() {
    if (isUpdatingDraftCounts) return;
    isUpdatingDraftCounts = true;
    try {
      const mtRecords = await window.DB.getMixTankRequests();
      updateMixTankBadge(mtRecords);
    } catch (e) {}

    const isRequester = state.currentUser?.role === 'requester';
    const isAdmin = state.currentUser?.role === 'admin';
    if (!isRequester && !isAdmin) {
      isUpdatingDraftCounts = false;
      return;
    }

    try {
      const draftCount = await window.DB.getDraftCount();
      
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
    } finally {
      isUpdatingDraftCounts = false;
    }
  }

  // --- 1. DASHBOARD CARD LOADER ---
  async function loadDashboard() {
    try {
      const stats = await window.DB.getDashboardStats();
      
      document.getElementById('stat-total').innerText = stats.total;
      document.getElementById('stat-pending').innerText = stats.pending;
      const inProgressEl = document.getElementById('stat-in-progress');
      if (inProgressEl) inProgressEl.innerText = stats.inProcess;
      document.getElementById('stat-completed').innerText = stats.complete;
      const rejectedEl = document.getElementById('stat-rejected');
      if (rejectedEl) rejectedEl.innerText = stats.rejected;

      // Populate recent request table (Max 5 items)
      const recentBody = document.getElementById('dashboard-recent-tbody');
      recentBody.innerHTML = '';

      const recents = stats.recents || [];
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
        tr.onclick = (e) => {
          if (!e.target.closest('button')) {
            Array.from(tr.parentNode.children).forEach(child => child.classList.remove('selected-row'));
            tr.classList.add('selected-row');
            navigate('request-detail', {id: r.id});
          }
        };
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

  // --- PAGINATION HELPER ---
  function renderPaginationControls({ containerId, page, pageSize, totalCount, onPageChange, onPageSizeChange }) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!totalCount || totalCount <= 0) {
      container.innerHTML = '';
      return;
    }

    const totalPages = Math.ceil(totalCount / pageSize);
    const startItem = (page - 1) * pageSize + 1;
    const endItem = Math.min(page * pageSize, totalCount);

    container.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; padding:4px 10px; background:var(--bg-secondary); border-top:1px solid var(--border-color); font-size:13px; color:var(--text-color);">
        <div style="display:flex; align-items:center; gap:8px;">
          <span>แสดง <strong>${startItem} - ${endItem}</strong> จากทั้งหมด <strong>${totalCount}</strong> รายการ</span>
          <span style="color:var(--text-muted);">|</span>
          <span>หน้าละ</span>
          <select class="form-control" style="width:auto; padding:3px 8px; font-size:13px; display:inline-block;" onchange="${onPageSizeChange}(parseInt(this.value, 10))">
            <option value="20" ${pageSize === 20 ? 'selected' : ''}>20</option>
            <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
            <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
          </select>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <button class="btn btn-sm btn-secondary" ${page <= 1 ? 'disabled' : ''} onclick="${onPageChange}(${page - 1})" style="padding:4px 10px;">
            ❮ ก่อนหน้า
          </button>
          <span style="font-weight:600; padding:0 6px;">หน้า ${page} / ${totalPages}</span>
          <button class="btn btn-sm btn-secondary" ${page >= totalPages ? 'disabled' : ''} onclick="${onPageChange}(${page + 1})" style="padding:4px 10px;">
            ถัดไป ❯
          </button>
        </div>
      </div>
    `;
  }

  function setRequestsPage(p) {
    state.filters.page = Math.max(1, p);
    loadRequestsList();
  }

  function setRequestsPageSize(ps) {
    state.filters.pageSize = ps;
    state.filters.page = 1;
    loadRequestsList();
  }

  function setHistoryPage(p) {
    state.historyFilters.page = Math.max(1, p);
    loadMaterialHistory();
  }

  function setHistoryPageSize(ps) {
    state.historyFilters.pageSize = ps;
    state.historyFilters.page = 1;
    loadMaterialHistory();
  }

  // --- 2. REQUESTS LIST LOADER & FILTERS ---
  async function loadRequestsList() {
    const listBody = document.getElementById('requests-list-tbody');
    if (listBody) {
      listBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:36px;"><div style="display:inline-flex; align-items:center; gap:10px;"><div class="spinner" style="width:20px; height:20px; border-width:2px;"></div> <span>กำลังโหลดข้อมูล...</span></div></td></tr>`;
    }

    try {
      const rawRes = await window.DB.getRequests(state.filters);
      const requests = Array.isArray(rawRes) ? rawRes : (rawRes.data || []);
      const totalCount = Array.isArray(rawRes) ? requests.length : (rawRes.totalCount || 0);
      const page = state.filters.page || 1;
      const pageSize = state.filters.pageSize || 20;

      listBody.innerHTML = '';

      if (requests.length === 0) {
        listBody.innerHTML = getEmptyStateHtml('ไม่พบรายการใบแจ้งตรวจสอบที่ตรงกับเงื่อนไขการค้นหา');
        renderPaginationControls({ containerId: 'requests-pagination', page: 1, pageSize, totalCount: 0, onPageChange: 'App.setRequestsPage', onPageSizeChange: 'App.setRequestsPageSize' });
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
        tr.onclick = (e) => {
          if (!e.target.closest('button')) {
            Array.from(tr.parentNode.children).forEach(child => child.classList.remove('selected-row'));
            tr.classList.add('selected-row');
            navigate('request-detail', {id: r.id});
          }
        };

        const hasRowNote = r.notes && r.notes.trim() && r.notes.trim() !== '-' && r.notes.trim() !== 'ไม่มีหมายเหตุ';
        const noteBadge = hasRowNote ? ` <span title="หมายเหตุ: ${escapeHtml(r.notes)}" style="display:inline-flex; align-items:center; background:#fef3c7; color:#b45309; border:1px solid #fde68a; font-size:11px; padding:1px 5px; border-radius:4px; margin-left:4px; font-weight:600; cursor:help;">📝</span>` : '';

        tr.innerHTML = `
          <td style="white-space: nowrap;"><strong>${r.request_no}/${r.request_year}</strong>${noteBadge}</td>
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

      renderPaginationControls({
        containerId: 'requests-pagination',
        page: page,
        pageSize: pageSize,
        totalCount: totalCount,
        onPageChange: 'App.setRequestsPage',
        onPageSizeChange: 'App.setRequestsPageSize'
      });

      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      console.error(e);
      if (listBody) {
        listBody.innerHTML = getEmptyStateHtml(`เกิดข้อผิดพลาดในการดึงข้อมูล: ${e.message}`);
      }
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
    if (listBody) {
      listBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:36px;"><div style="display:inline-flex; align-items:center; gap:10px;"><div class="spinner" style="width:20px; height:20px; border-width:2px;"></div> <span>กำลังโหลดรายการแบบร่าง...</span></div></td></tr>`;
    }

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

    } catch (e) {
      console.error(e);
      if (listBody) {
        listBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-danger); padding:30px;">ไม่สามารถโหลดข้อมูลแบบร่างได้: ${escapeHtml(e.message)}</td></tr>`;
      }
      showToast('ไม่สามารถดึงข้อมูลรายการแบบร่างได้: ' + e.message, 'error');
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

    // Helper: apply base-oil-field column visibility based on checkbox state
    function applyBaseOilFieldVisibility(checked) {
      const isBaseOilViewVisible = isAdminOrLab && checked;
      formSection.querySelectorAll('.admin-lab-field').forEach(el => {
        const isTableCell = el.tagName === 'TH' || el.tagName === 'TD';
        let shouldShow = isAdminOrLab;
        if (el.classList.contains('base-oil-field')) {
          shouldShow = isBaseOilViewVisible;
        }
        el.style.display = shouldShow ? (isTableCell ? 'table-cell' : 'block') : 'none';
      });
    }

    // Initial visibility (before loading DB values — checkbox will be unchecked by default after form.reset())
    applyBaseOilFieldVisibility(false);

    if (needBaseOilCheck) {
      // Remove old listener if any to avoid duplicates
      const newCheck = needBaseOilCheck.cloneNode(true);
      if (needBaseOilCheck.parentNode) {
        needBaseOilCheck.parentNode.replaceChild(newCheck, needBaseOilCheck);
      }
      newCheck.addEventListener('change', (e) => {
        applyBaseOilFieldVisibility(e.target.checked);
      });
    }

    // Show Base Oil sharing checkbox and Status dropdown for admin/lab in edit mode
    if (baseOilSection) baseOilSection.style.display = isAdminOrLab ? 'block' : 'none';
    if (statusSection) statusSection.style.display = isAdminOrLab ? 'block' : 'none';

    if (isEditMode) {
      titleEl.innerText = 'แก้ไขใบแจ้งตรวจสอบ';
      
      try {
        const details = await window.DB.getRequestDetail(requestId);
        state.editingRecord = details; // เก็บไว้ใช้ตรวจสถานะตอนบันทึก
        
        customerInput.value = details.customer_name;
        requesterInput.value = details.requester_name;
        carPlateInput.value = details.car_plate || '';
        sealInput.value = details.seal_no || '';
        containerInput.value = details.container_no || '';
        notesInput.value = details.notes || '';
        commentsInput.value = details.lab_comments || '';
        if (poInput) poInput.value = details.po_number || '';
        const currentBaseOilCheck = document.getElementById('form-need-base-oil');
        if (currentBaseOilCheck) currentBaseOilCheck.checked = !!details.need_base_oil_view;
        if (statusSelect) {
          statusSelect.value = details.status || 'Pending';
          statusSelect.onchange = (e) => {
            if (e.target.value === 'Complete') {
              const itemRows = document.querySelectorAll('#form-items-tbody tr');
              const hasInProcess = Array.from(itemRows).some(row => {
                const resultSelect = row.querySelector('.item-form-result');
                return !resultSelect || !resultSelect.value || resultSelect.value.trim() === 'In Process';
              });
              if (hasInProcess) {
                showToast('ไม่สามารถเปลี่ยนสถานะเป็น Complete ได้ เนื่องจากยังมีรายการวัตถุดิบที่ผลการทดสอบยังเป็น In Process', 'warning');
                const prevStatus = (state.editingRecord && state.editingRecord.status !== 'Complete') ? state.editingRecord.status : 'In Process';
                e.target.value = prevStatus;
              }
            }
          };
        }

        // Re-apply base-oil-field visibility now that checkbox is populated from DB
        applyBaseOilFieldVisibility(!!details.need_base_oil_view);

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

        // Show notes alert popup in edit mode if request has notes
        const hasNote = details.notes && details.notes.trim() && details.notes.trim() !== '-' && details.notes.trim() !== 'ไม่มีหมายเหตุ';
        if (hasNote) {
          showNotesAlertModal(details);
        }

      } catch (e) {
        console.error(e);
        showToast('ไม่สามารถดึงข้อมูลรายละเอียดมาทำการแก้ไขได้: ' + e.message, 'error');
        navigate('requests');
      }
    } else {
      titleEl.innerText = 'สร้างใบแจ้งตรวจสอบห้องปฏิบัติการ';
      requesterInput.value = state.currentUser.display_name;
      state.editingRecord = null; // เคลียร์ state สำหรับสร้างใหม่

      const { dateStr: trueDate, timeStr: trueTime } = (window.TimeSync && window.TimeSync.getBangkokDateTime) 
        ? window.TimeSync.getBangkokDateTime() 
        : (() => {
            const now = new Date();
            const pad = n => n.toString().padStart(2, '0');
            return { dateStr: `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`, timeStr: `${pad(now.getHours())}:${pad(now.getMinutes())}` };
          })();

      const dateInput = document.getElementById('form-request-date');
      const timeInput = document.getElementById('form-request-time');
      if (dateInput) dateInput.value = trueDate;
      if (timeInput) timeInput.value = trueTime;

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
    const isFulfillingEdit = currentFulfillingEditRequestId !== null;
    const readonlyForLabOrRequester = (isLab && !isAdmin && !isFulfillingEdit) || (isBaseOil && !isAdmin) || (isRequester && !isDraftStatus);
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
        btn.innerText = 'ร่าง';
        
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

    // Dynamic submit button text based on edit mode and status
    const submitBtn = document.getElementById('btn-submit-request');
    if (submitBtn) {
      if (!isEditMode) {
        submitBtn.innerText = 'ส่ง';
      } else {
        const currentStatus = state.editingRecord?.status || 'Draft';
        if (currentStatus === 'Draft') {
          submitBtn.innerText = 'ส่ง';
        } else {
          submitBtn.innerText = 'บันทึก';
        }
      }
    }
  }

  function updateItemResultStyle(el) {
    if (!el) return;
    const val = el.value || 'In Process';
    el.setAttribute('data-result', val);
    if (val === 'Pass') {
      el.style.backgroundColor = '#dcfce7';
      el.style.color = '#15803d';
      el.style.borderColor = '#86efac';
      el.style.fontWeight = '600';
    } else if (val === 'Fail') {
      el.style.backgroundColor = '#fee2e2';
      el.style.color = '#b91c1c';
      el.style.borderColor = '#fca5a5';
      el.style.fontWeight = '600';
    } else if (val === 'Hold') {
      el.style.backgroundColor = '#fef3c7';
      el.style.color = '#b45309';
      el.style.borderColor = '#fde68a';
      el.style.fontWeight = '600';
    } else {
      // In Process (default)
      el.style.backgroundColor = '#ffffff';
      el.style.color = '#334155';
      el.style.borderColor = '#cbd5e1';
      el.style.fontWeight = '500';
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
    const density15c = item.density_15c || '';
    const density30c = item.density_30c || '';

    const isEditMode = state.currentRequestId !== null;
    const statusSelect = document.getElementById('form-status');
    const isDraftStatus = statusSelect ? statusSelect.value === 'Draft' : false;
    const isFulfillingEdit = currentFulfillingEditRequestId !== null;
    const disableInputs = isEditMode && ((isLab && !isAdmin && !isFulfillingEdit) || (isRequester && !isDraftStatus));
    const showDelete = !disableInputs;
    const needBaseOilCheck = document.getElementById('form-need-base-oil');
    const isBaseOilChecked = needBaseOilCheck ? needBaseOilCheck.checked : false;

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
        <select class="item-form-result" data-result="${result}" style="padding: 8px 10px; cursor: pointer;" ${isRequester ? 'disabled' : ''}>
          <option value="In Process" style="background-color: #ffffff; color: #334155; font-weight: 500;" ${result === 'In Process' ? 'selected' : ''}>In Process</option>
          <option value="Pass" style="background-color: #dcfce7; color: #15803d; font-weight: 600;" ${result === 'Pass' ? 'selected' : ''}>Pass</option>
          <option value="Fail" style="background-color: #fee2e2; color: #b91c1c; font-weight: 600;" ${result === 'Fail' ? 'selected' : ''}>Fail</option>
          <option value="Hold" style="background-color: #fef3c7; color: #b45309; font-weight: 600;" ${result === 'Hold' ? 'selected' : ''}>Hold</option>
        </select>
      </td>
      <td class="admin-lab-field base-oil-field" style="display:${(isAdminOrLab && isBaseOilChecked) ? 'table-cell' : 'none'};">
        <input type="text" class="item-form-density15c" placeholder="เช่น 0.85" value="${escapeHtml(density15c)}" ${isRequester ? 'disabled readonly' : ''}>
      </td>
      <td class="admin-lab-field base-oil-field" style="display:${(isAdminOrLab && isBaseOilChecked) ? 'table-cell' : 'none'};">
        <input type="text" class="item-form-density30c" placeholder="เช่น 0.83" value="${escapeHtml(density30c)}" ${isRequester ? 'disabled readonly' : ''}>
      </td>
      <td class="admin-lab-field" style="display:${isAdminOrLab ? 'table-cell' : 'none'};">
        <input type="text" class="item-form-comment" placeholder="หมายเหตุ" value="${escapeHtml(comment)}" ${isRequester ? 'disabled readonly' : ''}>
      </td>
      <td style="text-align:center;">
        ${showDelete ? `
        <button type="button" class="btn btn-secondary btn-sm" style="color:var(--text-danger); border-color:#fee2e2; padding:4px 8px; min-width:32px;" onclick="App.removeFormItemRow('${rowId}')" title="ลบรายการนี้">
          &times;
        </button>
        ` : ''}
      </td>
    `;
    tbody.appendChild(tr);

    const resultSel = tr.querySelector('.item-form-result');
    if (resultSel) {
      updateItemResultStyle(resultSel);
      resultSel.addEventListener('change', (e) => {
        updateItemResultStyle(e.target);
        if (e.target.value === 'In Process') {
          const stSel = document.getElementById('form-status');
          if (stSel && stSel.value === 'Complete') {
            stSel.value = 'In Process';
            showToast('มีรายการวัตถุดิบเป็น In Process ระบบปรับสถานะใบแจ้งเป็น In Process', 'info');
          }
        }
      });
    }

    if (!item.id && !item.product_name) {
      const stSel = document.getElementById('form-status');
      if (stSel && stSel.value === 'Complete') {
        stSel.value = 'In Process';
        showToast('เพิ่มรายการใหม่ที่มีผลการทดสอบเป็น In Process ระบบปรับสถานะใบแจ้งเป็น In Process', 'info');
      }
    }
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
      const den15Input = row.querySelector('.item-form-density15c');
      const den30Input = row.querySelector('.item-form-density30c');

      const pRm = rmInput ? rmInput.value.trim() : '';
      const pResult = resultSelect ? resultSelect.value : 'In Process';
      const pComment = commentInput ? commentInput.value.trim() : '';
      const pDen15 = den15Input ? den15Input.value.trim() : '';
      const pDen30 = den30Input ? den30Input.value.trim() : '';

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
        item_comment: pComment,
        density_15c: pDen15,
        density_30c: pDen30
      });
    }

    if (itemsData.length === 0) {
      showToast('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ', 'warning');
      isSaving = false;
      return;
    }

    const poNumber = document.getElementById('form-po-number');
    const needBaseOilCheck = document.getElementById('form-need-base-oil');
    const { dateStr: trueDateStr, timeStr: trueTimeStr } = (window.TimeSync && window.TimeSync.getBangkokDateTime)
      ? window.TimeSync.getBangkokDateTime()
      : (() => {
          const now = new Date();
          const pad = n => n.toString().padStart(2, '0');
          return { dateStr: `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`, timeStr: `${pad(now.getHours())}:${pad(now.getMinutes())}` };
        })();

    const requestDate = document.getElementById('form-request-date').value || trueDateStr;
    const requestTime = document.getElementById('form-request-time').value || trueTimeStr;

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

    if (requestData.status === 'Rejected' || requestData.status === 'Approved') {
      showToast('สถานะ Approved และ Rejected ต้องดำเนินการผ่านระบบลงลายเซ็นในหน้ารายละเอียดใบแจ้งเท่านั้น', 'error');
      isSaving = false;
      return;
    }

    if (requestData.status === 'Complete') {
      const hasInProcessItem = itemsData.some(item => !item.test_result || item.test_result.trim() === 'In Process');
      if (hasInProcessItem) {
        showToast('ไม่สามารถเปลี่ยนสถานะเป็น Complete ได้ เนื่องจากยังมีรายการวัตถุดิบที่ผลการทดสอบยังเป็น In Process', 'warning');
        isSaving = false;
        return;
      }
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
          playNotificationSound();
          showToast('ส่งใบแจ้งตรวจสอบเรียบร้อยแล้ว', 'success');
          loadRequestsList();
          navigate('request-detail', { id: submitted.id });
        } else {
          // Update request (Admin/Lab)
          const updated = await window.DB.updateRequest(state.currentRequestId, requestData, itemsData);
          showToast('แก้ไขข้อมูลใบแจ้งตรวจสอบเรียบร้อยแล้ว', 'success');
          
          if (currentFulfillingEditRequestId) {
            // Build simple old/new data objects for audit
            const oldData = state.editingRecord ? { request: state.editingRecord, items: state.editingRecord.items } : null;
            const newData = { request: requestData, items: itemsData };
            await window.DB.updateEditRequestStatus(currentFulfillingEditRequestId, 'Completed', state.currentUser.id, oldData, newData);
            currentFulfillingEditRequestId = null;
            showToast('ดำเนินการตามคำขอแก้ไขข้อมูลเรียบร้อยแล้ว', 'success');
          }

          loadRequestsList();
          navigate('request-detail', { id: updated.id });
        }
      } else {
        // Create request directly
        const created = await window.DB.createRequest(requestData, itemsData);
        playNotificationSound();
        showToast('บันทึกใบแจ้งตรวจสอบส่งแล็บเรียบร้อยแล้ว', 'success');
        loadRequestsList();
        navigate('request-detail', { id: created.id });
      }
    } catch (err) {
      console.error(err);
      showToast('ไม่สามารถบันทึกข้อมูลได้: ' + err.message, 'error');
    } finally {
      isSaving = false;
      const originalText = (!state.currentRequestId) ? 'ส่ง' : 
                           (state.editingRecord?.status === 'Draft' ? 'ส่ง' : 'บันทึก');
      showLoadingButton(e.submitter, false, originalText);
    }
  }

  async function saveDraft() {
    if (isSaving) return;
    isSaving = true;
    const btn = document.getElementById('btn-save-draft');
    showLoadingButton(btn, true, 'กำลังร่าง...');

    try {
      const customerName = document.getElementById('form-customer').value.trim();
      const carPlate = document.getElementById('form-car-plate').value.trim();
      const sealNo = document.getElementById('form-seal-no').value.trim();
      const containerNo = document.getElementById('form-container-no').value.trim();
      const notes = document.getElementById('form-notes').value.trim();
      
      const itemRows = document.querySelectorAll('#form-items-tbody tr');
      const itemsData = [];
      for (let row of itemRows) {
        const den15Input = row.querySelector('.item-form-density15c');
        const den30Input = row.querySelector('.item-form-density30c');
        itemsData.push({
          id: row.querySelector('.item-form-id').value || undefined,
          product_name: row.querySelector('.item-form-name').value.trim() || '-',
          batch_number: row.querySelector('.item-form-batch').value.trim() || '-',
          quantity: row.querySelector('.item-form-qty').value.trim() || '-',
          test_result: 'In Process',
          density_15c: den15Input ? den15Input.value.trim() : '',
          density_30c: den30Input ? den30Input.value.trim() : ''
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
        request_date: document.getElementById('form-request-date').value || (window.TimeSync ? window.TimeSync.getBangkokDateTime().dateStr : new Date().toISOString().slice(0, 10)),
        request_time: document.getElementById('form-request-time').value || (window.TimeSync ? window.TimeSync.getBangkokDateTime().timeStr : new Date().toTimeString().slice(0, 5))
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
      showLoadingButton(btn, false, 'ร่าง');
    }
  }

  function checkRequestFormDirty() {
    if (!state.editingRecord) {
      const customer = (document.getElementById('form-customer')?.value || '').trim();
      const car = (document.getElementById('form-car-plate')?.value || '').trim();
      const notes = (document.getElementById('form-notes')?.value || '').trim();
      const po = (document.getElementById('form-po-number')?.value || '').trim();
      const rows = document.querySelectorAll('#form-items-tbody tr');
      let hasItems = false;
      for (let r of rows) {
        if ((r.querySelector('.item-form-name')?.value || '').trim() ||
            (r.querySelector('.item-form-batch')?.value || '').trim() ||
            (r.querySelector('.item-form-qty')?.value || '').trim()) {
          hasItems = true;
          break;
        }
      }
      return !!(customer || car || notes || po || hasItems);
    }

    const r = state.editingRecord;
    const normalize = v => (v === null || v === undefined) ? '' : String(v).trim();

    const customer = normalize(document.getElementById('form-customer')?.value);
    if (customer !== normalize(r.customer_name)) return true;

    const po = normalize(document.getElementById('form-po-number')?.value);
    if (po !== normalize(r.po_number)) return true;

    const car = normalize(document.getElementById('form-car-plate')?.value);
    if (car !== normalize(r.car_plate)) return true;

    const seal = normalize(document.getElementById('form-seal-no')?.value);
    if (seal !== normalize(r.seal_no)) return true;

    const container = normalize(document.getElementById('form-container-no')?.value);
    if (container !== normalize(r.container_no)) return true;

    const notes = normalize(document.getElementById('form-notes')?.value);
    if (notes !== normalize(r.notes)) return true;

    const comments = normalize(document.getElementById('form-lab-comments')?.value);
    if (comments !== normalize(r.lab_comments)) return true;

    const baseOil = !!document.getElementById('form-need-base-oil')?.checked;
    if (baseOil !== !!r.need_base_oil_view) return true;

    const statusVal = normalize(document.getElementById('form-status')?.value);
    if (statusVal && statusVal !== normalize(r.status)) return true;

    const reqNo = normalize(document.getElementById('form-request-no')?.value);
    if (reqNo && reqNo !== normalize(r.request_no)) return true;

    const reqYear = normalize(document.getElementById('form-request-year')?.value);
    if (reqYear && reqYear !== normalize(r.request_year)) return true;

    const reqDate = normalize(document.getElementById('form-request-date')?.value);
    if (reqDate && reqDate !== normalize(r.request_date)) return true;

    const reqTime = normalize(document.getElementById('form-request-time')?.value);
    const origTime = normalize(r.request_time ? r.request_time.slice(0, 5) : '');
    if (reqTime && reqTime !== origTime) return true;

    const itemRows = document.querySelectorAll('#form-items-tbody tr');
    const origItems = r.items || [];
    
    const activeRows = [];
    for (let row of itemRows) {
      const pName = normalize(row.querySelector('.item-form-name')?.value);
      const pBatch = normalize(row.querySelector('.item-form-batch')?.value);
      const pQty = normalize(row.querySelector('.item-form-qty')?.value);
      const pRm = normalize(row.querySelector('.item-form-rm')?.value);
      const pDen15 = normalize(row.querySelector('.item-form-density15c')?.value);
      const pDen30 = normalize(row.querySelector('.item-form-density30c')?.value);
      const pComm = normalize(row.querySelector('.item-form-comment')?.value);
      if (pName || pBatch || pQty || pRm || pDen15 || pDen30 || pComm) {
        activeRows.push(row);
      }
    }

    if (activeRows.length !== origItems.length) return true;

    for (let i = 0; i < activeRows.length; i++) {
      const row = activeRows[i];
      const orig = origItems[i] || {};
      if (normalize(row.querySelector('.item-form-name')?.value) !== normalize(orig.product_name)) return true;
      if (normalize(row.querySelector('.item-form-batch')?.value) !== normalize(orig.batch_number)) return true;
      if (normalize(row.querySelector('.item-form-qty')?.value) !== normalize(orig.quantity)) return true;
      if (normalize(row.querySelector('.item-form-rm')?.value) !== normalize(orig.rm_no)) return true;
      if (normalize(row.querySelector('.item-form-result')?.value || 'In Process') !== normalize(orig.test_result || 'In Process')) return true;
      if (normalize(row.querySelector('.item-form-comment')?.value) !== normalize(orig.item_comment)) return true;
      if (normalize(row.querySelector('.item-form-density15c')?.value) !== normalize(orig.density_15c)) return true;
      if (normalize(row.querySelector('.item-form-density30c')?.value) !== normalize(orig.density_30c)) return true;
    }

    return false;
  }

  async function handleRequestFormBack() {
    if (isSaving) return;

    const backBtn = document.getElementById('btn-request-form-back') || document.querySelector('#view-request-form .btn-secondary');

    // Case 1: Create Mode (creating a new request)
    if (!state.currentRequestId) {
      const isDirty = checkRequestFormDirty();
      if (isDirty) {
        try {
          if (backBtn) showLoadingButton(backBtn, true, 'กำลังร่าง...');
          await saveDraft();
        } catch (e) {
          console.error('Error auto-saving new draft on back:', e);
          navigate('requests');
        } finally {
          if (backBtn) showLoadingButton(backBtn, false, 'ย้อนกลับ');
        }
      } else {
        navigate('requests');
      }
      return;
    }

    // Case 2: Edit Mode (editing an existing request)
    const isDirty = checkRequestFormDirty();
    if (!isDirty) {
      if (state.editingRecord?.status === 'Draft') {
        navigate('drafts');
      } else {
        navigate('request-detail', { id: state.currentRequestId });
      }
      return;
    }

    try {
      if (backBtn) showLoadingButton(backBtn, true, 'กำลังบันทึก...');
      isSaving = true;

      const customerName = document.getElementById('form-customer')?.value.trim() || (state.editingRecord?.customer_name || '-');
      const carPlate = document.getElementById('form-car-plate')?.value.trim() || '';
      const sealNo = document.getElementById('form-seal-no')?.value.trim() || '';
      const containerNo = document.getElementById('form-container-no')?.value.trim() || '';
      const notes = document.getElementById('form-notes')?.value.trim() || '';
      const labComments = document.getElementById('form-lab-comments')?.value.trim() || '';
      const poNumber = document.getElementById('form-po-number')?.value.trim() || '';
      const needBaseOilCheck = document.getElementById('form-need-base-oil');
      const statusSelect = document.getElementById('form-status');

      const itemRows = document.querySelectorAll('#form-items-tbody tr');
      const itemsData = [];

      for (let i = 0; i < itemRows.length; i++) {
        const row = itemRows[i];
        const pName = row.querySelector('.item-form-name')?.value.trim() || '';
        const pBatch = row.querySelector('.item-form-batch')?.value.trim() || '';
        const pQty = row.querySelector('.item-form-qty')?.value.trim() || '';
        const idVal = row.querySelector('.item-form-id')?.value;
        const rmInput = row.querySelector('.item-form-rm');
        const resultSelect = row.querySelector('.item-form-result');
        const commentInput = row.querySelector('.item-form-comment');
        const den15Input = row.querySelector('.item-form-density15c');
        const den30Input = row.querySelector('.item-form-density30c');

        const pRm = rmInput ? rmInput.value.trim() : '';
        const pResult = resultSelect ? resultSelect.value : 'In Process';
        const pComment = commentInput ? commentInput.value.trim() : '';
        const pDen15 = den15Input ? den15Input.value.trim() : '';
        const pDen30 = den30Input ? den30Input.value.trim() : '';

        if (!pName && !pBatch && !pQty && !pRm && !pDen15 && !pDen30 && !pComment) {
          continue;
        }

        const origItem = state.editingRecord?.items?.[i] || {};
        itemsData.push({
          id: idVal || origItem.id || undefined,
          product_name: pName || origItem.product_name || '-',
          batch_number: pBatch || origItem.batch_number || '-',
          quantity: pQty || origItem.quantity || '-',
          rm_no: pRm !== undefined ? pRm : (origItem.rm_no || ''),
          test_result: pResult || origItem.test_result || 'In Process',
          item_comment: pComment !== undefined ? pComment : (origItem.item_comment || ''),
          density_15c: pDen15,
          density_30c: pDen30
        });
      }

      if (itemsData.length === 0 && state.editingRecord?.items?.length) {
        state.editingRecord.items.forEach(it => itemsData.push({ ...it }));
      }

      const requestDate = document.getElementById('form-request-date')?.value || state.editingRecord?.request_date || (window.TimeSync ? window.TimeSync.getBangkokDateTime().dateStr : new Date().toISOString().slice(0, 10));
      const requestTime = document.getElementById('form-request-time')?.value || state.editingRecord?.request_time || (window.TimeSync ? window.TimeSync.getBangkokDateTime().timeStr : new Date().toTimeString().slice(0, 5));

      const requestData = {
        customer_name: customerName,
        po_number: poNumber,
        need_base_oil_view: needBaseOilCheck ? needBaseOilCheck.checked : false,
        car_plate: carPlate,
        seal_no: sealNo,
        container_no: containerNo,
        notes: notes,
        lab_comments: labComments,
        request_date: requestDate,
        request_time: requestTime
      };

      if (statusSelect && statusSelect.value) {
        requestData.status = statusSelect.value;
      } else if (state.editingRecord?.status) {
        requestData.status = state.editingRecord.status;
      }

      if (requestData.status === 'Complete') {
        const hasInProcessItem = itemsData.some(item => !item.test_result || item.test_result.trim() === 'In Process');
        if (hasInProcessItem) {
          showToast('ไม่สามารถบันทึกเป็น Complete ได้ เนื่องจากยังมีรายการ In Process (คงสถานะเดิมไว้)', 'warning');
          requestData.status = (state.editingRecord?.status !== 'Complete') ? state.editingRecord.status : 'In Process';
          if (statusSelect) statusSelect.value = requestData.status;
        }
      }

      const isAdmin = state.currentUser?.role === 'admin';
      const isLab = state.currentUser?.role === 'lab';
      const isAdminOrLab = isAdmin || isLab;
      const formReqNo = document.getElementById('form-request-no');
      const formReqYear = document.getElementById('form-request-year');
      if (isAdminOrLab && formReqNo && formReqYear && formReqNo.value) {
        requestData.request_no = formReqNo.value;
        requestData.request_year = formReqYear.value;
      }

      if (state.editingRecord?.status === 'Draft') {
        requestData.status = 'Draft';
        await window.DB.updateDraft(state.currentRequestId, requestData, itemsData);
        showToast('บันทึกแบบร่างอัตโนมัติเรียบร้อยแล้ว', 'success');
        navigate('drafts');
      } else {
        const updated = await window.DB.updateRequest(state.currentRequestId, requestData, itemsData);
        if (currentFulfillingEditRequestId) {
          const oldData = state.editingRecord ? { request: state.editingRecord, items: state.editingRecord.items } : null;
          const newData = { request: requestData, items: itemsData };
          await window.DB.updateEditRequestStatus(currentFulfillingEditRequestId, 'Completed', state.currentUser.id, oldData, newData);
          currentFulfillingEditRequestId = null;
        }
        showToast('บันทึกข้อมูลอัตโนมัติเรียบร้อยแล้ว', 'success');
        loadRequestsList();
        navigate('request-detail', { id: updated.id });
      }
    } catch (err) {
      console.error('Error auto-saving on back:', err);
      showToast('ไม่สามารถบันทึกอัตโนมัติได้: ' + err.message, 'error');
    } finally {
      isSaving = false;
      if (backBtn) showLoadingButton(backBtn, false, 'ย้อนกลับ');
    }
  }

  function handleRequestFormCancel() {
    if (state.currentRequestId) {
      if (state.editingRecord?.status === 'Draft') {
        navigate('drafts');
      } else {
        navigate('request-detail', { id: state.currentRequestId });
      }
    } else {
      navigate('requests');
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
      state.currentRequestDetail = details;
      
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
      const notesEl = document.getElementById('detail-notes');
      const hasNote = details.notes && details.notes.trim() && details.notes.trim() !== '-' && details.notes.trim() !== 'ไม่มีหมายเหตุ';
      if (notesEl) {
        notesEl.innerText = hasNote ? details.notes : 'ไม่มีหมายเหตุ';
        notesEl.style.color = hasNote ? '#b45309' : '';
        notesEl.style.fontWeight = hasNote ? '600' : 'normal';
        const parentBlock = notesEl.closest('.print-block');
        if (parentBlock) {
          parentBlock.style.backgroundColor = hasNote ? '#fffdf5' : '';
          parentBlock.style.borderColor = hasNote ? '#f59e0b' : '';
          parentBlock.style.borderWidth = hasNote ? '1.5px' : '';
        }
      }

      // Lab comments — and append Density summary when need_base_oil_view is true
      const labCommentEl = document.getElementById('detail-lab-comments');
      let labCommentText = details.lab_comments || 'ไม่มีความคิดเห็นจากห้องปฏิบัติการ';

      const isBaseOilVisible = details.need_base_oil_view === true;
      if (isBaseOilVisible && details.items && details.items.length > 0) {
        const densityLines = details.items
          .filter(it => it.density_15c || it.density_30c)
          .map(it => {
            const den15 = it.density_15c ? `Den@15°C: ${it.density_15c}` : '';
            const den30 = it.density_30c ? `Den@30°C: ${it.density_30c}` : '';
            const densities = [den15, den30].filter(Boolean).join(' | ');
            return `- ${it.product_name || 'ไม่ระบุชื่อสินค้า'}: ${densities}`;
          });

        if (densityLines.length > 0) {
          labCommentText += '\n\n📊 ค่าความหนาแน่น (Density):\n' + densityLines.join('\n');
        }
      }
      labCommentEl.innerText = labCommentText;

      // Items table
      itemsTbody.innerHTML = '';
      
      const detailTable = itemsTbody.closest('table');
      if (detailTable) {
        detailTable.querySelectorAll('th.base-oil-field').forEach(th => {
          th.style.display = isBaseOilVisible ? 'table-cell' : 'none';
        });
      }
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
        if (state.currentUser.role === 'admin' && !['approved', 'rejected'].includes((details.status || '').toLowerCase().trim())) {
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
          <td class="base-oil-field" style="display:${isBaseOilVisible ? 'table-cell' : 'none'};">${escapeHtml(item.density_15c || '-')}</td>
          <td class="base-oil-field" style="display:${isBaseOilVisible ? 'table-cell' : 'none'};">${escapeHtml(item.density_30c || '-')}</td>
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

      const statusLower = (details.status || '').trim().toLowerCase();
      const isApproved = details.approved === true || statusLower === 'approved';
      const isRejected = statusLower === 'rejected';
      const isLocked = isApproved || isRejected;
      
      if (printBtn) printBtn.style.setProperty('display', 'inline-flex', 'important');
      
      // Hide Edit / Modify button and Delete button when locked (Approved OR Rejected) or for base_oil
      if (isBaseOil || isLocked) {
        if (editBtn) editBtn.style.setProperty('display', 'none', 'important');
        if (deleteBtn) deleteBtn.style.setProperty('display', 'none', 'important');
      } else {
        if (editBtn) {
          editBtn.style.setProperty('display', (isAdmin || isLab) ? 'inline-flex' : 'none', 'important');
          editBtn.innerHTML = '<i data-lucide="edit"></i> แก้ไขข้อมูลใบแจ้ง';
          if (isLab && !isAdmin) {
            window.DB.hasPendingEditRequest(details.id).then(hasActiveEdit => {
               if (hasActiveEdit) {
                 editBtn.innerHTML = '✏️ แก้ไขข้อมูลตามคำขอ';
                 editBtn.style.backgroundColor = '#f59e0b';
                 editBtn.style.color = 'white';
               } else {
                 editBtn.style.backgroundColor = ''; // default
                 editBtn.style.color = '';
               }
               if (window.lucide) window.lucide.createIcons();
            }).catch(e => console.error(e));
          }
        }
        if (deleteBtn) deleteBtn.style.setProperty('display', isAdmin ? 'inline-flex' : 'none', 'important');
      }

      // Dynamically render Approve and Reject buttons together ONLY when status is Complete
      const approveRejectContainer = document.getElementById('approve-reject-btn-container');
      if (approveRejectContainer) {
        if (statusLower === 'complete' && (isAdmin || isLab)) {
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
          const reopenActionContainer = document.getElementById('reopen-action-container');

          if (isApproved || isRejected) {
            badge.innerText = isApproved ? 'Approved' : 'Rejected';
            badge.className = isApproved ? 'badge approved' : 'badge rejected';
            badge.style.backgroundColor = isApproved ? '' : '#dc2626';
            badge.style.color = isApproved ? '' : 'white';

            document.getElementById('approval-pending-state').style.display = 'none';
            document.getElementById('approval-done-state').style.display = 'flex';
            
            const actionLabel = document.getElementById('approval-action-label');
            if (actionLabel) actionLabel.innerText = isApproved ? 'Approved By' : 'Rejected By';
            const dateLabel = document.getElementById('approval-date-label');
            if (dateLabel) dateLabel.innerText = isApproved ? 'Approved Date' : 'Rejected Date';

            document.getElementById('approval-name-display').innerText = details.approved_name || '-';
            document.getElementById('approval-role-display').innerText = details.approved_role || '-';
            
            const dt = details.approved_at ? new Date(details.approved_at) : null;
            document.getElementById('approval-date-display').innerText = dt ? `${formatThaiDate(dt.toISOString().split('T')[0])} ${dt.toTimeString().slice(0, 5)} น.` : '-';

            if (reopenActionContainer) {
              // Reopen is strictly restricted to Admin only (Lab users must never see or use Reopen)
              reopenActionContainer.style.display = isAdmin ? 'flex' : 'none';
            }

          } else {
            badge.innerText = 'Waiting for Approval';
            badge.className = 'badge pending';
            badge.style.backgroundColor = '';
            badge.style.color = '';
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

    // Approved / Rejected by info
    const approvedNameEl = document.getElementById('print-approved-name');
    const approvedDateEl = document.getElementById('print-approved-date');
    const waitingEl = document.getElementById('print-waiting-approval');
    const sigBox = document.getElementById('print-signature-img-box');
    const approvedTitleEl = document.getElementById('print-approved-title');
    const statusStampEl = document.getElementById('print-status-stamp');
    
    // Clear old images & stamps
    if (sigBox) {
      const oldNodes = sigBox.querySelectorAll('img, .reject-stamp-box');
      oldNodes.forEach(i => i.remove());
    }
    if (statusStampEl) {
      statusStampEl.style.display = 'none';
      statusStampEl.innerHTML = '';
    }

    // Always restore title to "ผู้อนุมัติผลการตรวจสอบ (Approved By)"
    if (approvedTitleEl) {
      approvedTitleEl.innerText = 'ผู้อนุมัติผลการตรวจสอบ (Approved By)';
      approvedTitleEl.style.color = '';
    }

    const statusLower = (details.status || '').trim().toLowerCase();
    const isApproved = details.approved === true || statusLower === 'approved';
    const isRejected = statusLower === 'rejected';

    if (isApproved || isRejected) {
      if (waitingEl) waitingEl.style.display = 'none';
      if (approvedNameEl) approvedNameEl.innerText = details.approved_name || '-';
      if (approvedDateEl && details.approved_at) {
        const dt = new Date(details.approved_at);
        const prefix = isApproved ? 'อนุมัติเมื่อ:' : 'วันที่:';
        approvedDateEl.innerText = `${prefix} ${formatThaiDate(dt.toISOString().split('T')[0])} เวลา ${dt.toTimeString().slice(0, 5)} น.`;
      }
      
      // Signature image
      if (sigBox && details.approved_signature_snapshot) {
        const img = document.createElement('img');
        img.src = details.approved_signature_snapshot;
        img.style.cssText = 'max-height:60px; max-width:160px; object-fit:contain; position:relative; z-index:2;';
        sigBox.appendChild(img);
      }

      // If rejected, show clear header stamp on A4 report
      if (isRejected && statusStampEl) {
        statusStampEl.style.display = 'block';
        statusStampEl.innerHTML = `
          <div style="border:2px solid #dc2626; color:#dc2626; font-size:13px; font-weight:800; padding:4px 12px; border-radius:6px; letter-spacing:1px; background-color:#fef2f2; text-align:center;">
            REJECTED / ปฏิเสธผล
          </div>
        `;
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

    // Lab comments for print — append Density summary when need_base_oil_view is true
    let printLabCommentText = details.lab_comments || '';
    const isBaseOilVisible = details.need_base_oil_view === true;
    if (isBaseOilVisible && details.items && details.items.length > 0) {
      const densityLines = details.items
        .filter(it => it.density_15c || it.density_30c)
        .map(it => {
          const den15 = it.density_15c ? `Den@15°C: ${it.density_15c}` : '';
          const den30 = it.density_30c ? `Den@30°C: ${it.density_30c}` : '';
          const densities = [den15, den30].filter(Boolean).join(' | ');
          return `- ${it.product_name || 'ไม่ระบุชื่อสินค้า'}: ${densities}`;
        });
      if (densityLines.length > 0) {
        printLabCommentText += (printLabCommentText ? '\n\n' : '') + '📊 ค่าความหนาแน่น (Density):\n' + densityLines.join('\n');
      }
    }
    document.getElementById('print-lab-comments').innerText = printLabCommentText;

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
    
    try {
      const details = await window.DB.getRequestById(state.currentRequestId);
      const statusLower = (details?.status || '').trim().toLowerCase();
      if (details?.approved === true || statusLower === 'approved') {
        showToast('ไม่สามารถลบใบแจ้งตรวจสอบที่ได้รับการอนุมัติ (Approved) แล้วได้', 'error');
        return;
      }
    } catch (err) {
      console.warn('Could not verify approval status before deletion:', err);
    }

    if (confirm('คุณแน่ใจว่าต้องการลบใบแจ้งตรวจสอบห้องปฏิบัติการใบนี้ใช่หรือไม่? การลบจะไม่สามารถกู้ข้อมูลกลับมาได้')) {
      try {
        await window.DB.deleteRequest(state.currentRequestId);
        showToast('ลบข้อมูลใบแจ้งตรวจสอบเรียบร้อยแล้ว', 'success');
        loadRequestsList();
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

    // If user hasn't clicked search yet, show prompt
    if (!state.historyFilters._hasSearched) {
      listBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:30px;">กรุณาระบุเงื่อนไขและกดปุ่ม "ค้นหา" เพื่อดูประวัติวัตถุดิบ</td></tr>`;
      renderPaginationControls({ containerId: 'history-pagination', page: 1, pageSize: state.historyFilters.pageSize || 20, totalCount: 0, onPageChange: 'App.setHistoryPage', onPageSizeChange: 'App.setHistoryPageSize' });
      return;
    }

    listBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:30px;">กำลังโหลดประวัติวัตถุดิบ...</td></tr>`;

    try {
      const rawHistory = await window.DB.getMaterialHistory(state.historyFilters);
      const history = Array.isArray(rawHistory) ? rawHistory : (rawHistory.data || []);
      const totalCount = Array.isArray(rawHistory) ? history.length : (rawHistory.totalCount || 0);
      const page = state.historyFilters.page || 1;
      const pageSize = state.historyFilters.pageSize || 20;

      state.historyList = history;
      listBody.innerHTML = '';

      if (history.length === 0) {
        listBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:30px;">ไม่พบประวัติการส่งทดสอบของชิ้นงาน/วัตถุดิบนี้</td></tr>`;
        renderPaginationControls({ containerId: 'history-pagination', page: 1, pageSize, totalCount: 0, onPageChange: 'App.setHistoryPage', onPageSizeChange: 'App.setHistoryPageSize' });
        return;
      }

      const paginatedItems = history;

      paginatedItems.forEach(h => {
        const tr = document.createElement('tr');
        const formattedDate = formatThaiDate(h.request_date);
        const formattedTime = (h.request_time && typeof h.request_time === 'string') ? `${h.request_time.slice(0, 5)} น.` : '';
        
        let resClass = 'result-process';
        if (h.test_result === 'Pass') resClass = 'result-pass';
        if (h.test_result === 'Fail') resClass = 'result-fail';
        if (h.test_result === 'Hold') resClass = 'result-hold';

        const statusBadge = getStatusBadgeClass(h.request_status || h.status || 'Complete');

        // ตรวจสอบสิทธิ์พิมพ์จากผลการตรวจระดับรายการ (test_result) ไม่ใช่สถานะใบ Request
        let printBtnHtml = '';
        if (state.currentUser && ['admin', 'lab', 'requester'].includes(state.currentUser.role)) {
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
        if (state.currentUser && state.currentUser.role === 'admin') {
            inspectionDateHtml += ` <button onclick="App.editInspectionDate('${h.item_id}', '${h.inspection_date || ''}')" style="background:none;border:none;cursor:pointer;color:var(--primary-color);" title="แก้ไขวันที่ตรวจสอบ">✏️</button>`;
        }

        const reqNoDisplay = h.is_historical ? '<span style="color:#64748b; font-size:12px; font-weight:600;">HISTORICAL</span>' : `<strong>${h.request_no || '-'}/${h.request_year || ''}</strong>`;
        const viewDetailBtn = (h.is_historical || !h.request_id || h.request_id === 'HISTORICAL') ? '' : `
          <button class="btn-icon" onclick="App.navigate('request-detail', {id: '${h.request_id}'})" title="ดูรายละเอียดใบแจ้ง">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </button>
        `;

        tr.innerHTML = `
          <td style="white-space: nowrap;">${reqNoDisplay}</td>
          <td style="white-space: nowrap;">${formattedDate} ${formattedTime}</td>
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
          <td style="white-space: nowrap;">${escapeHtml(h.requester_name || '-')}</td>
          <td style="white-space: nowrap;"><span class="badge ${statusBadge}">${h.request_status || h.status || 'Complete'}</span></td>
          <td style="display: flex; justify-content: center; align-items: center; gap: 8px; white-space: nowrap;">
            ${viewDetailBtn}
            ${printBtnHtml}
          </td>
        `;
        listBody.appendChild(tr);
      });

      renderPaginationControls({
        containerId: 'history-pagination',
        page: page,
        pageSize: pageSize,
        totalCount: totalCount,
        onPageChange: 'App.setHistoryPage',
        onPageSizeChange: 'App.setHistoryPageSize'
      });
    } catch (e) {
      console.error(e);
      listBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-danger); padding:30px;">เกิดข้อผิดพลาดในการโหลดประวัติวัตถุดิบ: ${e.message}</td></tr>`;
    }
  }

  function handleHistoryFilter(e) {
    if (e) e.preventDefault();
    state.historyFilters = {
      productName: document.getElementById('hist-product').value.trim(),
      batchNumber: document.getElementById('hist-batch').value.trim(),
      rmNo: document.getElementById('hist-rm').value.trim(),
      requestNo: document.getElementById('hist-request-no').value.trim(),
      testResult: document.getElementById('hist-result').value,
      startDate: document.getElementById('hist-start-date').value,
      endDate: document.getElementById('hist-end-date').value,
      page: 1,
      pageSize: state.historyFilters.pageSize || 20,
      _hasSearched: true
    };
    loadMaterialHistory();
  }

  function clearHistoryFilters() {
    state.historyFilters = {
      productName: '', batchNumber: '', rmNo: '', requestNo: '', testResult: '', startDate: '', endDate: '',
      page: 1,
      pageSize: state.historyFilters.pageSize || 20,
      _hasSearched: false
    };
    // Clear inputs visually
    document.getElementById('hist-product').value = '';
    document.getElementById('hist-batch').value = '';
    document.getElementById('hist-rm').value = '';
    document.getElementById('hist-request-no').value = '';
    document.getElementById('hist-result').value = '';
    document.getElementById('hist-start-date').value = '';
    document.getElementById('hist-end-date').value = '';
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
      const result = await window.DB.getBatchHistory(batchNumber);
      const traceLogs = result.data || result;
      tbody.innerHTML = '';

      if (traceLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:20px;">ไม่พบประวัติสำหรับ Batch: ${batchNumber}</td></tr>`;
        return;
      }

      traceLogs.forEach(h => {
        const tr = document.createElement('tr');
        const formattedDate = formatThaiDate(h.request_date);
        const formattedTime = (h.request_time && typeof h.request_time === 'string') ? `${h.request_time.slice(0, 5)} น.` : '';

        let resClass = 'result-process';
        if (h.test_result === 'Pass') resClass = 'result-pass';
        if (h.test_result === 'Fail') resClass = 'result-fail';
        if (h.test_result === 'Hold') resClass = 'result-hold';

        const statusBadge = getStatusBadgeClass(h.request_status || h.status || 'Complete');
        const reqNoDisplay = h.is_historical ? '<span style="color:#64748b; font-size:12px; font-weight:600;">HISTORICAL</span>' : `<strong>${h.request_no || '-'}/${h.request_year || ''}</strong>`;
        const viewLinkHtml = (h.is_historical || !h.request_id || h.request_id === 'HISTORICAL') ? '-' : `<a href="#" onclick="App.closeBatchTraceModal(); App.navigate('request-detail', {id: '${h.request_id}'}); return false;">ดูรายละเอียด &rarr;</a>`;

        tr.innerHTML = `
          <td style="white-space: nowrap;">${reqNoDisplay}</td>
          <td style="white-space: nowrap;">${formattedDate} ${formattedTime}</td>
          <td>${escapeHtml(h.product_name)}</td>
          <td style="white-space: nowrap;">${h.rm_no ? `<code>${escapeHtml(h.rm_no)}</code>` : '<em style="color:var(--text-muted);">ว่าง</em>'}</td>
          <td style="white-space: nowrap;"><span class="badge ${resClass}">${h.test_result}</span></td>
          <td style="white-space: nowrap;">${escapeHtml(h.requester_name || '-')}</td>
          <td style="white-space: nowrap;"><span class="badge ${statusBadge}">${h.request_status || h.status || 'Complete'}</span></td>
          <td style="white-space: nowrap;">
            ${viewLinkHtml}
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

  function showNotesAlertModal(details) {
    const modal = document.getElementById('modal-notes-alert');
    if (!modal) return;
    const reqNoEl = document.getElementById('notes-alert-req-no');
    const reqUserEl = document.getElementById('notes-alert-requester');
    const contentEl = document.getElementById('notes-alert-content');

    if (reqNoEl) reqNoEl.innerText = `${details.request_no || '-'}/${details.request_year || '-'}`;
    if (reqUserEl) reqUserEl.innerText = details.requester_name || '-';
    if (contentEl) contentEl.innerText = details.notes || '';

    modal.classList.add('open');
  }

  function closeNotesAlertModal() {
    const modal = document.getElementById('modal-notes-alert');
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
            <button class="btn btn-secondary btn-sm" onclick="App.openChangeRoleModal('${u.id}', '${escapeHtml(u.username)}', '${u.role}')" style="padding:4px 8px; ${isSelf ? 'opacity:0.3; cursor:not-allowed;' : ''}" ${isSelf ? 'disabled' : ''}>
              เปลี่ยนสิทธิ์
            </button>
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
  // --- Change Role ---
  function openChangeRoleModal(userId, username, currentRole) {
    const modal = document.getElementById('modal-change-role');
    if (modal) {
      document.getElementById('change-role-form').reset();
      document.getElementById('change-role-userid').value = userId;
      document.getElementById('change-role-select').value = currentRole || 'requester';
      document.getElementById('change-role-title').innerText = 'เปลี่ยนสิทธิ์ผู้ใช้: ' + username;
      modal.classList.add('open');
    }
  }

  function closeChangeRoleModal() {
    const modal = document.getElementById('modal-change-role');
    if (modal) modal.classList.remove('open');
  }

  async function handleChangeRoleSubmit(e) {
    e.preventDefault();
    const userId = document.getElementById('change-role-userid').value;
    const newRole = document.getElementById('change-role-select').value;

    try {
      showLoadingButton(e.submitter, true, 'กำลังบันทึก...');
      await window.DB.updateUserRole(userId, newRole);
      showToast('เปลี่ยนสิทธิ์ผู้ใช้งานสำเร็จ', 'success');
      closeChangeRoleModal();
      loadUsersManager(); // Refresh the list
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาดในการเปลี่ยนสิทธิ์: ' + err.message, 'error');
    } finally {
      showLoadingButton(e.submitter, false);
    }
  }

  function loadSettingsView() {
    if (!state.currentUser) return;
    const role = (state.currentUser.role || '').toLowerCase();
    const isUserAdmin = role === 'admin';

    // Populate user info card
    const nameEl = document.getElementById('settings-user-name');
    const usernameEl = document.getElementById('settings-user-username');
    const avatarEl = document.getElementById('settings-user-avatar');
    const roleBadgeEl = document.getElementById('settings-user-role-badge');

    const displayName = state.currentUser.display_name || state.currentUser.username || 'User';
    if (nameEl) nameEl.innerText = displayName;
    if (usernameEl) usernameEl.innerText = state.currentUser.username || '-';
    if (avatarEl) {
      avatarEl.innerText = displayName.trim().charAt(0).toUpperCase() || 'U';
    }

    if (roleBadgeEl) {
      const roleNames = {
        admin: 'ผู้ดูแลระบบ (Admin)',
        lab: 'เจ้าหน้าที่แล็บ (Lab)',
        requester: 'ผู้ขอตรวจ (Requester)',
        base_oil: 'Base Oil'
      };
      roleBadgeEl.innerText = roleNames[role] || role.toUpperCase();
      roleBadgeEl.className = 'badge';
      if (isUserAdmin) {
        roleBadgeEl.classList.add('badge-admin');
        roleBadgeEl.style.backgroundColor = '#dbeafe';
        roleBadgeEl.style.color = '#1d4ed8';
      } else if (role === 'lab') {
        roleBadgeEl.classList.add('badge-lab');
        roleBadgeEl.style.backgroundColor = '#e0e7ff';
        roleBadgeEl.style.color = '#4338ca';
      } else if (role === 'base_oil') {
        roleBadgeEl.style.backgroundColor = '#fef3c7';
        roleBadgeEl.style.color = '#b45309';
      } else {
        roleBadgeEl.classList.add('badge-requester');
        roleBadgeEl.style.backgroundColor = '#f1f5f9';
        roleBadgeEl.style.color = '#475569';
      }
    }

    // Admin Section Visibility
    const adminSec = document.getElementById('setting-admin-section');
    if (adminSec) {
      adminSec.style.display = isUserAdmin ? 'block' : 'none';
    }

    // Check Push Notification Status
    checkPushSubscriptionStatus();
  }

  function openSettingsModal() {
    navigate('settings');
  }

  function closeSettingsModal() {
    const modal = document.getElementById('modal-settings');
    if (modal) modal.classList.remove('open');
  }

  async function clearSampleData() {
    closeSettingsModal();
    try {
      if (window.DB && typeof window.DB.getService === 'function' && window.DB.getService().clearSampleData) {
        await window.DB.getService().clearSampleData();
      } else {
        localStorage.removeItem('lrms_local_requests');
        localStorage.removeItem('lrms_local_items');
        localStorage.removeItem('rmis_requests');
        localStorage.removeItem('rmis_items');
      }
      showToast('ล้างข้อมูลใบแจ้งตัวอย่างสำเร็จ กรุณารีเฟรชหน้าจอ (F5)', 'success');
      setTimeout(() => location.reload(), 2000);
    } catch (e) {
      console.error(e);
      showToast('เกิดข้อผิดพลาดในการล้างข้อมูล', 'error');
    }
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

  // --- DATABASE & SYSTEM SETTINGS CONFIG ---
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

  async function saveDatabaseConfig() {
    const mode = document.getElementById('config-db-mode').value;
    const url = document.getElementById('config-sb-url').value.trim();
    const key = document.getElementById('config-sb-key').value.trim();

    if (mode === 'supabase' && (!url || !key)) {
      showToast('กรุณากรอกข้อมูล Supabase URL และ Anon Key ให้ครบถ้วน', 'warning');
      return;
    }

    const soundEnabled = document.getElementById('config-sound-enabled') ? document.getElementById('config-sound-enabled').checked : true;

    const currentConfig = window.AppConfig.load();
    const isDbChanged = currentConfig.supabaseUrl !== url || currentConfig.supabaseAnonKey !== key;

    const newConfig = {
      ...currentConfig,
      dbMode: mode,
      supabaseUrl: url,
      supabaseAnonKey: key,
      soundEnabled: soundEnabled
    };

    if (window.AppConfig.save(newConfig)) {

      showToast('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว', 'success');
      closeConfigModal();
      
      // Only logout and reload if database credentials were changed
      if (isDbChanged) {
        updateConnectionBadge();
        logout();
      }
    } else {
      showToast('ไม่สามารถบันทึกการตั้งค่าลงเครื่องได้', 'error');
    }
  }

  // --- LINE MESSAGING API FUNCTIONS ---
  function toggleLineConfigFields() {
    const isEnabled = document.getElementById('config-line-enabled')?.checked;
    const container = document.getElementById('line-config-fields');
    if (container) {
      container.style.display = isEnabled ? 'block' : 'none';
    }
  }

  // --- DYNAMIC SCRIPT LOADERS (LAZY LOADING FOR HEAVY LIBRARIES) ---
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${url}"]`);
      if (existing) {
        if (existing.getAttribute('data-loaded') === 'true' || typeof XLSX !== 'undefined' || typeof html2pdf !== 'undefined') {
          return resolve();
        }
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', (e) => reject(e));
        return;
      }
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => {
        script.setAttribute('data-loaded', 'true');
        resolve();
      };
      script.onerror = (e) => reject(new Error('Failed to load script ' + url));
      document.head.appendChild(script);
    });
  }

  async function ensureXLSXLoaded() {
    if (typeof XLSX !== 'undefined') return true;
    showToast('กำลังโหลดโมดูลจัดการไฟล์ Excel...', 'info');
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
      return true;
    } catch (e) {
      console.warn('XLSX script load failed:', e);
      return false;
    }
  }

  async function ensureHtml2PdfLoaded() {
    if (typeof html2pdf !== 'undefined') return true;
    showToast('กำลังโหลดโมดูลสร้างไฟล์ PDF...', 'info');
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
      return true;
    } catch (e) {
      console.warn('html2pdf script load failed:', e);
      return false;
    }
  }

  // --- MANUAL HISTORICAL RECORD ENTRY ---
  function openManualHistoricalModal() {
    const role = (state.currentUser?.role || '').toLowerCase();
    if (!['admin', 'lab'].includes(role)) {
      showToast('เฉพาะผู้ดูแลระบบ (Admin) หรือเจ้าหน้าที่แลป (Lab) เท่านั้นที่มีสิทธิ์เพิ่มข้อมูลย้อนหลัง', 'error');
      return;
    }
    const modal = document.getElementById('modal-manual-historical');
    if (modal) {
      const today = new Date().toISOString().slice(0, 10);
      const dateInput = document.getElementById('mhist-date');
      if (dateInput) dateInput.value = today;
      modal.classList.add('open');
      if (window.lucide) window.lucide.createIcons();
    }
  }

  function closeManualHistoricalModal() {
    const modal = document.getElementById('modal-manual-historical');
    if (modal) {
      modal.classList.remove('open');
      const form = document.getElementById('form-manual-historical');
      if (form) form.reset();
    }
  }

  async function handleManualHistoricalSubmit(e) {
    if (e) e.preventDefault();
    const date = document.getElementById('mhist-date')?.value;
    const product = document.getElementById('mhist-product')?.value.trim();
    const batch = document.getElementById('mhist-batch')?.value.trim();
    const qty = document.getElementById('mhist-quantity')?.value.trim();
    const rmNo = document.getElementById('mhist-rm')?.value.trim();
    const result = document.getElementById('mhist-result')?.value;
    const den15 = document.getElementById('mhist-den15')?.value.trim();
    const den30 = document.getElementById('mhist-den30')?.value.trim();
    const comment = document.getElementById('mhist-comment')?.value.trim();

    if (!product || !batch) {
      showToast('กรุณากรอกชื่อสินค้าและ Batch Number', 'warning');
      return;
    }

    showLoading();
    const btn = document.getElementById('btn-submit-manual-hist');
    if (btn) btn.disabled = true;

    try {
      await window.DB.saveHistoricalRecord({
        receive_date: date,
        product_name: product,
        batch_number: batch,
        quantity: qty,
        rm_no: rmNo,
        test_result: result,
        density_15c: den15,
        density_30c: den30,
        item_comment: comment
      });

      showToast('บันทึกข้อมูลประวัติย้อนหลังเรียบร้อยแล้ว', 'success');
      closeManualHistoricalModal();
      if (state.currentView === 'history') {
        loadMaterialHistory();
      }
    } catch (err) {
      console.error('saveHistoricalRecord error:', err);
      showToast('ไม่สามารถบันทึกข้อมูลได้: ' + err.message, 'error');
    } finally {
      hideLoading();
      if (btn) btn.disabled = false;
    }
  }

  // --- EXPORT TO EXCEL & CSV ---
  function handleImportClick(e) {
    if (e) e.preventDefault();
    if (state.currentUser.role !== 'admin') {
      showToast('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์นำเข้าข้อมูลได้', 'error');
      return;
    }
    const fileInput = document.getElementById('file-import-excel');
    if (fileInput) fileInput.click();
  }

  async function handleImportExcel(event) {
    if (state.currentUser.role !== 'admin') {
      showToast('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์นำเข้าข้อมูลได้', 'error');
      if (event && event.target) event.target.value = '';
      return;
    }

    const file = event.target.files[0];
    if (!file) return;

    await ensureXLSXLoaded();

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

        rawData.forEach((row, index) => {
          // Flexible Thai/English column aliases
          const pName = String(row['Product Name'] || row['Product'] || row['ชื่อสินค้า'] || row['ชื่อวัตถุดิบ'] || row['รายการวัตถุดิบ'] || row['Item'] || '').trim();
          const bNo = String(row['Batch Number'] || row['Batch No.'] || row['Batch No'] || row['Batch'] || row['หมายเลขล็อต'] || row['เลขล็อต'] || '').trim();
          
          // Skip empty rows without product name or batch number
          if (!pName && !bNo) return;

          // Smart auto-fallback for Request Ref if not specified
          let reqRef = String(row['Request Ref'] || row['Request No'] || row['เลขที่ใบแจ้ง'] || row['Inspection Date'] || row['Request Date'] || row['วันที่'] || '').trim();
          if (!reqRef) {
            reqRef = `IMPORT_${new Date().toISOString().slice(0,10)}_${Math.floor(index / 20) + 1}`;
          }

          if (!requestGroups[reqRef]) {
            let parsedYear = parseInt(row['Request Year'] || row['ปี']);
            if (isNaN(parsedYear)) parsedYear = new Date().getFullYear();
            
            // Format dates with fallback to Inspection Date or today's date
            const dateVal = row['Request Date'] || row['Inspection Date'] || row['วันที่'] || row['วันที่รับเข้า'] || row['วันที่ตรวจ'];
            let reqDate = dateVal ? parseExcelDate(dateVal) : new Date().toISOString().split('T')[0];
            
            const timeVal = row['Request Time'] || row['เวลา'];
            let reqTime = timeVal ? parseExcelTime(timeVal) : '08:00:00';

            // Resolve Requester ID from name
            const reqName = String(row['Requester Name'] || row['ผู้แจ้ง'] || '').trim().toLowerCase();
            let resolvedRequesterId = state.currentUser.id; // fallback to current user
            if (reqName && userMap[reqName]) {
              resolvedRequesterId = userMap[reqName];
            }

            const custName = String(row['Customer Name'] || row['Customer'] || row['Supplier'] || row['ชื่อลูกค้า'] || row['ซัพพลายเออร์'] || '-').trim();
            const reqStatus = String(row['Request Status'] || row['สถานะ'] || 'Approved').trim();

            requestGroups[reqRef] = {
              metadata: {
                request_no: String(row['Request No'] || row['เลขที่ใบแจ้ง'] || '').trim(), 
                request_year: parsedYear,
                customer_name: custName || '-',
                request_date: reqDate,
                request_time: reqTime,
                po_number: String(row['PO Number'] || row['PO'] || '').trim(),
                car_plate: String(row['Car Plate'] || row['ทะเบียนรถ'] || '').trim(),
                seal_no: String(row['Seal No'] || row['หมายเลขซีล'] || '').trim(),
                container_no: String(row['Container No'] || row['หมายเลขตู้'] || '').trim(),
                notes: String(row['Notes'] || row['หมายเหตุ'] || '').trim(),
                lab_comments: String(row['Lab Comments'] || row['ความคิดเห็นแล็บ'] || '').trim(),
                status: reqStatus, 
                requester_id: resolvedRequesterId, 
                need_base_oil_view: false,
                created_at: new Date().toISOString()
              },
              items: []
            };
          }

          let itemInspectionDate = null;
          const inspDateVal = row['Inspection Date'] || row['วันที่ตรวจ'] || row['วันที่ทดสอบ'] || row['Request Date'] || row['วันที่'];
          if (inspDateVal) {
            itemInspectionDate = parseExcelDate(inspDateVal);
          }

          const dens15 = row['Density@15C'] || row['Density 15C'] || row['Density_15C'] || row['density_15c'] || row['Density15C'] || '';
          const dens30 = row['Density@30C'] || row['Density 30C'] || row['Density_30C'] || row['density_30c'] || row['Density30C'] || '';
          
          const rawResult = String(row['Test Result'] || row['Result'] || row['ผลการทดสอบ'] || row['ผลการตรวจ'] || row['ผลแล็บ'] || 'Pass').trim();
          let formattedResult = 'Pass';
          if (rawResult.toUpperCase().includes('PASS') || rawResult.includes('ผ่าน')) formattedResult = 'Pass';
          else if (rawResult.toUpperCase().includes('FAIL') || rawResult.includes('ไม่ผ่าน')) formattedResult = 'Fail';
          else if (rawResult.toUpperCase().includes('HOLD') || rawResult.includes('ชะลอ')) formattedResult = 'Hold';

          const qtyVal = String(row['Quantity'] || row['Qty'] || row['ปริมาณ'] || row['จำนวน'] || '').trim();
          const rmVal = String(row['RM No'] || row['RM No.'] || row['RM Number'] || row['รหัสวัตถุดิบ'] || '').trim();
          const itemCommentVal = String(row['Item Comment'] || row['หมายเหตุรายการ'] || '').trim();

          requestGroups[reqRef].items.push({
            product_name: pName || '',
            batch_number: bNo || '',
            quantity: qtyVal || '',
            rm_no: rmVal || '',
            test_result: formattedResult, 
            item_comment: itemCommentVal,
            inspection_date: itemInspectionDate,
            density_15c: String(dens15).trim(),
            density_30c: String(dens30).trim()
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

        const getRowVal = (rowObj, fieldKeys) => {
          if (!rowObj) return '';
          const rowKeys = Object.keys(rowObj);
          for (const key of rowKeys) {
            const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/gi, '');
            for (const fk of fieldKeys) {
              const cleanFk = fk.trim().toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/gi, '');
              if (cleanKey === cleanFk) {
                const val = rowObj[key];
                return val !== undefined && val !== null ? String(val).trim() : '';
              }
            }
          }
          return '';
        };

        const historicalRecordsToImport = [];
        rawData.forEach(row => {
          const pName = getRowVal(row, ['product name', 'product', 'ชื่อสินค้า', 'ชื่อวัตถุดิบ', 'รายการวัตถุดิบ', 'สินค้า', 'item', 'product_name']);
          const bNo = getRowVal(row, ['batch number', 'batch no', 'batch', 'batch_number', 'batch_no', 'หมายเลขล็อต', 'เลขล็อต', 'เลข batch', 'หมายเลข batch', 'lot', 'lot no', 'batch/lot']);
          if (!pName && !bNo) return;

          const rawDate = getRowVal(row, ['request date', 'date', 'วันที่', 'วันที่ตรวจ', 'receive date', 'inspection date', 'request_date', 'receive_date']);
          const recDate = rawDate ? parseExcelDate(rawDate) : new Date().toISOString().slice(0, 10);
          const rawResult = getRowVal(row, ['test result', 'result', 'ผลการทดสอบ', 'ผลการตรวจ', 'ผลแล็บ', 'test_result']);
          let formattedResult = 'Pass';
          if (rawResult.toUpperCase().includes('PASS') || rawResult.includes('ผ่าน')) formattedResult = 'Pass';
          else if (rawResult.toUpperCase().includes('FAIL') || rawResult.includes('ไม่ผ่าน')) formattedResult = 'Fail';
          else if (rawResult.toUpperCase().includes('HOLD') || rawResult.includes('ชะลอ')) formattedResult = 'Hold';

          const dens15 = getRowVal(row, ['density@15c', 'density 15c', 'density_15c', 'density15c', 'den15']);
          const dens30 = getRowVal(row, ['density@30c', 'density 30c', 'density_30c', 'density30c', 'den30']);

          historicalRecordsToImport.push({
            receive_date: recDate,
            product_name: pName || '',
            batch_number: bNo || '',
            quantity: getRowVal(row, ['quantity', 'qty', 'ปริมาณ', 'จำนวน']),
            rm_no: getRowVal(row, ['rm no', 'rm number', 'รหัสวัตถุดิบ', 'rm_no', 'rm']),
            test_result: formattedResult,
            density_15c: dens15,
            density_30c: dens30,
            item_comment: getRowVal(row, ['item comment', 'หมายเหตุรายการ', 'หมายเหตุ', 'comment', 'item_comment'])
          });
        });

        if (requestsToImport.length > 0) {
          await window.DB.bulkImportRequests(requestsToImport, itemsToImport);
        }
        if (historicalRecordsToImport.length > 0) {
          await window.DB.bulkImportHistoricalRecords(historicalRecordsToImport);
        }
        
        showToast(`นำเข้าประวัติย้อนหลังสำเร็จ ${historicalRecordsToImport.length} รายการ`, 'success');
        event.target.value = ''; 
        
        if (state.currentView === 'requests') {
          renderRequestsList();
        } else if (state.currentView === 'history') {
          loadMaterialHistory();
        }
      } catch (err) {
        console.error('Import Error:', err);
        showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
        event.target.value = '';
      }
    };
    
    reader.readAsArrayBuffer(file);
  }

  function openExportModal() {
    if (state.currentUser.role !== 'admin') {
      showToast('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์ส่งออกข้อมูลได้', 'error');
      return;
    }
    
    // Set default start (1st day of month) and end dates (today)
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const formatDateStr = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const startDateEl = document.getElementById('export-start-date');
    const endDateEl = document.getElementById('export-end-date');
    
    if (startDateEl && !startDateEl.value) startDateEl.value = formatDateStr(firstDay);
    if (endDateEl && !endDateEl.value) endDateEl.value = formatDateStr(today);

    const modal = document.getElementById('modal-export-data');
    if (modal) modal.classList.add('open');
  }

  function closeExportModal() {
    const modal = document.getElementById('modal-export-data');
    if (modal) modal.classList.remove('open');
  }

  async function handleExportSubmit(e) {
    e.preventDefault();
    if (state.currentUser.role !== 'admin') {
      showToast('เฉพาะผู้ดูแลระบบเท่านั้นที่มีสิทธิ์ส่งออกข้อมูลได้', 'error');
      return;
    }

    const startDate = document.getElementById('export-start-date').value;
    const endDate = document.getElementById('export-end-date').value;
    const statusVal = document.getElementById('export-status-filter').value;
    
    const formatRadios = document.getElementsByName('export_format');
    let format = 'excel';
    for (let r of formatRadios) {
      if (r.checked) { format = r.value; break; }
    }

    if (!startDate || !endDate) {
      alert('กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุด');
      return;
    }

    const submitBtn = e.submitter;
    const oldBtnText = submitBtn ? submitBtn.innerText : 'ส่งออกข้อมูล';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'กำลังประมวลผล...';
    }

    try {
      showToast('กำลังจัดเตรียมข้อมูลสำหรับการส่งออก...', 'info');

      // Build filters with start & end dates
      const exportFilters = {
        startDate: startDate,
        endDate: endDate
      };
      if (statusVal && statusVal !== 'ALL') {
        exportFilters.status = statusVal;
      }

      // 1. Fetch matching requests based on start & end dates + status filter
      const requests = await window.DB.getRequests(exportFilters);
      if (!requests || requests.length === 0) {
        showToast(`ไม่พบข้อมูลใบแจ้งตามช่วงวันที่ ${startDate} ถึง ${endDate}`, 'warning');
        return;
      }

      // 2. Direct in-memory compilation without N+1 queries
      const flattenedData = [];
      for (let detail of requests) {
        const items = detail.request_items || detail.items || [];
        const reqNoYear = (detail.request_no || '') + '/' + (detail.request_year || '');
        const requesterName = detail.requester_name || (detail.profiles ? detail.profiles.display_name : '');
        
        if (items.length > 0) {
          items.forEach(item => {
            flattenedData.push({
              'เลขที่ใบแจ้ง (Request No)': reqNoYear,
              'วันที่แจ้ง (Date)': detail.request_date,
              'เวลาที่แจ้ง (Time)': detail.request_time,
              'ชื่อลูกค้า (Customer)': detail.customer_name,
              'ผู้แจ้ง (Requester)': requesterName,
              'ทะเบียนรถ (Car Plate)': detail.car_plate || '',
              'หมายเลขซีล (Seal No)': detail.seal_no || '',
              'หมายเลขตู้ (Container No)': detail.container_no || '',
              'หมายเหตุ (Notes)': detail.notes || '',
              'ความคิดเห็นห้องปฏิบัติการ (Lab Comments)': detail.lab_comments || '',
              'สถานะใบแจ้ง (Request Status)': detail.status,
              'ชื่อสินค้า (Product Name)': item.product_name || '',
              'Batch Number': item.batch_number || item.batch_no || '',
              'Quantity (จำนวน)': item.quantity || '',
              'RM No.': item.rm_no || '',
              'ผลการทดสอบ (Test Result)': item.test_result || '',
              'Density@15C': item.density_15c || '',
              'Density@30C': item.density_30c || ''
            });
          });
        } else {
          flattenedData.push({
            'เลขที่ใบแจ้ง (Request No)': reqNoYear,
            'วันที่แจ้ง (Date)': detail.request_date,
            'เวลาที่แจ้ง (Time)': detail.request_time,
            'ชื่อลูกค้า (Customer)': detail.customer_name,
            'ผู้แจ้ง (Requester)': requesterName,
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
            'ผลการทดสอบ (Test Result)': '',
            'Density@15C': '',
            'Density@30C': ''
          });
        }
      }
      // 3. Perform export based on selected format
      if (format === 'excel') {
        await ensureXLSXLoaded();
        if (typeof XLSX !== 'undefined') {
          const worksheet = XLSX.utils.json_to_sheet(flattenedData);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Laboratory Requests');
          
          XLSX.writeFile(workbook, `RMIS_Export_${startDate}_to_${endDate}.xlsx`);
          showToast('ส่งออกไฟล์ Excel (.xlsx) สำเร็จแล้ว', 'success');
        } else {
          console.warn('XLSX library not loaded. Falling back to CSV export.');
          triggerCSVDownload(flattenedData, startDate, endDate);
        }
      } else {
        triggerCSVDownload(flattenedData, startDate, endDate);
        showToast('ส่งออกไฟล์ CSV (.csv) สำเร็จแล้ว', 'success');
      }

      closeExportModal();

    } catch (err) {
      console.error('Export failed:', err);
      showToast('การส่งออกข้อมูลล้มเหลว: ' + err.message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = oldBtnText;
      }
    }
  }

  // Alias for backward compatibility
  async function exportRequestsExcel() {
    openExportModal();
  }

  function triggerCSVDownload(data, startDate = '', endDate = '') {
    if (!data || data.length === 0) return;
    
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
    
    const dateRange = (startDate && endDate) ? `${startDate}_to_${endDate}` : new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `RMIS_Export_${dateRange}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
      showToast('ไม่สามารถอนุมัติได้ เนื่องจากข้อมูลการตรวจสอบยังไม่สมบูรณ์ (Status ต้องเป็น Complete)', 'warning');
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
      showToast('ไม่สามารถอนุมัติได้ เนื่องจากยังมีรายการที่ตรวจสอบไม่เสร็จสิ้น', 'warning');
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
    const btnTop = document.getElementById('btn-detail-approve');
    if (btnTop) { btnTop.disabled = true; btnTop.innerText = 'กำลังอนุมัติ...'; }
    
    try {
      const updated = await window.DB.approveRequest(state.currentRequestId);
      showToast('อนุมัติเอกสารสำเร็จ สถานะเปลี่ยนเป็น Approved', 'success');
      await loadRequestDetail(state.currentRequestId);
      loadRequestsList();
    } catch (e) {
      console.error('approveRequest error:', e);
      showToast('ไม่สามารถอนุมัติได้: ' + e.message, 'error');
    } finally {
      isApproving = false;
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-circle"></i> Approve Document'; }
      if (btnTop) { btnTop.disabled = false; btnTop.innerHTML = '<i data-lucide="check-circle"></i> Approve'; if (window.lucide) window.lucide.createIcons(); }
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
      loadRequestsList();
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

    const reason = prompt('กรุณาระบุเหตุผลในการ Reject (หรือกดตกลงหากไม่ต้องการระบุ):', '');
    if (reason === null) return; // User cancelled
    
    if (!confirm('คุณต้องการ Reject ใบแจ้งนี้ใช่หรือไม่?\nระบบจะประทับลายเซ็นดิจิทัลของคุณเป็นผู้ปฏิเสธผลลงในเอกสาร')) return;
    
    isApproving = true;
    const btn = document.getElementById('btn-detail-reject');
    if (btn) { btn.disabled = true; btn.innerText = 'กำลังปฏิเสธ...'; }
    const btnDoc = document.getElementById('btn-reject-doc');
    if (btnDoc) { btnDoc.disabled = true; btnDoc.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังปฏิเสธ...'; }
    
    try {
      const updated = await window.DB.rejectRequest(state.currentRequestId, reason);
      showToast('Reject ใบแจ้งเรียบร้อยแล้ว (บันทึกลายเซ็นผู้ปฏิเสธผลแล้ว)', 'success');
      await loadRequestDetail(state.currentRequestId);
      loadRequestsList();
    } catch (e) {
      console.error('rejectRequest error:', e);
      showToast('ไม่สามารถ Reject ได้: ' + e.message, 'error');
    } finally {
      isApproving = false;
      if (btn) { btn.disabled = false; btn.innerText = 'Reject'; }
      if (btnDoc) { btnDoc.disabled = false; btnDoc.innerHTML = '<i class="fas fa-times-circle"></i> Reject Document'; }
    }
  }

  async function signCurrentRequest() {
    if (!state.currentRequestId) return;
    if (!confirm('คุณต้องการประทับลายเซ็นดิจิทัลของคุณลงในเอกสารนี้ใช่หรือไม่?')) return;
    
    try {
      await window.DB.signRequest(state.currentRequestId);
      showToast('ลงลายเซ็นดิจิทัลกำกับเอกสารเรียบร้อยแล้ว', 'success');
      await loadRequestDetail(state.currentRequestId);
    } catch (e) {
      console.error('signCurrentRequest error:', e);
      showToast('ไม่สามารถลงลายเซ็นได้: ' + e.message, 'error');
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
      const filters = {
        startDate: dateStr,
        endDate: dateStr,
        page: 1,
        pageSize: 5000
      };
      const historyResult = await window.DB.getMaterialHistory(filters);
      const historyData = historyResult.data || [];
      // Filter items for the selected date and exclude drafts, then sort by request_no ascending
      const dateItems = historyData.filter(item => item.request_date === dateStr && item.request_status !== 'Draft')
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

          const displayResult = item.test_result || (item.request_status === 'Pending' || item.request_status === 'In Process' ? item.request_status : '');

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
      
      const shell = document.getElementById('app-shell');
      if (shell) shell.style.setProperty('display', 'none', 'important');
      
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
    
    const shell = document.getElementById('app-shell');
    if (shell) shell.style.setProperty('display', 'none', 'important');
    
    // Temporarily change document title to ensure correct PDF filename
    const originalTitle = document.title;
    const requestNoText = reqNoEl.innerText.trim().replace(/\//g, '-');
    document.title = `Request_${requestNoText}`;
    
    // Allow DOM to update before triggering print dialog
    setTimeout(() => {
      window.print();
      
      // Restore title
      document.title = originalTitle;
    }, 300);
  }

  // Clean up print classes automatically after print dialog closes
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('print-mode-detail', 'print-mode-daily');
    const shell = document.getElementById('app-shell');
    if (shell && state.currentUser) {
      shell.style.setProperty('display', 'flex', 'important');
    }
  });

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
    const btn = document.querySelector('#modal-upload-signature .btn-primary');
    
    try {
      if (btn) { btn.disabled = true; btn.innerText = 'กำลังอัปโหลด...'; }
      await window.DB.saveSignature(userId, file);
      showToast('บันทึกลายเซ็นลง Cloud Storage เรียบร้อยแล้ว', 'success');
      closeSignatureModal();
      loadSignaturesManager();
    } catch (err) {
      console.error(err);
      showToast('ไม่สามารถบันทึกลายเซ็นได้: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerText = 'บันทึกลายเซ็น'; }
    }
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

  // ============================================================
  // NOTIFICATION AUDIO SERVICE
  // Architecture: Web Audio API (primary) + In-memory WAV fallback
  // ============================================================
  const NotificationAudioService = (function () {
    let audioCtx = null;
    let isPlaying = false;
    let isUnlocked = false;
    let cachedBlobUrl = null;
    let fallbackAudio = null;
    let keepAliveTimer = null;

    // Generate in-memory WAV chime blob URL (0 network bandwidth, 100% offline & mobile reliable)
    function generateChimeWavBlobUrl() {
      if (cachedBlobUrl) return cachedBlobUrl;
      try {
        const sampleRate = 22050;
        const duration = 1.4;
        const numSamples = Math.floor(sampleRate * duration);
        const buffer = new ArrayBuffer(44 + numSamples * 2);
        const view = new DataView(buffer);
        function writeStr(off, str) {
          for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
        }
        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + numSamples * 2, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 1, true); // Mono
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeStr(36, 'data');
        view.setUint32(40, numSamples * 2, true);

        const notes = [
          { freq: 659.25, start: 0.00, dur: 0.9 }, // E5
          { freq: 880.00, start: 0.15, dur: 1.0 }, // A5
          { freq: 1108.73, start: 0.30, dur: 1.1 } // C#6
        ];
        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          let s = 0;
          notes.forEach(n => {
            if (t >= n.start && t < n.start + n.dur) {
              const env = Math.exp(-3.5 * (t - n.start));
              s += (Math.sin(2 * Math.PI * n.freq * t) * 0.7 +
                    Math.sin(4 * Math.PI * n.freq * t) * 0.15) * env * 0.35;
            }
          });
          s = Math.max(-1, Math.min(1, s));
          view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        const blob = new Blob([buffer], { type: 'audio/wav' });
        cachedBlobUrl = URL.createObjectURL(blob);

        fallbackAudio = new Audio(cachedBlobUrl);
        fallbackAudio.volume = 0.8;
        fallbackAudio.preload = 'auto';

        return cachedBlobUrl;
      } catch (e) {
        console.warn('[NotificationAudioService] WAV generator exception:', e);
        return null;
      }
    }

    function unlock() {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!audioCtx && AudioContextClass) {
          audioCtx = new AudioContextClass();
          console.log('[NotificationAudioService] AudioContext created, state:', audioCtx.state);
        }
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().then(() => {
            console.log('[NotificationAudioService] AudioContext resumed, state:', audioCtx.state);
            if (audioCtx.state === 'running') {
              isUnlocked = true;
              try {
                const buf = audioCtx.createBuffer(1, 1, 22050);
                const src = audioCtx.createBufferSource();
                src.buffer = buf;
                src.connect(audioCtx.destination);
                src.start(0);
              } catch (_) {}
            }
          }).catch(err => {
            console.warn('[NotificationAudioService] Resume failed:', err);
          });
        } else if (audioCtx && audioCtx.state === 'running') {
          isUnlocked = true;
        }
      } catch (e) {
        console.warn('[NotificationAudioService] unlock error:', e);
      }
    }

    function keepAlive() {
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
          if (audioCtx.state === 'running') isUnlocked = true;
        }).catch(() => {});
      }
      if (audioCtx.state === 'running') {
        try {
          const buf = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
          const src = audioCtx.createBufferSource();
          src.buffer = buf;
          src.connect(audioCtx.destination);
          src.start(0);
        } catch (_) {}
      }
    }

    function triggerMelody() {
      if (!audioCtx || audioCtx.state !== 'running') {
        playFallback();
        return;
      }
      if (isPlaying) return;
      isPlaying = true;
      console.log('[NotificationAudioService] Playing Web Audio chime');

      try {
        const time = audioCtx.currentTime;
        const masterGain = audioCtx.createGain();
        masterGain.connect(audioCtx.destination);
        masterGain.gain.value = 0.6;

        const notes = [
          { freq: 659.25,  start: 0.00, duration: 1.0 }, // E5
          { freq: 880.00,  start: 0.15, duration: 1.2 }, // A5
          { freq: 1108.73, start: 0.30, duration: 1.5 }  // C#6
        ];

        notes.forEach(note => {
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

          const oscTri = audioCtx.createOscillator();
          const gainTri = audioCtx.createGain();
          oscTri.type = 'triangle';
          oscTri.frequency.setValueAtTime(note.freq, time + note.start);
          gainTri.gain.setValueAtTime(0, time + note.start);
          gainTri.gain.linearRampToValueAtTime(0.15, time + note.start + 0.01);
          gainTri.gain.exponentialRampToValueAtTime(0.001, time + note.start + 0.3);
          oscTri.connect(gainTri);
          gainTri.connect(masterGain);
          oscTri.start(time + note.start);
          oscTri.stop(time + note.start + 0.4);
        });
      } catch (ex) {
        console.warn('[NotificationAudioService] Web Audio oscillator error:', ex);
        isPlaying = false;
        playFallback();
        return;
      }

      setTimeout(() => { isPlaying = false; }, 1800);
    }

    function playFallback() {
      if (isPlaying) return;
      isPlaying = true;
      console.log('[NotificationAudioService] Playing HTML Audio fallback');
      try {
        if (!fallbackAudio) generateChimeWavBlobUrl();
        if (fallbackAudio) {
          fallbackAudio.currentTime = 0;
          const playPromise = fallbackAudio.play();
          if (playPromise !== undefined) {
            playPromise.catch(err => console.warn('[NotificationAudioService] Fallback audio rejected:', err.name));
          }
        }
      } catch (e) {
        console.warn('[NotificationAudioService] Fallback error:', e);
      }
      setTimeout(() => { isPlaying = false; }, 1800);
    }

    function play() {
      const config = window.AppConfig ? window.AppConfig.load() : {};
      if (config && config.soundEnabled === false) {
        console.log('[NotificationAudioService] Sound disabled in settings');
        return;
      }

      console.log('[NotificationAudioService] Sound requested — audioCtx state:', audioCtx ? audioCtx.state : 'null', 'unlocked:', isUnlocked);

      if (isPlaying) return;

      if (audioCtx && audioCtx.state === 'running') {
        triggerMelody();
        return;
      }

      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
          if (audioCtx.state === 'running') {
            isUnlocked = true;
            triggerMelody();
          } else {
            playFallback();
          }
        }).catch(() => {
          playFallback();
        });
        return;
      }

      playFallback();
    }

    function testSound() {
      unlock();
      setTimeout(() => play(), 50);
    }

    function init() {
      generateChimeWavBlobUrl();
      ['click', 'touchstart', 'touchend', 'pointerdown', 'keydown'].forEach(evt => {
        document.addEventListener(evt, () => {
          if (!isUnlocked) unlock();
        }, { passive: true });
      });
      if (!keepAliveTimer) {
        keepAliveTimer = setInterval(keepAlive, 20000);
      }
    }

    return {
      init,
      unlock,
      play,
      testSound,
      isReady: () => isUnlocked && audioCtx && audioCtx.state === 'running'
    };
  })();

  function playNotificationSound() {
    NotificationAudioService.play();
  }

  function testNotificationSound() {
    NotificationAudioService.testSound();
  }

  // --- OS LEVEL NOTIFICATIONS ---
  function showOSNotification(title, body) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const iconPath = './icons/icon-192.png';
        const notifOptions = {
          body: body,
          icon: iconPath,
          badge: iconPath,
          vibrate: [200, 100, 200, 100, 200],
          tag: 'rmis-approval-' + Date.now(),
          renotify: true
        };
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(title, notifOptions);
          }).catch(err => {
            console.warn('ServiceWorker showNotification error:', err);
            new Notification(title, notifOptions);
          });
        } else {
          new Notification(title, notifOptions);
        }
      } catch (e) {
        console.error('OS Notification error:', e);
      }
    }
  }

  // --- WEB PUSH NOTIFICATION HELPERS ---
  function urlB64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function checkPushSubscriptionStatus() {
    const btn = document.getElementById('btn-toggle-push');
    const statusText = document.getElementById('push-status-text');
    if (!btn || !statusText) return;

    // กรณีเปิดจาก file:// หรือไม่รองรับ
    const protocol = window.location.protocol;
    if (protocol === 'file:') {
      statusText.innerText = 'กรุณาเปิดผ่าน Web Server (localhost หรือ https://) เพื่อเปิดใช้งาน';
      btn.innerText = 'ต้องใช้ Web Server';
      btn.disabled = true;
      btn.className = 'btn btn-sm btn-secondary';
      return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      statusText.innerText = 'อุปกรณ์นี้ยังไม่รองรับ Web Push (หากใช้ iOS ต้องกด Add to Home Screen ก่อน)';
      btn.disabled = true;
      btn.innerText = 'ไม่รองรับ';
      btn.className = 'btn btn-sm btn-secondary';
      return;
    }

    try {
      // timeout 3 วินาที ไม่รอนานจนค้าง
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]);
      const sub = await reg.pushManager.getSubscription();

      if (sub) {
        btn.innerText = 'เปิดใช้งานอยู่ (คลิกเพื่อปิด)';
        btn.className = 'btn btn-sm btn-success';
        btn.style.backgroundColor = '#10b981';
        btn.style.color = 'white';
        statusText.innerText = 'อุปกรณ์นี้เปิดรับการแจ้งเตือนบนหน้าจอแล้ว ✅';
      } else {
        btn.innerText = 'เปิดใช้งาน';
        btn.className = 'btn btn-sm btn-primary';
        btn.style.backgroundColor = '';
        btn.style.color = '';
        statusText.innerText = 'รับแจ้งเตือนเมื่อมีใบงานใหม่ / อนุมัติ แม้ปิดหน้าจอ';
        btn.disabled = false;
      }
    } catch (e) {
      console.warn('Error checking push subscription:', e);
      statusText.innerText = 'รับแจ้งเตือนเมื่อมีใบงานใหม่ / อนุมัติ แม้ปิดหน้าจอ';
      btn.innerText = 'เปิดใช้งาน';
      btn.disabled = false;
    }
  }

  async function togglePushNotification() {
    const btn = document.getElementById('btn-toggle-push');
    const statusText = document.getElementById('push-status-text');

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับ Web Push Notifications\n(หากใช้งานบน iPhone/iPad ต้องกดปุ่ม Share แล้วเลือก "เพิ่มไปยังหน้าจอโฮม" ก่อนใช้งานครับ)');
      return;
    }

    try {
      showLoadingButton(btn, true, 'กำลังดำเนินการ...');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      if (sub) {
        // Unsubscribe
        await sub.unsubscribe();
        await window.DB.deletePushSubscription(sub.endpoint);
        showToast('ปิดการแจ้งเตือนบนอุปกรณ์นี้เรียบร้อยแล้ว', 'info');
      } else {
        // Subscribe
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          alert('คุณไม่ได้อนุญาตการแจ้งเตือน กรุณาเปิดสิทธิ์การแจ้งเตือนในการตั้งค่าเบราว์เซอร์');
          showToast('ไม่ได้รับสิทธิ์การแจ้งเตือน', 'warning');
          return;
        }

        const config = window.AppConfig.load();
        const vapidKey = config.vapidPublicKey || 'BPoDZ0Z17eH8XmeJJL-hZHr9N3Pu63vXt82iN2IUoHk6KmxlmduN-T3I-IfKwLJVzc3gLSIh_pWtbVcWwqx8dF0';
        
        const newSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(vapidKey)
        });

        await window.DB.savePushSubscription(newSub, state.currentUser.role);
        showToast('เปิดรับการแจ้งเตือนบนอุปกรณ์นี้เรียบร้อยแล้ว! 🔔', 'success');
      }
    } catch (err) {
      console.error('Push Notification Error:', err);
      showToast('เกิดข้อผิดพลาดในการตั้งค่าแจ้งเตือน: ' + err.message, 'error');
    } finally {
      showLoadingButton(btn, false, 'ดำเนินการ');
      checkPushSubscriptionStatus();
    }
  }

  // ============================================================
  // NOTIFICATION SERVICE
  // Manages state, deduplication, Realtime subscriptions, role filters & UI
  // ============================================================
  const NotificationService = (function () {
    let currentUser = null;
    let realtimeChannel = null;
    let notifications = [];
    const processedEvents = new Map(); // key -> timestamp

    function getStorageKey() {
      return currentUser ? `rmis_notifications_${currentUser.id}` : 'rmis_notifications_guest';
    }

    function loadPersisted() {
      try {
        const stored = localStorage.getItem(getStorageKey());
        notifications = stored ? JSON.parse(stored) : [];
        if (!Array.isArray(notifications)) notifications = [];
      } catch (e) {
        notifications = [];
      }
    }

    function savePersisted() {
      try {
        if (notifications.length > 50) notifications = notifications.slice(0, 50);
        localStorage.setItem(getStorageKey(), JSON.stringify(notifications));
      } catch (e) {}
    }

    function isDuplicate(eventKey) {
      const now = Date.now();
      // Clean keys older than 10 minutes
      for (const [k, time] of processedEvents.entries()) {
        if (now - time > 600000) processedEvents.delete(k);
      }
      if (processedEvents.has(eventKey)) return true;
      processedEvents.set(eventKey, now);
      return false;
    }

    function getUnreadCount() {
      return notifications.filter(n => !n.isRead).length;
    }

    function updateUI() {
      const count = getUnreadCount();
      const badge = document.getElementById('notif-badge-count');
      const unreadTag = document.getElementById('notif-panel-unread-tag');
      if (badge) {
        badge.innerText = count > 99 ? '99+' : count;
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
      }
      if (unreadTag) {
        unreadTag.innerText = `${count} ใหม่`;
        unreadTag.style.display = count > 0 ? 'inline-block' : 'none';
      }
      renderList();
    }

    function formatTimeAgo(isoString) {
      if (!isoString) return '';
      const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
      if (diff < 60) return 'เมื่อสักครู่';
      if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
      if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
      return `${Math.floor(diff / 86400)} วันที่แล้ว`;
    }

    function renderList() {
      const container = document.getElementById('notif-list-container');
      if (!container) return;

      if (notifications.length === 0) {
        container.innerHTML = `
          <div style="padding: 30px 20px; text-align: center; color: #94a3b8; font-size: 13px;">
            ไม่มีการแจ้งเตือน
          </div>
        `;
        return;
      }

      container.innerHTML = notifications.map(n => `
        <div class="notif-item ${n.isRead ? '' : 'unread'}" onclick="App.handleNotificationClick('${n.id}', '${n.type}', '${n.requestId || ''}')">
          <div class="notif-item-icon">${n.icon || '🔔'}</div>
          <div class="notif-item-content">
            <div class="notif-item-title">${escapeHtml(n.title)}</div>
            <div class="notif-item-desc">${escapeHtml(n.message)}</div>
            <div class="notif-item-time">${formatTimeAgo(n.createdAt)}</div>
          </div>
          ${n.isRead ? '' : '<div class="notif-unread-dot"></div>'}
        </div>
      `).join('');
    }

    function createNotification(data) {
      console.log('[NotificationService] Creating notification:', data.title);
      const notif = {
        id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        title: data.title,
        message: data.message,
        type: data.type || 'request',
        requestId: data.requestId || null,
        icon: data.icon || '🔔',
        createdAt: new Date().toISOString(),
        isRead: false
      };

      notifications.unshift(notif);
      savePersisted();
      updateUI();

      // Play Sound
      NotificationAudioService.play();

      // Trigger OS Push / Notification if granted
      showOSNotification(data.title, data.message);
    }

    function handleRealtimeEvent(table, eventType, newRow, oldRow) {
      if (!currentUser) return;
      const role = (currentUser.role || '').toLowerCase();
      console.log(`[NotificationService] Event: ${table} ${eventType}`, newRow);

      if (table === 'requests') {
        if (eventType === 'INSERT') {
          if (!newRow || newRow.status === 'Draft') return;
          const dedupKey = `req_insert_${newRow.id}`;
          if (isDuplicate(dedupKey)) return;

          const reqNoYear = `${newRow.request_no || ''}/${newRow.request_year || ''}`;
          const cust = newRow.customer_name || '';

          if (role === 'admin' || role === 'lab') {
            createNotification({
              title: `ใบแจ้งตรวจสอบใหม่: ${reqNoYear}`,
              message: `ลูกค้า: ${cust}`,
              type: 'request',
              requestId: newRow.id,
              icon: '📋'
            });
            loadRequestsList();
          } else if (role === 'base_oil' && newRow.need_base_oil_view) {
            createNotification({
              title: `ใบแจ้งตรวจสอบ Base Oil: ${reqNoYear}`,
              message: `ลูกค้า: ${cust}`,
              type: 'request',
              requestId: newRow.id,
              icon: '🛢️'
            });
            loadRequestsList();
          }
        } else if (eventType === 'UPDATE') {
          if (!newRow) return;

          // Draft submitted -> Pending
          if (oldRow && oldRow.status === 'Draft' && newRow.status !== 'Draft') {
            const dedupKey = `req_submit_${newRow.id}`;
            if (isDuplicate(dedupKey)) return;

            const reqNoYear = `${newRow.request_no || ''}/${newRow.request_year || ''}`;
            const cust = newRow.customer_name || '';

            if (role === 'admin' || role === 'lab') {
              createNotification({
                title: `ส่งใบแจ้งตรวจสอบ: ${reqNoYear}`,
                message: `ลูกค้า: ${cust}`,
                type: 'request',
                requestId: newRow.id,
                icon: '📋'
              });
            }
            loadRequestsList();
          }

          // 1. Broadcast Approval Notification (To Requester and Base Oil)
          const isApprovedNow = (newRow.status === 'Approved' || newRow.approved === true);
          const wasApprovedBefore = oldRow ? (oldRow.status === 'Approved' || oldRow.approved === true) : false;

          if (isApprovedNow && !wasApprovedBefore) {
            const dedupKey = `req_approved_${newRow.id}`;
            if (!isDuplicate(dedupKey)) {
              const reqNoYear = `${newRow.request_no || ''}/${newRow.request_year || ''}`;
              const cust = newRow.customer_name ? ` (${newRow.customer_name})` : '';

              if (role === 'base_oil' && newRow.need_base_oil_view) {
                // Fetch product names for Base Oil notification
                let productName = newRow.customer_name || '-';
                if (window.DB && window.DB.getRequestDetail) {
                  window.DB.getRequestDetail(newRow.id).then(details => {
                    if (details && details.items && details.items.length > 0) {
                      productName = details.items.map(i => i.product_name).filter(Boolean).join(', ');
                    }
                    createNotification({
                      title: 'RMIS: ผลทดสอบ Base Oil ผ่าน ✅',
                      message: `สินค้า: ${productName} | ทะเบียน: ${newRow.car_plate || '-'}`,
                      type: 'request',
                      requestId: newRow.id,
                      icon: '✅'
                    });
                    loadRequestsList();
                  }).catch(() => {
                    createNotification({
                      title: 'RMIS: ผลทดสอบ Base Oil ผ่าน ✅',
                      message: `สินค้า: ${productName} | ทะเบียน: ${newRow.car_plate || '-'}`,
                      type: 'request',
                      requestId: newRow.id,
                      icon: '✅'
                    });
                    loadRequestsList();
                  });
                } else {
                  createNotification({
                    title: 'RMIS: ผลทดสอบ Base Oil ผ่าน ✅',
                    message: `สินค้า: ${productName} | ทะเบียน: ${newRow.car_plate || '-'}`,
                    type: 'request',
                    requestId: newRow.id,
                    icon: '✅'
                  });
                  loadRequestsList();
                }
              } else if (role === 'requester') {
                if (newRow.need_base_oil_view) {
                  let productName = newRow.customer_name || '-';
                  if (window.DB && window.DB.getRequestDetail) {
                    window.DB.getRequestDetail(newRow.id).then(details => {
                      if (details && details.items && details.items.length > 0) {
                        productName = details.items.map(i => i.product_name).filter(Boolean).join(', ');
                      }
                      createNotification({
                        title: 'RMIS: ผลทดสอบ Base Oil ผ่าน ✅',
                        message: `สินค้า: ${productName} | ทะเบียน: ${newRow.car_plate || '-'}`,
                        type: 'request',
                        requestId: newRow.id,
                        icon: '✅'
                      });
                      loadRequestsList();
                    }).catch(() => {
                      createNotification({
                        title: 'ใบแจ้งตรวจสอบได้รับการอนุมัติแล้ว',
                        message: `ใบแจ้งตรวจสอบเลขที่ ${reqNoYear}${cust} ได้รับการอนุมัติแล้ว`,
                        type: 'request',
                        requestId: newRow.id,
                        icon: '✅'
                      });
                      loadRequestsList();
                    });
                  } else {
                    createNotification({
                      title: 'RMIS: ผลทดสอบ Base Oil ผ่าน ✅',
                      message: `สินค้า: ${productName} | ทะเบียน: ${newRow.car_plate || '-'}`,
                      type: 'request',
                      requestId: newRow.id,
                      icon: '✅'
                    });
                    loadRequestsList();
                  }
                } else {
                  createNotification({
                    title: 'ใบแจ้งตรวจสอบได้รับการอนุมัติแล้ว',
                    message: `ใบแจ้งตรวจสอบเลขที่ ${reqNoYear}${cust} ได้รับการอนุมัติแล้ว`,
                    type: 'request',
                    requestId: newRow.id,
                    icon: '✅'
                  });
                  loadRequestsList();
                }
              }
            }
          } else if (role === 'requester' || role === 'base_oil') {
            // Silently refresh list for other status changes (e.g. Complete) without sending mobile notification
            loadRequestsList();
          }
        }
      } else if (table === 'edit_requests') {
        if (eventType === 'INSERT') {
          if (!newRow || newRow.status !== 'Pending') return;
          const dedupKey = `edit_insert_${newRow.id}`;
          if (isDuplicate(dedupKey)) return;

          if (role === 'admin') {
            createNotification({
              title: `มีคำขอแก้ไขข้อมูลใหม่`,
              message: `เหตุผล: ${newRow.reason || '-'}`,
              type: 'edit_request',
              requestId: newRow.request_id,
              icon: '📝'
            });
            if (document.getElementById('view-edit-requests') && document.getElementById('view-edit-requests').style.display !== 'none') {
              loadEditRequests();
            }
          }
        } else if (eventType === 'UPDATE') {
          if (!newRow) return;
          if (newRow.requester_id === currentUser.id && oldRow && oldRow.status !== newRow.status) {
            const dedupKey = `edit_status_${newRow.id}_${newRow.status}`;
            if (isDuplicate(dedupKey)) return;

            let statusThai = (newRow.status === 'Approved' || newRow.status === 'Completed') ? 'อนุมัติแล้ว' : 'ถูกปฏิเสธ';
            createNotification({
              title: `คำขอแก้ไขข้อมูล: ${statusThai}`,
              message: `สถานะคำขอแก้ไขเปลี่ยนเป็น ${newRow.status}`,
              type: 'edit_request',
              requestId: newRow.request_id,
              icon: (newRow.status === 'Completed' || newRow.status === 'Approved') ? '✅' : '❌'
            });
          }
        }
      }
    }

    function subscribe(user) {
      currentUser = user;
      loadPersisted();
      updateUI();

      const client = window.DB ? window.DB.getSupabaseClient() : null;
      if (!client) return;

      if (realtimeChannel) {
        client.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }

      console.log('[NotificationService] Subscribing to Supabase Realtime channel rmis-notifications-channel');
      realtimeChannel = client.channel('rmis-notifications-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requests' }, payload => {
          handleRealtimeEvent('requests', 'INSERT', payload.new, null);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requests' }, payload => {
          handleRealtimeEvent('requests', 'UPDATE', payload.new, payload.old);
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'edit_requests' }, payload => {
          handleRealtimeEvent('edit_requests', 'INSERT', payload.new, null);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'edit_requests' }, payload => {
          handleRealtimeEvent('edit_requests', 'UPDATE', payload.new, payload.old);
        })
        .subscribe((status) => {
          console.log('[NotificationService] Channel status:', status);
        });
    }

    function unsubscribe() {
      if (realtimeChannel) {
        const client = window.DB ? window.DB.getSupabaseClient() : null;
        if (client) client.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }
    }

    function markAsRead(id) {
      const item = notifications.find(n => n.id === id);
      if (item) {
        item.isRead = true;
        savePersisted();
        updateUI();
      }
    }

    function markAllAsRead() {
      notifications.forEach(n => n.isRead = true);
      savePersisted();
      updateUI();
    }

    function togglePanel(e) {
      if (e) e.stopPropagation();
      const panel = document.getElementById('notif-panel');
      if (panel) {
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) {
          renderList();
        }
      }
    }

    function closePanel() {
      const panel = document.getElementById('notif-panel');
      if (panel) panel.classList.remove('open');
    }

    function handleItemClick(id, type, requestId) {
      markAsRead(id);
      closePanel();
      if (type === 'request' && requestId) {
        navigate('request-detail', { id: requestId });
      } else if (type === 'edit_request') {
        navigate('edit-requests');
      }
    }

    // Close panel on outside click
    document.addEventListener('click', (e) => {
      const wrapper = document.getElementById('notif-dropdown-wrapper');
      if (wrapper && !wrapper.contains(e.target)) {
        closePanel();
      }
    });

    return {
      initialize: (user) => {
        NotificationAudioService.init();
        subscribe(user);
      },
      subscribe,
      unsubscribe,
      cleanup: () => {
        unsubscribe();
        currentUser = null;
        notifications = [];
        updateUI();
      },
      createNotification,
      markAsRead,
      markAllAsRead,
      togglePanel,
      closePanel,
      handleItemClick,
      getUnreadCount
    };
  })();

  function initRealtime() {
    if (state.currentUser) {
      NotificationService.initialize(state.currentUser);
    }
  }

  // Bind init to window load event
  window.addEventListener('DOMContentLoaded', init);

  // Expose module APIs
  // --- STICKER PRINTING HELPERS ---

  function _formatRecDate(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
  }

  function _buildStickerPreviewHtml(arg1, arg2, arg3, arg4) {
    let data;
    if (typeof arg1 === 'object' && arg1 !== null) {
      data = arg1;
    } else {
      data = {
        test_result: arg1,
        product_name: arg2,
        batch_number: arg3,
        inspection_date: arg4,
        supplier_name: '-',
        quantity: '-',
        item_comment: ''
      };
    }

    const resText = (data.test_result || 'PENDING').toUpperCase();
    const recDate = _formatRecDate(data.inspection_date || data.request_date);
    const isHold = (resText === 'HOLD');

    if (isHold) {
      const hasSig = !!data.signature_url;
      const sigImgHtml = hasSig
        ? `<div style="height: 65px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px;">
             <img src="${data.signature_url}" style="max-height: 65px; max-width: 220px; object-fit: contain;" alt="Signature">
           </div>`
        : `<div style="height: 65px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px;">
             <!-- พื้นที่ว่างสำหรับเซ็นสดด้วยปากกา -->
           </div>`;

      return `
        <div style="border: 3px solid #000; width: 100%; max-width: 780px; height: 490px; box-sizing: border-box; background: white; color: black; display: flex; flex-direction: column; justify-content: space-between; font-family: monospace; box-shadow: 0 4px 12px rgba(0,0,0,0.08); overflow: hidden;">
          <!-- Top Header: HOLD with yellow background (~1/4 height) -->
          <div style="background-color: #ffff99; border-bottom: 3px solid #000; height: 105px; min-height: 105px; display: flex; align-items: center; justify-content: center; text-align: center; box-sizing: border-box;">
            <div style="font-size: 68px; font-weight: bold; letter-spacing: 8px; line-height: 1; color: #000; font-family: monospace;">HOLD</div>
          </div>

          <!-- Body Content: Table layout for precise colon alignment -->
          <div style="padding: 14px 28px 12px 28px; flex: 1; display: flex; flex-direction: column; justify-content: space-between; font-family: monospace; box-sizing: border-box;">
            <table style="width: 100%; border-collapse: collapse; font-size: 16px; line-height: 1.65; color: #000; font-family: monospace;">
              <tr>
                <td style="width: 250px; font-weight: bold; white-space: nowrap; vertical-align: top; padding: 3px 0;">ชื่อวัตถุดิบ / ชื่อผลิตภัณฑ์</td>
                <td style="width: 25px; font-weight: bold; vertical-align: top; text-align: center; padding: 3px 0;">:</td>
                <td style="font-weight: bold; vertical-align: top; padding: 3px 0;">${escapeHtml(data.product_name || '-')}</td>
              </tr>
              <tr>
                <td style="font-weight: bold; white-space: nowrap; vertical-align: top; padding: 4px 0;">ลูกค้า</td>
                <td style="font-weight: bold; vertical-align: top; text-align: center; padding: 3px 0;">:</td>
                <td style="font-weight: bold; vertical-align: top; padding: 3px 0;">${escapeHtml(data.supplier_name || '-')}</td>
              </tr>
              <tr>
                <td style="font-weight: bold; white-space: nowrap; vertical-align: top; padding: 3px 0;">Lot no.</td>
                <td style="font-weight: bold; vertical-align: top; text-align: center; padding: 3px 0;">:</td>
                <td style="font-weight: bold; vertical-align: top; padding: 3px 0;">${escapeHtml(data.batch_number || '-')}</td>
              </tr>
              <tr>
                <td style="font-weight: bold; white-space: nowrap; vertical-align: top; padding: 3px 0;">จำนวน</td>
                <td style="font-weight: bold; vertical-align: top; text-align: center; padding: 3px 0;">:</td>
                <td style="font-weight: bold; vertical-align: top; padding: 3px 0;">${escapeHtml(data.quantity || '-')}</td>
              </tr>
              <tr>
                <td style="font-weight: bold; white-space: nowrap; vertical-align: top; padding: 3px 0;">สาเหตุ</td>
                <td style="font-weight: bold; vertical-align: top; text-align: center; padding: 3px 0;">:</td>
                <td style="font-weight: bold; vertical-align: top; padding: 3px 0; word-break: break-word;">${escapeHtml(data.item_comment || '-')}</td>
              </tr>
            </table>

            <!-- Bottom Right Signature Block -->
            <div style="display: flex; justify-content: flex-end; margin-top: auto; padding-top: 10px; margin-bottom: 6px;">
              <div style="width: 250px; text-align: center; color: #000; font-family: monospace;">
                ${sigImgHtml}
                <div style="border-top: 2px solid #000; margin-bottom: 4px;"></div>
                <div style="font-size: 16px; font-weight: bold;">ผู้ตรวจ/ผู้อนุมัติ</div>
                <div style="font-size: 16px; font-weight: bold; margin-top: 3px;">วันที่ &nbsp;&nbsp;${recDate}</div>
              </div>
            </div>
          </div>

          <div style="text-align: right; font-size: 11px; color: #64748b; padding: 4px 16px 8px 16px;">
            * ตัวอย่างสติกเกอร์ขนาด A4 แนวนอน (Landscape)
          </div>
        </div>
      `;
    }

    return `
      <div style="border:2px solid black; padding:12px 14px; width:300px; font-family:monospace; background:white; color:black; box-sizing:border-box;">
        <div style="text-align:center; border-bottom:2px solid black; padding-bottom:8px; margin-bottom:10px;">
          <div style="font-size:36px; font-weight:bold; letter-spacing:4px;">${resText}</div>
        </div>
        <div style="font-size:13px; line-height:1.8; color:black;">
          <div><strong>Product :</strong> ${escapeHtml(data.product_name || '-')}</div>
          <div><strong>Batch &nbsp;&nbsp;:</strong> ${escapeHtml(data.batch_number || '-')}</div>
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
    previewHtml = _buildStickerPreviewHtml(stickerData);

    const isHold = (stickerData.test_result || '').toUpperCase() === 'HOLD';
    const isRequester = state.currentUser && state.currentUser.role === 'requester';
    const dateDisabled = isRequester ? 'disabled' : '';

    modal.style.cssText = [
      'display:flex', 'position:fixed', 'top:0', 'left:0',
      'width:100vw', 'height:100vh', 'background:rgba(0,0,0,0.6)',
      'z-index:99999', 'align-items:center', 'justify-content:center',
      'padding:16px', 'box-sizing:border-box', 'backdrop-filter:blur(2px)'
    ].join(';');

    const modalWidth = isHold ? '860px' : '440px';
    const modalTitle = isHold ? '🏷️ Preview สติกเกอร์ HOLD (A4 แนวนอน)' : '🏷️ Preview สติกเกอร์วัตถุดิบ';
    const dateLabel = isHold ? 'วันที่ตรวจสอบ (Inspection Date):' : 'วันที่ผ่าน (Passed Date):';

    const hasSig = !!stickerData.signature_url;
    const sigStatusNotice = isHold
      ? (hasSig 
          ? `<div style="margin-bottom:14px; font-size:13px; color:#15803d; background:#dcfce7; border:1px solid #86efac; border-radius:6px; padding:8px 14px; display:flex; align-items:center; gap:8px;"><span>✍️</span><span>แนบลายเซ็นเจ้าหน้าที่ Lab ผู้ตรวจ/อนุมัติ: <strong>${escapeHtml(stickerData.approver_name || '-')}</strong> เรียบร้อยแล้ว</span></div>`
          : `<div style="margin-bottom:14px; font-size:13px; color:#64748b; background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:8px 14px; display:flex; align-items:center; gap:8px;"><span>ℹ️</span><span>ใบแจ้งยังไม่ได้รับการอนุมัติ (Approve) จาก Lab &mdash; เว้นว่างช่องเซ็นชื่อไว้สำหรับเซ็นสดด้วยปากกา</span></div>`)
      : '';

    modal.innerHTML = `
      <div style="background:white;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.4);width:${modalWidth};max-width:96vw;max-height:92vh;overflow-y:auto;font-family:'Sarabun',sans-serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e0e0e0;">
          <h2 style="margin:0;font-size:18px;color:#1a1a2e;">${modalTitle}</h2>
          <button onclick="App.closeStickerModal()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;line-height:1;">&times;</button>
        </div>
        <div style="padding:20px;">
          <div id="sticker-preview-container" style="display:flex;justify-content:center;margin-bottom:20px;">${previewHtml}</div>
          
          ${sigStatusNotice}

          <div style="display:flex;gap:15px;flex-wrap:wrap;align-items:flex-end;">
            <div style="flex:1;min-width:200px;margin-bottom:8px;">
              <label style="display:block;margin-bottom:6px;font-weight:600;color:#333;">${dateLabel}</label>
              <input type="date" id="sticker-passed-date" value="${stickerData.inspection_date}" onchange="App.updateStickerPreviewDate(this.value)"
                style="width:100%;padding:8px 12px;border:1px solid #ccc;border-radius:8px;font-size:15px;box-sizing:border-box;" ${dateDisabled}>
            </div>
            ${isHold && !isRequester ? `
            <div style="flex:2;min-width:280px;margin-bottom:8px;">
              <label style="display:block;margin-bottom:6px;font-weight:600;color:#333;">สาเหตุ (Hold Reason):</label>
              <input type="text" id="sticker-hold-reason" value="${escapeHtml(stickerData.item_comment || '')}" oninput="App.updateStickerPreviewReason(this.value)" placeholder="ระบุสาเหตุการ Hold..."
                style="width:100%;padding:8px 12px;border:1px solid #ccc;border-radius:8px;font-size:15px;box-sizing:border-box;">
            </div>
            ` : ''}
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
    const previewHtml = _buildStickerPreviewHtml(state.currentStickerItem);
    const container = document.getElementById('sticker-preview-container');
    if (container) container.innerHTML = previewHtml;
  }

  function updateStickerPreviewReason(val) {
    if (!state.currentStickerItem) return;
    state.currentStickerItem.item_comment = val;
    const previewHtml = _buildStickerPreviewHtml(state.currentStickerItem);
    const container = document.getElementById('sticker-preview-container');
    if (container) container.innerHTML = previewHtml;
  }

  // Used by Material History page (looks up item from state.historyList by id)
  async function openStickerPreview(itemId) {
    if (!state.historyList) return;
    const item = state.historyList.find(i => String(i.id) === String(itemId) || Number(i.id) === Number(itemId));
    if (!item) return;

    let signatureUrl = null;
    let approverName = null;

    if (item.request_id) {
      try {
        const req = await window.DB.getRequestDetail(item.request_id);
        if (req && (req.approved === true || (req.status || '').toLowerCase() === 'approved')) {
          signatureUrl = req.approved_signature_snapshot || null;
          approverName = req.approved_name || null;
        }
      } catch (err) {
        console.warn('Could not fetch request detail for sticker signature:', err);
      }
    }

    const stickerData = {
      id: item.id,
      test_result: item.test_result,
      product_name: item.product_name,
      batch_number: item.batch_number,
      supplier_name: item.customer_name || '-',
      quantity: item.quantity || '-',
      item_comment: item.item_comment || '',
      request_date: item.request_date,
      inspection_date: item.inspection_date || item.request_date,
      signature_url: signatureUrl,
      approver_name: approverName
    };
    const previewHtml = _buildStickerPreviewHtml(stickerData);
    _showStickerModal(previewHtml, stickerData);
  }

  // Used by Request Detail page (data passed directly or looked up from currentRequestDetail)
  function openStickerPreviewDirect(testResultOrId, productName, batchNumber, requestDate, testedDate, itemId) {
    let stickerData = null;
    const targetId = itemId || testResultOrId;
    const curReq = state.currentRequestDetail;
    const isApproved = curReq && (curReq.approved === true || (curReq.status || '').toLowerCase() === 'approved');
    const signatureUrl = (isApproved && curReq.approved_signature_snapshot) ? curReq.approved_signature_snapshot : null;
    const approverName = (isApproved && curReq.approved_name) ? curReq.approved_name : null;

    if (curReq && curReq.items) {
      const found = curReq.items.find(i => String(i.id) === String(targetId));
      if (found) {
        stickerData = { 
          id: found.id,
          test_result: found.test_result, 
          product_name: found.product_name, 
          batch_number: found.batch_number, 
          supplier_name: curReq.customer_name || '-',
          quantity: found.quantity || '-',
          item_comment: found.item_comment || '',
          request_date: curReq.request_date || requestDate,
          inspection_date: found.inspection_date || testedDate || curReq.request_date,
          signature_url: signatureUrl,
          approver_name: approverName
        };
      }
    }
    if (!stickerData) {
      stickerData = { 
        id: targetId,
        test_result: productName ? testResultOrId : 'Hold', 
        product_name: productName || '-', 
        batch_number: batchNumber || '-', 
        supplier_name: (curReq && curReq.customer_name) || '-',
        quantity: '-',
        item_comment: '',
        request_date: requestDate || '',
        inspection_date: testedDate || requestDate || '',
        signature_url: signatureUrl,
        approver_name: approverName
      };
    }
    const previewHtml = _buildStickerPreviewHtml(stickerData);
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
    const reasonInput = document.getElementById('sticker-hold-reason');
    const reasonVal = reasonInput ? reasonInput.value.trim() : undefined;
    
    try {
      const btn = document.querySelector('#modal-sticker-preview button[onclick="App.saveStickerDate()"]');
      if (btn) { btn.disabled = true; btn.innerText = 'กำลังบันทึก...'; }
      
      if (reasonVal !== undefined && window.DB.updateRequestItemInspection) {
        await window.DB.updateRequestItemInspection(item.id, dateInput.value, reasonVal);
        item.item_comment = reasonVal;
      } else {
        await window.DB.updateRequestItemInspectionDate(item.id, dateInput.value);
      }
      
      item.inspection_date = dateInput.value;
      
      showToast('บันทึกข้อมูลสติกเกอร์สำเร็จ', 'success');
      
      if (btn) { btn.disabled = false; btn.innerText = '💾 บันทึก'; }
      
      // Refresh the detail table to update the HTML onclick handlers with the new date
      if (state.currentRequestId) {
        await loadRequestDetail(state.currentRequestId);
      }
    } catch (err) {
      console.error('Error saving sticker info:', err);
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
    const isHold = (resText === 'HOLD');

    let pageCss = '';
    let singleSticker = '';

    if (isHold) {
      const hasSig = !!item.signature_url;
      const printSigImgHtml = hasSig
        ? `<div style="height: 80px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px;">
             <img src="${item.signature_url}" style="max-height: 78px; max-width: 280px; object-fit: contain;" alt="Signature">
           </div>`
        : `<div style="height: 80px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px;">
             <!-- พื้นที่ว่างสำหรับเซ็นสดด้วยปากกา -->
           </div>`;

      pageCss = `
        @media print {
          @page { size: A4 landscape; margin: 6mm; }
          html, body {
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            overflow: hidden !important;
          }
          .sticker-page {
            width: 100% !important;
            height: 192mm !important;
            max-height: 192mm !important;
            box-sizing: border-box !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
        body { margin: 0; padding: 0; background: white; font-family: monospace; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      `;
      singleSticker = `
        <div class="sticker-page" style="page-break-after: avoid; page-break-inside: avoid; box-sizing: border-box; width: 100%; height: 192mm; max-height: 192mm; display: flex; align-items: stretch; justify-content: center; padding: 0; margin: 0;">
          <div style="border: 3.5px solid #000; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; background: white; color: black; font-family: monospace; overflow: hidden;">
            
            <!-- HEADER: HOLD with Yellow Background (approx. 1/4 of paper height = 45mm) -->
            <div style="background-color: #ffff99; border-bottom: 3.5px solid #000; height: 45mm; min-height: 45mm; max-height: 45mm; display: flex; align-items: center; justify-content: center; text-align: center; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box;">
              <h1 style="margin: 0; font-size: 80pt; font-weight: bold; letter-spacing: 12px; line-height: 1; color: black; font-family: monospace;">HOLD</h1>
            </div>

            <!-- BODY CONTENT: Table for exact colon alignment -->
            <div style="padding: 10px 35px 12px 35px; flex: 1; display: flex; flex-direction: column; justify-content: space-between; font-family: monospace; box-sizing: border-box;">
              <table style="width: 100%; border-collapse: collapse; font-size: 22px; line-height: 1.6; color: black; font-family: monospace;">
                <tr>
                  <td style="width: 380px; font-weight: bold; white-space: nowrap; vertical-align: top; padding: 3px 0;">ชื่อวัตถุดิบ / ชื่อผลิตภัณฑ์</td>
                  <td style="width: 35px; font-weight: bold; vertical-align: top; text-align: center; padding: 3px 0;">:</td>
                  <td style="font-weight: bold; vertical-align: top; padding: 3px 0;">${escapeHtml(item.product_name || '-')}</td>
                </tr>
                <tr>
                  <td style="font-weight: bold; white-space: nowrap; vertical-align: top; padding: 3px 0;">ลูกค้า</td>
                  <td style="width: 35px; font-weight: bold; vertical-align: top; text-align: center; padding: 3px 0;">:</td>
                  <td style="font-weight: bold; vertical-align: top; padding: 3px 0;">${escapeHtml(item.supplier_name || '-')}</td>
                </tr>
                <tr>
                  <td style="font-weight: bold; white-space: nowrap; vertical-align: top; padding: 3px 0;">Lot no.</td>
                  <td style="width: 35px; font-weight: bold; vertical-align: top; text-align: center; padding: 3px 0;">:</td>
                  <td style="font-weight: bold; vertical-align: top; padding: 3px 0;">${escapeHtml(item.batch_number || '-')}</td>
                </tr>
                <tr>
                  <td style="font-weight: bold; white-space: nowrap; vertical-align: top; padding: 3px 0;">จำนวน</td>
                  <td style="width: 35px; font-weight: bold; vertical-align: top; text-align: center; padding: 3px 0;">:</td>
                  <td style="font-weight: bold; vertical-align: top; padding: 3px 0;">${escapeHtml(item.quantity || '-')}</td>
                </tr>
                <tr>
                  <td style="font-weight: bold; white-space: nowrap; vertical-align: top; padding: 3px 0;">สาเหตุ</td>
                  <td style="width: 35px; font-weight: bold; vertical-align: top; text-align: center; padding: 3px 0;">:</td>
                  <td style="font-weight: bold; vertical-align: top; padding: 3px 0; word-break: break-word;">${escapeHtml(item.item_comment || '-')}</td>
                </tr>
              </table>

              <!-- RIGHT SIGNATURE BLOCK (anchored to bottom right with generous clearance) -->
              <div style="display: flex; justify-content: flex-end; margin-top: auto; padding-top: 10px; margin-right: 15px; margin-bottom: 5px;">
                <div style="width: 350px; text-align: center; color: black; font-family: monospace;">
                  ${printSigImgHtml}
                  <div style="border-top: 2.5px solid #000; margin-bottom: 6px;"></div>
                  <div style="font-size: 20px; font-weight: bold;">ผู้ตรวจ/ผู้อนุมัติ</div>
                  <div style="font-size: 20px; font-weight: bold; margin-top: 6px;">วันที่ &nbsp;&nbsp;${recDate}</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      `;
    } else {
      pageCss = `
        @media print {
          @page { size: auto; margin: 0; }
          body { background-color: white !important; margin: 0 !important; padding: 0 !important; }
        }
        body { margin: 0; padding: 0; background: white; font-family: monospace; }
      `;
      singleSticker = `
        <div class="sticker-page" style="page-break-after: always; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
          <div style="border: 2px solid black; padding: 10px; width: 300px; font-family: monospace; background: white; color: black; box-sizing: border-box;">
            <div style="text-align: center; border-bottom: 2px solid black; padding-bottom: 5px; margin-bottom: 10px;">
              <h1 style="margin: 0; font-size: 32px; font-weight: bold; color: black;">${resText}</h1>
            </div>
            <div style="font-size: 14px; line-height: 1.5; color: black;">
              <div>Product : ${escapeHtml(item.product_name || '-')}</div>
              <div>Batch &nbsp;&nbsp;: ${escapeHtml(item.batch_number || '-')}</div>
              <div>Pass Date: ${recDate}</div>
            </div>
          </div>
        </div>
      `;
    }

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
        ${pageCss}
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
      
      let statusBadge = '<span class="badge pending" style="background:#f59e0b; color:white; padding:4px 8px; border-radius:12px; font-size:12px;">รอดำเนินการ</span>';
      if (er.status === 'Approved' || er.status === 'Completed') {
        statusBadge = '<span class="badge approved" style="background:#10b981; color:white; padding:4px 8px; border-radius:12px; font-size:12px;">ดำเนินการแล้ว</span>';
      }
      
      const createdDate = new Date(er.created_at).toLocaleString('th-TH');
      const actionedDate = er.actioned_at ? new Date(er.actioned_at).toLocaleString('th-TH') : '-';
      
      let actionHtml = '';
      if ((isAdmin || role === 'lab') && er.status === 'Pending') {
        actionHtml += `<button class="btn btn-sm btn-primary" onclick="App.fulfillEditRequest('${er.id}', '${er.request_id}')">✏️ แก้ไขข้อมูลตามคำขอ</button>`;
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

  function openCreateEditRequestModal() {
    try {
      const searchInput = document.getElementById('edit-req-search-input');
      if (searchInput) searchInput.value = '';
      
      const errorEl = document.getElementById('edit-req-search-error');
      if (errorEl) errorEl.style.display = 'none';
      
      const detailsContainer = document.getElementById('edit-req-details-container');
      if (detailsContainer) detailsContainer.style.display = 'none';

      if (document.getElementById('edit-req-supplier')) document.getElementById('edit-req-supplier').textContent = '-';
      if (document.getElementById('edit-req-date')) document.getElementById('edit-req-date').textContent = '-';
      if (document.getElementById('edit-req-status')) document.getElementById('edit-req-status').textContent = '-';
      
      const itemsTbody = document.getElementById('edit-req-items-tbody');
      if (itemsTbody) itemsTbody.innerHTML = '';
      
      const reasonEl = document.getElementById('edit-req-reason');
      if (reasonEl) reasonEl.value = '';
      
      const noteEl = document.getElementById('edit-req-note');
      if (noteEl) noteEl.value = '';
      
      state.currentEditTargetRequest = null;

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
    
    // Check if input is a valid request number
    const btn = document.querySelector('#modal-create-edit-request .btn-primary');
    const oldText = btn.innerText;
    btn.innerText = 'กำลังค้นหา...';
    btn.disabled = true;

    try {
      // Search from DB directly by requestNo
      const reqs = await window.DB.getRequests({ requestNo: input });
      
      // Find the best match (exact match first)
      let match = reqs.find(r => r.request_no === input);
      if (!match && reqs.length > 0) {
        match = reqs[0];
      }

      if (!match) {
        errorEl.style.display = 'block';
      } else {
        // Fetch full request detail to guarantee request_items with all fields (batch_number, quantity, etc.)
        try {
          const fullDetail = await window.DB.getRequestDetail(match.id);
          if (fullDetail) match = fullDetail;
        } catch(errDetail) {
          console.warn('Could not fetch full detail for request', errDetail);
        }

        state.currentEditTargetRequest = match;
        
        if (document.getElementById('edit-req-supplier')) document.getElementById('edit-req-supplier').textContent = match.customer_name || '-';
        if (document.getElementById('edit-req-date')) document.getElementById('edit-req-date').textContent = match.request_date ? new Date(match.request_date).toLocaleDateString('th-TH') : '-';
        if (document.getElementById('edit-req-status')) document.getElementById('edit-req-status').textContent = match.status || '-';
        
        // Render items table matching user design
        const tbody = document.getElementById('edit-req-items-tbody');
        if (tbody) {
          tbody.innerHTML = '';
          const itemsArr = match.request_items || match.items || [];
          if (itemsArr.length > 0) {
            itemsArr.forEach(item => {
              const tr = document.createElement('tr');
              tr.style.borderBottom = '1px solid #f1f5f9';
              const pName = item.product_name || '-';
              const bNo = item.batch_number || item.batch_no || '-';
              const qty = item.quantity || '-';
              tr.innerHTML = `
                <td style="padding:12px 16px; font-weight:600; color:#0f172a;">${escapeHtml(pName)}</td>
                <td style="padding:12px 16px; color:#334155;">${escapeHtml(bNo)}</td>
                <td style="padding:12px 16px; color:#334155;">${escapeHtml(qty)}</td>
              `;
              tbody.appendChild(tr);
            });
          } else {
            tbody.innerHTML = '<tr><td colspan="3" style="padding:14px; text-align:center; color:#94a3b8;">ไม่มีรายการสินค้า</td></tr>';
          }
        }

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

  async function clearAndReimportHistoricalData() {
    if (!confirm('คุณต้องการล้างข้อมูลประวัติย้อนหลังเดิมเพื่อเลือกไฟล์ Excel และนำเข้าใหม่อีกครั้งใช่หรือไม่?')) return;
    try {
      await window.DB.clearHistoricalRecords();
      showToast('ล้างข้อมูลย้อนหลังเดิมเรียบร้อยแล้ว กรุณากดปุ่ม "นำเข้าข้อมูลย้อนหลัง" เพื่อเลือกไฟล์ Excel ใหม่อีกครั้ง', 'info');
      loadMaterialHistory();
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger');
    }
  }


  /* =========================================================================
     MIX TANK INSPECTION (FM-QC003) CONTROLLER
     ========================================================================= */

  let currentMixTankRecord = null;

  function openMixTankFilterModal() {
    const modal = document.getElementById('modal-mix-tank-filters');
    if (modal) modal.classList.add('open');
  }

  function closeMixTankFilterModal() {
    const modal = document.getElementById('modal-mix-tank-filters');
    if (modal) modal.classList.remove('open');
  }

  function handleMixTankFilterSubmit(e) {
    if (e) e.preventDefault();
    state.mixTankFilters.docNo = (document.getElementById('filter-mt-doc-no')?.value || '').trim();
    state.mixTankFilters.tank = (document.getElementById('filter-mt-tank')?.value || '').trim();
    state.mixTankFilters.product = (document.getElementById('filter-mt-product')?.value || '').trim();
    state.mixTankFilters.status = document.getElementById('filter-mt-status')?.value || '';
    state.mixTankFilters.startDate = document.getElementById('filter-mt-start-date')?.value || '';
    state.mixTankFilters.endDate = document.getElementById('filter-mt-end-date')?.value || '';
    state.mixTankFilters.page = 1;
    closeMixTankFilterModal();
    loadMixTankList();
  }

  function resetMixTankFilters() {
    const form = document.getElementById('mix-tank-filter-form');
    if (form) form.reset();
    state.mixTankFilters.docNo = '';
    state.mixTankFilters.tank = '';
    state.mixTankFilters.product = '';
    state.mixTankFilters.status = '';
    state.mixTankFilters.startDate = '';
    state.mixTankFilters.endDate = '';
    state.mixTankFilters.page = 1;
    closeMixTankFilterModal();
    loadMixTankList();
  }

  function setMixTankPage(p) {
    state.mixTankFilters.page = Math.max(1, p);
    loadMixTankList();
  }

  function setMixTankPageSize(ps) {
    state.mixTankFilters.pageSize = ps;
    state.mixTankFilters.page = 1;
    loadMixTankList();
  }

  async function loadMixTankList() {
    const tbody = document.getElementById('mix-tank-list-tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:36px;"><div style="display:inline-flex; align-items:center; gap:10px;"><div class="spinner" style="width:20px; height:20px; border-width:2px;"></div> <span>กำลังโหลดรายการ Mix Tank...</span></div></td></tr>`;
    }

    try {
      const records = await window.DB.getMixTankRequests();
      updateMixTankBadge(records);

      const f = state.mixTankFilters;
      const filtered = (records || []).filter(r => {
        if (f.docNo && !(r.doc_no || '').toLowerCase().includes(f.docNo.toLowerCase())) return false;
        if (f.tank && !(r.tank_name || '').toLowerCase().includes(f.tank.toLowerCase())) return false;
        if (f.product && !(r.product_name || '').toLowerCase().includes(f.product.toLowerCase())) return false;
        if (f.status && r.status !== f.status) return false;
        if (f.startDate && r.request_date && r.request_date < f.startDate) return false;
        if (f.endDate && r.request_date && r.request_date > f.endDate) return false;
        return true;
      });

      const totalCount = filtered.length;
      const page = f.page || 1;
      const pageSize = f.pageSize || 20;
      const startIndex = (page - 1) * pageSize;
      const paginated = filtered.slice(startIndex, startIndex + pageSize);

      renderMixTankTable(paginated, totalCount, page, pageSize);

      // Auto-select record in bottom pane if available
      if (paginated.length > 0) {
        const targetId = (currentMixTankRecord && paginated.some(r => r.id === currentMixTankRecord.id))
          ? currentMixTankRecord.id
          : paginated[0].id;
        
        setTimeout(() => {
          const curTbody = document.getElementById('mix-tank-list-tbody');
          if (curTbody) {
            const rows = curTbody.querySelectorAll('tr');
            rows.forEach(row => {
              if (row.innerHTML.includes(targetId) || (targetId === paginated[0].id && row === rows[0])) {
                row.classList.add('selected-row');
              }
            });
          }
          loadMixTankDetailInPane(targetId);
        }, 50);
      } else {
        clearMixTankDetailPane();
      }
    } catch (e) {
      console.error('loadMixTankList error:', e);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-danger); padding:30px;">ไม่สามารถโหลดรายการได้: ${escapeHtml(e.message)}</td></tr>`;
      }
      showToast('ไม่สามารถโหลดรายการใบตรวจ Mix Tank ได้: ' + e.message, 'error');
    }
  }

  function updateMixTankBadge(records) {
    const badge = document.getElementById('sidebar-mix-tank-count');
    if (!badge) return;
    const pendingCount = (records || []).filter(r => r.status === 'Pending QC' || r.status === 'Pending Approval').length;
    if (pendingCount > 0) {
      badge.innerText = pendingCount;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  function renderMixTankTable(records, totalCount, page, pageSize) {
    const tbody = document.getElementById('mix-tank-list-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!records || records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:30px;">ไม่พบรายการใบตรวจ Mix Tank ที่ตรงกับเงื่อนไขการค้นหา</td></tr>`;
      renderPaginationControls({
        containerId: 'mix-tank-pagination',
        page: 1,
        pageSize: pageSize || 20,
        totalCount: 0,
        onPageChange: 'App.setMixTankPage',
        onPageSizeChange: 'App.setMixTankPageSize'
      });
      return;
    }

    records.forEach(r => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.style.transition = 'background 0.15s';
      tr.onclick = (e) => {
        if (!e.target.closest('button')) {
          Array.from(tr.parentNode.children).forEach(child => child.classList.remove('selected-row'));
          tr.classList.add('selected-row');
          loadMixTankDetailInPane(r.id);
        }
      };

      const rawMaterial = (r.after_item && r.after_item.item && r.after_item.item.trim()) || r.product_name || '-';
      const batchNo = (r.after_item && r.after_item.lot_no && r.after_item.lot_no.trim()) || r.batch_number || '-';
      const customer = (r.after_item && r.after_item.supplier && r.after_item.supplier.trim()) || r.customer || r.customer_name || '-';
      const requester = r.created_by || r.prepared_by_name || '-';

      // Status mapping to: Pending, In Process, Complete, Approved, Rejected
      let displayStatus = r.status || 'Pending';
      if (displayStatus === 'Pending QC') displayStatus = 'Pending';
      else if (displayStatus === 'Pending Approval') displayStatus = 'Complete';
      else if (displayStatus === 'Draft') displayStatus = 'Pending';

      let statusBadgeClass = 'pending';
      if (displayStatus === 'Pending') statusBadgeClass = 'pending';
      else if (displayStatus === 'In Process') statusBadgeClass = 'in-process';
      else if (displayStatus === 'Complete') statusBadgeClass = 'complete';
      else if (displayStatus === 'Approved') statusBadgeClass = 'approved';
      else if (displayStatus === 'Rejected') statusBadgeClass = 'rejected';

      tr.innerHTML = `
        <td style="white-space: nowrap;"><strong>${escapeHtml(r.doc_no || '-')}</strong></td>
        <td style="white-space: nowrap;">${escapeHtml(r.request_date || '-')}</td>
        <td style="white-space: nowrap;"><strong>${escapeHtml(r.tank_name || '-')}</strong></td>
        <td style="white-space: nowrap;">${escapeHtml(customer)}</td>
        <td style="white-space: nowrap;">${escapeHtml(rawMaterial)}</td>
        <td style="white-space: nowrap; font-weight: 600; color: #166534;">${escapeHtml(batchNo)}</td>
        <td style="white-space: nowrap;">${escapeHtml(requester)}</td>
        <td style="white-space: nowrap; text-align: center;"><span class="badge ${statusBadgeClass}">${displayStatus}</span></td>
      `;
      tbody.appendChild(tr);
    });

    renderPaginationControls({
      containerId: 'mix-tank-pagination',
      page: page,
      pageSize: pageSize,
      totalCount: totalCount,
      onPageChange: 'App.setMixTankPage',
      onPageSizeChange: 'App.setMixTankPageSize'
    });

    if (window.lucide) window.lucide.createIcons();
  }


  /* =========================================================================
     MIX TANK SPLIT DETAIL PANE CONTROLLER
     ========================================================================= */

  function clearMixTankDetailPane() {
    const emptyEl = document.getElementById('mt-detail-empty');
    const bodyEl = document.getElementById('mt-detail-body');
    const printBtn = document.getElementById('btn-mt-detail-print');
    const editBtn = document.getElementById('btn-mt-detail-edit');
    const delBtn = document.getElementById('btn-mt-detail-delete');

    if (emptyEl) emptyEl.style.display = 'block';
    if (bodyEl) bodyEl.style.display = 'none';
    if (printBtn) printBtn.style.setProperty('display', 'none', 'important');
    if (editBtn) editBtn.style.setProperty('display', 'none', 'important');
    if (delBtn) delBtn.style.setProperty('display', 'none', 'important');

    const docBadge = document.getElementById('mt-detail-doc-badge');
    const statusBadge = document.getElementById('mt-detail-status-badge');
    if (docBadge) docBadge.innerText = '-';
    if (statusBadge) {
      statusBadge.innerText = '-';
      statusBadge.className = 'badge';
    }
    const d15El = document.getElementById('mt-det-density-15');
    const d30El = document.getElementById('mt-det-density-30');
    const remEl = document.getElementById('mt-det-remark');
    if (d15El) d15El.innerText = '-';
    if (d30El) d30El.innerText = '-';
    if (remEl) remEl.innerText = '-';

    const arc = document.getElementById('mt-approve-reject-btn-container');
    if (arc) arc.innerHTML = '';
    const mtApprovalCard = document.getElementById('mt-detail-approval-card');
    if (mtApprovalCard) mtApprovalCard.style.display = 'none';
  }

  async function loadMixTankDetailInPane(id) {
    if (!id) return clearMixTankDetailPane();

    try {
      const rec = await window.DB.getMixTankDetail(id);
      if (!rec) return clearMixTankDetailPane();
      currentMixTankRecord = rec;

      const emptyEl = document.getElementById('mt-detail-empty');
      const bodyEl = document.getElementById('mt-detail-body');
      if (emptyEl) emptyEl.style.display = 'none';
      if (bodyEl) bodyEl.style.display = 'block';

      // Header Badges
      const docBadge = document.getElementById('mt-detail-doc-badge');
      if (docBadge) docBadge.innerText = rec.doc_no || '-';

      const statusBadge = document.getElementById('mt-detail-status-badge');
      if (statusBadge) {
        let displayStatus = rec.status || 'Pending';
        if (displayStatus === 'Pending QC') displayStatus = 'Pending';
        else if (displayStatus === 'Pending Approval') displayStatus = 'Complete';
        else if (displayStatus === 'Draft') displayStatus = 'Pending';

        let badgeClass = 'pending';
        if (displayStatus === 'Pending') badgeClass = 'pending';
        else if (displayStatus === 'In Process') badgeClass = 'in-process';
        else if (displayStatus === 'Complete') badgeClass = 'complete';
        else if (displayStatus === 'Approved') badgeClass = 'approved';
        else if (displayStatus === 'Rejected') badgeClass = 'rejected';

        statusBadge.className = 'badge ' + badgeClass;
        statusBadge.innerText = displayStatus;
      }

      // Top Action Buttons
      const printBtn = document.getElementById('btn-mt-detail-print');
      const editBtn = document.getElementById('btn-mt-detail-edit');
      const delBtn = document.getElementById('btn-mt-detail-delete');

      if (printBtn) printBtn.style.setProperty('display', 'inline-flex', 'important');

      const isLocked = rec.status === 'Approved';
      const currentUser = state.currentUser || {};
      const userRole = (currentUser.role || '').toLowerCase();
      const isRestrictedRole = (userRole === 'requester' || userRole === 'base_oil');
      const canEdit = !isRestrictedRole && (userRole === 'admin' || userRole === 'lab') && !isLocked;
      const canDelete = !isRestrictedRole && (userRole === 'admin') && !isLocked;

      if (editBtn) editBtn.style.setProperty('display', canEdit ? 'inline-flex' : 'none', 'important');
      if (delBtn) delBtn.style.setProperty('display', canDelete ? 'inline-flex' : 'none', 'important');

      // Section 2: Volumes Table
      const volumesTbody = document.getElementById('mt-det-volumes-tbody');
      if (volumesTbody) {
        const beforeQty = (rec.before_item && parseFloat(rec.before_item.quantity)) || 0;
        const items = rec.top_up_items || [];
        let topUpTotal = 0;
        let dischargeTotal = 0;
        items.forEach(t => {
          const q = parseFloat(t.quantity) || 0;
          if (t.type === 'DISCHARGE') {
            dischargeTotal += q;
          } else {
            topUpTotal += q;
          }
        });
        const afterQty = (rec.after_item && parseFloat(rec.after_item.quantity)) || (beforeQty + topUpTotal - dischargeTotal);

        let rowsHtml = '';
        
        // BEFORE row
        rowsHtml += `
          <tr style="background: #fafafa;">
            <td style="font-weight: 700; color: #475569;">BEFORE</td>
            <td>${escapeHtml((rec.before_item && rec.before_item.item) || rec.product_name || '-')}</td>
            <td>${escapeHtml((rec.before_item && rec.before_item.lot_no) || '-')}</td>
            <td style="text-align: right; font-weight: 600;">${beforeQty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>${escapeHtml((rec.before_item && rec.before_item.supplier) || '-')}</td>
            <td>-</td>
          </tr>`;

        // TOP UP and DISCHARGE rows
        items.forEach((item, idx) => {
          const qty = parseFloat(item.quantity) || 0;
          if (item.type === 'DISCHARGE') {
            rowsHtml += `
              <tr style="background: #fff7ed;">
                <td style="font-weight: 700; color: #ea580c;">DISCHARGE (-)</td>
                <td style="color: #9a3412; font-style: italic;">(จ่ายออก)</td>
                <td>-</td>
                <td style="text-align: right; font-weight: 700; color: #c2410c;">-${qty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td>-</td>
                <td>-</td>
              </tr>`;
          } else {
            rowsHtml += `
              <tr>
                <td style="font-weight: 700; color: #0284c7;">TOP UP</td>
                <td>${escapeHtml(item.item || rec.product_name || '-')}</td>
                <td>${escapeHtml(item.lot_no || '-')}</td>
                <td style="text-align: right; font-weight: 600; color: #0284c7;">+${qty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td>${escapeHtml(item.supplier || '-')}</td>
                <td>${escapeHtml(item.vehicle || '-')}</td>
              </tr>`;
          }
        });

        // AFTER row
        rowsHtml += `
          <tr style="background: #f0fdf4; font-weight: 700;">
            <td style="color: #166534;">AFTER</td>
            <td>${escapeHtml((rec.after_item && rec.after_item.item) || rec.product_name || '-')}</td>
            <td style="color: #166534;">${escapeHtml((rec.after_item && rec.after_item.lot_no) || '-')}</td>
            <td style="text-align: right; color: #166534; font-size: 14px;">${afterQty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>${escapeHtml((rec.after_item && rec.after_item.supplier) || rec.customer || '-')}</td>
            <td>-</td>
          </tr>`;

        volumesTbody.innerHTML = rowsHtml;
      }

      // Section 3: QC Results (Read-only view in Detail Pane)
      const d15El = document.getElementById('mt-det-density-15');
      const d30El = document.getElementById('mt-det-density-30');
      const remEl = document.getElementById('mt-det-remark');

      if (d15El) d15El.innerText = rec.density_15 || '-';
      if (d30El) d30El.innerText = rec.density_30 || '-';
      if (remEl) remEl.innerText = rec.remark || '-';

      // Section 4: Document Approval Card & Top Action Buttons (Matched to requests-detail-pane)
      const approveRejectContainer = document.getElementById('mt-approve-reject-btn-container');
      const isCompleteStatus = (rec.status === 'Complete' || rec.status === 'Pending Approval');
      const isApprovedStatus = (rec.status === 'Approved');
      const isRejectedStatus = (rec.status === 'Rejected');

      if (approveRejectContainer) {
        if (isCompleteStatus && (currentUser.role === 'admin' || currentUser.role === 'lab')) {
          approveRejectContainer.innerHTML = `
            <button class="btn btn-sm" id="btn-mt-detail-approve" style="background-color:#16a34a; color:white; border:none;" onclick="App.approveMixTank()">
              <i data-lucide="check-circle"></i> Approve
            </button>
            <button class="btn btn-sm" id="btn-mt-detail-reject" style="background-color:#dc2626; color:white; border:none;" onclick="App.rejectMixTankFromDetail()">
              <i data-lucide="x-circle"></i> Reject
            </button>
          `;
          if (window.lucide) window.lucide.createIcons();
        } else {
          approveRejectContainer.innerHTML = '';
        }
      }

      const approvalCard = document.getElementById('mt-detail-approval-card');
      if (approvalCard) {
        const showApprovalCard = (currentUser.role === 'admin' || currentUser.role === 'lab' || isApprovedStatus || isRejectedStatus);
        approvalCard.style.display = showApprovalCard ? 'block' : 'none';

        const badge = document.getElementById('mt-approval-status-badge');
        const reopenContainer = document.getElementById('mt-reopen-action-container');
        const validationMsg = document.getElementById('mt-approval-validation-msg');
        if (validationMsg) validationMsg.style.display = 'none';

        if (isApprovedStatus) {
          if (badge) { badge.className = 'badge badge-success'; badge.innerText = 'Approved'; }
          const pendingState = document.getElementById('mt-approval-pending-state');
          const doneState = document.getElementById('mt-approval-done-state');
          if (pendingState) pendingState.style.display = 'none';
          if (doneState) doneState.style.display = 'flex';

          const actionLabel = document.getElementById('mt-approval-action-label');
          const nameDisplay = document.getElementById('mt-approval-name-display');
          const roleDisplay = document.getElementById('mt-approval-role-display');
          const dateDisplay = document.getElementById('mt-approval-date-display');

          if (actionLabel) actionLabel.innerText = 'Approved By';
          if (nameDisplay) nameDisplay.innerText = rec.approved_by_name || '-';
          if (roleDisplay) roleDisplay.innerText = 'LAB / QC';
          if (dateDisplay) dateDisplay.innerText = rec.approved_at ? new Date(rec.approved_at).toLocaleString('th-TH') : '-';

          if (reopenContainer) {
            reopenContainer.style.display = (currentUser.role === 'admin' || currentUser.role === 'lab') ? 'flex' : 'none';
          }
        } else if (isRejectedStatus) {
          if (badge) { badge.className = 'badge badge-danger'; badge.innerText = 'Rejected'; }
          const pendingState = document.getElementById('mt-approval-pending-state');
          const doneState = document.getElementById('mt-approval-done-state');
          if (pendingState) pendingState.style.display = 'none';
          if (doneState) doneState.style.display = 'flex';

          const actionLabel = document.getElementById('mt-approval-action-label');
          const nameDisplay = document.getElementById('mt-approval-name-display');
          const roleDisplay = document.getElementById('mt-approval-role-display');
          const dateDisplay = document.getElementById('mt-approval-date-display');

          if (actionLabel) actionLabel.innerText = 'Rejected By';
          if (nameDisplay) nameDisplay.innerText = rec.approved_by_name || '-';
          if (roleDisplay) roleDisplay.innerText = 'LAB / QC';
          if (dateDisplay) dateDisplay.innerText = rec.approved_at ? new Date(rec.approved_at).toLocaleString('th-TH') : '-';

          if (reopenContainer) {
            reopenContainer.style.display = (currentUser.role === 'admin' || currentUser.role === 'lab') ? 'flex' : 'none';
          }
        } else {
          // Waiting for Approval
          if (badge) { badge.className = 'badge pending'; badge.innerText = 'Waiting for Approval'; }
          const pendingState = document.getElementById('mt-approval-pending-state');
          const doneState = document.getElementById('mt-approval-done-state');
          if (pendingState) pendingState.style.display = 'flex';
          if (doneState) doneState.style.display = 'none';
          if (reopenContainer) reopenContainer.style.display = 'none';
        }
      }

      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      console.error('loadMixTankDetailInPane error:', e);
    }
  }

  function renderMixTankDetailSignatures(rec) {
    const boxPrep = document.getElementById('mt-det-sig-box-prep');
    if (!boxPrep) return;
    const currentUser = state.currentUser || {};
    const role = currentUser.role || '';

    // 1. PREPARED BY
    const imgPrep = document.getElementById('mt-det-sig-img-prep');
    const namePrep = document.getElementById('mt-det-sig-name-prep');
    const datePrep = document.getElementById('mt-det-sig-date-prep');
    const statusPrep = document.getElementById('mt-det-sig-status-prep');
    const btnPrep = document.getElementById('mt-det-btn-sign-prep');

    if (rec.prepared_at || rec.prepared_signature_url) {
      if (boxPrep) boxPrep.classList.add('signed');
      if (statusPrep) { statusPrep.className = 'badge badge-success'; statusPrep.innerText = 'ลงนามแล้ว'; }
      if (imgPrep) imgPrep.innerHTML = rec.prepared_signature_url ? `<img src="${rec.prepared_signature_url}" alt="Prepared Signature" style="max-height:50px; max-width:140px; object-fit:contain;">` : '<span style="color:#166534; font-weight:700;">[ลงนามเรียบร้อย]</span>';
      if (namePrep) namePrep.innerText = rec.prepared_by_name || '-';
      if (datePrep) datePrep.innerText = new Date(rec.prepared_at).toLocaleString('th-TH');
      if (btnPrep) btnPrep.style.display = 'none';
    } else {
      if (boxPrep) boxPrep.classList.remove('signed');
      if (statusPrep) { statusPrep.className = 'badge'; statusPrep.innerText = 'รอดำเนินการ'; }
      if (imgPrep) imgPrep.innerHTML = '<span style="font-size: 11px; color: #94a3b8;">(ยังไม่ได้ลงนาม)</span>';
      if (namePrep) namePrep.innerText = '-';
      if (datePrep) datePrep.innerText = '-';
      if (btnPrep) btnPrep.style.display = ['base_oil', 'requester', 'admin'].includes(role) ? 'block' : 'none';
    }

    // 2. TEST BY
    const boxTest = document.getElementById('mt-det-sig-box-test');
    const imgTest = document.getElementById('mt-det-sig-img-test');
    const nameTest = document.getElementById('mt-det-sig-name-test');
    const dateTest = document.getElementById('mt-det-sig-date-test');
    const statusTest = document.getElementById('mt-det-sig-status-test');
    const btnTest = document.getElementById('mt-det-btn-sign-test');

    if (rec.tested_at || rec.tested_signature_url) {
      if (boxTest) boxTest.classList.add('signed');
      if (statusTest) { statusTest.className = 'badge badge-success'; statusTest.innerText = 'ทดสอบแล้ว'; }
      if (imgTest) imgTest.innerHTML = rec.tested_signature_url ? `<img src="${rec.tested_signature_url}" alt="Tested Signature" style="max-height:50px; max-width:140px; object-fit:contain;">` : '<span style="color:#166534; font-weight:700;">[ลงนามเรียบร้อย]</span>';
      if (nameTest) nameTest.innerText = rec.tested_by_name || '-';
      if (dateTest) dateTest.innerText = new Date(rec.tested_at).toLocaleString('th-TH');
      if (btnTest) btnTest.style.display = 'none';
    } else {
      if (boxTest) boxTest.classList.remove('signed');
      if (statusTest) { statusTest.className = 'badge'; statusTest.innerText = 'รอดำเนินการ'; }
      if (imgTest) imgTest.innerHTML = '<span style="font-size: 11px; color: #94a3b8;">(ยังไม่ได้ลงนาม)</span>';
      if (nameTest) nameTest.innerText = '-';
      if (dateTest) dateTest.innerText = '-';
      if (btnTest) btnTest.style.display = ['lab', 'admin'].includes(role) ? 'block' : 'none';
    }

    // 3. APPROVED BY
    const boxAppr = document.getElementById('mt-det-sig-box-appr');
    const imgAppr = document.getElementById('mt-det-sig-img-appr');
    const nameAppr = document.getElementById('mt-det-sig-name-appr');
    const dateAppr = document.getElementById('mt-det-sig-date-appr');
    const statusAppr = document.getElementById('mt-det-sig-status-appr');
    const btnAppr = document.getElementById('mt-det-btn-sign-appr');
    const btnRej = document.getElementById('mt-det-btn-reject-appr');

    if (rec.approved_at || rec.approved_signature_url) {
      if (boxAppr) boxAppr.classList.add('signed');
      if (statusAppr) { statusAppr.className = 'badge badge-success'; statusAppr.innerText = 'อนุมัติแล้ว'; }
      if (imgAppr) imgAppr.innerHTML = rec.approved_signature_url ? `<img src="${rec.approved_signature_url}" alt="Approved Signature" style="max-height:50px; max-width:140px; object-fit:contain;">` : '<span style="color:#166534; font-weight:700;">[อนุมัติเรียบร้อย]</span>';
      if (nameAppr) nameAppr.innerText = rec.approved_by_name || '-';
      if (dateAppr) dateAppr.innerText = new Date(rec.approved_at).toLocaleString('th-TH');
      if (btnAppr) btnAppr.style.display = 'none';
      if (btnRej) btnRej.style.display = 'none';
    } else if (rec.status === 'Rejected') {
      if (boxAppr) boxAppr.classList.remove('signed');
      if (statusAppr) { statusAppr.className = 'badge badge-danger'; statusAppr.innerText = 'ปฏิเสธ'; }
      if (imgAppr) imgAppr.innerHTML = '<span style="color:#dc2626; font-weight:700;">[ปฏิเสธ/ส่งกลับ]</span>';
      if (nameAppr) nameAppr.innerText = '-';
      if (dateAppr) dateAppr.innerText = '-';
      if (btnAppr) btnAppr.style.display = role === 'admin' ? 'block' : 'none';
      if (btnRej) btnRej.style.display = 'none';
    } else {
      if (boxAppr) boxAppr.classList.remove('signed');
      if (statusAppr) { statusAppr.className = 'badge'; statusAppr.innerText = 'รอดำเนินการ'; }
      if (imgAppr) imgAppr.innerHTML = '<span style="font-size: 11px; color: #94a3b8;">(ยังไม่ได้อนุมัติ)</span>';
      if (nameAppr) nameAppr.innerText = '-';
      if (dateAppr) dateAppr.innerText = '-';
      if (btnAppr) btnAppr.style.display = role === 'admin' ? 'block' : 'none';
      if (btnRej) btnRej.style.display = role === 'admin' ? 'block' : 'none';
    }
  }

  async function saveMixTankQCFromDetail() {
    if (!currentMixTankRecord || !currentMixTankRecord.id) return;
    const density15 = document.getElementById('mt-det-density-15')?.value.trim();
    const density30 = document.getElementById('mt-det-density-30')?.value.trim();
    const remark = document.getElementById('mt-det-remark')?.value.trim();

    showLoading();
    try {
      const updated = await window.DB.updateMixTankQC(currentMixTankRecord.id, {
        density_15: density15 || null,
        density_30: density30 || null,
        remark: remark || null
      });
      currentMixTankRecord = updated;
      showToast('บันทึกผลทดสอบ QC สำเร็จเรียบร้อยแล้ว', 'success');
      loadMixTankList();
    } catch (e) {
      console.error('saveMixTankQCFromDetail error:', e);
      showToast('เกิดข้อผิดพลาดในการบันทึกผล QC: ' + e.message, 'error');
    } finally {
      hideLoading();
    }
  }

  async function signMixTankTierFromDetail(tier) {
    if (!currentMixTankRecord || !currentMixTankRecord.id) return;
    await signMixTankTier(tier);
    loadMixTankDetailInPane(currentMixTankRecord.id);
  }

  async function rejectMixTankFromDetail() {
    if (!currentMixTankRecord || !currentMixTankRecord.id) return;
    await rejectMixTank();
    loadMixTankDetailInPane(currentMixTankRecord.id);
  }

  function printMixTankCurrentFromDetail() {
    if (!currentMixTankRecord || !currentMixTankRecord.id) return;
    printMixTank(currentMixTankRecord.id);
  }

  function editCurrentMixTankFromDetail() {
    if (!currentMixTankRecord || !currentMixTankRecord.id) return;
    const role = (state.currentUser?.role || '').toLowerCase();
    if (role === 'requester' || role === 'base_oil') {
      showToast('คุณไม่มีสิทธิ์แก้ไขใบแจ้ง Mix Tank', 'warning');
      return;
    }
    navigate('mix-tank-form', { id: currentMixTankRecord.id });
  }

  function deleteCurrentMixTankFromDetail() {
    if (!currentMixTankRecord || !currentMixTankRecord.id) return;
    const role = (state.currentUser?.role || '').toLowerCase();
    if (role === 'requester' || role === 'base_oil') {
      showToast('คุณไม่มีสิทธิ์ลบใบแจ้ง Mix Tank', 'warning');
      return;
    }
    deleteMixTankRecord(currentMixTankRecord.id);
  }

  async function prepareMixTankForm(id, mode) {
    if (id) {
      const role = (state.currentUser?.role || '').toLowerCase();
      if (role === 'requester' || role === 'base_oil') {
        showToast('คุณไม่มีสิทธิ์แก้ไขใบแจ้ง Mix Tank ที่ส่งไปแล้ว', 'warning');
        navigate('mix-tank');
        return;
      }
    }
    showLoading();
    try {
      if (id) {
        currentMixTankRecord = await window.DB.getMixTankDetail(id);
      } else {
        const todayStr = new Date().toISOString().slice(0, 10);
        currentMixTankRecord = {
          id: '',
          doc_no: '',
          to_dept: 'QC',
          tank_name: '',
          request_date: todayStr,
          product_name: '',
          status: 'Draft',
          top_up_items: [{ item: '', lot_no: '', quantity: '', unit: 'MT', supplier: '', vehicle: '' }],
          before_item: { item: '', lot_no: '', quantity: '', unit: 'MT', supplier: '' },
          after_item: { item: '', lot_no: '', quantity: '', unit: 'MT', supplier: '' },
          density_15: '',
          density_30: '',
          visc_40_time: '',
          visc_40_const: '',
          visc_40_result: '',
          visc_100_time: '',
          visc_100_const: '',
          visc_100_result: '',
          viscosity_index: '',
          water_content: 'NIL',
          remark: '',
          prepared_by_name: state.currentUser ? state.currentUser.display_name : '',
          prepared_by_id: state.currentUser ? state.currentUser.id : '',
          prepared_signature_url: '',
          prepared_at: null,
          tested_by_name: '',
          tested_by_id: '',
          tested_signature_url: '',
          tested_at: null,
          approved_by_name: '',
          approved_by_id: '',
          approved_signature_url: '',
          approved_at: null
        };
      }

      populateMixTankFormUI(currentMixTankRecord);
    } catch (e) {
      console.error('prepareMixTankForm error:', e);
      showToast('ไม่สามารถเปิดแบบฟอร์ม Mix Tank ได้: ' + e.message, 'error');
      navigate('mix-tank');
    } finally {
      hideLoading();
    }
  }

  function populateMixTankFormUI(rec) {
    const isEdit = !!rec.id;
    const heading = document.getElementById('mix-tank-form-heading');
    if (heading) heading.innerText = isEdit ? 'แก้ไขใบแจ้งตรวจ Mix Tank' : 'สร้างใบแจ้งตรวจ Mix Tank';
    
        // Dynamic edit button text based on status
        const editBtn = document.getElementById('btn-mix-save-edit');
        if (editBtn) {
          if (rec.status === 'Draft') {
            editBtn.innerText = 'ส่ง';
          } else {
            editBtn.innerText = 'บันทึก';
          }
        }

    // Toggle Action Buttons (Create vs Edit)
    const createActions = document.getElementById('mt-form-actions-create');
    const editActions = document.getElementById('mt-form-actions-edit');
    if (createActions) createActions.style.display = isEdit ? 'none' : 'flex';
    if (editActions) editActions.style.display = isEdit ? 'flex' : 'none';
    
    // Status Badge
    const statusBadge = document.getElementById('mix-form-status-badge');
    if (statusBadge) {
      statusBadge.innerText = rec.status || 'Draft';
      statusBadge.className = 'badge ' + (rec.status === 'Approved' ? 'badge-success' : rec.status === 'Rejected' ? 'badge-danger' : rec.status === 'Draft' ? 'badge-draft' : 'badge-pending');
    }

    // Print button visibility
    const printBtn = document.getElementById('btn-mix-form-print');
    if (printBtn) printBtn.style.setProperty('display', isEdit ? 'inline-flex' : 'none', 'important');
    if (window.lucide) window.lucide.createIcons();

    // Helper to safely set element value if element exists
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = (val !== undefined && val !== null) ? val : '';
    };

    // Header info
    setVal('mt-doc-no', rec.doc_no);
    setVal('mt-request-date', rec.request_date || new Date().toISOString().slice(0, 10));
    setVal('mt-to-dept', rec.to_dept || 'QC');
    setVal('mt-requester-name', isEdit ? (rec.created_by || rec.prepared_by_name || '-') : (state.currentUser?.display_name || ''));
    setVal('mt-customer', rec.customer || '');
    setVal('mt-tank-name', rec.tank_name);
    setVal('mt-product-name', rec.product_name);

    // Render TOP UP / DISCHARGE rows
    const tbody = document.getElementById('mt-topup-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      const items = (rec.top_up_items && rec.top_up_items.length > 0) ? rec.top_up_items : [{ item: '', lot_no: '', quantity: '', supplier: '', vehicle: '' }];
      items.forEach(item => {
        if (item.type === 'DISCHARGE') {
          addMixTankDischargeRow(item);
        } else {
          addMixTankTopUpRow(item);
        }
      });
    }

    // BEFORE row
    const before = rec.before_item || {};
    setVal('mt-before-item', before.item || rec.product_name);
    setVal('mt-before-lot', before.lot_no);
    setVal('mt-before-qty', before.quantity);
    setVal('mt-before-supplier', before.supplier);

    // AFTER row
    const after = rec.after_item || {};
    setVal('mt-after-item', after.item || rec.product_name);
    setVal('mt-after-lot', after.lot_no);
    setVal('mt-after-qty', after.quantity);
    setVal('mt-after-supplier', (after.supplier && after.supplier !== 'MIXED') ? after.supplier : (rec.customer || ''));

    recalculateMixTankTotals();

    // QC Results (Density 15°C & 30°C only)
    setVal('mt-density-15', rec.density_15);
    setVal('mt-density-30', rec.density_30);
    setVal('mt-remark', rec.remark);

    // QC Status dropdown
    const statusSelect = document.getElementById('mt-form-status');
    if (statusSelect) {
      let curStatus = rec.status || 'Pending';
      if (curStatus === 'Pending QC') curStatus = 'Pending';
      else if (curStatus === 'Pending Approval') curStatus = 'Complete';
      statusSelect.value = curStatus;
    }

    // Role-based visibility for QC card
    const qcCard = document.getElementById('mt-form-qc-card');
    const role = (state.currentUser && state.currentUser.role) || '';
    const isLabOrAdmin = ['lab', 'admin'].includes(role);
    if (qcCard) {
      qcCard.style.display = isEdit ? 'block' : (isLabOrAdmin ? 'block' : 'none');
    }

    // Render 3 Signature Cards
    renderSignatureCards(rec);

    // Apply role-based field restrictions
    applyMixTankRolePermissions(rec);
  }

  function addMixTankTopUpRow(item = {}) {
    const tbody = document.getElementById('mt-topup-tbody');
    if (!tbody) return;
    const rowId = 'topup-row-' + Math.random().toString(36).substr(2, 9);
    const tr = document.createElement('tr');
    tr.id = rowId;
    tr.className = 'topup-item-row';
    tr.innerHTML = `
      <td style="font-weight: 600; color: #0284c7;">TOP UP</td>
      <td><input type="text" class="form-control form-control-sm tu-item" value="${escapeHtml(item.item || document.getElementById('mt-product-name')?.value || '')}" placeholder="ชื่อสินค้า" required></td>
      <td><input type="text" class="form-control form-control-sm tu-lot" value="${escapeHtml(item.lot_no || '')}" placeholder="เช่น 261001" required></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm tu-qty" value="${escapeHtml(item.quantity || '')}" placeholder="เช่น 249.00" oninput="App.recalculateMixTankTotals()" style="font-weight: 600;" required></td>
      <td><input type="text" class="form-control form-control-sm tu-supplier" value="${escapeHtml(item.supplier || '')}" placeholder="เช่น ESSO" required></td>
      <td><input type="text" class="form-control form-control-sm tu-vehicle" value="${escapeHtml(item.vehicle || '')}" placeholder="ทะเบียนรถ/เรือ" required></td>
      <td style="text-align: center;">
        <button type="button" class="btn btn-danger btn-sm" onclick="App.removeMixTankTopUpRow('${rowId}')" style="padding: 2px 6px; font-size: 11px;">✕</button>
      </td>
    `;
    tbody.appendChild(tr);
    recalculateMixTankTotals();
  }

  function removeMixTankTopUpRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) row.remove();
    recalculateMixTankTotals();
  }

  function addMixTankDischargeRow(item = {}) {
    const tbody = document.getElementById('mt-topup-tbody');
    if (!tbody) return;
    const rowId = 'discharge-row-' + Math.random().toString(36).substr(2, 9);
    const tr = document.createElement('tr');
    tr.id = rowId;
    tr.className = 'discharge-item-row';
    tr.style.background = '#fff7ed';
    tr.innerHTML = `
      <td style="font-weight: 700; color: #ea580c;">DISCHARGE (-)</td>
      <td><input type="text" class="form-control form-control-sm dis-item" value="(จ่ายออก)" readonly style="background: #fff7ed; color: #9a3412; font-style: italic; border-color: #fed7aa;" title="จ่ายออกจากถังเดิม (ไม่ต้องกรอก)"></td>
      <td><input type="text" class="form-control form-control-sm dis-lot" value="-" readonly style="background: #fff7ed; color: #9a3412; text-align: center; border-color: #fed7aa;" title="ไม่ต้องกรอก"></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm dis-qty" value="${escapeHtml(item.quantity || '')}" placeholder="เช่น 50.00" oninput="App.recalculateMixTankTotals()" style="font-weight: 700; color: #c2410c; background: #fff; border-color: #f97316;" required></td>
      <td><input type="text" class="form-control form-control-sm dis-supplier" value="-" readonly style="background: #fff7ed; color: #9a3412; text-align: center; border-color: #fed7aa;" title="ไม่ต้องกรอก"></td>
      <td><input type="text" class="form-control form-control-sm dis-vehicle" value="-" readonly style="background: #fff7ed; color: #9a3412; text-align: center; border-color: #fed7aa;" title="ไม่ต้องกรอก"></td>
      <td style="text-align: center;">
        <button type="button" class="btn btn-danger btn-sm" onclick="App.removeMixTankDischargeRow('${rowId}')" style="padding: 2px 6px; font-size: 11px;">✕</button>
      </td>
    `;
    tbody.appendChild(tr);
    recalculateMixTankTotals();
    setTimeout(() => {
      tr.querySelector('.dis-qty')?.focus();
    }, 50);
  }

  function removeMixTankDischargeRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) row.remove();
    recalculateMixTankTotals();
  }

  function recalculateMixTankTotals() {
    const beforeQty = parseFloat(document.getElementById('mt-before-qty')?.value) || 0;
    let topUpTotal = 0;
    document.querySelectorAll('.topup-item-row').forEach(r => {
      topUpTotal += parseFloat(r.querySelector('.tu-qty')?.value) || 0;
    });
    let dischargeTotal = 0;
    document.querySelectorAll('.discharge-item-row').forEach(r => {
      dischargeTotal += parseFloat(r.querySelector('.dis-qty')?.value) || 0;
    });
    const afterQty = beforeQty + topUpTotal - dischargeTotal;
    const afterInput = document.getElementById('mt-after-qty');
    if (afterInput) {
      afterInput.value = (afterQty !== 0 || beforeQty > 0 || topUpTotal > 0 || dischargeTotal > 0) ? afterQty.toFixed(2) : '';
      if (afterQty < 0) {
        afterInput.style.color = '#dc2626';
        afterInput.style.background = '#fee2e2';
      } else {
        afterInput.style.color = '#166534';
        afterInput.style.background = '#dcfce7';
      }
    }
  }

  function recalculateViscosity(temp) {
    return;
    const timeVal = document.getElementById(`mt-visc${temp}-time`)?.value || '';
    const constVal = parseFloat(document.getElementById(`mt-visc${temp}-const`)?.value) || 0;
    const resInput = document.getElementById(`mt-visc${temp}-result`);
    if (!resInput) return;

    if (!timeVal || !constVal) return;

    let seconds = 0;
    if (timeVal.includes("'") || timeVal.includes(":")) {
      const parts = timeVal.split(/[':]/);
      if (parts.length === 3) {
        seconds = (parseFloat(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0) + (parseFloat(parts[2]) || 0) / 100;
      } else if (parts.length === 2) {
        seconds = (parseFloat(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0);
      }
    } else {
      seconds = parseFloat(timeVal) || 0;
    }

    if (seconds > 0 && constVal > 0) {
      const result = seconds * constVal;
      resInput.value = result.toFixed(2);
    }
  }

  function calculateMixTankVI() {
    return;
    const v40 = parseFloat(document.getElementById('mt-visc40-result')?.value) || 0;
    const v100 = parseFloat(document.getElementById('mt-visc100-result')?.value) || 0;
    const viInput = document.getElementById('mt-vi-result');
    if (!viInput) return;

    if (v40 <= 0 || v100 <= 0) {
      showToast('กรุณาระบุผลลัพธ์ Viscosity 40°C และ 100°C ก่อนคำนวณ VI', 'warning');
      return;
    }

    let L, H;
    if (v100 > 70) {
      L = 1.0152 * Math.pow(v100, 2) + 28.24 * v100 - 286.3;
      H = 0.5854 * Math.pow(v100, 2) + 15.00 * v100 - 94.65;
    } else {
      L = 0.8353 * Math.pow(v100, 2) + 14.67 * v100 - 216.0;
      H = 0.1684 * Math.pow(v100, 2) + 11.85 * v100 - 97.0;
      if (L < 0) L = 0.8353 * Math.pow(v100, 2) + 14.67 * v100;
      if (H < 0) H = 0.1684 * Math.pow(v100, 2) + 11.85 * v100;
    }

    let vi = 0;
    if (v40 <= H) {
      const N = (Math.log10(H) - Math.log10(v40)) / Math.log10(v100);
      vi = ((Math.pow(10, N) - 1) / 0.00715) + 100;
    } else {
      vi = ((L - v40) / (L - H)) * 100;
    }

    const roundedVI = Math.round(vi);
    viInput.value = isNaN(roundedVI) || roundedVI < 0 ? 0 : roundedVI;
    showToast(`คำนวณ Viscosity Index ได้: ${viInput.value}`, 'info');
  }

  function renderSignatureCards(rec) {
    const boxPrep = document.getElementById('sig-box-prepared');
    if (!boxPrep) return;
    const currentUser = state.currentUser || {};
    const role = currentUser.role || '';

    // 1. PREPARED BY
    const imgPrep = document.getElementById('sig-img-prep');
    const namePrep = document.getElementById('sig-name-prep');
    const datePrep = document.getElementById('sig-date-prep');
    const statusPrep = document.getElementById('sig-status-prep');
    const btnPrep = document.getElementById('btn-sign-prep');

    if (rec.prepared_at) {
      boxPrep.classList.add('signed');
      statusPrep.className = 'badge badge-success';
      statusPrep.innerText = 'ลงนามแล้ว';
      imgPrep.innerHTML = rec.prepared_signature_url ? `<img src="${rec.prepared_signature_url}" alt="Prepared Signature">` : '<span style="color:#166534; font-weight:700;">[ลงนามเรียบร้อย]</span>';
      namePrep.innerText = rec.prepared_by_name || '-';
      datePrep.innerText = new Date(rec.prepared_at).toLocaleString('th-TH');
      btnPrep.style.display = 'none';
    } else {
      boxPrep.classList.remove('signed');
      statusPrep.className = 'badge';
      statusPrep.innerText = 'รอดำเนินการ';
      imgPrep.innerHTML = '<span style="font-size: 11px; color: #94a3b8;">(ยังไม่ได้ลงนาม)</span>';
      namePrep.innerText = '-';
      datePrep.innerText = '-';
      btnPrep.style.display = ['base_oil', 'requester', 'admin'].includes(role) ? 'block' : 'none';
    }

    // 2. TEST BY
    const boxTest = document.getElementById('sig-box-tested');
    const imgTest = document.getElementById('sig-img-test');
    const nameTest = document.getElementById('sig-name-test');
    const dateTest = document.getElementById('sig-date-test');
    const statusTest = document.getElementById('sig-status-test');
    const btnTest = document.getElementById('btn-sign-test');

    if (rec.tested_at) {
      boxTest.classList.add('signed');
      statusTest.className = 'badge badge-success';
      statusTest.innerText = 'ทดสอบแล้ว';
      imgTest.innerHTML = rec.tested_signature_url ? `<img src="${rec.tested_signature_url}" alt="Tested Signature">` : '<span style="color:#166534; font-weight:700;">[ลงนามเรียบร้อย]</span>';
      nameTest.innerText = rec.tested_by_name || '-';
      dateTest.innerText = new Date(rec.tested_at).toLocaleString('th-TH');
      btnTest.style.display = 'none';
    } else {
      boxTest.classList.remove('signed');
      statusTest.className = 'badge';
      statusTest.innerText = 'รอดำเนินการ';
      imgTest.innerHTML = '<span style="font-size: 11px; color: #94a3b8;">(ยังไม่ได้ลงนาม)</span>';
      nameTest.innerText = '-';
      dateTest.innerText = '-';
      btnTest.style.display = ['lab', 'admin'].includes(role) ? 'block' : 'none';
    }

    // 3. APPROVED BY
    const boxAppr = document.getElementById('sig-box-approved');
    const imgAppr = document.getElementById('sig-img-appr');
    const nameAppr = document.getElementById('sig-name-appr');
    const dateAppr = document.getElementById('sig-date-appr');
    const statusAppr = document.getElementById('sig-status-appr');
    const btnAppr = document.getElementById('btn-sign-appr');
    const btnRej = document.getElementById('btn-reject-appr');

    if (rec.approved_at) {
      boxAppr.classList.add('signed');
      statusAppr.className = 'badge badge-success';
      statusAppr.innerText = 'อนุมัติแล้ว';
      imgAppr.innerHTML = rec.approved_signature_url ? `<img src="${rec.approved_signature_url}" alt="Approved Signature">` : '<span style="color:#166534; font-weight:700;">[อนุมัติเรียบร้อย]</span>';
      nameAppr.innerText = rec.approved_by_name || '-';
      dateAppr.innerText = new Date(rec.approved_at).toLocaleString('th-TH');
      btnAppr.style.display = 'none';
      btnRej.style.display = 'none';
    } else if (rec.status === 'Rejected') {
      boxAppr.classList.remove('signed');
      statusAppr.className = 'badge badge-danger';
      statusAppr.innerText = 'ปฏิเสธ';
      imgAppr.innerHTML = '<span style="color:#dc2626; font-weight:700;">[ปฏิเสธ/ส่งกลับ]</span>';
      nameAppr.innerText = '-';
      dateAppr.innerText = '-';
      btnAppr.style.display = role === 'admin' ? 'block' : 'none';
      btnRej.style.display = 'none';
    } else {
      boxAppr.classList.remove('signed');
      statusAppr.className = 'badge';
      statusAppr.innerText = 'รอดำเนินการ';
      imgAppr.innerHTML = '<span style="font-size: 11px; color: #94a3b8;">(ยังไม่ได้อนุมัติ)</span>';
      nameAppr.innerText = '-';
      dateAppr.innerText = '-';
      btnAppr.style.display = role === 'admin' ? 'block' : 'none';
      btnRej.style.display = role === 'admin' ? 'block' : 'none';
    }
  }

  function applyMixTankRolePermissions(rec) {
    const role = (state.currentUser && state.currentUser.role) || '';
    const isApproved = rec.status === 'Approved';

    const isLabOrAdmin = ['lab', 'admin'].includes(role);
    const qcFields = ['mt-density-15', 'mt-density-30', 'mt-remark'];
    qcFields.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !isLabOrAdmin || isApproved;
    });

    const statusSelect = document.getElementById('mt-form-status');
    if (statusSelect) {
      statusSelect.disabled = !isLabOrAdmin || isApproved;
    }

    if (isApproved) {
      const allInputs = document.querySelectorAll('#view-mix-tank-form input, #view-mix-tank-form select, #view-mix-tank-form button.btn-danger, #btn-add-topup, #btn-add-discharge, #btn-mix-save-draft, #btn-mix-submit, #btn-mix-save-edit');
      allInputs.forEach(el => { el.disabled = true; });
    }
  }

  async function saveMixTankForm(targetStatus) {
    const tankName = document.getElementById('mt-tank-name')?.value.trim();
    const requestDate = document.getElementById('mt-request-date')?.value;
    const beforeItemVal = document.getElementById('mt-before-item')?.value.trim() || '';
    const afterItemVal = document.getElementById('mt-after-item')?.value.trim() || '';
    const productName = afterItemVal || beforeItemVal || document.getElementById('mt-product-name')?.value?.trim() || currentMixTankRecord?.product_name || '';

    const isDraft = targetStatus === 'Draft';

    if (!tankName) {
      showToast('กรุณากรอกชื่อถังจัดเก็บ (TANK)', 'warning');
      document.getElementById('mt-tank-name')?.focus();
      return;
    }

    if (!requestDate) {
      showToast('กรุณาระบุวันที่ส่งตรวจ (Date)', 'warning');
      document.getElementById('mt-request-date')?.focus();
      return;
    }

    // Strict validation for all required fields when submitting to QC or saving edit
    if (!isDraft) {
      const tuRows = document.querySelectorAll('.topup-item-row');
      const disRows = document.querySelectorAll('.discharge-item-row');
      if (tuRows.length === 0 && disRows.length === 0) {
        showToast('กรุณาเพิ่มรายการเติมเพิ่ม (TOP UP) หรือจ่ายออก (DISCHARGE) อย่างน้อย 1 รายการ', 'warning');
        return;
      }

      for (let i = 0; i < tuRows.length; i++) {
        const r = tuRows[i];
        const itemInput = r.querySelector('.tu-item');
        const lotInput = r.querySelector('.tu-lot');
        const qtyInput = r.querySelector('.tu-qty');
        const supplierInput = r.querySelector('.tu-supplier');
        const vehicleInput = r.querySelector('.tu-vehicle');

        const item = itemInput?.value.trim();
        const lot = lotInput?.value.trim();
        const qtyVal = qtyInput?.value.trim();
        const qty = parseFloat(qtyVal);
        const supplier = supplierInput?.value.trim();
        const vehicle = vehicleInput?.value.trim();

        const rowLabel = tuRows.length > 1 ? ` (แถวที่ ${i + 1})` : '';
        if (!item) {
          showToast(`กรุณากรอก "วัตถุดิบ" ในรายการ TOP UP${rowLabel}`, 'warning');
          itemInput?.focus();
          return;
        }
        if (!lot) {
          showToast(`กรุณากรอก "LOT NO." ในรายการ TOP UP${rowLabel}`, 'warning');
          lotInput?.focus();
          return;
        }
        if (!qtyVal || isNaN(qty) || qty <= 0) {
          showToast(`กรุณากรอก "QUANTITY (MT)" ให้ถูกต้องในรายการ TOP UP${rowLabel}`, 'warning');
          qtyInput?.focus();
          return;
        }
        if (!supplier) {
          showToast(`กรุณากรอก "ลูกค้า" ในรายการ TOP UP${rowLabel}`, 'warning');
          supplierInput?.focus();
          return;
        }
        if (!vehicle) {
          showToast(`กรุณากรอก "ทะเบียนรถ/เรือ" ในรายการ TOP UP${rowLabel}`, 'warning');
          vehicleInput?.focus();
          return;
        }
      }

      // DISCHARGE validation: ONLY quantity is required as explicitly specified
      for (let i = 0; i < disRows.length; i++) {
        const dr = disRows[i];
        const qtyInput = dr.querySelector('.dis-qty');
        const qtyVal = qtyInput?.value.trim();
        const qty = parseFloat(qtyVal);
        const rowLabel = disRows.length > 1 ? ` (แถวที่ ${i + 1})` : '';
        if (!qtyVal || isNaN(qty) || qty <= 0) {
          showToast(`กรุณากรอก "QUANTITY (MT)" ให้ถูกต้องในรายการจ่ายออก (DISCHARGE)${rowLabel}`, 'warning');
          qtyInput?.focus();
          return;
        }
      }

      // Check BEFORE row
      const beforeItemInput = document.getElementById('mt-before-item');
      const beforeLotInput = document.getElementById('mt-before-lot');
      const beforeQtyInput = document.getElementById('mt-before-qty');
      const beforeSupplierInput = document.getElementById('mt-before-supplier');

      const bItem = beforeItemInput?.value.trim();
      const bLot = beforeLotInput?.value.trim();
      const bQtyVal = beforeQtyInput?.value.trim();
      const bQty = parseFloat(bQtyVal);
      const bSupplier = beforeSupplierInput?.value.trim();

      if (!bItem) {
        showToast('กรุณากรอก "วัตถุดิบ" ในแถว BEFORE', 'warning');
        beforeItemInput?.focus();
        return;
      }
      if (!bLot) {
        showToast('กรุณากรอก "LOT NO." ในแถว BEFORE', 'warning');
        beforeLotInput?.focus();
        return;
      }
      if (!bQtyVal || isNaN(bQty) || bQty < 0) {
        showToast('กรุณากรอก "QUANTITY (MT)" ในแถว BEFORE', 'warning');
        beforeQtyInput?.focus();
        return;
      }
      if (!bSupplier) {
        showToast('กรุณากรอก "ลูกค้า" ในแถว BEFORE', 'warning');
        beforeSupplierInput?.focus();
        return;
      }

      // Check AFTER row
      const afterItemInput = document.getElementById('mt-after-item');
      const afterLotInput = document.getElementById('mt-after-lot');
      const afterSupplierInput = document.getElementById('mt-after-supplier');

      const aItem = afterItemInput?.value.trim();
      const aLot = afterLotInput?.value.trim();
      const aSupplier = afterSupplierInput?.value.trim();

      if (!aItem) {
        showToast('กรุณากรอก "วัตถุดิบ" ในแถว AFTER', 'warning');
        afterItemInput?.focus();
        return;
      }
      if (!aLot) {
        showToast('กรุณากรอก "LOT NO." ในแถว AFTER', 'warning');
        afterLotInput?.focus();
        return;
      }
      if (!aSupplier) {
        showToast('กรุณากรอก "ลูกค้า" ในแถว AFTER', 'warning');
        afterSupplierInput?.focus();
        return;
      }
    }

    showLoading();
    try {
      const topUpItems = [];
      const allRows = document.querySelectorAll('#mt-topup-tbody tr');
      allRows.forEach(r => {
        if (r.classList.contains('discharge-item-row')) {
          const qty = parseFloat(r.querySelector('.dis-qty')?.value) || 0;
          if (qty > 0) {
            topUpItems.push({
              type: 'DISCHARGE',
              item: '(จ่ายออก)',
              lot_no: '-',
              quantity: qty,
              unit: 'MT',
              supplier: '-',
              vehicle: '-'
            });
          }
        } else if (r.classList.contains('topup-item-row')) {
          const item = r.querySelector('.tu-item')?.value.trim();
          const lot = r.querySelector('.tu-lot')?.value.trim();
          const qty = parseFloat(r.querySelector('.tu-qty')?.value) || 0;
          const supplier = r.querySelector('.tu-supplier')?.value.trim();
          const vehicle = r.querySelector('.tu-vehicle')?.value.trim();
          if (item || lot || qty > 0) {
            topUpItems.push({
              type: 'TOP UP',
              item,
              lot_no: lot,
              quantity: qty,
              unit: 'MT',
              supplier,
              vehicle
            });
          }
        }
      });

      const beforeItem = {
        item: document.getElementById('mt-before-item')?.value.trim() || productName,
        lot_no: document.getElementById('mt-before-lot')?.value.trim(),
        quantity: parseFloat(document.getElementById('mt-before-qty')?.value) || 0,
        unit: 'MT',
        supplier: document.getElementById('mt-before-supplier')?.value.trim()
      };

      const afterItemName = document.getElementById('mt-after-item')?.value.trim() || '';
      const afterLot = document.getElementById('mt-after-lot')?.value.trim() || '';
      const afterSupplier = document.getElementById('mt-after-supplier')?.value.trim() || '';

      const afterItem = {
        item: afterItemName || productName,
        lot_no: afterLot,
        quantity: parseFloat(document.getElementById('mt-after-qty')?.value) || 0,
        unit: 'MT',
        supplier: afterSupplier || ''
      };

      const finalProductName = afterItem.item || productName;
      const finalCustomer = afterSupplier || document.getElementById('mt-customer')?.value?.trim() || currentMixTankRecord?.customer || '';
      const finalBatchNo = afterLot || currentMixTankRecord?.batch_number || undefined;

      const payload = {
        id: currentMixTankRecord?.id || undefined,
        doc_no: document.getElementById('mt-doc-no')?.value.trim() || undefined,
        to_dept: document.getElementById('mt-to-dept')?.value.trim() || 'QC',
        prepared_by_name: document.getElementById('mt-requester-name')?.value.trim() || (state.currentUser ? state.currentUser.display_name : ''),
        prepared_by_id: state.currentUser ? state.currentUser.id : (currentMixTankRecord?.prepared_by_id || undefined),
        created_by: document.getElementById('mt-requester-name')?.value.trim() || (state.currentUser ? state.currentUser.display_name : ''),
        created_by_id: state.currentUser ? state.currentUser.id : (currentMixTankRecord?.created_by_id || undefined),
        customer: finalCustomer,
        batch_number: finalBatchNo,
        tank_name: tankName,
        request_date: requestDate,
        product_name: finalProductName,
        status: targetStatus || currentMixTankRecord?.status || 'Draft',
        top_up_items: topUpItems,
        before_item: beforeItem,
        after_item: afterItem,
        density_15: document.getElementById('mt-density-15')?.value.trim() || null,
        density_30: document.getElementById('mt-density-30')?.value.trim() || null,
        remark: document.getElementById('mt-remark')?.value.trim() || null
      };

      const saved = await window.DB.saveMixTankRequest(payload);
      currentMixTankRecord = saved;
      // Reset filters so newly created record shows up in table
      if (state.mixTankFilters) {
        state.mixTankFilters.docNo = '';
        state.mixTankFilters.tank = '';
        state.mixTankFilters.product = '';
        state.mixTankFilters.status = '';
        state.mixTankFilters.startDate = '';
        state.mixTankFilters.endDate = '';
        state.mixTankFilters.page = 1;
      }
      showToast(targetStatus === 'Pending QC' ? 'ส่งตรวจห้องปฏิบัติการ QC สำเร็จแล้ว' : 'บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
      navigate('mix-tank');
    } catch (e) {
      console.error('saveMixTankForm error:', e);
      showToast('เกิดข้อผิดพลาดในการบันทึก: ' + e.message, 'error');
    } finally {
      hideLoading();
    }
  }

  async function saveMixTankEdit() {
    const statusSelect = document.getElementById('mt-form-status');
    let targetStatus = statusSelect ? statusSelect.value : (currentMixTankRecord?.status || 'Pending');
    if (targetStatus === 'Pending') targetStatus = 'Pending QC';
    else if (targetStatus === 'Complete') targetStatus = 'Pending Approval';
    await saveMixTankForm(targetStatus);
  }

  let isApprovingMixTank = false;

  async function approveMixTank() {
    if (!currentMixTankRecord || !currentMixTankRecord.id) {
      showToast('ไม่พบข้อมูลใบตรวจ Mix Tank', 'error');
      return;
    }
    if (isApprovingMixTank) return;

    // Check if QC results are present
    const hasDensity = !!(currentMixTankRecord.density_15 || currentMixTankRecord.density_30);
    if (!hasDensity && currentMixTankRecord.status !== 'Complete' && currentMixTankRecord.status !== 'Pending Approval') {
      showToast('ไม่สามารถอนุมัติได้ เนื่องจากยังไม่มีผลการตรวจสอบ QC', 'warning');
      const msgEl = document.getElementById('mt-approval-validation-msg');
      if (msgEl) {
        msgEl.innerText = 'ไม่สามารถอนุมัติได้ เนื่องจากยังไม่ได้บันทึกผลการทดสอบ QC';
        msgEl.style.display = 'block';
      }
      return;
    }

    if (!confirm('ยืนยันการอนุมัติใบตรวจ Mix Tank นี้หรือไม่?\nหลังอนุมัติ จะไม่สามารถแก้ไขข้อมูลได้')) return;

    isApprovingMixTank = true;
    const btnTop = document.getElementById('btn-mt-detail-approve');
    if (btnTop) { btnTop.disabled = true; btnTop.innerText = 'กำลังอนุมัติ...'; }

    try {
      const currentUser = state.currentUser || {};
      let signatureUrl = '';
      try {
        signatureUrl = await window.DB.getUserSignature(currentUser.id);
      } catch (e) {
        console.warn('Could not fetch user signature for approval:', e);
      }

      await window.DB.signMixTank(currentMixTankRecord.id, 'approved', {
        name: currentUser.display_name || 'Admin/Lab',
        userId: currentUser.id || null,
        signatureUrl: signatureUrl || ''
      });

      showToast('อนุมัติเอกสารสำเร็จ สถานะเปลี่ยนเป็น Approved', 'success');
      await loadMixTankDetailInPane(currentMixTankRecord.id);
      await loadMixTankList();
    } catch (e) {
      console.error('approveMixTank error:', e);
      showToast('ไม่สามารถอนุมัติได้: ' + e.message, 'error');
    } finally {
      isApprovingMixTank = false;
      if (btnTop) {
        btnTop.disabled = false;
        btnTop.innerHTML = '<i data-lucide="check-circle"></i> Approve';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  async function rejectMixTankFromDetail() {
    if (!currentMixTankRecord || !currentMixTankRecord.id) {
      showToast('ไม่พบข้อมูลใบตรวจ Mix Tank', 'error');
      return;
    }
    if (isApprovingMixTank) return;

    const reason = prompt('กรุณาระบุเหตุผลในการ Reject (หรือกดตกลงหากไม่ต้องการระบุ):', '');
    if (reason === null) return; // User cancelled

    if (!confirm('คุณต้องการ Reject ใบตรวจ Mix Tank นี้ใช่หรือไม่?')) return;

    isApprovingMixTank = true;
    const btnTop = document.getElementById('btn-mt-detail-reject');
    if (btnTop) { btnTop.disabled = true; btnTop.innerText = 'กำลังปฏิเสธ...'; }

    try {
      const currentUser = state.currentUser || {};
      await window.DB.signMixTank(currentMixTankRecord.id, 'rejected', {
        name: currentUser.display_name || 'Admin/Lab',
        userId: currentUser.id || null,
        reason: reason || ''
      });

      showToast('Reject ใบตรวจ Mix Tank เรียบร้อยแล้ว', 'success');
      await loadMixTankDetailInPane(currentMixTankRecord.id);
      await loadMixTankList();
    } catch (e) {
      console.error('rejectMixTank error:', e);
      showToast('ไม่สามารถ Reject ได้: ' + e.message, 'error');
    } finally {
      isApprovingMixTank = false;
      if (btnTop) {
        btnTop.disabled = false;
        btnTop.innerHTML = '<i data-lucide="x-circle"></i> Reject';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  async function reopenMixTank() {
    if (!currentMixTankRecord || !currentMixTankRecord.id) return;
    if (isApprovingMixTank) return;

    if (!confirm('ยืนยันการยกเลิกการอนุมัติ (Reopen) หรือไม่?\nสถานะจะกลับเป็น Complete และสามารถแก้ไขข้อมูลได้อีกครั้ง')) return;

    isApprovingMixTank = true;
    try {
      await window.DB.reopenMixTank(currentMixTankRecord.id);
      showToast('Reopen เอกสารสำเร็จ', 'success');
      await loadMixTankDetailInPane(currentMixTankRecord.id);
      await loadMixTankList();
    } catch (e) {
      console.error('reopenMixTank error:', e);
      showToast('ไม่สามารถ Reopen ได้: ' + e.message, 'error');
    } finally {
      isApprovingMixTank = false;
    }
  }


  async function signMixTankTier(tier) {
    if (!currentMixTankRecord || !currentMixTankRecord.id) {
      showToast('กรุณาบันทึกข้อมูลแบบร่างก่อนลงนาม', 'warning');
      return;
    }

    const currentUser = state.currentUser;
    if (!currentUser) {
      showToast('กรุณาเข้าสู่ระบบก่อนทำการลงนาม', 'warning');
      return;
    }

    showLoading();
    try {
      let signatureUrl = '';
      try {
        // 1. Direct query user signature from user_signatures
        signatureUrl = await window.DB.getUserSignature(currentUser.id);

        // 2. Fallback to all signatures
        if (!signatureUrl) {
          const sigs = await window.DB.getSignatures();
          const mySig = (sigs || []).find(s => s.id === currentUser.id || s.user_id === currentUser.id);
          if (mySig && mySig.signature_url) {
            signatureUrl = mySig.signature_url;
          } else if (tier === 'tested' || tier === 'approved') {
            // If current user is lab staff or admin, look for any available registered lab signature
            const labSig = (sigs || []).find(s => s.signature_url && (s.role === 'lab' || s.role === 'admin'));
            if (labSig) signatureUrl = labSig.signature_url;
          }
        }
      } catch (e) {
        console.warn('Could not auto-fetch signature:', e);
      }

      if (!signatureUrl) {
        showToast('ไม่พบลายเซ็นของคุณในระบบ กรุณาให้ Admin อัปโหลดลายเซ็นในระบบก่อน', 'warning');
      }

      const updated = await window.DB.signMixTank(currentMixTankRecord.id, tier, {
        userId: currentUser.id,
        name: currentUser.display_name,
        signatureUrl: signatureUrl || ''
      });
      currentMixTankRecord = updated;
      populateMixTankFormUI(updated);
      showToast(`ลงนามรับรอง ${tier.toUpperCase()} สำเร็จ`, 'success');
      loadMixTankList();
    } catch (e) {
      console.error('signMixTankTier error:', e);
      showToast('เกิดข้อผิดพลาดในการลงนาม: ' + e.message, 'error');
    } finally {
      hideLoading();
    }
  }

  async function rejectMixTank() {
    if (!currentMixTankRecord || !currentMixTankRecord.id) return;
    const reason = prompt('ระบุเหตุผลในการปฏิเสธ / สั่งแก้ไข:');
    if (reason === null) return;

    showLoading();
    try {
      const updated = await window.DB.signMixTank(currentMixTankRecord.id, 'rejected', { reason: reason });
      currentMixTankRecord = updated;
      populateMixTankFormUI(updated);
      showToast('ส่งกลับ/ปฏิเสธใบตรวจเรียบร้อยแล้ว', 'info');
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    } finally {
      hideLoading();
    }
  }

  async function deleteMixTankRecord(id) {
    if (!confirm('ยืนยันการลบใบตรวจ Mix Tank นี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้')) return;
    showLoading();
    try {
      await window.DB.deleteMixTank(id);
      showToast('ลบรายการสำเร็จแล้ว', 'success');
      loadMixTankList();
    } catch (e) {
      showToast('เกิดข้อผิดพลาดในการลบ: ' + e.message, 'error');
    } finally {
      hideLoading();
    }
  }

  function printMixTankCurrent() {
    if (currentMixTankRecord && currentMixTankRecord.id) {
      printMixTank(currentMixTankRecord.id);
    }
  }

  async function printMixTank(id) {
    showToast('กำลังเตรียมเอกสาร MIXED STORAGE TANK สำหรับการพิมพ์...', 'info');
    try {
      const rec = await window.DB.getMixTankDetail(id);
      if (!rec) throw new Error('ไม่พบข้อมูลเอกสาร');

      const formatDateOnly = (dStr) => {
        if (!dStr) return '';
        try {
          const d = new Date(dStr);
          if (isNaN(d.getTime())) return dStr;
          return d.toLocaleDateString('th-TH');
        } catch (e) {
          return dStr;
        }
      };

      const formatDateTime = (dStr) => {
        if (!dStr) return '';
        try {
          const d = new Date(dStr);
          if (isNaN(d.getTime())) return dStr;
          const datePart = d.toLocaleDateString('th-TH');
          const hours = String(d.getHours()).padStart(2, '0');
          const minutes = String(d.getMinutes()).padStart(2, '0');
          return `${datePart} เวลา ${hours}:${minutes} น.`;
        } catch (e) {
          return dStr;
        }
      };

      const beforeQty = (rec.before_item && parseFloat(rec.before_item.quantity)) || 0;
      const items = rec.top_up_items || [];
      let topUpTotal = 0;
      let dischargeTotal = 0;
      items.forEach(t => {
        const q = parseFloat(t.quantity) || 0;
        if (t.type === 'DISCHARGE') {
          dischargeTotal += q;
        } else {
          topUpTotal += q;
        }
      });
      const afterQty = (rec.after_item && parseFloat(rec.after_item.quantity)) || (beforeQty + topUpTotal - dischargeTotal);

      let topUpRowsHtml = '';
      if (items.length > 0) {
        topUpRowsHtml = items.map((t) => {
          const isDischarge = t.type === 'DISCHARGE';
          const qty = parseFloat(t.quantity) || 0;
          if (isDischarge) {
            return `
              <tr>
                <td style="border: 1px solid #000000; text-align: center; font-weight: 700; padding: 4px 6px;">DISCHARGE (-)</td>
                <td style="border: 1px solid #000000; padding: 4px 6px; font-style: italic;">(จ่ายออก)</td>
                <td style="border: 1px solid #000000; text-align: center; padding: 4px 6px;">-</td>
                <td style="border: 1px solid #000000; text-align: right; padding: 4px 6px; font-weight: 700;">-${qty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style="border: 1px solid #000000; text-align: center; padding: 4px 6px;">-</td>
                <td style="border: 1px solid #000000; text-align: center; padding: 4px 6px;">-</td>
              </tr>
            `;
          } else {
            return `
              <tr>
                <td style="border: 1px solid #000000; text-align: center; font-weight: 700; padding: 4px 6px;">TOP UP</td>
                <td style="border: 1px solid #000000; padding: 4px 6px;">${escapeHtml(t.item || rec.product_name || '-')}</td>
                <td style="border: 1px solid #000000; text-align: center; padding: 4px 6px;">${escapeHtml(t.lot_no || '-')}</td>
                <td style="border: 1px solid #000000; text-align: right; padding: 4px 6px; font-weight: 600;">+${qty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style="border: 1px solid #000000; padding: 4px 6px;">${escapeHtml(t.supplier || '-')}</td>
                <td style="border: 1px solid #000000; padding: 4px 6px;">${escapeHtml(t.vehicle || t.remark || '')}</td>
              </tr>
            `;
          }
        }).join('');
      } else {
        topUpRowsHtml = `
          <tr>
            <td style="border: 1px solid #000000; text-align: center; width: 85px; font-weight: 700;">TOP UP</td>
            <td colspan="5" style="border: 1px solid #000000; text-align: center; color: #555555; padding: 6px; font-style: italic;">ไม่มีรายการเติมเพิ่ม / จ่ายออก</td>
          </tr>
        `;
      }

      const printHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MIX_TANK_${escapeHtml(rec.doc_no || 'REPORT')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,600&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 10mm 12mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Sarabun', -apple-system, sans-serif;
      font-size: 11.5px;
      color: #000000;
      margin: 0;
      padding: 0;
      line-height: 1.4;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .doc-container {
      width: 100%;
      margin: 0 auto;
    }

    /* 1. Formal Document Header */
    .iso-header-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000000;
      margin-bottom: 6px;
    }
    .iso-header-table td {
      border: 1px solid #000000;
      padding: 6px 8px;
    }

    /* 2. Info Summary Table */
    .info-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000000;
      margin-bottom: 8px;
    }
    .info-table td {
      padding: 4px 8px;
      border: 1px solid #000000;
      font-size: 11px;
    }

    /* Section Heading */
    .section-heading {
      font-size: 11px;
      font-weight: 700;
      color: #000000;
      margin: 8px 0 4px 0;
      text-transform: uppercase;
    }

    /* 3. Volume Table */
    .volume-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      border: 1px solid #000000;
    }
    .volume-table th, .volume-table td {
      border: 1px solid #000000;
      padding: 4px 6px;
      font-size: 11px;
    }
    .volume-table th {
      background-color: #f2f2f2;
      color: #000000;
      font-weight: 700;
      text-align: center;
      font-size: 10.5px;
    }

    /* 4. QC Results Box */
    .qc-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000000;
      margin-bottom: 8px;
    }
    .qc-table td {
      border: 1px solid #000000;
      padding: 6px 10px;
      font-size: 11.5px;
      vertical-align: middle;
    }

    /* 5. 2 Signature Boxes */
    .sig-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000000;
      margin-top: 10px;
    }
    .sig-table td {
      width: 50%;
      border: 1px solid #000000;
      padding: 8px 12px;
      vertical-align: top;
      background: #ffffff;
    }
    .sig-header {
      font-size: 11px;
      font-weight: 700;
      color: #000000;
      border-bottom: 1px solid #000000;
      padding-bottom: 4px;
      margin-bottom: 6px;
      text-transform: uppercase;
    }
    .sig-content {
      height: 52px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .sig-img {
      max-height: 48px;
      max-width: 150px;
      object-fit: contain;
    }
    .sig-footer {
      text-align: center;
      border-top: 1px dotted #000000;
      margin-top: 6px;
      padding-top: 4px;
      font-size: 10.5px;
      color: #000000;
    }
  </style>
</head>
<body>
  <div class="doc-container">

    <!-- 1. Formal Document Header -->
    <table class="iso-header-table">
      <tr>
        <td style="width: 35%; vertical-align: middle;">
          <div style="font-size: 14px; font-weight: 800; color: #000000; line-height: 1.2;">บริษัท เอสเอฟซี เอกเซลเล้นซ์ จำกัด</div>
          <div style="font-size: 11px; font-weight: 700; color: #333333;">SFC EXCELLENCE CO., LTD.</div>
        </td>
        <td style="width: 40%; text-align: center; vertical-align: middle;">
          <div style="font-size: 15px; font-weight: 800; color: #000000; line-height: 1.2;">MIXED STORAGE TANK</div>
        </td>
        <td style="width: 25%; vertical-align: middle; text-align: right;">
          <div style="font-size: 11px; color: #000000; margin-bottom: 3px;"><strong>เลขที่เอกสาร:</strong> ${escapeHtml(rec.doc_no || '-')}</div>
          <div style="font-size: 11px; color: #000000;"><strong>วันที่ส่งตรวจ:</strong> ${escapeHtml(formatDateOnly(rec.request_date) || '-')}</div>
        </td>
      </tr>
    </table>

    <!-- 2. Tank & Product Information Summary Table -->
    <table class="info-table">
      <tr>
        <td style="width: 25%; font-weight: 700;">ชื่อถังจัดเก็บ (TANK):</td>
        <td style="width: 25%; font-weight: 800;">${escapeHtml(rec.tank_name || '-')}</td>
        <td style="width: 25%; font-weight: 700;">ส่งถึงแผนก (TO DEPT):</td>
        <td style="width: 25%;">${escapeHtml(rec.to_dept || 'QC')}</td>
      </tr>
      <tr>
        <td style="font-weight: 700;">ผลิตภัณฑ์ (PRODUCT):</td>
        <td>${escapeHtml(rec.product_name || (rec.after_item && rec.after_item.item) || '-')}</td>
        <td style="font-weight: 700;">ลูกค้า (CUSTOMER):</td>
        <td>${escapeHtml((rec.after_item && rec.after_item.supplier) || rec.customer || '-')}</td>
      </tr>
    </table>

    <!-- 3. Volume Tracking Table -->
    <div class="section-heading">1. ตารางบันทึกปริมาณเนื้อน้ำมัน (TANK VOLUME TRACKING)</div>
    <table class="volume-table">
      <thead>
        <tr>
          <th style="width: 85px;">ประเภท</th>
          <th>วัตถุดิบ</th>
          <th style="width: 110px;">LOT NO.</th>
          <th style="width: 105px;">QUANTITY (MT)</th>
          <th>ลูกค้า</th>
          <th>ทะเบียนรถ/เรือ</th>
        </tr>
      </thead>
      <tbody>
        <!-- BEFORE Row -->
        <tr>
          <td style="border: 1px solid #000000; text-align: center; font-weight: 700;">BEFORE</td>
          <td style="border: 1px solid #000000; padding: 4px 6px;">${escapeHtml((rec.before_item && rec.before_item.item) || rec.product_name || '-')}</td>
          <td style="border: 1px solid #000000; text-align: center; padding: 4px 6px;">${escapeHtml((rec.before_item && rec.before_item.lot_no) || '-')}</td>
          <td style="border: 1px solid #000000; text-align: right; padding: 4px 6px; font-weight: 700;">${beforeQty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="border: 1px solid #000000; padding: 4px 6px;">${escapeHtml((rec.before_item && rec.before_item.supplier) || '-')}</td>
          <td style="border: 1px solid #000000; padding: 4px 6px;">${escapeHtml((rec.before_item && (rec.before_item.remark || rec.before_item.vehicle)) || '')}</td>
        </tr>

        <!-- TOP UP Rows -->
        ${topUpRowsHtml}

        <!-- AFTER Row -->
        <tr style="font-weight: 700; background-color: #fafafa;">
          <td style="border: 1px solid #000000; text-align: center;">AFTER</td>
          <td style="border: 1px solid #000000; padding: 4px 6px;">${escapeHtml((rec.after_item && rec.after_item.item) || rec.product_name || '-')}</td>
          <td style="border: 1px solid #000000; text-align: center; padding: 4px 6px; font-weight: 800;">${escapeHtml((rec.after_item && rec.after_item.lot_no) || '-')}</td>
          <td style="border: 1px solid #000000; text-align: right; padding: 4px 6px; font-size: 12px; font-weight: 800;">${afterQty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="border: 1px solid #000000; padding: 4px 6px;">${escapeHtml((rec.after_item && rec.after_item.supplier) || rec.customer || '-')}</td>
          <td style="border: 1px solid #000000; padding: 4px 6px;">${escapeHtml((rec.after_item && (rec.after_item.remark || rec.after_item.vehicle)) || '')}</td>
        </tr>
      </tbody>
    </table>

    <!-- 4. Laboratory QC Results -->
    <div class="section-heading">2. ผลการวิเคราะห์ทางห้องปฏิบัติการ (LABORATORY QC RESULTS)</div>
    <table class="qc-table">
      <tr>
        <td style="width: 50%;">
          <strong>Density 15°C :</strong> ${escapeHtml(rec.density_15 || '-')}
        </td>
        <td style="width: 50%;">
          <strong>Density 30°C :</strong> ${escapeHtml(rec.density_30 || '-')}
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <strong>หมายเหตุ (Remark) :</strong> ${escapeHtml(rec.remark || '')}
        </td>
      </tr>
    </table>

    <!-- 5. 2 Signatures Table (Prepared By & Approved By, Date Only) -->
    <div class="section-heading">3. การลงนามกำกับและอนุมัติเอกสาร (APPROVALS & SIGNATURES)</div>
    <table class="sig-table">
      <tr>
        <!-- 1. PREPARED BY -->
        <td>
          <div class="sig-header">
            1. ผู้แจ้งตรวจ (PREPARED BY)
          </div>
          <div class="sig-content">
            ${rec.prepared_signature_url ? `<img src="${rec.prepared_signature_url}" class="sig-img" alt="Prepared Signature">` : (rec.prepared_by_name ? `<span style="font-weight: 700;">${escapeHtml(rec.prepared_by_name)}</span>` : '<span style="color:#888888; font-style:italic;">(ยังไม่ได้ลงนาม)</span>')}
          </div>
          <div class="sig-footer">
            (${rec.prepared_by_name ? escapeHtml(rec.prepared_by_name) : '..........................................................'})<br>
            <span>${(rec.created_at || rec.prepared_at) ? 'วันที่: ' + formatDateOnly(rec.created_at || rec.prepared_at) : 'วันที่ ...../...../..........'}</span>
          </div>
        </td>

        <!-- 2. APPROVED BY -->
        <td>
          <div class="sig-header">
            2. ผู้อนุมัติ (APPROVED BY)
          </div>
          <div class="sig-content">
            ${rec.approved_signature_url ? `<img src="${rec.approved_signature_url}" class="sig-img" alt="Approved Signature">` : (rec.approved_by_name ? `<span style="font-weight: 700;">${escapeHtml(rec.approved_by_name)}</span>` : '<span style="color:#888888; font-style:italic;">(ยังไม่ได้อนุมัติ)</span>')}
          </div>
          <div class="sig-footer">
            (${rec.approved_by_name ? escapeHtml(rec.approved_by_name) : '..........................................................'})<br>
            <span>${rec.approved_at ? 'วันที่: ' + formatDateOnly(rec.approved_at) : 'วันที่ ...../...../..........'}</span>
          </div>
        </td>
      </tr>
    </table>

  </div>
</body>
</html>`;

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
      doc.write(printHtml);
      doc.close();

      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 3000);
      }, 600);
    } catch (e) {
      console.error('printMixTank error:', e);
      showToast('เกิดข้อผิดพลาดในการเตรียมพิมพ์: ' + e.message, 'error');
    }
  }

  return {
    setRequestsPage,
    setRequestsPageSize,
    setHistoryPage,
    setHistoryPageSize,
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
    editCurrentRequest,
    handleRequestFormSubmit,
    handleRequestFormBack,
    handleRequestFormCancel,
    testNotificationSound,
    toggleNotificationPanel: (e) => NotificationService.togglePanel(e),
    markAllNotificationsAsRead: () => NotificationService.markAllAsRead(),
    handleNotificationClick: (id, type, reqId) => NotificationService.handleItemClick(id, type, reqId),
    NotificationService,
    NotificationAudioService,
    openStickerPreview,
    openStickerPreviewDirect,
    closeStickerModal,
    updateStickerPreviewDate,
    updateStickerPreviewReason,
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
    signCurrentRequest,
    clearAndReimportHistoricalData,
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
    clearSampleData,
    openChangeOwnPasswordModal,
    closeChangeOwnPasswordModal,
    togglePwdVisibility,
    handleChangeOwnPasswordSubmit,
    openChangePasswordModal,
    closeChangeRoleModal,
    openChangeRoleModal,
    handleChangeRoleSubmit,
    closeChangePasswordModal,
    handleChangePasswordSubmit,
    deleteUserAccount,
    openConfigModal,
    closeConfigModal,
    saveDatabaseConfig,
    handleConfigModeChange,
    handleImportExcel,
    handleImportClick,
    exportRequestsExcel,
    openExportModal,
    closeExportModal,
    handleExportSubmit,
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
    deleteEditRequest,
    togglePushNotification,
    checkPushSubscriptionStatus,
    showNotesAlertModal,
    closeNotesAlertModal,
    loadSettingsView,
    loadMixTankList,
    openMixTankFilterModal,
    loadMixTankDetailInPane,
    saveMixTankQCFromDetail,
    signMixTankTierFromDetail,
    rejectMixTankFromDetail,
    printMixTankCurrentFromDetail,
    editCurrentMixTankFromDetail,
    deleteCurrentMixTankFromDetail,
    closeMixTankFilterModal,
    handleMixTankFilterSubmit,
    resetMixTankFilters,
    setMixTankPage,
    setMixTankPageSize,
    prepareMixTankForm,
    addMixTankTopUpRow,
    removeMixTankTopUpRow,
    addMixTankDischargeRow,
    removeMixTankDischargeRow,
    recalculateMixTankTotals,
    recalculateViscosity,
    calculateMixTankVI,
    saveMixTankForm,
    saveMixTankEdit,
    approveMixTank,
    rejectMixTankFromDetail,
    reopenMixTank,
    signMixTankTier,
    rejectMixTank,
    deleteMixTankRecord,
    printMixTank,
    printMixTankCurrent,
    openManualHistoricalModal,
    closeManualHistoricalModal,
    handleManualHistoricalSubmit
  };
})();
window.App = App;
