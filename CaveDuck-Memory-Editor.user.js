// ==UserScript==
// @name         CaveDuck Memory Editor v2.1.0
// @namespace    https://caveduck.io/
// @version      2.1.0
// @description  케이브덕의 단기 기억을 조회하고 복사합니다. (경량 버전)
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

    function getAllDates() {
        const dates = new Set();
        fetchedMemories.forEach(m => {
            if (m.scene_context && m.scene_context.date) {
                dates.add(m.scene_context.date);
            }
        });
        return Array.from(dates).sort();
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

        .memory-text {
            font-size: 12px;
            line-height: 1.5;
            color: #1f2937;
            white-space: pre-wrap;
            word-break: break-word;
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

        .selected-count {
            font-size: 11px;
            color: #6b7280;
            padding: 4px 0;
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

        body[data-theme="dark"] .memory-text {
            color: #F0EFEB;
        }

        body[data-theme="dark"] .btn {
            background: #2E2D2B;
            color: #F0EFEB;
            border-color: #42413D;
        }

        body[data-theme="dark"] .btn:hover {
            background: #42413D;
        }

        body[data-theme="dark"] .selected-count {
            color: #9ca3af;
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
                    <div class="selected-count" id="selected-count">선택됨: 0</div>
                    <div class="memory-content" id="memory-content">
                        <div class="loading-spinner">메모리 불러오는 중...</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <div style="display: flex; gap: 8px;">
                        <button class="btn" id="select-all-btn">전체 선택</button>
                        <button class="btn btn-primary" id="copy-selected-btn">선택 복사</button>
                    </div>
                    <button id="memory-close-footer-btn" class="btn">닫기</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        overlay.classList.add('open');

        // 이벤트 바인딩
        document.getElementById('memory-close-btn').onclick = handleClose;
        document.getElementById('memory-close-footer-btn').onclick = handleClose;
        document.getElementById('select-all-btn').onclick = toggleSelectAll;
        document.getElementById('copy-selected-btn').onclick = copySelected;
        document.getElementById('select-all-dates-btn').onclick = selectAllDates;
        document.getElementById('deselect-all-dates-btn').onclick = deselectAllDates;

        // 메모리 로드
        await loadMemories();
        renderFilterButtons();
        renderMemories();
    }

    function closeModal() {
        const overlay = document.getElementById('memory-editor-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    function handleClose() {
        closeModal();
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
            updateSelectedCount();
            return;
        }

        filtered.forEach((memory) => {
            const memoryText = memory.short_term_memory || '';
            const isSelected = selectedMemories.has(memory.chat_content_id);

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
            const headerText = `[${sceneContext.date} | ${sceneContext.time} | ${sceneContext.location}]`;
            header.textContent = headerText;

            const text = document.createElement('div');
            text.className = 'memory-text';
            text.textContent = memoryText;

            wrapper.appendChild(header);
            wrapper.appendChild(text);

            div.appendChild(checkbox);
            div.appendChild(wrapper);
            content.appendChild(div);
        });

        updateSelectedCount();
    }

    // ===== 유틸리티 =====

    function updateSelectedCount() {
        const label = document.getElementById('selected-count');
        if (label) label.innerText = `선택됨: ${selectedMemories.size}`;
    }

    function toggleSelectAll() {
        const checkboxes = document.querySelectorAll('.memory-checkbox');
        const allSelected = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);

        document.querySelectorAll('.memory-checkbox').forEach(checkbox => {
            checkbox.checked = !allSelected;
            checkbox.dispatchEvent(new Event('change'));
        });
    }

    function copySelected() {
        if (selectedMemories.size === 0) {
            alert('선택된 메모리가 없습니다.');
            return;
        }

        const textareas = document.querySelectorAll('.memory-header');
        const memories = [];

        textareas.forEach(header => {
            const item = header.closest('.memory-item');
            const checkbox = item.querySelector('.memory-checkbox');
            
            if (checkbox.checked) {
                const headerText = header.textContent;
                const text = item.querySelector('.memory-text').textContent;
                memories.push(headerText + '\n' + text);
            }
        });

        const selected = memories.join('\n\n' + '─'.repeat(50) + '\n\n');

        const textarea = document.createElement('textarea');
        textarea.value = selected;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);

        alert(`✓ ${selectedMemories.size}개 항목이 복사되었습니다!`);
    }

    // ===== 로드 =====

    async function loadMemories() {
        isLoading = true;
        const res = await getStructuredMemories();
        isLoading = false;

        if (res && res.memories) {
            // 최신순으로 받은 메모리를 오래된 순으로 정렬
            fetchedMemories = res.memories.sort((a, b) => a.chat_id - b.chat_id);
            
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