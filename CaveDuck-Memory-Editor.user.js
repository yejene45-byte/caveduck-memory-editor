// ==UserScript==
// @name         CaveDuck Memory Editor v2.0.0
// @namespace    https://caveduck.io/
// @version      2.0.0
// @description  케이브덕의 단기 기억을 편집하고 관리합니다. (날짜별 필터 지원, 붙여넣기 기능)
// @author       gemini
// @match        https://caveduck.io/ko/talk/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    let fetchedMemories = [];
    let selectedDates = new Set();
    let selectedMemories = new Set();
    let isLoading = false;
    let minChatId = Infinity;

    // ===== 유틸리티 =====

    function getSessionId() {
        const match = location.pathname.match(/\/talk\/([a-f0-9-]+)/);
        return match ? match[1] : null;
    }

    async function apiRequest(method, path, body = null) {
        const sessionId = getSessionId();

        if (!sessionId) {
            return null;
        }

        const url = `https://caveduck.io/api/chat${path}`;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        };
        if (body) options.body = JSON.stringify(body);

        try {
            const response = await fetch(url, options);
            
            if (!response.ok) throw new Error(`API Error: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            return null;
        }
    }

    function getCharCount(str) {
        return str ? str.length : 0;
    }

    function formatCharCount(current, max) {
        const status = current > max ? '⚠' : '✓';
        return `${status} ${current} / ${max}`;
    }

    function getAllDates() {
        const dates = new Set();
        fetchedMemories.forEach(m => {
            if (m.scene_context && m.scene_context.date) {
                dates.add(m.scene_context.date);
            }
        });
        return Array.from(dates).sort();
    }

    function getMemoryNumber(memory) {
        return memory.chat_id - minChatId + 1;
    }

    // ===== 스타일 =====

    const styles = `
        #memory-editor-btn {
            position: fixed !important;
            bottom: 10px !important;
            left: 10px !important;
            z-index: 99998 !important;
            width: 56px !important;
            height: 56px !important;
            border-radius: 50% !important;
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
            color: white !important;
            border: none !important;
            cursor: grab !important;
            font-size: 24px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4) !important;
            transition: all 0.2s !important;
            user-select: none !important;
            padding: 0 !important;
            line-height: 1 !important;
            touch-action: none !important;
            -webkit-user-select: none !important;
            -webkit-touch-callout: none !important;
        }
        #memory-editor-btn:hover {
            transform: scale(1.1) !important;
            box-shadow: 0 6px 16px rgba(59, 130, 246, 0.6) !important;
        }
        #memory-editor-btn.dragging {
            cursor: grabbing !important;
            transition: none !important;
        }

        #memory-editor-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 100000;
            display: none;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        #memory-editor-overlay.open {
            display: flex;
        }

        #memory-editor-modal {
            background: white;
            width: 90vw;
            height: 80vh;
            max-width: 900px;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            color: #1f2937;
        }

        .modal-header {
            padding: 12px 20px;
            border-bottom: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f9fafb;
        }

        .modal-header h2 {
            margin: 0;
            font-size: 16px;
            font-weight: 700;
        }

        .modal-header button {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #6b7280;
        }

        .modal-header button:hover {
            color: #1f2937;
        }

        .filter-section {
            padding: 8px 20px;
            border-bottom: 1px solid #e5e7eb;
            background: #f9fafb;
            max-height: 80px;
            overflow-y: auto;
        }

        .filter-section::-webkit-scrollbar {
            width: 4px;
        }

        .filter-section::-webkit-scrollbar-track {
            background: transparent;
        }

        .filter-section::-webkit-scrollbar-thumb {
            background: #d1d5db;
            border-radius: 2px;
        }

        .filter-header {
            font-weight: 600;
            font-size: 11px;
            color: #1f2937;
            margin-bottom: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .filter-buttons {
            display: flex;
            gap: 4px;
        }

        .filter-btn {
            padding: 2px 6px;
            font-size: 10px;
            background: #e5e7eb;
            border: 1px solid #d1d5db;
            border-radius: 3px;
            cursor: pointer;
            font-weight: 600;
            color: #6b7280;
        }

        .filter-btn:hover {
            background: #d1d5db;
        }

        .filter-items {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .filter-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .filter-checkbox {
            width: 14px;
            height: 14px;
            cursor: pointer;
            accent-color: #3b82f6;
        }

        .filter-label {
            font-size: 11px;
            color: #1f2937;
            cursor: pointer;
            user-select: none;
        }

        .modal-body {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 12px 20px;
            overflow: hidden;
        }

        .char-count-container {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #6b7280;
            padding: 4px 0;
        }

        .memory-content {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 10px;
            background: #f3f4f6;
            border-radius: 8px;
            border: 1px solid #d1d5db;
        }

        .memory-content::-webkit-scrollbar {
            width: 6px;
        }

        .memory-content::-webkit-scrollbar-track {
            background: transparent;
        }

        .memory-content::-webkit-scrollbar-thumb {
            background: #d1d5db;
            border-radius: 3px;
        }

        .memory-item {
            background: white;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            padding: 10px;
            font-size: 12px;
            display: flex;
            gap: 8px;
            align-items: flex-start;
        }

        .memory-item.checked {
            background: #eff6ff;
            border-color: #3b82f6;
        }

        .memory-checkbox {
            flex-shrink: 0;
            width: 18px;
            height: 18px;
            margin-top: 2px;
            cursor: pointer;
            accent-color: #3b82f6;
        }

        .memory-content-wrapper {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .memory-header {
            font-weight: 600;
            color: #3b82f6;
            font-size: 11px;
            padding: 6px;
            background: #eff6ff;
            border-radius: 4px;
        }

        .memory-item textarea {
            width: 100%;
            min-height: 70px;
            padding: 6px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-family: monospace;
            font-size: 11px;
            resize: vertical;
            box-sizing: border-box;
        }

        .memory-overflow-warning {
            width: 100%;
            min-height: 70px;
            padding: 6px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-family: monospace;
            font-size: 11px;
            box-sizing: border-box;
            word-wrap: break-word;
            white-space: pre-wrap;
            line-height: 1.4;
            color: transparent;
            position: relative;
            pointer-events: none;
        }

        .memory-overflow-warning span {
            color: #000;
        }

        .memory-overflow-warning span.overflow {
            background-color: #ff4444;
            color: #fff;
            padding: 2px 4px;
            border-radius: 2px;
        }

        .memory-item-footer {
            display: flex;
            justify-content: flex-end;
            font-size: 10px;
            color: #6b7280;
        }

        .modal-footer {
            padding: 12px 20px;
            border-top: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            gap: 8px;
            background: #f9fafb;
            flex-wrap: wrap;
        }

        .btn {
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            border: 1px solid #d1d5db;
            background: white;
            transition: all 0.2s;
        }

        .btn:hover {
            background: #f3f4f6;
        }

        .btn:disabled {
            background: #e5e7eb;
            color: #9ca3af;
            cursor: not-allowed;
            border-color: #d1d5db;
        }

        .btn-primary {
            background: #3b82f6;
            color: white;
            border-color: #3b82f6;
        }

        .btn-primary:hover {
            background: #2563eb;
        }

        .btn-primary:disabled {
            background: #94a3b8;
            border-color: #94a3b8;
            cursor: not-allowed;
        }

        .save-success {
            display: none;
            padding: 6px 10px;
            background: #dcfce7;
            color: #166534;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
        }

        .save-success.show {
            display: block;
            animation: fadeInOut 3s ease-in-out;
        }

        @keyframes fadeInOut {
            0% { opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { opacity: 0; }
        }

        .footer-row {
            display: flex;
            gap: 8px;
            width: 100%;
        }

        .select-controls {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .loading-spinner {
            text-align: center;
            padding: 20px;
            color: #9ca3af;
        }

        .empty-message {
            text-align: center;
            color: #9ca3af;
            padding: 20px;
        }

        /* Dark Mode */
        body[data-theme="dark"] #memory-editor-modal {
            background: #242321;
            color: #F0EFEB;
        }

        body[data-theme="dark"] .modal-header,
        body[data-theme="dark"] .modal-footer,
        body[data-theme="dark"] .filter-section {
            background: #2E2D2B;
            border-color: #42413D;
        }

        body[data-theme="dark"] .modal-header button {
            color: #9ca3af;
        }

        body[data-theme="dark"] .modal-header button:hover {
            color: #F0EFEB;
        }

        body[data-theme="dark"] .filter-header {
            color: #F0EFEB;
        }

        body[data-theme="dark"] .filter-btn {
            background: #42413D;
            border-color: #42413D;
            color: #F0EFEB;
        }

        body[data-theme="dark"] .filter-btn:hover {
            background: #545251;
        }

        body[data-theme="dark"] .filter-label {
            color: #F0EFEB;
        }

        body[data-theme="dark"] .memory-content {
            background: #1a1918;
            border-color: #42413D;
        }

        body[data-theme="dark"] .memory-content::-webkit-scrollbar-thumb {
            background: #42413D;
        }

        body[data-theme="dark"] .memory-item {
            background: #242321;
            border-color: #42413D;
        }

        body[data-theme="dark"] .memory-item.checked {
            background: #1a3a52;
            border-color: #3b82f6;
        }

        body[data-theme="dark"] .memory-header {
            background: #1a3a52;
            color: #60a5fa;
        }

        body[data-theme="dark"] .memory-item textarea {
            background: #141413;
            color: #F0EFEB;
            border-color: #42413D;
        }

        body[data-theme="dark"] .memory-overflow-warning {
            background: #141413;
            border-color: #42413D;
        }

        body[data-theme="dark"] .btn {
            background: #2E2D2B;
            color: #F0EFEB;
            border-color: #42413D;
        }

        body[data-theme="dark"] .btn:hover {
            background: #42413D;
        }

        body[data-theme="dark"] .save-success {
            background: #064e3b;
            color: #a7f3d0;
        }
    `;

    function injectStyles() {
        const styleSheet = document.createElement("style");
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);
    }

    // ===== API =====

    async function getStructuredMemories() {
        const sessionId = getSessionId();
        const path = `/sessions/${sessionId}/structured-memories?limit=100&order=desc`;
        return await apiRequest('GET', path);
    }

    async function updateMemory(chatContentId, shortTerm) {
        const path = `/structured-memory/${chatContentId}`;
        const body = { short_term_memory: shortTerm };
        return await apiRequest('PUT', path, body);
    }

    // ===== 모달 =====

    async function createModal() {
        if (document.getElementById('memory-editor-overlay')) {
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'memory-editor-overlay';
        overlay.innerHTML = `
            <div id="memory-editor-modal">
                <div class="modal-header">
                    <h2>CaveDuck Memory Editor</h2>
                    <button id="memory-close-btn">&times;</button>
                </div>
                <div class="filter-section">
                    <div class="filter-header">
                        <span>날짜 필터</span>
                        <div class="filter-buttons">
                            <button class="filter-btn" id="select-all-dates-btn">전체</button>
                            <button class="filter-btn" id="deselect-all-dates-btn">해제</button>
                        </div>
                    </div>
                    <div class="filter-items" id="filter-items"></div>
                </div>
                <div class="modal-body">
                    <div class="char-count-container">
                        <span id="char-count-label">총 글자수: 0</span>
                        <span id="selected-count">선택됨: 0</span>
                    </div>
                    <div class="memory-content" id="memory-content">
                        <div class="loading-spinner">메모리 불러오는 중...</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <div class="save-success" id="save-success">✓ 저장되었습니다!</div>
                    <div class="footer-row">
                        <div class="select-controls">
                            <button class="btn" id="select-all-btn">전체 선택</button>
                            <button class="btn" id="copy-selected-btn">선택 복사</button>
                            <button class="btn" id="paste-selected-btn">붙여넣기</button>
                        </div>
                        <div style="flex: 1;"></div>
                        <button id="memory-save-btn" class="btn btn-primary">저장</button>
                        <button id="memory-close-footer-btn" class="btn">닫기</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        overlay.classList.add('open');

        // 이벤트 바인딩
        document.getElementById('memory-close-btn').onclick = handleClose;
        document.getElementById('memory-close-footer-btn').onclick = handleClose;
        document.getElementById('memory-save-btn').onclick = saveAll;
        document.getElementById('select-all-btn').onclick = toggleSelectAll;
        document.getElementById('copy-selected-btn').onclick = copySelected;
        document.getElementById('paste-selected-btn').onclick = pasteSelected;
        document.getElementById('select-all-dates-btn').onclick = selectAllDates;
        document.getElementById('deselect-all-dates-btn').onclick = deselectAllDates;

        // Ctrl+S 저장
        document.addEventListener('keydown', handleCtrlS);

        // 메모리 로드
        await loadMemories();
        renderFilterButtons();
        renderMemories();
    }

    function closeModal() {
        const overlay = document.getElementById('memory-editor-overlay');
        if (overlay) {
            document.removeEventListener('keydown', handleCtrlS);
            overlay.remove();
        }
    }

    function handleClose() {
        const hasChanges = checkForChanges();
        if (hasChanges && !confirm('변경사항이 있습니다. 저장하지 않고 닫으시겠습니까?')) {
            return;
        }
        closeModal();
    }

    function handleCtrlS(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveAll();
        }
    }

    // ===== 필터 =====

    function renderFilterButtons() {
        const dates = getAllDates();
        const container = document.getElementById('filter-items');
        container.innerHTML = '';

        if (dates.length === 0) {
            container.innerHTML = '<div class="empty-message">날짜 정보 없음</div>';
            return;
        }

        dates.forEach(date => {
            const isSelected = selectedDates.has(date);
            const div = document.createElement('div');
            div.className = 'filter-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'filter-checkbox';
            checkbox.checked = isSelected;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    selectedDates.add(date);
                } else {
                    selectedDates.delete(date);
                }
                renderMemories();
            });

            const label = document.createElement('label');
            label.className = 'filter-label';
            label.textContent = date;
            label.style.cursor = 'pointer';
            label.addEventListener('click', () => {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            });

            div.appendChild(checkbox);
            div.appendChild(label);
            container.appendChild(div);
        });
    }

    function selectAllDates() {
        const dates = getAllDates();
        dates.forEach(date => selectedDates.add(date));
        renderFilterButtons();
        renderMemories();
    }

    function deselectAllDates() {
        selectedDates.clear();
        renderFilterButtons();
        renderMemories();
    }

    // ===== 파싱 =====

    function parseClipboardFormat(text) {
        const items = [];
        const lines = text.split('\n');
        
        let currentNumber = null;
        let currentHeader = null;
        let currentText = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // 숫자 + 헤더 형식: "67. [2026-04-22 | 21:40 | 위치]"
            const headerMatch = line.match(/^(\d+)\.\s+(\[.+\])$/);
            
            if (headerMatch) {
                // 이전 항목 저장
                if (currentNumber !== null && currentHeader !== null) {
                    items.push({
                        number: currentNumber,
                        header: currentHeader,
                        text: currentText.join('\n').trimEnd()
                    });
                }
                
                // 새 항목 시작
                currentNumber = parseInt(headerMatch[1]);
                currentHeader = headerMatch[2];
                currentText = [];
            } else if (currentNumber !== null) {
                // 헤더 이후의 텍스트 수집
                currentText.push(line);
            }
        }

        // 마지막 항목 저장
        if (currentNumber !== null && currentHeader !== null) {
            items.push({
                number: currentNumber,
                header: currentHeader,
                text: currentText.join('\n').trimEnd()
            });
        }

        return items;
    }

    // ===== 렌더링 =====

    function renderMemories() {
        const content = document.getElementById('memory-content');
        content.innerHTML = '';

        const filtered = fetchedMemories.filter(m => {
            if (!m.scene_context || !m.scene_context.date) return false;
            return selectedDates.has(m.scene_context.date);
        });

        if (filtered.length === 0) {
            content.innerHTML = '<div class="empty-message">선택된 날짜의 메모리가 없습니다.</div>';
            updateCharCount();
            updateSelectedCount();
            return;
        }

        filtered.forEach((memory) => {
            const memoryText = memory.short_term_memory || '';
            const currentLength = getCharCount(memoryText);
            const maxLength = currentLength + 100;
            const isSelected = selectedMemories.has(memory.chat_content_id);
            const memoryNumber = getMemoryNumber(memory);

            const div = document.createElement('div');
            div.className = `memory-item ${isSelected ? 'checked' : ''}`;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'memory-checkbox';
            checkbox.checked = isSelected;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    selectedMemories.add(memory.chat_content_id);
                } else {
                    selectedMemories.delete(memory.chat_content_id);
                }
                div.classList.toggle('checked');
                updateSelectedCount();
            });

            const wrapper = document.createElement('div');
            wrapper.className = 'memory-content-wrapper';

            const header = document.createElement('div');
            header.className = 'memory-header';
            const sceneContext = memory.scene_context;
            const headerText = `${memoryNumber}. [${sceneContext.date} | ${sceneContext.time} | ${sceneContext.location}]`;
            header.textContent = headerText;

            const textareaContainer = document.createElement('div');
            textareaContainer.style.position = 'relative';

            const textarea = document.createElement('textarea');
            textarea.value = memoryText;
            textarea.dataset.id = memory.chat_content_id;
            textarea.dataset.sceneDatetime = headerText;
            textarea.dataset.maxLength = maxLength;
            textarea.style.position = 'relative';
            textarea.style.zIndex = '1';
            textarea.style.background = 'white';

            const overflowDiv = document.createElement('div');
            overflowDiv.className = 'memory-overflow-warning';
            overflowDiv.style.position = 'absolute';
            overflowDiv.style.top = '0';
            overflowDiv.style.left = '0';
            overflowDiv.style.zIndex = '0';
            overflowDiv.style.pointerEvents = 'none';

            function updateOverflowDisplay() {
                const text = textarea.value;
                if (text.length <= maxLength) {
                    overflowDiv.innerHTML = '';
                    textarea.style.background = 'white';
                } else {
                    const normalText = text.substring(0, maxLength);
                    const overflowText = text.substring(maxLength);
                    
                    const normalSpan = document.createElement('span');
                    normalSpan.textContent = normalText;
                    
                    const overflowSpan = document.createElement('span');
                    overflowSpan.className = 'overflow';
                    overflowSpan.textContent = overflowText;
                    
                    overflowDiv.innerHTML = '';
                    overflowDiv.appendChild(normalSpan);
                    overflowDiv.appendChild(overflowSpan);
                    
                    textarea.style.background = 'rgba(255, 68, 68, 0.1)';
                }
            }

            textarea.addEventListener('input', () => {
                updateCharCount();
                updateOverflowDisplay();
            });

            updateOverflowDisplay();

            const footer = document.createElement('div');
            footer.className = 'memory-item-footer';

            const charCountSpan = document.createElement('span');
            charCountSpan.textContent = formatCharCount(currentLength, maxLength);

            footer.appendChild(charCountSpan);

            textareaContainer.appendChild(overflowDiv);
            textareaContainer.appendChild(textarea);

            wrapper.appendChild(header);
            wrapper.appendChild(textareaContainer);
            wrapper.appendChild(footer);

            div.appendChild(checkbox);
            div.appendChild(wrapper);
            content.appendChild(div);
        });

        updateCharCount();
        updateSelectedCount();
    }

    // ===== 유틸리티 =====

    function updateCharCount() {
        const textareas = document.querySelectorAll('textarea[data-id]');
        let total = 0;
        textareas.forEach(ta => total += getCharCount(ta.value));

        const label = document.getElementById('char-count-label');
        if (label) label.innerText = `총 글자수: ${total}`;
    }

    function updateSelectedCount() {
        const label = document.getElementById('selected-count');
        if (label) label.innerText = `선택됨: ${selectedMemories.size}`;
    }

    function toggleSelectAll() {
        const textareas = document.querySelectorAll('textarea[data-id]');
        const allSelected = textareas.length > 0 && Array.from(textareas).every(ta => selectedMemories.has(ta.dataset.id));

        document.querySelectorAll('.memory-checkbox').forEach(checkbox => {
            const memoryId = checkbox.parentElement.querySelector('textarea').dataset.id;
            if (allSelected) {
                selectedMemories.delete(memoryId);
                checkbox.checked = false;
            } else {
                selectedMemories.add(memoryId);
                checkbox.checked = true;
            }
        });

        document.querySelectorAll('.memory-item').forEach(item => {
            item.classList.toggle('checked', !allSelected);
        });

        updateSelectedCount();
    }

    function copySelected() {
        const textareas = document.querySelectorAll('textarea[data-id]');
        const selected = Array.from(textareas)
            .filter(ta => selectedMemories.has(ta.dataset.id))
            .map(ta => ta.dataset.sceneDatetime + '\n' + ta.value)
            .join('\n\n' + '─'.repeat(50) + '\n\n');

        if (!selected) {
            alert('선택된 메모리가 없습니다.');
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = selected;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);

        alert(`✓ ${selectedMemories.size}개 항목이 복사되었습니다!`);
    }

    async function pasteSelected() {
        if (selectedMemories.size === 0) {
            alert('선택된 메모리가 없습니다.');
            return;
        }

        try {
            const clipboardText = await navigator.clipboard.readText();
            const parsedItems = parseClipboardFormat(clipboardText);

            if (parsedItems.length === 0) {
                alert('클립보드에서 메모리 형식을 찾을 수 없습니다.');
                return;
            }

            if (parsedItems.length !== selectedMemories.size) {
                alert(`선택된 메모리(${selectedMemories.size}개)와 붙여넣을 항목(${parsedItems.length}개)의 개수가 맞지 않습니다.`);
                return;
            }

            // 선택된 메모리들을 번호순으로 정렬
            const selectedArray = Array.from(selectedMemories)
                .map(id => fetchedMemories.find(m => m.chat_content_id === id))
                .filter(m => m)
                .sort((a, b) => getMemoryNumber(a) - getMemoryNumber(b));

            // 붙여넣기 항목들을 번호순으로 정렬
            parsedItems.sort((a, b) => a.number - b.number);

            // 매칭 및 적용
            const textareas = document.querySelectorAll('textarea[data-id]');
            let matchedCount = 0;

            parsedItems.forEach((item, index) => {
                if (index < selectedArray.length) {
                    const memory = selectedArray[index];
                    const textarea = Array.from(textareas).find(ta => ta.dataset.id === memory.chat_content_id);
                    
                    if (textarea) {
                        textarea.value = item.text;
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        matchedCount++;
                    }
                }
            });

            if (matchedCount > 0) {
                alert(`✓ ${matchedCount}개 메모리가 업데이트되었습니다!`);
            }
        } catch (error) {
            alert('클립보드에 접근할 수 없습니다. 권한을 확인해주세요.');
            console.error('Clipboard error:', error);
        }
    }

    function checkForChanges() {
        const textareas = document.querySelectorAll('textarea[data-id]');
        for (let ta of textareas) {
            const id = ta.dataset.id;
            const memory = fetchedMemories.find(m => m.chat_content_id === id);
            if (!memory) continue;

            if (ta.value !== (memory.short_term_memory || '')) {
                return true;
            }
        }
        return false;
    }

    // ===== 저장 =====

    async function saveAll() {
        const textareas = document.querySelectorAll('textarea[data-id]');
        const saveBtn = document.getElementById('memory-save-btn');
        const saveSuccess = document.getElementById('save-success');

        saveBtn.disabled = true;
        saveBtn.innerText = '저장 중...';

        let saved = 0;
        let failed = 0;

        for (let ta of textareas) {
            const id = ta.dataset.id;
            const memory = fetchedMemories.find(m => m.chat_content_id === id);
            if (!memory) continue;

            if (ta.value === (memory.short_term_memory || '')) continue;

            const res = await updateMemory(id, ta.value || null);

            if (res && res.success) {
                memory.short_term_memory = ta.value;
                saved++;
            } else {
                failed++;
            }
        }

        saveBtn.disabled = false;
        saveBtn.innerText = '저장';

        if (failed > 0) {
            alert(`저장 완료: ${saved}건 성공, ${failed}건 실패`);
        } else if (saved > 0) {
            saveSuccess.classList.add('show');
            setTimeout(() => saveSuccess.classList.remove('show'), 3000);
        } else {
            alert('변경사항이 없습니다.');
        }
    }

    // ===== 로드 =====

    async function loadMemories() {
        isLoading = true;
        const res = await getStructuredMemories();
        isLoading = false;

        if (res && res.memories) {
            // 최신순으로 받은 메모리를 오래된 순으로 정렬
            fetchedMemories = res.memories.sort((a, b) => a.chat_id - b.chat_id);
            
            // 최소 chat_id 저장 (번호 계산에 사용)
            if (fetchedMemories.length > 0) {
                minChatId = Math.min(...fetchedMemories.map(m => m.chat_id));
            }
            
            if (selectedDates.size === 0) {
                const dates = getAllDates();
                dates.forEach(date => selectedDates.add(date));
            }
        } else {
            fetchedMemories = [];
        }
    }

    // ===== 버튼 주입 =====

    function injectButton() {
        if (document.getElementById('memory-editor-btn')) {
            return;
        }

        const btn = document.createElement('button');
        btn.id = 'memory-editor-btn';
        btn.title = '메모리 편집기';
        btn.innerHTML = '📝';

        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let dragOffsetX = 0;
        let dragOffsetY = 0;

        function startDrag(e) {
            e.preventDefault();
            e.stopPropagation();

            isDragging = false;
            const rect = btn.getBoundingClientRect();

            if (e.type === 'touchstart') {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                dragOffsetX = startX - rect.left;
                dragOffsetY = startY - rect.top;
            } else {
                startX = e.clientX;
                startY = e.clientY;
                dragOffsetX = startX - rect.left;
                dragOffsetY = startY - rect.top;
            }

            btn.classList.add('dragging');

            function onMove(e) {
                let currentX, currentY;

                if (e.type.startsWith('touch')) {
                    currentX = e.touches[0].clientX;
                    currentY = e.touches[0].clientY;
                } else {
                    currentX = e.clientX;
                    currentY = e.clientY;
                }

                const diffX = Math.abs(currentX - startX);
                const diffY = Math.abs(currentY - startY);

                if (diffX > 5 || diffY > 5) {
                    isDragging = true;
                }

                if (isDragging) {
                    let x = currentX - dragOffsetX;
                    let y = currentY - dragOffsetY;
                    x = Math.max(0, Math.min(window.innerWidth - btn.offsetWidth, x));
                    y = Math.max(0, Math.min(window.innerHeight - btn.offsetHeight, y));
                    btn.style.left = x + 'px';
                    btn.style.top = y + 'px';
                    btn.style.bottom = 'auto';
                    btn.style.right = 'auto';
                }
            }

            function onUp() {
                btn.classList.remove('dragging');
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.removeEventListener('touchend', onUp);

                if (!isDragging) {
                    createModal();
                } else {
                    localStorage.setItem('memory-editor-btn-pos', JSON.stringify({
                        left: btn.style.left,
                        top: btn.style.top
                    }));
                }
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('mouseup', onUp);
            document.addEventListener('touchend', onUp);
        }

        btn.addEventListener('mousedown', startDrag);
        btn.addEventListener('touchstart', startDrag, { passive: false });

        const savedPos = localStorage.getItem('memory-editor-btn-pos');
        if (savedPos) {
            try {
                const pos = JSON.parse(savedPos);
                btn.style.left = pos.left;
                btn.style.top = pos.top;
                btn.style.bottom = 'auto';
                btn.style.right = 'auto';
            } catch (e) {}
        }

        document.body.appendChild(btn);
    }

    // ===== 초기화 =====

    function init() {
        injectStyles();
        injectButton();

        const observer = new MutationObserver(() => {
            injectButton();
        });
        observer.observe(document.body, { childList: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();