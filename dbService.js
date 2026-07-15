// DATABASE SERVICE LAYER
// Implements dual-mode database access: Local Mock (localStorage) and Supabase client.

(function () {
  // --- HELPERS FOR LOCAL STORAGE DB ---
  const LOCAL_USERS_KEY = 'lrms_local_users';
  const LOCAL_REQUESTS_KEY = 'lrms_local_requests';
  const LOCAL_ITEMS_KEY = 'lrms_local_items';
  const LOCAL_SESSION_KEY = 'lrms_local_session';

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Pre-seeded database values
  const defaultUsers = [
    { id: 'u-admin-1', username: 'admin', password: 'admin1234', display_name: 'สมชาย แอดมิน (ฝ่ายควบคุมคุณภาพ)', role: 'admin', created_at: new Date('2026-01-01T08:00:00Z').toISOString() },
    { id: 'u-req-1', username: 'requester', password: 'req1234', display_name: 'วิชัย ผู้แจ้ง (ฝ่ายผลิต)', role: 'requester', created_at: new Date('2026-01-01T08:30:00Z').toISOString() },
    { id: 'u-req-2', username: 'requester2', password: 'req1234', display_name: 'อนันต์ ผู้แจ้ง2 (ฝ่ายคลังสินค้า)', role: 'requester', created_at: new Date('2026-01-02T09:00:00Z').toISOString() }
  ];

  const defaultRequests = [
    {
      id: 'r-1',
      request_no: 1,
      request_year: 2026,
      request_date: '2026-05-15',
      request_time: '09:30:00',
      customer_name: 'บริษัท ลูบริแคนท์ จำกัด',
      requester_id: 'u-req-1',
      car_plate: '1กข 1234 กรุงเทพฯ',
      seal_no: 'SL-009988',
      container_no: 'CONT-9922',
      notes: 'ตรวจสอบด่วน สำหรับงานด่วนลูกค้าในนิคม',
      lab_comments: 'ผลการทดสอบความหนืดและค่าดัชนีความหนืด (Viscosity Index) อยู่ในเกณฑ์มาตรฐานตามเอกสารแนบ',
      status: 'Completed',
      created_at: new Date('2026-05-15T09:30:00Z').toISOString()
    },
    {
      id: 'r-2',
      request_no: 2,
      request_year: 2026,
      request_date: '2026-06-01',
      request_time: '10:15:00',
      customer_name: 'โรงงานอุตสาหกรรมภาคใต้',
      requester_id: 'u-req-1',
      car_plate: '82-9988 ชลบุรี',
      seal_no: 'SL-009989',
      container_no: 'CONT-9923',
      notes: 'เก็บตัวอย่างจากรถบรรทุกหน้าโรงงานก่อนถ่ายน้ำมันเข้าถังพัก',
      lab_comments: 'จาระบีรายการที่ 2 กำลังตรวจสอบความสม่ำเสมอของเนื้อ (Consistency Test)',
      status: 'Pending',
      created_at: new Date('2026-06-01T10:15:00Z').toISOString()
    },
    {
      id: 'r-3',
      request_no: 3,
      request_year: 2026,
      request_date: '2026-06-04',
      request_time: '14:00:00',
      customer_name: 'บริษัท ซุปเปอร์เพาเวอร์ เทรดดิ้ง',
      requester_id: 'u-req-2',
      car_plate: '70-5544 ระยอง',
      seal_no: 'SL-009990',
      container_no: 'CONT-9924',
      notes: 'สินค้านำเข้า ตรวจสอบสิ่งเจือปนและตะกอนก้นถัง',
      lab_comments: 'ตรวจพบตะกอนปนเปื้อนเกินมาตรฐาน 0.05% ไม่อนุมัติให้ทำรายการรับสินค้า',
      status: 'Completed',
      created_at: new Date('2026-06-04T14:00:00Z').toISOString()
    }
  ];

  const defaultItems = [
    { id: 'i-1', request_id: 'r-1', product_name: 'Hydraulic Oil AW 68', batch_number: 'B-260510-1', quantity: '10 Drums', rm_no: 'RM-HYD-01', test_result: 'Pass', created_at: new Date('2026-05-15T09:31:00Z').toISOString() },
    { id: 'i-2', request_id: 'r-1', product_name: 'Engine Oil 10W-30', batch_number: 'B-260512-2', quantity: '20 Drums', rm_no: 'RM-ENG-02', test_result: 'Pass', created_at: new Date('2026-05-15T09:31:00Z').toISOString() },
    { id: 'i-3', request_id: 'r-2', product_name: 'Gear Oil EP 220', batch_number: 'B-260601-1', quantity: '5,000 Liters', rm_no: 'RM-GER-03', test_result: 'Pass', created_at: new Date('2026-06-01T10:16:00Z').toISOString() },
    { id: 'i-4', request_id: 'r-2', product_name: 'Grease EP 2', batch_number: 'B-260601-2', quantity: '50 Pails', rm_no: '', test_result: 'In Process', created_at: new Date('2026-06-01T10:16:00Z').toISOString() },
    { id: 'i-5', request_id: 'r-3', product_name: 'Turbine Oil T 46', batch_number: 'B-260603-5', quantity: '4 Drums', rm_no: 'RM-TUR-04', test_result: 'Fail', created_at: new Date('2026-06-04T14:01:00Z').toISOString() }
  ];

  // --- INITIALIZE LOCAL STORAGE ---
  function initLocalStorage() {
    if (!localStorage.getItem(LOCAL_USERS_KEY)) {
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(defaultUsers));
    }
    if (!localStorage.getItem(LOCAL_REQUESTS_KEY)) {
      localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(defaultRequests));
    }
    if (!localStorage.getItem(LOCAL_ITEMS_KEY)) {
      localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(defaultItems));
    }
  }
  initLocalStorage();

  // --- LOCAL DATABASE SERVICE ---
  const LocalDBService = {
    async login(username, password) {
      const users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');
      const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
      if (!user) {
        throw new Error('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
      }
      const sessionUser = { id: user.id, username: user.username, display_name: user.display_name, role: user.role };
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(sessionUser));
      return sessionUser;
    },

    async logout() {
      localStorage.removeItem(LOCAL_SESSION_KEY);
    },

    async getCurrentUser() {
      const session = localStorage.getItem(LOCAL_SESSION_KEY);
      return session ? JSON.parse(session) : null;
    },

    async getRequests(filters = {}) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');

      let requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
      let items = JSON.parse(localStorage.getItem(LOCAL_ITEMS_KEY) || '[]');
      let users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');

      // Base Oil role: only see requests where need_base_oil_view = true
      if (currentUser.role === 'base_oil') {
        requests = requests.filter(r => r.need_base_oil_view === true);
      }
      // Populate Requester display name
      requests = requests.map(r => {
        const u = users.find(user => user.id === r.requester_id);
        const rItems = items.filter(i => i.request_id === r.id);
        return {
          ...r,
          requester_name: u ? u.display_name : 'ไม่ระบุ',
          request_items: rItems
        };
      });

      // Filter Logic
      // Drafts handling
      if (filters.isDraft) {
        requests = requests.filter(r => r.status === 'Draft');
      } else {
        requests = requests.filter(r => r.status !== 'Draft');
      }
      if (filters.requestNo) {
        requests = requests.filter(r => r.request_no.toString().includes(filters.requestNo));
      }
      if (filters.customerName) {
        requests = requests.filter(r => r.customer_name.toLowerCase().includes(filters.customerName.toLowerCase()));
      }
      if (filters.status) {
        requests = requests.filter(r => r.status === filters.status);
      }
      if (filters.startDate) {
        requests = requests.filter(r => r.request_date >= filters.startDate);
      }
      if (filters.endDate) {
        requests = requests.filter(r => r.request_date <= filters.endDate);
      }

      // Filter by items parameters (productName, batchNumber, rmNo)
      if (filters.productName || filters.batchNumber || filters.rmNo) {
        const matchingRequestIds = new Set(
          items.filter(item => {
            let matches = true;
            if (filters.productName && !item.product_name.toLowerCase().includes(filters.productName.toLowerCase())) {
              matches = false;
            }
            if (filters.batchNumber && !item.batch_number.toLowerCase().includes(filters.batchNumber.toLowerCase())) {
              matches = false;
            }
            if (filters.rmNo && (!item.rm_no || !item.rm_no.toLowerCase().includes(filters.rmNo.toLowerCase()))) {
              matches = false;
            }
            return matches;
          }).map(item => item.request_id)
        );
        requests = requests.filter(r => matchingRequestIds.has(r.id));
      }

      // Sort by Year & No descending (newest first)
      return requests.sort((a, b) => {
        if (b.request_year !== a.request_year) return b.request_year - a.request_year;
        return b.request_no - a.request_no;
      });
    },

    async getRequestDetail(id) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');

      const requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
      const items = JSON.parse(localStorage.getItem(LOCAL_ITEMS_KEY) || '[]');
      const users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');

      const req = requests.find(r => r.id === id);
      if (!req) throw new Error('ไม่พบข้อมูลใบแจ้ง');

      // Security check
      // Security check removed to allow requesters to view all requests

      const reqItems = items.filter(item => item.request_id === id);
      const requester = users.find(u => u.id === req.requester_id);
      const approver = users.find(u => u.id === req.lab_approved_by);

      return {
        ...req,
        requester_name: requester ? requester.display_name : 'ไม่ระบุ',
        lab_approved_name: approver ? approver.display_name : null,
        items: reqItems
      };
    },

    // Compute request status based on item rules
    _computeStatus(items) {
      if (items.length === 0) return 'Pending';
      const isPending = items.some(item => !item.rm_no || item.rm_no.trim() === '' || ['In Process', 'Hold'].includes(item.test_result));
      return isPending ? 'Pending' : 'Complete';
    },

    async createRequest(requestData, itemsData) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');

      const requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
      const items = JSON.parse(localStorage.getItem(LOCAL_ITEMS_KEY) || '[]');

      const requestId = generateUUID();
      const now = new Date();
      const localDate = now.toISOString().split('T')[0];
      const localTime = now.toTimeString().split(' ')[0];
      const currentYear = parseInt(localDate.split('-')[0]);

      // Auto numbering for local storage (skip if Draft)
      let nextNo = null;
      let finalStatus = requestData.status || 'Pending';
      
      if (finalStatus !== 'Draft') {
        const sameYearReqs = requests.filter(r => r.request_year === currentYear && r.request_no !== null);
        nextNo = sameYearReqs.reduce((max, r) => r.request_no > max ? r.request_no : max, 0) + 1;
        
        // Status check (recalc if not draft)
        const isPending = itemsData.every(item => item.test_result === 'Pending' || !item.test_result);
        finalStatus = isPending ? 'Pending' : 'In Process';
        const isComplete = itemsData.every(item => ['Pass', 'Fail', 'Hold'].includes(item.test_result));
        if (isComplete) finalStatus = 'Complete';
      }

      const preparedItems = itemsData.map(item => ({
        id: generateUUID(),
        request_id: requestId,
        product_name: item.product_name,
        batch_number: item.batch_number,
        quantity: item.quantity,
        rm_no: item.rm_no || '',
        test_result: item.test_result || 'In Process',
        item_comment: item.item_comment || '',
        created_at: now.toISOString()
      }));

      const newRequest = {
        id: requestId,
        request_no: nextNo,
        request_year: currentYear,
        request_date: localDate,
        request_time: localTime,
        customer_name: requestData.customer_name,
        po_number: requestData.po_number || '',
        need_base_oil_view: requestData.need_base_oil_view || false,
        requester_id: currentUser.id,
        car_plate: requestData.car_plate || '',
        seal_no: requestData.seal_no || '',
        container_no: requestData.container_no || '',
        notes: requestData.notes || '',
        lab_comments: requestData.lab_comments || '',
        status: finalStatus,
        created_at: now.toISOString()
      };

      requests.push(newRequest);
      items.push(...preparedItems);

      localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(requests));
      localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(items));

      return { ...newRequest, items: preparedItems };
    },

    async updateRequest(id, requestData, itemsData) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');

      const requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
      const items = JSON.parse(localStorage.getItem(LOCAL_ITEMS_KEY) || '[]');

      const reqIndex = requests.findIndex(r => r.id === id);
      if (reqIndex === -1) throw new Error('ไม่พบข้อมูลใบแจ้ง');

      // Security check
      const isRequester = currentUser.role === 'requester';
      const isDraft = requests[reqIndex].status === 'Draft';
      
      if (!['admin', 'lab'].includes(currentUser.role) && !(isRequester && isDraft)) {
        throw new Error('เฉพาะผู้ดูแลระบบ (Admin) หรือเจ้าหน้าที่ห้องปฏิบัติการ (Lab) เท่านั้นที่สามารถแก้ไขข้อมูลได้ ยกเว้นการแก้ไขแบบร่าง');
      }

      // Overwrite items for this request: delete old, insert new
      const filteredItems = items.filter(item => String(item.request_id) !== String(id));
      const preparedItems = itemsData.map(item => ({
        id: item.id || generateUUID(),
        request_id: id,
        product_name: item.product_name,
        batch_number: item.batch_number,
        quantity: item.quantity,
        rm_no: item.rm_no || '',
        test_result: item.test_result || 'In Process',
        created_at: item.created_at || new Date().toISOString()
      }));

      // Update status logic
      let currentReq = requests[reqIndex];
      let newStatus = requestData.status || currentReq.status;
      let reqNo = requestData.request_no !== undefined ? requestData.request_no : currentReq.request_no;
      let reqYear = requestData.request_year !== undefined ? requestData.request_year : currentReq.request_year;

      if (currentReq.status === 'Draft' && newStatus !== 'Draft' && reqNo === null) {
        const now = new Date();
        const currentYear = parseInt(now.toISOString().split('-')[0]);
        const sameYearReqs = requests.filter(r => r.request_year === currentYear && r.request_no !== null);
        reqNo = sameYearReqs.reduce((max, r) => r.request_no > max ? r.request_no : max, 0) + 1;
        reqYear = currentYear;
      }

      // Re-calculate status if not draft
      if (newStatus !== 'Draft') {
        const isPending = preparedItems.every(item => item.test_result === 'Pending' || !item.test_result);
        newStatus = isPending ? 'Pending' : 'In Process';
        const isComplete = preparedItems.every(item => ['Pass', 'Fail', 'Hold'].includes(item.test_result));
        if (isComplete) newStatus = 'Complete';
        // Keep approved/rejected if already is
        if (['Approved', 'Rejected'].includes(currentReq.status)) newStatus = currentReq.status;
      }

      const updatedReq = {
        ...currentReq,
        request_no: reqNo,
        request_year: reqYear,
        customer_name: requestData.customer_name !== undefined ? requestData.customer_name : currentReq.customer_name,
        po_number: requestData.po_number !== undefined ? requestData.po_number : currentReq.po_number,
        need_base_oil_view: requestData.need_base_oil_view !== undefined ? requestData.need_base_oil_view : currentReq.need_base_oil_view,
        car_plate: requestData.car_plate !== undefined ? requestData.car_plate : currentReq.car_plate,
        seal_no: requestData.seal_no !== undefined ? requestData.seal_no : currentReq.seal_no,
        container_no: requestData.container_no !== undefined ? requestData.container_no : currentReq.container_no,
        notes: requestData.notes !== undefined ? requestData.notes : currentReq.notes,
        lab_comments: requestData.lab_comments !== undefined ? requestData.lab_comments : currentReq.lab_comments,
        status: newStatus,
        request_date: requestData.request_date || currentReq.request_date,
        request_time: requestData.request_time || currentReq.request_time
      };

      requests[reqIndex] = updatedReq;
      localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(requests));
      localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(filteredItems.concat(preparedItems)));

      return { ...updatedReq, items: preparedItems };
    },

    async updateDraft(id, requestData, itemsData) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');

      let requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
      let items = JSON.parse(localStorage.getItem(LOCAL_ITEMS_KEY) || '[]');

      const reqIndex = requests.findIndex(r => r.id === id);
      if (reqIndex === -1) throw new Error('ไม่พบข้อมูลแบบร่าง');

      if (requests[reqIndex].status !== 'Draft') {
        throw new Error('สามารถแก้ไขได้เฉพาะแบบร่างเท่านั้น');
      }
      
      const isRequester = currentUser.role === 'requester';
      if (!['admin', 'lab'].includes(currentUser.role) && !isRequester) {
        throw new Error('ไม่มีสิทธิ์แก้ไขแบบร่าง');
      }

      const filteredItems = items.filter(item => String(item.request_id) !== String(id));
      const preparedItems = itemsData.map(item => ({
        id: item.id || generateUUID(),
        request_id: id,
        product_name: item.product_name,
        batch_number: item.batch_number,
        quantity: item.quantity,
        rm_no: item.rm_no || '',
        test_result: item.test_result || 'In Process',
        created_at: item.created_at || new Date().toISOString()
      }));

      requests[reqIndex] = {
        ...requests[reqIndex],
        customer_name: requestData.customer_name,
        po_number: requestData.po_number,
        need_base_oil_view: requestData.need_base_oil_view,
        car_plate: requestData.car_plate,
        seal_no: requestData.seal_no,
        container_no: requestData.container_no,
        notes: requestData.notes,
        status: 'Draft',
        request_date: requestData.request_date,
        request_time: requestData.request_time,
        updated_at: new Date().toISOString()
      };

      localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(requests));
      localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(filteredItems.concat(preparedItems)));

      return { ...requests[reqIndex], items: preparedItems };
    },

    async submitDraft(id, requestData, itemsData) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');

      let requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
      let items = JSON.parse(localStorage.getItem(LOCAL_ITEMS_KEY) || '[]');

      const reqIndex = requests.findIndex(r => r.id === id);
      if (reqIndex === -1) throw new Error('ไม่พบข้อมูลแบบร่าง');

      if (requests[reqIndex].status !== 'Draft') {
        throw new Error('สถานะไม่ใช่แบบร่าง ไม่สามารถกดส่งได้');
      }

      const filteredItems = items.filter(item => String(item.request_id) !== String(id));
      const preparedItems = itemsData.map(item => ({
        id: item.id || generateUUID(),
        request_id: id,
        product_name: item.product_name,
        batch_number: item.batch_number,
        quantity: item.quantity,
        rm_no: item.rm_no || '',
        test_result: item.test_result || 'In Process',
        created_at: item.created_at || new Date().toISOString()
      }));

      // Generate Req No
      const now = new Date();
      const currentYear = parseInt(now.toISOString().split('-')[0]);
      const sameYearReqs = requests.filter(r => r.request_year === currentYear && r.request_no !== null);
      const reqNo = sameYearReqs.reduce((max, r) => r.request_no > max ? r.request_no : max, 0) + 1;

      requests[reqIndex] = {
        ...requests[reqIndex],
        request_no: reqNo,
        request_year: currentYear,
        customer_name: requestData.customer_name,
        po_number: requestData.po_number,
        need_base_oil_view: requestData.need_base_oil_view,
        car_plate: requestData.car_plate,
        seal_no: requestData.seal_no,
        container_no: requestData.container_no,
        notes: requestData.notes,
        status: 'Pending',
        request_date: requestData.request_date,
        request_time: requestData.request_time,
        updated_at: new Date().toISOString()
      };

      localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(requests));
      localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(filteredItems.concat(preparedItems)));

      return { ...requests[reqIndex], items: preparedItems };
    },

    async deleteRequest(id) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');
      if (currentUser.role !== 'admin') {
        throw new Error('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถลบข้อมูลได้');
      }

      let requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
      let items = JSON.parse(localStorage.getItem(LOCAL_ITEMS_KEY) || '[]');

      requests = requests.filter(r => r.id !== id);
      items = items.filter(item => item.request_id !== id);

      localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(requests));
      localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(items));
    },

    async getMaterialHistory(filters = {}) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');
      if (!['admin', 'lab'].includes(currentUser.role)) {
        throw new Error('คุณไม่มีสิทธิ์เข้าดูระบบประวัติวัตถุดิบย้อนหลัง');
      }

      const requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
      const items = JSON.parse(localStorage.getItem(LOCAL_ITEMS_KEY) || '[]');
      const users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');

      // Link items with parent request details
      let history = items.map(item => {
        const req = requests.find(r => r.id === item.request_id);
        const requester = req ? users.find(u => u.id === req.requester_id) : null;
        return {
          id: item.id,
          request_id: item.request_id,
          request_no: req ? req.request_no : null,
          request_year: req ? req.request_year : null,
          request_date: req ? req.request_date : '',
          request_time: req ? req.request_time : '',
          customer_name: req ? req.customer_name : '',
          status: req ? req.status : '',
          requester_name: requester ? requester.display_name : 'ไม่ระบุ',
          product_name: item.product_name,
          batch_number: item.batch_number,
          quantity: item.quantity,
          rm_no: item.rm_no,
          test_result: item.test_result
        };
      });

      // Filter by history-specific criteria
      if (filters.productName) {
        history = history.filter(h => h.product_name.toLowerCase().includes(filters.productName.toLowerCase()));
      }
      if (filters.batchNumber) {
        history = history.filter(h => h.batch_number.toLowerCase().includes(filters.batchNumber.toLowerCase()));
      }
      if (filters.rmNo) {
        history = history.filter(h => h.rm_no && h.rm_no.toLowerCase().includes(filters.rmNo.toLowerCase()));
      }
      if (filters.requestNo) {
        history = history.filter(h => h.request_no && h.request_no.toString().includes(filters.requestNo));
      }
      if (filters.testResult) {
        history = history.filter(h => h.test_result === filters.testResult);
      }
      if (filters.startDate) {
        history = history.filter(h => h.request_date >= filters.startDate);
      }
      if (filters.endDate) {
        history = history.filter(h => h.request_date <= filters.endDate);
      }

      // Sort by newest date, then request_no
      return history.sort((a, b) => {
        if (b.request_date !== a.request_date) return b.request_date.localeCompare(a.request_date);
        return (b.request_no || 0) - (a.request_no || 0);
      });
    },

    async getBatchHistory(batchNumber) {
      const history = await this.getMaterialHistory();
      return history.filter(h => h.batch_number.toLowerCase() === batchNumber.toLowerCase());
    },

    // User Manager functions
    async getUsers() {
      const currentUser = await this.getCurrentUser();
      if (!currentUser || currentUser.role !== 'admin') throw new Error('Unauthorized');
      const users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');
      return users.map(u => ({ id: u.id, username: u.username, display_name: u.display_name, role: u.role, created_at: u.created_at }));
    },

    async createUser(username, password, displayName, role) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser || currentUser.role !== 'admin') throw new Error('Unauthorized');

      const users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');
      if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        throw new Error('ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว');
      }

      const newUser = {
        id: 'u-' + generateUUID().slice(0, 8),
        username: username.trim(),
        password: password,
        display_name: displayName.trim(),
        role: role,
        created_at: new Date().toISOString()
      };

      users.push(newUser);
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
      return { id: newUser.id, username: newUser.username, display_name: newUser.display_name, role: newUser.role };
    },

    async updateUserPassword(userId, password) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser || currentUser.role !== 'admin') throw new Error('Unauthorized');

      const users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');
      const userIndex = users.findIndex(u => u.id === userId);
      if (userIndex === -1) throw new Error('ไม่พบข้อมูลผู้ใช้งาน');

      users[userIndex].password = password;
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
    },

    // Change password for the currently logged-in user (any role)
    async changeOwnPassword(currentPassword, newPassword) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('ไม่ได้เข้าสู่ระบบ');

      const users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');
      const userRecord = users.find(u => u.id === currentUser.id);
      if (!userRecord) throw new Error('ไม่พบข้อมูลผู้ใช้งาน');

      if (userRecord.password !== currentPassword) {
        throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง');
      }

      const idx = users.findIndex(u => u.id === currentUser.id);
      users[idx].password = newPassword;
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
    },

    async deleteUser(userId) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser || currentUser.role !== 'admin') throw new Error('Unauthorized');
      if (userId === currentUser.id) {
        throw new Error('ไม่สามารถลบบัญชีผู้ใช้งานของตนเองได้');
      }

      let users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');
      users = users.filter(u => u.id !== userId);
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
    },

    async getSignatures() {
      return [];
    },

    async saveSignature(userId, signatureUrl) {},

    async deleteSignature(userId) {},

    async approveRequest(id) {
      const requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
      const reqIndex = requests.findIndex(r => r.id === id);
      const currentUser = await this.getCurrentUser();
      
      if (reqIndex !== -1 && currentUser) {
        requests[reqIndex].status = 'Approved';
        requests[reqIndex].approved = true;
        requests[reqIndex].approved_by = currentUser.id;
        requests[reqIndex].approved_name = currentUser.display_name;
        requests[reqIndex].approved_role = currentUser.role;
        requests[reqIndex].approved_at = new Date().toISOString();
        requests[reqIndex].approved_signature_snapshot = 'local-signature-dummy.png';
        
        localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(requests));
      }
      return this.getRequestDetail(id);
    },

    async reopenRequest(id) {
      const requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
      const reqIndex = requests.findIndex(r => r.id === id);
      
      if (reqIndex !== -1) {
        requests[reqIndex].status = 'Complete';
        requests[reqIndex].approved = false;
        requests[reqIndex].approved_by = null;
        requests[reqIndex].approved_name = null;
        requests[reqIndex].approved_role = null;
        requests[reqIndex].approved_at = null;
        requests[reqIndex].approved_signature_snapshot = null;
        
        localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(requests));
      }
      return this.getRequestDetail(id);
    },

    async rejectRequest(id) {
      const requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
      const reqIndex = requests.findIndex(r => r.id === id);
      if (reqIndex !== -1) {
        requests[reqIndex].status = 'Rejected';
        localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(requests));
      }
      return this.getRequestDetail(id);
    },

    // --- REALTIME STUBS ---
    async setupRealtimeNotifications(onInsert, onUpdate) {},
    async cleanupRealtimeNotifications() {},
    async fetchRequesterName(userId) { return 'Unknown'; }
  };

  // --- SUPABASE DATABASE SERVICE ---
  let supabaseClient = null;

  function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    const config = window.AppConfig.load();
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error('กรุณากำหนด Supabase URL และ Anon Key ในหน้าการตั้งค่าก่อนเชื่อมต่อ');
    }
    // Initialize standard Supabase client loaded via CDN script
    if (typeof supabase !== 'undefined') {
      supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      return supabaseClient;
    }
    throw new Error('ไม่พบ Library Supabase (อาจเนื่องจากการเชื่อมต่ออินเทอร์เน็ตล้มเหลว)');
  }

  const SupabaseDBService = {
    // Session state mapped locally because standard RLS utilizes authenticated user tokens
    async login(username, password) {
      const client = getSupabaseClient();
      // Map username to factory virtual email
      const email = `${username.trim().toLowerCase()}@factory.local`;
      
      const { data, error } = await client.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) {
        // If login failed, customize error message for user
        if (error.message.includes('Invalid login credentials')) {
          throw new Error('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
        }
        throw new Error(error.message);
      }

      // Fetch user profile info
      const { data: profile, error: profileErr } = await client
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileErr) {
        throw new Error('ไม่พบข้อมูลส่วนตัวของผู้ใช้งาน: ' + profileErr.message);
      }

      return {
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        role: profile.role
      };
    },

    async logout() {
      const client = getSupabaseClient();
      await client.auth.signOut();
    },

    async getCurrentUser() {
      try {
        const client = getSupabaseClient();
        const { data: { session } } = await client.auth.getSession();
        if (!session) return null;

        const { data: profile } = await client
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          return {
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            role: profile.role
          };
        }
      } catch (e) {
        console.warn('Supabase not connected or initialized', e);
      }
      return null;
    },

    async getRequests(filters = {}) {
      const client = getSupabaseClient();
      const currentUser = await this.getCurrentUser();
      
      // Starting base query
      let query = client
        .from('requests')
        .select(`
          *,
          profiles:requester_id (display_name),
          request_items (product_name)
        `);

      // Handle Draft filtering
      if (filters.isDraft) {
        query = query.eq('status', 'Draft');
      } else {
        query = query.neq('status', 'Draft');
      }

      // Base Oil role: MUST only see requests where need_base_oil_view = true
      if (currentUser && currentUser.role === 'base_oil') {
        query = query.eq('need_base_oil_view', true);
      }
      if (filters.requestNo) {
        query = query.ilike('request_no::text', `%${filters.requestNo}%`);
      }
      if (filters.customerName) {
        query = query.ilike('customer_name', `%${filters.customerName}%`);
      }
      if (filters.poNumber) {
        query = query.ilike('po_number', `%${filters.poNumber}%`);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.startDate) {
        query = query.gte('request_date', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('request_date', filters.endDate);
      }

      // Filters for sub-items
      if (filters.productName || filters.batchNumber || filters.rmNo) {
        // Query items first to fetch request_ids matching filters
        let itemQuery = client.from('request_items').select('request_id');
        if (filters.productName) {
          itemQuery = itemQuery.ilike('product_name', `%${filters.productName}%`);
        }
        if (filters.batchNumber) {
          itemQuery = itemQuery.ilike('batch_number', `%${filters.batchNumber}%`);
        }
        if (filters.rmNo) {
          itemQuery = itemQuery.ilike('rm_no', `%${filters.rmNo}%`);
        }

        const { data: matchedItems, error: itemErr } = await itemQuery;
        if (itemErr) throw new Error(itemErr.message);

        const ids = [...new Set(matchedItems.map(item => item.request_id))];
        if (ids.length === 0) return []; // Return empty if no matches
        query = query.in('id', ids);
      }

      const { data, error } = await query.order('request_year', { ascending: false }).order('request_no', { ascending: false });
      if (error) throw new Error(error.message);

      return data.map(r => ({
        ...r,
        requester_name: r.profiles ? r.profiles.display_name : 'ไม่ระบุ'
      }));
    },

    async getRequestDetail(id) {
      const client = getSupabaseClient();
      
      const { data: req, error: reqErr } = await client
        .from('requests')
        .select(`
          *,
          profiles:requester_id (display_name)
        `)
        .eq('id', id)
        .single();

      if (reqErr) throw new Error(reqErr.message);

      const { data: items, error: itemsErr } = await client
        .from('request_items')
        .select('*')
        .eq('request_id', id)
        .order('created_at', { ascending: true });

      if (itemsErr) throw new Error(itemsErr.message);

      // Fetch approver name if approved
      let lab_approved_name = null;
      if (req.lab_approved_by) {
        const { data: approver } = await client
          .from('profiles')
          .select('display_name')
          .eq('id', req.lab_approved_by)
          .single();
        lab_approved_name = approver ? approver.display_name : null;
      }

      return {
        ...req,
        requester_name: req.profiles ? req.profiles.display_name : 'ไม่ระบุ',
        lab_approved_name: lab_approved_name,
        items: items
      };
    },

    async createRequest(requestData, itemsData) {
      const client = getSupabaseClient();
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');

      // 1. Insert request metadata
      const { data: newReq, error: reqErr } = await client
        .from('requests')
        .insert({
          customer_name: requestData.customer_name,
          po_number: requestData.po_number || '',
          need_base_oil_view: requestData.need_base_oil_view || false,
          requester_id: currentUser.id,
          car_plate: requestData.car_plate || '',
          seal_no: requestData.seal_no || '',
          container_no: requestData.container_no || '',
          notes: requestData.notes || '',
          lab_comments: requestData.lab_comments || '',
          status: requestData.status || 'Pending',
          request_date: requestData.request_date || new Date().toISOString().split('T')[0],
          request_time: requestData.request_time || new Date().toTimeString().split(' ')[0]
        })
        .select()
        .single();

      if (reqErr) throw new Error(reqErr.message);

      // 2. Insert items linking to new request ID
      const itemsToInsert = itemsData.map(item => ({
        id: generateUUID(),
        request_id: newReq.id,
        product_name: item.product_name,
        batch_number: item.batch_number,
        quantity: item.quantity,
        rm_no: item.rm_no || '',
        test_result: item.test_result || 'In Process',
        item_comment: item.item_comment || ''
      }));

      const { data: newItems, error: itemsErr } = await client
        .from('request_items')
        .insert(itemsToInsert)
        .select();

      if (itemsErr) {
        // Cleanup request if items insert fails (manual transaction control)
        await client.from('requests').delete().eq('id', newReq.id);
        throw new Error(itemsErr.message);
      }

      // Re-fetch detail to get populated fields and calculated status
      return this.getRequestDetail(newReq.id);
    },

    async updateRequest(id, requestData, itemsData) {
      const client = getSupabaseClient();

      // Build update payload — only include defined fields
      const updatePayload = {
        customer_name: requestData.customer_name,
        po_number: requestData.po_number,
        need_base_oil_view: requestData.need_base_oil_view,
        car_plate: requestData.car_plate,
        container_no: requestData.container_no !== undefined ? requestData.container_no : undefined,
        notes: requestData.notes !== undefined ? requestData.notes : undefined,
        lab_comments: requestData.lab_comments !== undefined ? requestData.lab_comments : undefined,
        status: requestData.status !== undefined ? requestData.status : undefined,
        request_date: requestData.request_date !== undefined ? requestData.request_date : undefined,
        request_time: requestData.request_time !== undefined ? requestData.request_time : undefined
      };

      // Allow admin/lab to set manual status
      if (requestData.status) {
        updatePayload.status = requestData.status;
      }

      // Allow admin to override request_no and request_year
      if (requestData.request_no) updatePayload.request_no = parseInt(requestData.request_no);
      if (requestData.request_year) updatePayload.request_year = parseInt(requestData.request_year);

      const { error: reqErr } = await client
        .from('requests')
        .update(updatePayload)
        .eq('id', id);

      if (reqErr) throw new Error(reqErr.message);

      // Fetch existing item IDs for this request
      const { data: currentItems } = await client.from('request_items').select('id').eq('request_id', id);
      const existingIds = (currentItems || []).map(i => i.id);

      // Prepare upsert items
      const upsertItems = itemsData.map(item => ({
        id: item.id || generateUUID(),
        request_id: id,
        product_name: item.product_name,
        batch_number: item.batch_number,
        quantity: item.quantity,
        rm_no: item.rm_no || '',
        test_result: item.test_result || 'In Process',
        item_comment: item.item_comment || ''
      }));

      // Determine which existing IDs should be kept
      const keepIds = itemsData.filter(i => i.id).map(i => i.id);
      const deleteIds = existingIds.filter(eid => !keepIds.includes(eid));

      // Upsert items
      const { error: upErr } = await client
        .from('request_items')
        .upsert(upsertItems, { onConflict: 'id' });
      if (upErr) throw new Error(upErr.message);

      // Delete removed items
      if (deleteIds.length > 0) {
        const { error: delErr } = await client
          .from('request_items')
          .delete()
          .in('id', deleteIds);
        if (delErr) throw new Error(delErr.message);
      }

      return this.getRequestDetail(id);
    },

    async updateDraft(id, requestData, itemsData) {
      const client = getSupabaseClient();

      // 1. MUST UPSERT/DELETE ITEMS FIRST WHILE STATUS IS STILL DRAFT
      const { data: currentItems } = await client.from('request_items').select('id').eq('request_id', id);
      const existingIds = (currentItems || []).map(i => i.id);

      const upsertItems = itemsData.map(item => ({
        id: item.id || generateUUID(),
        request_id: id,
        product_name: item.product_name,
        batch_number: item.batch_number,
        quantity: item.quantity,
        rm_no: item.rm_no || '',
        test_result: item.test_result || 'In Process',
        item_comment: item.item_comment || ''
      }));

      const keepIds = itemsData.filter(i => i.id).map(i => i.id);
      const deleteIds = existingIds.filter(eid => !keepIds.includes(eid));

      if (upsertItems.length > 0) {
        const { error: upErr } = await client.from('request_items').upsert(upsertItems, { onConflict: 'id' });
        if (upErr) throw new Error(upErr.message);
      }

      if (deleteIds.length > 0) {
        const { error: delErr } = await client.from('request_items').delete().in('id', deleteIds);
        if (delErr) throw new Error(delErr.message);
      }

      // 2. UPDATE REQUEST DATA
      const { error: reqErr } = await client
        .from('requests')
        .update({
          customer_name: requestData.customer_name,
          po_number: requestData.po_number,
          need_base_oil_view: requestData.need_base_oil_view,
          car_plate: requestData.car_plate,
          seal_no: requestData.seal_no,
          container_no: requestData.container_no,
          notes: requestData.notes,
          status: 'Draft',
          request_date: requestData.request_date,
          request_time: requestData.request_time
        })
        .eq('id', id)
        .eq('status', 'Draft');

      if (reqErr) throw new Error(reqErr.message);

      return this.getRequestDetail(id);
    },

    async submitDraft(id, requestData, itemsData) {
      const client = getSupabaseClient();

      // 1. MUST UPSERT/DELETE ITEMS FIRST WHILE STATUS IS STILL DRAFT
      const { data: currentItems } = await client.from('request_items').select('id').eq('request_id', id);
      const existingIds = (currentItems || []).map(i => i.id);

      const upsertItems = itemsData.map(item => ({
        id: item.id || generateUUID(),
        request_id: id,
        product_name: item.product_name,
        batch_number: item.batch_number,
        quantity: item.quantity,
        rm_no: item.rm_no || '',
        test_result: item.test_result || 'In Process',
        item_comment: item.item_comment || ''
      }));

      const keepIds = itemsData.filter(i => i.id).map(i => i.id);
      const deleteIds = existingIds.filter(eid => !keepIds.includes(eid));

      if (upsertItems.length > 0) {
        const { error: upErr } = await client.from('request_items').upsert(upsertItems, { onConflict: 'id' });
        if (upErr) throw new Error(upErr.message);
      }

      if (deleteIds.length > 0) {
        const { error: delErr } = await client.from('request_items').delete().in('id', deleteIds);
        if (delErr) throw new Error(delErr.message);
      }

      // 2. NOW UPDATE STATUS TO PENDING
      const { error: reqErr } = await client
        .from('requests')
        .update({
          customer_name: requestData.customer_name,
          po_number: requestData.po_number,
          need_base_oil_view: requestData.need_base_oil_view,
          car_plate: requestData.car_plate,
          seal_no: requestData.seal_no,
          container_no: requestData.container_no,
          notes: requestData.notes,
          status: 'Pending',
          request_date: requestData.request_date,
          request_time: requestData.request_time
        })
        .eq('id', id)
        .eq('status', 'Draft');

      if (reqErr) throw new Error(reqErr.message);

      return this.getRequestDetail(id);
    },

    async deleteRequest(id) {
      const client = getSupabaseClient();
      const { error } = await client
        .from('requests')
        .delete()
        .eq('id', id);

      if (error) throw new Error(error.message);
    },

    async getMaterialHistory(filters = {}) {
      const client = getSupabaseClient();

      let query = client
        .from('request_items')
        .select(`
          *,
          requests:request_id (
            request_no,
            request_year,
            request_date,
            request_time,
            customer_name,
            status,
            profiles:requester_id (display_name)
          )
        `);

      if (filters.productName) {
        query = query.ilike('product_name', `%${filters.productName}%`);
      }
      if (filters.batchNumber) {
        query = query.ilike('batch_number', `%${filters.batchNumber}%`);
      }
      if (filters.rmNo) {
        query = query.ilike('rm_no', `%${filters.rmNo}%`);
      }
      if (filters.testResult) {
        query = query.eq('test_result', filters.testResult);
      }

      // Filters targeting parent table
      if (filters.requestNo || filters.startDate || filters.endDate) {
        // Note: For complex cross-table filtering in Supabase without nested query limitations,
        // we can filter client side or construct filter criteria depending on parent fields.
        // Let's filter client-side or build nested strings. Standard client filtering on fetched rows
        // is reliable if the result list is manageable, or we query with inner joins.
        // In PostgREST, we can filter on parent fields like `requests.request_no=eq.value` but the row is omitted, 
        // which leaves records with null requests unless we query request first.
        // Let's query from requests instead if date filters are active, or filter post-fetch.
        // Post-fetch filtering is safest for complex relational searches in Supabase JS Client v2:
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      // Flatten and map
      let history = data.map(item => {
        const req = item.requests || {};
        const requester = req.profiles || {};
        return {
          id: item.id,
          request_id: item.request_id,
          request_no: req.request_no || null,
          request_year: req.request_year || null,
          request_date: req.request_date || '',
          request_time: req.request_time || '',
          customer_name: req.customer_name || '',
          status: req.status || '',
          requester_name: requester.display_name || 'ไม่ระบุ',
          product_name: item.product_name,
          batch_number: item.batch_number,
          quantity: item.quantity,
          rm_no: item.rm_no,
          test_result: item.test_result
        };
      });

      // Relational filters implemented on client for accuracy
      if (filters.requestNo) {
        history = history.filter(h => h.request_no && h.request_no.toString().includes(filters.requestNo));
      }
      if (filters.startDate) {
        history = history.filter(h => h.request_date >= filters.startDate);
      }
      if (filters.endDate) {
        history = history.filter(h => h.request_date <= filters.endDate);
      }

      return history.sort((a, b) => {
        if (b.request_date !== a.request_date) return b.request_date.localeCompare(a.request_date);
        return (b.request_no || 0) - (a.request_no || 0);
      });
    },

    async getBatchHistory(batchNumber) {
      return this.getMaterialHistory({ batchNumber: batchNumber });
    },

    async getUsers() {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);
      return data;
    },

    async createUser(username, password, displayName, role) {
      const client = getSupabaseClient();
      const email = `${username.trim().toLowerCase()}@factory.local`;

      // Create a secondary non-persisted client to register the user without logging the current Admin out
      const config = window.AppConfig.load();
      const tempClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false }
      });

      const { data, error } = await tempClient.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            role: role,
            display_name: displayName
          }
        }
      });

      if (error) throw new Error(error.message);

      // Return a profile mockup since trigger will run to create the record
      return {
        id: data.user.id,
        username: username,
        display_name: displayName,
        role: role
      };
    },

    async updateUserPassword(userId, password) {
      const client = getSupabaseClient();
      // Invoke postgres security definer function created in schema setup
      const { error } = await client.rpc('admin_update_user_password', {
        p_user_id: userId,
        p_new_password: password
      });

      if (error) throw new Error(error.message);
    },

    // Change password for the currently logged-in user via Supabase Auth
    async changeOwnPassword(currentPassword, newPassword) {
      const client = getSupabaseClient();

      // 1. Verify current password by attempting a fresh sign-in
      const { data: sessionData, error: sessionErr } = await client.auth.getSession();
      if (sessionErr || !sessionData.session) throw new Error('ไม่ได้เข้าสู่ระบบ');

      const userEmail = sessionData.session.user.email;
      const { error: signInErr } = await client.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword
      });
      if (signInErr) throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง กรุณาตรวจสอบใหม่');

      // 2. Update password via Supabase Auth (secure, no direct DB write)
      const { error: updateErr } = await client.auth.updateUser({ password: newPassword });
      if (updateErr) throw new Error(updateErr.message);
    },

    async deleteUser(userId) {
      const client = getSupabaseClient();
      const { error } = await client.rpc('admin_delete_user', { p_user_id: userId });
      if (error) throw new Error(error.message);
    },

    // --- SIGNATURE MANAGEMENT ---
    async getSignatures() {
      const client = getSupabaseClient();
      // Fetch all lab/admin users and their signatures
      const { data: users, error: usersErr } = await client
        .from('profiles')
        .select('id, display_name, role')
        .in('role', ['lab', 'admin'])
        .order('created_at', { ascending: true });
      if (usersErr) throw new Error(usersErr.message);

      const { data: sigs, error: sigsErr } = await client
        .from('user_signatures')
        .select('user_id, signature_url, updated_at');
      if (sigsErr) throw new Error(sigsErr.message);

      const sigMap = {};
      (sigs || []).forEach(s => { sigMap[s.user_id] = s; });

      return (users || []).map(u => ({
        ...u,
        signature_url: sigMap[u.id] ? sigMap[u.id].signature_url : null,
        signature_updated_at: sigMap[u.id] ? sigMap[u.id].updated_at : null
      }));
    },

    async saveSignature(userId, signatureUrl) {
      const client = getSupabaseClient();
      const currentUser = await this.getCurrentUser();
      const { error } = await client
        .from('user_signatures')
        .upsert({
          user_id: userId,
          signature_url: signatureUrl,
          updated_at: new Date().toISOString(),
          created_by: currentUser ? currentUser.id : null
        }, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
    },

    async deleteSignature(userId) {
      const client = getSupabaseClient();
      const { error } = await client
        .from('user_signatures')
        .delete()
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
    },

    // --- APPROVAL / REJECTION ---
    async approveRequest(id) {
      const client = getSupabaseClient();
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');

      // Get current user's signature
      const { data: sigRow, error: sigErr } = await client
        .from('user_signatures')
        .select('signature_url')
        .eq('user_id', currentUser.id)
        .single();

      if (sigErr || !sigRow) {
        throw new Error('ไม่พบลายเซ็นของคุณ กรุณาให้ Admin อัปโหลดลายเซ็นก่อนทำการ Approve');
      }

      const { error } = await client
        .from('requests')
        .update({
          status: 'Approved',
          approved: true,
          approved_by: currentUser.id,
          approved_name: currentUser.display_name,
          approved_role: currentUser.role,
          approved_at: new Date().toISOString(),
          approved_signature_snapshot: sigRow.signature_url
        })
        .eq('id', id);

      if (error) throw new Error(error.message);
      return this.getRequestDetail(id);
    },

    async rejectRequest(id) {
      const client = getSupabaseClient();
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');

      const { error } = await client
        .from('requests')
        .update({
          status: 'Rejected',
          approved: false,
          approved_by: currentUser.id,
          approved_name: currentUser.display_name,
          approved_role: currentUser.role,
          approved_at: new Date().toISOString(),
          approved_signature_snapshot: null
        })
        .eq('id', id);

      if (error) throw new Error(error.message);
      return this.getRequestDetail(id);
    },

    async reopenRequest(id) {
      const client = getSupabaseClient();
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');
      
      if (currentUser.role !== 'admin') {
        throw new Error('Only Admin can reopen requests.');
      }

      const { error } = await client
        .from('requests')
        .update({
          status: 'Complete',
          approved: false,
          approved_by: null,
          approved_name: null,
          approved_role: null,
          approved_at: null,
          approved_signature_snapshot: null
        })
        .eq('id', id);

      if (error) throw new Error(error.message);
      return this.getRequestDetail(id);
    },

    // --- REALTIME NOTIFICATIONS ---
    async setupRealtimeNotifications(onInsert, onUpdate) {
      const client = getSupabaseClient();
      if (!client) return;

      if (this._realtimeChannel) {
        client.removeChannel(this._realtimeChannel);
      }

      this._realtimeChannel = client.channel('requests-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requests' }, payload => {
          if (onInsert) onInsert(payload.new);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requests' }, payload => {
          if (onUpdate) onUpdate(payload.new, payload.old);
        })
        .subscribe();
    },

    async cleanupRealtimeNotifications() {
      if (this._realtimeChannel) {
        const client = getSupabaseClient();
        if (client) client.removeChannel(this._realtimeChannel);
        this._realtimeChannel = null;
      }
    },

    async fetchRequesterName(userId) {
      const client = getSupabaseClient();
      if (!client || !userId) return 'Unknown';
      const { data, error } = await client.from('profiles').select('display_name').eq('id', userId).single();
      if (error || !data) return 'Unknown';
      return data.display_name;
    }
  };

  // --- EXPOSE CONSOLIDATED API ---
  window.DB = {
    // Always return SupabaseDBService since we only support Supabase Cloud now
    getService() {
      return SupabaseDBService;
    },

    // Bridge all functions dynamically
    async login(username, password) { return this.getService().login(username, password); },
    async logout() { return this.getService().logout(); },
    async getCurrentUser() { return this.getService().getCurrentUser(); },
    async getRequests(filters) { return this.getService().getRequests(filters); },
    async getRequestDetail(id) { return this.getService().getRequestDetail(id); },
    async createRequest(requestData, itemsData) { return this.getService().createRequest(requestData, itemsData); },
    async updateRequest(id, requestData, itemsData) { return this.getService().updateRequest(id, requestData, itemsData); },
    async updateDraft(id, requestData, itemsData) { return this.getService().updateDraft(id, requestData, itemsData); },
    async submitDraft(id, requestData, itemsData) { return this.getService().submitDraft(id, requestData, itemsData); },
    async deleteRequest(id) { return this.getService().deleteRequest(id); },
    async getMaterialHistory(filters) { return this.getService().getMaterialHistory(filters); },
    async getBatchHistory(batchNumber) { return this.getService().getBatchHistory(batchNumber); },
    async getUsers() { return this.getService().getUsers(); },
    async createUser(username, password, displayName, role) { return this.getService().createUser(username, password, displayName, role); },
    async updateUserPassword(userId, password) { return this.getService().updateUserPassword(userId, password); },
    async changeOwnPassword(currentPassword, newPassword) { return this.getService().changeOwnPassword(currentPassword, newPassword); },
    async deleteUser(userId) { return this.getService().deleteUser(userId); },
    async getSignatures() { return this.getService().getSignatures(); },
    async saveSignature(userId, signatureUrl) { return this.getService().saveSignature(userId, signatureUrl); },
    async deleteSignature(userId) { return this.getService().deleteSignature(userId); },
    async approveRequest(id) { return this.getService().approveRequest(id); },
    async reopenRequest(id) { return this.getService().reopenRequest(id); },
    async rejectRequest(id) { return this.getService().rejectRequest(id); },
    
    async setupRealtimeNotifications(onInsert, onUpdate) { return this.getService().setupRealtimeNotifications(onInsert, onUpdate); },
    async cleanupRealtimeNotifications() { return this.getService().cleanupRealtimeNotifications(); },
    async fetchRequesterName(userId) { return this.getService().fetchRequesterName(userId); }
  };
})();
